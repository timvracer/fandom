

//
// connection-> registers the user by connection ID (as a user) - not "alive" yet
// username-> client registers the user, associated with the connection ID, assigned slave or master
//      -> startGame (role) sent to client to get things rolling
// disconect-> client disconnect, connectionID no longer valid
//
//
// following methods are ignored by the client until startGame is completed
//
// score-> player score update, current player score recorded
//
// coords-> master update of NPC's (system of record)
//      -> coordsSync sent to all clients with updated NPC coords (only slaves listen)
// starkill-> client reports an NPC kill
//      -> starkilled sent to all clients
//
//

var fs = require('fs');
var path = require('path');
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

// helper function - to copy the coffee script existenstial operator
function exists(a) {return (a!==undefined && a!==null)}


// Set up socket listeners------------------------
//
io.on('connection', function(socket){
  // send the user their reg info
    console.log('a user connected');
    registerSocketUser (socket);

    socket.on('username', function(pmsg) {
        console.log("USER-CONNECT");
        var msg = unpackMsg(pmsg);
        recordUser (socket, msg, true);
    });
    //socket.on('username-reconnect', function(pmsg) {
    //  console.log ("USER-RECONNECT");
    //  var msg = unpackMsg(pmsg);
    //  recordUser (socket, msg, false);
    //});
    socket.on('score', function(pmsg) {
        var msg = unpackMsg(pmsg);
        recordScore (socket, msg);
    });
    socket.on('coords', function(pmsg) {
        var msg = unpackMsg(pmsg);
        recordCoords (socket, msg);
    });
    socket.on('pcoords', function(pmsg) {
        var msg = unpackMsg(pmsg);
        recordPCoords (socket, msg);
    });
    socket.on('starkill', function(pmsg) {
        var msg = unpackMsg(pmsg);
        broadcastKill(msg);
    });
    // try to grab master if not set
    socket.on('pick_me', function(pmsg) {
        maybeNewMaster(pmsg);
    });

    socket.on('disconnect', function(msg){
        disconnectUser(socket, msg);
    });
});

//======EXPRESS ROUTING ===========================

var server_port = process.env.OPENSHIFT_NODEJS_PORT || 8080;
var server_ip_address = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1';
 
var socket_port = parseInt(server_port) + 1;

// Socket Listener
http.listen(parseInt(socket_port), server_ip_address, function(){
    console.log('listening on ' + server_ip_address + ':' + socket_port);
});


// HTTP Listener / Server
app.set('port', server_port);

// process API calls
app.get('/api/socket-port', function(req,res) {
    res.writeHead(200, {"Content-Type": "application/json"});
    res.write(JSON.stringify({port: socket_port}));
    res.end();
});

app.use('/', express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

app.listen(app.get('port'), server_ip_address, function() {
    console.log('Server started: http://' + server_ip_address + ':' + app.get('port') + '/');
});


//---------------------------------------------------------------------------------
//
var currentMaster = null;
var masterCoords = null;
var pcoordsCache = {players: []};
var connects = {}; 


function unpackMsg(pmsg) {
    return pmsg.msg;
}

function clientUserID(socket) {
    return socket.client.conn.id;
}

function getConnectRecord(socket) {
    return connects[clientUserID(socket)];
}

function clientUserRole(socket) {
    return connects[clientUserID(socket)].role;
}
function removeConnectRecord(sid) {
    delete connects[sid];
}
function removePcoordsCacheRecord(sid) {
    delete pcoordsCache.players[sid];
}
function findUserConnectionRecord (id) {
    for (var key in connects) {
        if (connects[key].userID == id) {
            return connects[key];
        }
    }
}

function registerSocketUser(socket) {
    console.log ("client IP: " + socket.client.conn.remoteAddress);
    console.log ("connection ID: " + clientUserID(socket));
    connects[clientUserID(socket)] = {socket: socket, socketID: clientUserID(socket), userID: null, role: "none"};
    console.log (connects);
}


function recordUser(socket, name, start) {

    var role = null;

    console.log ("registering user " + name + " connid = " + clientUserID(socket));

    if (currentMaster == null) {
        role = 'master';
        currentMaster = clientUserID(socket);
        console.log ("REGISTERED MASTER : " + clientUserID(socket));
    } else {
        role = 'slave';
        console.log ("REGISTERED SLAVE : " + clientUserID(socket));
    }

    connects[clientUserID(socket)].role = role;
    connects[clientUserID(socket)].userID = name;

    if (start) {
        socket.emit("startGame", {role: role, id: clientUserID(socket)});
    }  
    console.log(connects);

}

function broadcastKill(msg) {
    console.log ("starkill " + msg);
    io.sockets.emit('starkilled', msg);
}

function recordScore(socket, score) {
    var rec = getConnectRecord(socket);
    if (exists(rec)) {
        rec.score = score;
        console.log ("Score registered for " + clientUserID(socket) + " : " + score);
    }
}

var scount = 0;
var SEND_FRAC = 0;

function recordCoords(socket, coords) {
    // send coords out to any slaves
    var rec = getConnectRecord(socket);
    if (exists(rec)) {
        rec.coords = coords;
        io.sockets.emit("coordsSync", coords);

        if (scount++ > SEND_FRAC) {
            scount = 0;
            sendPlayerCoords();
        }
    }    
}

function sendPlayerCoords() {

    var res = {};
    for (var key in pcoordsCache) {
        res[key] = [];
        for (var k2 in pcoordsCache[key]) {
            res[key].push(pcoordsCache[key][k2]);
        }
    }
    io.sockets.emit("pcoordsSync", res);
}

function recordPCoords(socket, coords) {
    // send coords out to any slaves
    var rec = getConnectRecord(socket);
    if (exists(rec)) {
        connects[rec.socketID].pcoords = coords;
        pcoordsCache.players[rec.socketID] = coords;
    }
}

function disconnectUser(socket, msg) {

    var rec = getConnectRecord(socket);

    if (exists(rec)) {

        console.log(rec.role + ' user disconnected - id: ' + rec.socketID + ' - ' + rec.userID);
        removePcoordsCacheRecord(rec.socketID);
        removeConnectRecord(rec.socketID);

        if (missingMaster()) {
            currentMaster = null;
            findNewMaster();
        }
    }    
    console.log ("disconnect");  
    console.log(connects);
    console.log(pcoordsCache);
}

function findNewMaster() {
    console.log ("need new master");
    io.sockets.emit("needNewMaster", " ");
}
function maybeNewMaster(msg) {
    var id = msg.userID;
    console.log ("maybe new master " + id);

    rec = findUserConnectionRecord(id);
    if (currentMaster == null) {
        // critical section here, will need a true atomic semaphore
        //
        currentMaster = rec.socketID;
        rec.role = 'master';
        rec.socket.emit ("roleChange", "master");
    }
}

function missingMaster() {

    for (var key in connects) {
        if (connects[key].role == 'master') {
            return false;
        }
    }
    console.log ("missing master!");
    return true;
}



