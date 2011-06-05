
///////////////////////////////////////////
//           SETUP Dependencies          //
///////////////////////////////////////////
var connect = require('connect'),
	express = require('express'),
	mongoStore = require('connect-mongodb'),
	model = require('./models/model-native-driver').db,
	util = require('util'),
	port = (process.env.PORT || 8081),
	rooms	= require('./logics/rooms.js'),
	formidable = require('formidable'),
	fs = require('fs');

       
///////////////////////////////////////////
//             SETUP Express             //
///////////////////////////////////////////
var app = module.exports = express.createServer();
app.rooms = rooms;

app.configure(function() {
	//views is the default folder already
  	app.set('views', __dirname + '/views');
  	app.set('view engine', 'jade');
  	app.use(express.bodyParser());
	app.use(express.cookieParser());
	
	app.use(express.session({ store: mongoStore(app.set('db-uri')), secret: 'keyboard cat'}));
  	app.use(express.compiler({ src: __dirname + '/public', enable: ['less'] }));
  	app.use(app.router);
  	app.use(express.static(__dirname + '/public'));
});

// node environment, use in terminal: "export NODE_ENV=production"
app.configure('test', function() {
	app.set('db-uri', 'mongodb://localhost/sharedesk-test');
	app.model = new model('sharedesk-test', function() {});
});

app.configure('development', function() {
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
	app.set('db-uri', 'mongodb://localhost/sharedesk-development');
	app.model = new model('sharedesk-development', function() {});
});

app.configure('production', function() {
	app.set('db-uri', 'mongodb://localhost/sharedesk-production');
	app.model = new model('sharedesk-production', function() {});
});


///////////////////////////////////////////
//            ERROR Handling             //
///////////////////////////////////////////

function NotFound(msg) {
  	this.name = 'NotFound';
  	Error.call(this, msg);
  	Error.captureStackTrace(this, arguments.callee);
}

util.inherits(NotFound, Error);

// Not Found Page
app.get('/404', function(req, res) {
	throw new NotFound;
});

// Server Error Page
app.get('/500', function(req, res) {
	throw new Error('An expected error');
});

// Server Error Page
app.get('/bad', function(req, res) {
	unknownMethod();
});

// on error redirect to 404 page
app.error(function(error, req, res, next) {
  	if (error instanceof NotFound) {
    	res.render('404', { status: 404 });
  	} else {
    	next(error);
  	}
});

///////////////////////////////////////////
//           ROUTES Controller           //
///////////////////////////////////////////


// Home directory, create desk
app.get('/', function(req, res){
	res.render('home', {
		layout: false
	});
});

// Download Route
// deskname is unimportant
// fileid is the id for the whole group of file (if multiupload)
app.get('/download/:deskname/:fileid', function(req, res) {
	// send file
	app.model.getFile(req.params.fileid, function(error, file) {
		if(error) {
			console.log("getFile error", error);
		}
		else {
			if(typeof file != 'undefined') {

				// HTTP Header
				res.writeHead('200', {
					'Content-Type' : file.type,
					'Content-Disposition' : 'attachment;filename=' + file.name
				});
						
				// Filestream		
				var read_stream = fs.createReadStream('./' + file.location);
				read_stream.on("data", function(data){
					res.write(data);
				});
				read_stream.on("error", function(err){
					console.error("An error occurred: %s", err)
				});
				read_stream.on("close", function(){
					res.end();
					console.log("File closed.")
				});

			}
			else {
				console.log("cannot read file");
				res.writeHead('404');
				res.end();
			}
		}
	});
});

// Desk Route
// different desk for each different name
app.get('/:deskname', function(req, res){
	res.render('index.jade', {
		locals: {pageTitle: ('shareDesk - ' + req.params.deskname) }
	});
});

// Upload Route
// used to upload file with ajax
app.post('/upload/:deskname/:filesgroupid', function(req, res) {
	var filesgroupid = req.params.filesgroupid;
	var rcvd_bytes_complete = 0;
	var basedir = './uploads/';

	var form = new formidable.IncomingForm(),
		files = [],
		fields = [];

	var oldProgressPercentage = 0;
	var dir = basedir + req.params.deskname;

	form.uploadDir = dir;

	// send progress-message, at one percent-rate or above
	form.on('progress', function(bytesReceived, bytesExpected) {									
		var newProgressPercentage = (bytesReceived / bytesExpected) * 100 | 0;
		if(oldProgressPercentage < newProgressPercentage) {
			var msg = {
				action: 'progress',																																																																																																																																																																																												
				data: {
					filesgroupid: filesgroupid,
					bytesReceived: bytesReceived,
					bytesExpected: bytesExpected
				}
			}
			rooms.broadcast_room(req.params.deskname, msg);
			oldProgressPercentage = newProgressPercentage;
		}
	});

	// uploading file done, save to db
	form.on('file', function(name, file) {
		console.log('file');
		var fileModel = {
			name: file.name,
			location: file.path,
			x: -1,
			y: -1,
			format: file.type
		}

		app.model.createFile(req.params.deskname, fileModel, function(error, db_file) {
			if (error) console.log(error);
			else {
				var msg = {
					action: 'createFile',
					data: {
						filesgroupid: filesgroupid,
						file: fileModel
					}
				}
				rooms.broadcast_room(req.params.deskname, msg);
			}
		});
	});

	// start upload/receiving file
	// close connection when done
	form.parse(req, function(error, fields, files) {

		res.writeHead(200, {'content-type': 'text/plain'});
		res.write('received upload:\n\n');
		res.end(util.inspect({fields: fields, files: files}));
		
	});

});

//create Upload folder if it not exists
var uploadFolder = './uploads/';
app.uploadFolder = uploadFolder;
fs.stat(uploadFolder, function(error, stats) {
	if(typeof stats=='undefined' || !stats.isDirectory()) {
		fs.mkdir(uploadFolder, 448, function(error) {
			if (error) throw new Error('could not create ' + uploadFolder + ' folder');
		});
	}
});

// start websockets controller
require('./controllers/websockets')(app);

// Only listen on $ node app.js
if (!module.parent) {
	app.listen(port);
	console.log("ShareDesk server listening on port %d", app.address().port);
}



