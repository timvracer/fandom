
//--------------------------------------------------------------------------------------
//
// NetCode module 
//
// Usage: 
// 
// var NC = new NetCode({<callbacks - see below>});
//
// This will attempt to connect to a server, and will then call the startGame callback to
// get things rolling.  use getRole() to determine what role your client is playing.
// 'local' indicates no connection is established
// 'master' indicates this client is in control of NPC's, and must report their positions
// 'slave' will receive NPC info from the server, but still reports player specific info
//
//

function NetCode(callbacks) {

	var SOCKET_PORT = 8081;
	var UPDATE_FREQUENCY = 100; // in ms
	var LATENCY_CHECK_FREQUENCY = 2000; // in ms
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
	//		removeNPC: removeNPCs,						// indicator that an NPC is to be removed
	//		latencyUpdate: latencyUpdate				// called every 2 seconds with server latency
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

				//---------------------------------------
				// Create the socket and try to connect
			    SOCKET = io(":" + obj.port);

				//---------------------------------------
			    // Connect Error
			    SOCKET.on("connect_error", function(msg) {
			    	console.log ("CONNECT_ERROR");
					ROLE = 'local';
					if ('startGame' in CALLBACKS) {
						CALLBACKS.startGame(NET_USER_ID);
					}	
			    });

				//---------------------------------------
			    // Connection made
			    SOCKET.on("connect", function(msg) {
			    	console.log("connect received");

				    SOCKET.on("startGame", function(msg){
				    	netStartGame(msg);
				    });

					SOCKET.emit("username", {userID: NET_USER_ID, msg: NET_USER_ID});
				}); 

				//--------------------------------------------
				// set up latency check
				// 
				if ('latencyUpdate' in CALLBACKS) {
					setInterval(function() {
					  var startTime = Date.now();
					  //
					  // send server a 'ping'
					  SOCKET.emit('ping');
					  //
					  // Server returns 'pong'
					  SOCKET.on('pong', function() {
					  	CALLBACKS.latencyUpdate(Date.now() - startTime);
					  });
					}, LATENCY_CHECK_FREQUENCY);
				}

			} else {
				console.log ("No socket provided, dynamic updates disabled");
			}			
			return;
		}	
	});


	//--------------------------------------------
	// updateServerScore
	//
	// self report current score: TODO for obvious reasons this is
	// not ideal, must change to server based scoring 
	//--------------------------------------------
	this.updateServerScore = function(score) {
	    netSocketSend("score", score);
	};

	//--------------------------------------------
	// UpdateServerCoords
	//
	// currently sends NPC coords (if master) seperately from
	// player coords.  not sure what is most efficient with sockets
	//
	//--------------------------------------------
	this.updateServerCoords = function(coords) {

		var d = new Date().getTime();

		// if not connected, don't do anything
		if (ROLE=='local') {
			return;
		}

		if (d - USC_lastUpdate > UPDATE_FREQUENCY) {
			USC_lastUpdate = d;

			if ('npcs' in coords) {
				netSocketSend("coords", coords);
			}	
			if ('player' in coords) {
				netSocketSend("pcoords", coords);
			}	
		}	

	};

	//--------------------------------------------
	// netRecordKill
	//
	// reports to the server that an NPC was killed or removed
	// TODO this obviously is easily hacked, so we need to add
	// server side coordinate checking
	//--------------------------------------------
	this.netRecordKill = function(id) {
		console.log ("recording kill - " + id);
		netSocketSend("npcKill", id);
	};

	//--------------------------------------------
	// getUserID
	//--------------------------------------------
	this.getUserID = function() {
		return NET_USER_ID;
	};
	//--------------------------------------------
	// getRole
	//--------------------------------------------
	this.getRole = function() {
		return ROLE;
	};


	//=====================================================================================
	// SUPPORT FUNCTIONS

	//--------------------------------------------
	// netStartGame
	//
	// called after user registratin succeeds (from server).  calls the startGame
	// callback and sets the role.  Sets up the SOCKET functions 
	//--------------------------------------------
	function netStartGame(msg) {

		console.log ("Game start as " + msg.role);

		ROLE = msg.role;

		// call the startGame callback to kick things off
		if ('startGame' in CALLBACKS) {
			CALLBACKS.startGame(NET_USER_ID);
		}

		//---------------------------------------------
		// coordsSync
		// process NPC coords sync message from server
		//
		SOCKET.on("coordsSync", function(coords){
			if (ROLE=='slave') {
				if ('showRemoteNPCs' in CALLBACKS) {
					CALLBACKS.showRemoteNPCs(coords);
				}	
			}	
		});

		//---------------------------------------------
		// removeNPC
		// NPC was destroyed, should be removed from the board
		//
	    SOCKET.on("npckilled", function(msg){
	    	console.log ("received npckilled msg " + msg);
	    	if ('removeNPC' in CALLBACKS) {
		    	CALLBACKS.removeNPC(msg);
		    }	
	    });

		//---------------------------------------------
		// pcoordsSync
	    // Update other players on the board
	    // array of various coords given, players are in 'remotePlayers'
	    //
	    SOCKET.on("pcoordsSync", function(coords){
	    	if ('remotePlayers' in coords) {
		    	if ('showRemotePlayers' in CALLBACKS) {
			    	CALLBACKS.showRemotePlayers(coords.remotePlayers);
			    }	
			}    
		});

		//---------------------------------------------
		// needNewMaser
	    // Server asking who wants to be the new master
	    // respond indicating candidacy. TODO: add logic to
	    // determine if this client is a goood candidate (ping time)
	    //
	    SOCKET.on("needNewMaster", function(msg) {
	    	netSocketSend ("pick_me", NET_USER_ID);
		});

		//---------------------------------------------
		// roleChange
	    // Listen for a promotion to master
	    //
	    SOCKET.on("roleChange", function(msg){
	    	changeRole(msg);
		});
	}


	//--------------------------------------------
	// changeRole
	// change the role of this client as specified.
	//--------------------------------------------
	function changeRole(msg) {
		var oldRole = ROLE;
		ROLE = msg;
		if ('setRole' in CALLBACKS) {
			CALLBACKS.setRole(oldRole, ROLE);
		}	
	}


	//--------------------------------------------
	// netSocketSend
	// Once connection and user ID are establihed, how to send user-based messages
	// 
	function netSocketSend(op, msg) {
		if (ROLE != 'local') {
			SOCKET.emit(op, {userID: NET_USER_ID, msg: msg});
		}	
	}

}
