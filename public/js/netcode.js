
// On initial connect, send a registration to server with "username"
// the given userID is associated with the socketID.  
//

var SOCKET_PORT = 8081;
var UPDATE_FREQUENCY = 100; // in ms
var socket;
var netUserID = new Date().getTime();


function networkSetup() {

	// retrieve information about the socket the server is using to communicate information back
	// to the client.  Port is configurable at the server, so we request it here
	$.ajax({

		url: "/api/socket-port",
		dataType: "json",
		type: "GET",
		success: function(obj) {
			console.log(obj);
			if (exists(obj.port)) {

			    socket = io(":" + obj.port);

			    socket.on("connect", function(msg) {
			    	console.log("connect received");
				    netSocketSend("username", netUserID);
				    socket.on("startGame", function(msg){
				    	netStartGame(msg);
				    });
				});
			} else {
				logger ("No socket provided, dynamic updates disabled");
			}			
			return;
		}	
	});
}


function updateServerScore(score) {
    netSocketSend("score", score);
}

var USC_lastUpdate = new Date().getTime();

function updateServerCoords(stars, ply, role) {

	var coords = {stars: []};
	var d = new Date().getTime();

	if (d - USC_lastUpdate > UPDATE_FREQUENCY) {

		USC_lastUpdate = d;

		if (role == "master") {

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

function reportPlayerPos (ply) {
	var pcoords = {
		x: ply.x,
		y: ply.y,
		vx: ply.body.velocity.x,
		vy: ply.body.velocity.y,
		id: netUserID,
		frame: ply.frame
	};

	netSocketSend("pcoords", pcoords);

}

//================SET UP GAME AND ENDPOINTS =================
//
function netStartGame(msg) {

	console.log ("Game start as " + msg.role);
	startGame(msg.role, netUserID);

	console.log ("enabling coordsSync message");

	// message to get new NPC coordinates
	socket.on("coordsSync", function(coords){
		if (role=='slave') {
			syncSlaveCoords(coords.stars);
		}	
	});

	// Initialize Messages that both process
	// NPC was destroyed, should be removed from the board
	//
    socket.on("starkilled", function(msg){
    	console.log ("received starkilled msg " + msg);
    	recordStarKill(msg);
    });

    // Update other players on the board
    //
    socket.on("pcoordsSync", function(msg){
    	showPlayers(msg.players);
	});

    // Need new master
    //
    socket.on("needNewMaster", function(msg) {
    	netSocketSend ("pick_me", netUserID);
	});

    // Listen for a promotion to master
    //
    socket.on("roleChange", function(msg){
    	changeRole(msg);
	});
}

function changeRole(msg) {
	//netSocketSend ("statusChangeAck", netUserID);
	debugText = role;
	role = msg;
}


// Report to server you killed a star
function netRecordKill(id) {
	console.log ("recording kill - " + id);
	netSocketSend("starkill", id);
}


// Once connection and user ID are establihed, how to send user-based messages
// 
function netSocketSend (op, msg) {
	socket.emit(op, {userID: netUserID, msg: msg});
}

