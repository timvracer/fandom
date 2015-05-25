
// On initial connect, send a registration to server with "username"
// the given userID is associated with the socketID.  
//

var UPDATE_FREQUENCY = 100; // in ms
var socket;
var netUserID = new Date().getTime();

function networkSetup() {

    socket = io(":3001");

    socket.on("connect", function(msg) {
    	console.log("connect received");
	    netSocketSend("username", netUserID);
	    socket.on("startGame", function(msg){
	    	netStartGame(msg);
	    });
	});

    //socket.on("reconnect", function(msg) {
    //	console.log("reconnect received");
	//    netSocketSend("username-reconnect", netUserID);
	//});
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

function netStartGame(msg) {

	console.log ("Game start as " + msg.role);
	startGame(msg.role, netUserID);

	// Initialize Messages that only the SLAVE processes
	if (msg.role == "slave") {
		console.log ("enabling coordsSync message");

		socket.on("coordsSync", function(coords){
			syncSlaveCoords(coords.stars);
		});

	}

	// Initialize Messages that both process
    socket.on("starkilled", function(msg){
    	console.log ("received starkilled msg " + msg);
    	recordStarKill(msg);
    });

    socket.on("pcoordsSync", function(msg){
    	showPlayers(msg.players);
	});

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

