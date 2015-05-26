
// On initial connect, send a registration to server with "username"
// the given userID is associated with the socketID.  
//


	//var CALLBACKS = callbacks;

function NetCode(callbacks) {

	var SOCKET_PORT = 8081;
	var UPDATE_FREQUENCY = 100; // in ms
	var SOCKET;
	var NET_USER_ID = new Date().getTime();
	var ROLE = 'local';
	var USC_lastUpdate = new Date().getTime();
	var CALLBACKS;

	//-----------------------------------------------------------------------------------
	// networkSetup
	//
	// returns the ROLE variable
	//
	// pass in key callbacks in a map:
	// {
	//      startGame: function(id),				 	// role = string, id = session user ID
	//		setRole: function(role, oldRole),      		// role = string. local, master, slave
	//		showRemotePlayers: function()(rPlayers),    // rPlayers = array of player coord objects 
	//		showRemoteNPCs: function(rNpcs), 			// rNpcs = array of npc coords (to slaves)
	//		removeNPC: removeNPCs						// indicator that an NPC is to be removed
	//		
	// }
	//

	CALLBACKS = callbacks;

	var that = this;

	// retrieve information about the socket the server is using to communicate information back
	// to the client.  Port is configurable at the server, so we request it here
	console.log ("attempting to get socket port")
	$.ajax({

		url: "/api/socket-port",
		dataType: "json",
		type: "GET",
		success: function(obj) {

			console.log("Socket Port received: " + obj.port);
			if (exists(obj.port)) {

			    SOCKET = io(":" + obj.port);

			    // Connect Error
			    SOCKET.on("connect_error", function(msg) {
			    	console.log ("CONNECT_ERROR");
					ROLE = 'local';
					if ('startGame' in CALLBACKS) {
						CALLBACKS.startGame(NET_USER_ID);
					}	
			    });

			    // Connection made
			    SOCKET.on("connect", function(msg) {
			    	console.log("connect received");

				    SOCKET.on("startGame", function(msg){
				    	netStartGame(msg);
				    });

					SOCKET.emit("username", {userID: NET_USER_ID, msg: NET_USER_ID});
				});    

			} else {
				console.log ("No socket provided, dynamic updates disabled");
			}			
			return;
		}	
	});


	this.updateServerScore = function(score) {
	    netSocketSend("score", score);
	};


	this.updateServerCoords = function(stars, ply) {

		// if not connected, don't do all the work to prepare package
		if (ROLE=='local') {
			return;
		}

		var coords = {stars: []};
		var d = new Date().getTime();

		if (d - USC_lastUpdate > UPDATE_FREQUENCY) {

			USC_lastUpdate = d;

			if (ROLE == "master") {

				stars.forEachAlive(function(star) {
					coords.stars.push({id: star.syncID,
								 x: star.x, 
								 y: star.y, 
								 xv: star.body.velocity.x, 
								 yv: star.body.velocity.y,
								 xb: star.body.bounce.x,
								 yb: star.body.bounce.y,
								 av: star.body.angularVelocity});
				}, this);

				netSocketSend("coords", coords);
			}	

			reportPlayerPos(ply);
		}	

	}

	// Report to server you killed a star
	this.netRecordKill = function(id) {
		console.log ("recording kill - " + id);
		netSocketSend("starkill", id);
	}

	this.getUserID = function() {
		return NET_USER_ID;
	}
	this.getRole = function() {
		return ROLE;
	}


	//=====================================================================================
	// SUPPORT FUNCTIONS

	function reportPlayerPos(ply) {

		var pcoords = {
			x: ply.x,
			y: ply.y,
			vx: ply.body.velocity.x,
			vy: ply.body.velocity.y,
			id: NET_USER_ID,
			frame: ply.frame
		};

		netSocketSend("pcoords", pcoords);
	}

	function netStartGame(msg) {

		console.log ("Game start as " + msg.role);

		ROLE = msg.role;

		if ('startGame' in CALLBACKS) {
			CALLBACKS.startGame(NET_USER_ID);
		}
		console.log ("enabling coordsSync message");

		// message to get new NPC coordinates
		SOCKET.on("coordsSync", function(coords){
			if (ROLE=='slave') {
				if ('showRemoteNPCs' in CALLBACKS) {
					CALLBACKS.showRemoteNPCs(coords.stars);
				}	
			}	
		});

		// Initialize Messages that both process
		// NPC was destroyed, should be removed from the board
		//
	    SOCKET.on("starkilled", function(msg){
	    	console.log ("received starkilled msg " + msg);
	    	if ('removeNPC' in CALLBACKS) {
		    	CALLBACKS.removeNPC(msg);
		    }	
	    });

	    // Update other players on the board
	    //
	    SOCKET.on("pcoordsSync", function(msg){
	    	if ('showRemotePlayers' in CALLBACKS) {
		    	CALLBACKS.showRemotePlayers(msg.players);
		    }	
		});

	    // Need new master
	    //
	    SOCKET.on("needNewMaster", function(msg) {
	    	netSocketSend ("pick_me", NET_USER_ID);
		});

	    // Listen for a promotion to master
	    //
	    SOCKET.on("roleChange", function(msg){
	    	changeRole(msg);
		});
	}


	function changeRole(msg) {
		var oldRole = ROLE;
		//netSocketSend ("statusChangeAck", NET_USER_ID);
		ROLE = msg;
		if ('setRole' in CALLBACKS) {
			CALLBACKS.setRole(oldRole, ROLE);
		}	
	}


	// Once connection and user ID are establihed, how to send user-based messages
	// 
	function netSocketSend(op, msg) {
		if (ROLE != 'local') {
			SOCKET.emit(op, {userID: NET_USER_ID, msg: msg});
		}	
	}
//}

}
