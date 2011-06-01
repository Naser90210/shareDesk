
///////////////////////////////////////////
//           socket.io routing           //
///////////////////////////////////////////

var io = require('socket.io'),
	util = require('util');
	
module.exports = function(app) {

	var socket = io.listen(app),
			model = app.model,
			rooms	= app.rooms;
		
	socket.on('connection', function(client) {
		
		// new client is here!

		client.on('message', function( message ) { 

			console.log("action: " + message.action + " -- data: " + util.inspect(message.data) );

			if (!message.action)	return;

			switch (message.action) {
				case 'initializeMe':
					initClient(client);
					break;

				case 'joinRoom':
					joinRoom(client, message.data, function(clients) {
						client.send( { action: 'roomAccept', data: '' } );
					});
					break;

				case 'moveFile':
					
					//report to all other browsers
					var messageOut = {
						action: message.action,
						data: {
							id: message.data.id,
							position: {
								left: message.data.position.left,
								top: message.data.position.top
							}
						}
					};


					broadcastToRoom( client, messageOut );
					
					model.setFilePosition(null, message.data.id, message.data.position.left, message.data.position.top, function(error, file) {
						console.log(error, file);	
					});
					break;

				case 'renameFile':
					renameFile(client, message.data.fileId, message.data.newName);
					break;

				case 'deleteFile':
					deleteFile(client, message.data.fileId);
					break;
				default:
					console.log('unknown action');
					break;
			}
		});

		client.on('disconnect', function() {
				//leaveRoom(client);
		});

	  //tell all others that someone has connected
	  //client.broadcast('someone has connected');
	});
	
	
	//--------------
	// Some Functions
	//--------------
	
	function initClient (client) {

		getRoom(client, function(room) {
			
			//Send client all the files from the room
			model.getAllFiles(room, function(err, files) {
				client.send({ action: 'initFiles', data: files});
			});

		});
	}
	
	function joinRoom (client, room, successFunction) {
		var msg = {};
		msg.action = 'join-announce';
		msg.data		= { sid: client.sessionId, user_name: client.user_name };

		rooms.add_to_room_and_announce(client, room, msg);
		successFunction();
	}

	function renameFile (client, fileId, newName) {
		model.renameFile(fileId, newName, function(error, file) {
			var msg = {};
			msg.action = 'renameFile';
			msg.data = { fileId: fileId, newName: newName };
			broadcastToRoom(client, msg);
			//broadcast?
			//console.log(error);
		});
	}

	function deleteFile (client, fileId) {
		model.deleteFile(fileId, function(error, file) {
			var msg = {};
			msg.action = 'deleteFile';
			msg.data = { fileId: fileId };
			broadcastToRoom(client, msg);
			//console.log(error);
		});
	}
	
	function getRoom( client , callback ) {
		room = rooms.get_room( client );
		//console.log( 'client: ' + client.sessionId + " is in " + room);
		callback(room);
	}

	function broadcastToRoom ( client, message ) {
		rooms.broadcast_to_roommates(client, message);
	}
	
}

