

//--------------------------------------------------------------------------------------------
//
// NetCode Server
//
//
//

var fs = require('fs');
var path = require('path');
var bodyParser = require('body-parser');
var express = require('express');


// helper function - to copy the coffee script existenstial operator
function exists(a) {return (a!==undefined && a!==null)}

//======EXPRESS ROUTING ==========================================


var app = express()
var server = require('http').createServer(app)
var io = require("socket.io").listen(server);

app.set('port', process.env.OPENSHIFT_NODEJS_PORT || 3000);
app.set('ipaddr', process.env.OPENSHIFT_NODEJS_IP || "127.0.0.1");
app.use('/', express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

// process API calls
app.get('/api/socket-port', function(req,res) {

    var clientPort = app.get('port');
    if (process.env.OPENSHIFT_NODEJS_PORT != null) {
        clientPort -= 80;
    }
    res.writeHead(200, {"Content-Type": "application/json"});
    res.write(JSON.stringify({port: clientPort}));
    res.end();
});

server.listen(app.get('port'), app.get('ipaddr'), function(){
    logger('Express server listening on  IP: ' + app.get('ipaddr') + ' and port ' + app.get('port'));
});


//---------------------------------------------------------------
// Set up socket listeners
//---------------------------------------------------------------
io.on('connection', function(socket){
  // send the user their reg info
    logger('a user connected');
    createConnectionRecord(socket);

//---------------------------------------------
// username - client registration function
//---------------------------------------------
    socket.on('username', function(pmsg) {
        logger("USER-CONNECT");
        var msg = unpackMsg(socket, pmsg);
        registerUser (socket, msg, true);
    });

    //---------------------------------------------
    // score - client score update
    //---------------------------------------------
    socket.on('score', function(pmsg) {
        var msg = unpackMsg(socket, pmsg);
        recordScore (socket, msg);
    });
    //---------------------------------------------
    // coords - master client update of NPCs
    //---------------------------------------------
    socket.on('coords', function(pmsg) {
        var msg = unpackMsg(socket, pmsg);
        recordCoords (socket, msg);
    });
    //---------------------------------------------
    // pcoords - all clients update their player pos
    //---------------------------------------------
    socket.on('pcoords', function(pmsg) {
        var msg = unpackMsg(socket, pmsg);
        recordPCoords (socket, msg);
    });
    //---------------------------------------------
    // npcKill - all clients report when they have
    // killed/removed an NPC
    //---------------------------------------------
    socket.on('npcKill', function(pmsg) {
        var msg = unpackMsg(socket, pmsg);
        broadcastKill(msg);
    });
    //---------------------------------------------
    // pick_me - when looking for a new master, 
    // clients respond asking for the job
    //---------------------------------------------
    socket.on('pick_me', function(pmsg) {
        maybeNewMaster(pmsg);
    });
    //---------------------------------------------
    // disconnect - a client disconnected
    //---------------------------------------------
    socket.on('disconnect', function(msg){
        disconnectUser(socket, msg);
    });
});



//---------------------------------------------------------------------------------
// CORE functions
//---------------------------------------------------------------------------------

var currentMaster = null;
var masterCoords = null;
var connects = {}; 


//---------------------------------------------------------------------------------
// unpackMsg - all messages come in the form of {userID: ..., msg: ...}
// this returns the msg portion
//---------------------------------------------------------------------------------
function unpackMsg(socket, pmsg) {
    if ('msg' in pmsg) {
        return pmsg.msg;
    }
    return "";
}

//---------------------------------------------------------------------------------
// connectionID
//
// get the connection ID from the given socket 
//---------------------------------------------------------------------------------
function connectionID(socket) {
    return socket.client.conn.id;
}
//---------------------------------------------------------------------------------
// getConnectRecord
//
// gets the connection record for the given socket by matching the connectionID
// userID is ignored at this point 
//---------------------------------------------------------------------------------
function getConnectRecord(socket) {
    var id = connectionID(socket);
    if (id in connects) {
        return connects[id];
    }
    console.log ("ERROR: no connection record for given socket");
    // ?? socket.disconnect();
    return null;
}
//---------------------------------------------------------------------------------
// clientUserRole
//
// returns the user ROLE (local, master, slave) for the given socket based
// on the connection ID
//---------------------------------------------------------------------------------
function clientUserRole(socket) {
    var id = connectionID(socket);
    if (id in connects) {
        return connects[id].role;
    }
    console.log ("ERROR: no connection record for given socket");
    // ?? socket.disconnect();
    return null;    
}
//---------------------------------------------------------------------------------
// removeConnectRecord
//
// Removes the connection record for the given key
//---------------------------------------------------------------------------------
function removeConnectRecord(sid) {
    if (sid in connects) {
        delete connects[sid];
    } else {
        console.log ("WARNING: tried to delete non-existent connection record");
    }
}
//---------------------------------------------------------------------------------
// findUserConnectionRecord
//
// find the connection record for the given userID (finds first)
//---------------------------------------------------------------------------------
function findUserConnectionRecord (id) {
    for (var key in connects) {
        if (connects[key].userID == id) {
            return connects[key];
        }
    }
}

//---------------------------------------------------------------------------------
// createConnectionRecord
//
// This function is called on the initial socket connect, it creates a connection 
// record with role set to none, and userID to null
//---------------------------------------------------------------------------------
function createConnectionRecord(socket) {
    logger ("client IP: " + socket.client.conn.remoteAddress);
    logger ("connection ID: " + connectionID(socket));
    connects[connectionID(socket)] = {socket: socket, socketID: connectionID(socket), userID: null, role: "none"};
    logger (connects);
}

//---------------------------------------------------------------------------------
// registerUser
//
// when the "username" record is received, which is the first message the client sends
// after a successful connection, we register the userID into the connection record
// that was already established (or should have been)
//---------------------------------------------------------------------------------
function registerUser(socket, name, start) {

    var role = null;
    logger ("registering user " + name + " connid = " + connectionID(socket));

    //**** NEXT
    // Get rid of currentMaster
    <BREAK CODE HERE>
    
    if (currentMaster == null) {
        role = 'master';
        currentMaster = connectionID(socket);
        logger ("REGISTERED MASTER : " + connectionID(socket));
    } else {
        role = 'slave';
        logger ("REGISTERED SLAVE : " + connectionID(socket));
    }

    connects[connectionID(socket)].role = role;
    connects[connectionID(socket)].userID = name;

    if (start) {
        socket.emit("startGame", {role: role, id: connectionID(socket)});
    }  
    logger(connects);

}

function broadcastKill(msg) {
    logger ("starkill " + msg);
    io.sockets.emit('npckilled', msg);
}

function recordScore(socket, score) {
    var rec = getConnectRecord(socket);
    if (exists(rec)) {
        rec.score = score;
        logger ("Score registered for " + connectionID(socket) + " : " + score);
    }
}

var scount = 0;
var SEND_FRAC = 0;

function recordCoords(socket, coords) {
    // send coords out to any slaves
    var rec = getConnectRecord(socket);
    if (exists(rec) && 'npcs' in coords) {
        rec.coords = coords.npcs;
        io.sockets.emit("coordsSync", coords.npcs);

        if (scount++ > SEND_FRAC) {
            scount = 0;
            sendPlayerInfo();
        }
    }    
}

function sendPlayerInfo() {

    var res = {};
    res['remotePlayers'] = [];
    for (var key in connects) {
        if ('pcoords' in connects[key]) {
            res['remotePlayers'].push(connects[key]['pcoords']);
        }
    }
    io.sockets.emit("pcoordsSync", res);
}

function recordPCoords(socket, coords) {
    // send coords out to any slaves
    var rec = getConnectRecord(socket);
    if (exists(rec) && 'player' in coords) {
        connects[rec.socketID].pcoords = coords.player;
    }
}

function disconnectUser(socket, msg) {

    var rec = getConnectRecord(socket);

    if (exists(rec)) {

        logger(rec.role + ' user disconnected - id: ' + rec.socketID + ' - ' + rec.userID);
        removeConnectRecord(rec.socketID);

        if (missingMaster()) {
            currentMaster = null;
            findNewMaster();
        }
    }    
    logger ("disconnect");  
    logger(connects);
}

function findNewMaster() {
    logger ("need new master");
    io.sockets.emit("needNewMaster", " ");
}
function maybeNewMaster(msg) {
    var id = msg.userID;
    logger ("maybe new master " + id);

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
    logger ("missing master!");
    return true;
}

LOGGING_ON = true;
//==================================================================================
// LOGGER
function logger(msg) {
    if (LOGGING_ON) {
        console.log(msg);
    }
}


