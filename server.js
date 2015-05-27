

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
    //---------------------------------------------
    // ping - used for latency checks
    //---------------------------------------------
    socket.on('ping', function() {
        socket.emit('pong');
    });
    
});



//---------------------------------------------------------------------------------
// CORE functions
//---------------------------------------------------------------------------------

var CONNECTS = {}; 


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
    if (id in CONNECTS) {
        return CONNECTS[id];
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
    if (id in CONNECTS) {
        return CONNECTS[id].role;
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
    if (sid in CONNECTS) {
        delete CONNECTS[sid];
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
    for (var key in CONNECTS) {
        if (CONNECTS[key].userID == id) {
            return CONNECTS[key];
        }
    }
}
//---------------------------------------------------------------------------------
// findMasterRecord
//
// find the connection record for the master (first one) - there should not be
// any duplicate!
//---------------------------------------------------------------------------------
function findMasterRecord() {
    for (var key in CONNECTS) {
        if (CONNECTS[key].role == 'master') {
            return CONNECTS[key];
        }
    }
    return null;
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
    CONNECTS[connectionID(socket)] = {socket: socket, socketID: connectionID(socket), userID: null, role: "none"};
    logger (CONNECTS);
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

    if (findMasterRecord() == null) {
        role = 'master';
        logger ("REGISTERED MASTER : " + connectionID(socket));
    } else {
        role = 'slave';
        logger ("REGISTERED SLAVE : " + connectionID(socket));
    }

    CONNECTS[connectionID(socket)].role = role;
    CONNECTS[connectionID(socket)].userID = name;

    //
    // TODO: need to validate that we receive messages from the master within 
    // a short period of time, otherwise we demote the master (if others are avail)
    //
    if (start) {
        socket.emit("startGame", {role: role, id: connectionID(socket)});
    }  
    logger(CONNECTS);

}

//---------------------------------------------------------------------------------
// broadcastKill
//
// send to all clients the death/removal of an NPC
//
// TODO: Note, this may become part of the coords message, in which dead npc's are
// indicated in the coords package.  Again, reduces traffic/noise
//---------------------------------------------------------------------------------
function broadcastKill(msg) {
    logger ("starkill " + msg);
    io.sockets.emit('npckilled', msg);
}

//---------------------------------------------------------------------------------
// recordScore
//
// record the self-reported score from the client, this of course will be changed
// to be counted on the server in the future (totally hackable right now)
//---------------------------------------------------------------------------------
function recordScore(socket, score) {
    var rec = getConnectRecord(socket);
    if (exists(rec)) {
        rec.score = score;
        logger ("Score registered for " + connectionID(socket) + " : " + score);
    }
}

//---------------------------------------------------------------------------------
// recordCoords
//
// called when the master reports NPC coordinates.  We in turn directly broadcast
// both the npc coords, and the combined players coords to all clients.
//
// TODO: This will be placed on an independent event loop and sent at a configured
// time cadence independent of the receipt of coords from the master
//---------------------------------------------------------------------------------
var SCOUNT = 0;
var SEND_FRAC = 0;

function recordCoords(socket, coords) {
    // send coords out to any slaves
    var rec = getConnectRecord(socket);
    if (exists(rec) && 'npcs' in coords) {
        rec.coords = coords.npcs;
        io.sockets.emit("coordsSync", coords.npcs);

        // used to send player information fractionally to NPC coord info
        // all this goes away when we refactor coords sending
        // TODO
        if (SCOUNT++ > SEND_FRAC) {
            SCOUNT = 0;
            sendPlayerInfo();
        }
    }    
}

//---------------------------------------------------------------------------------
// sendPlayerInfo
//
// send all player coordinates to all clients
//---------------------------------------------------------------------------------
function sendPlayerInfo() {

    var res = {};
    res['remotePlayers'] = [];
    for (var key in CONNECTS) {
        if ('pcoords' in CONNECTS[key]) {
            res['remotePlayers'].push(CONNECTS[key]['pcoords']);
        }
    }
    io.sockets.emit("pcoordsSync", res);
}

//---------------------------------------------------------------------------------
// recordPCoords
//
// called when any client submits their player-related coordinates.  Only supports
// player position today, but will support all player related objects
//
//---------------------------------------------------------------------------------
function recordPCoords(socket, coords) {
    // send coords out to any slaves
    var rec = getConnectRecord(socket);
    if (exists(rec) && 'player' in coords) {
        CONNECTS[rec.socketID].pcoords = coords.player;
    }
}

//---------------------------------------------------------------------------------
// disconnectUser
//
// Called when a disconnect is received from a client (may or may not reconnect quickly)
// removes the associated connection record 
//
// TODO: today this works because the client is maintaining player specific info like
// score.  When this is stored by the server, we either have to maintain the connection
// record, or create a new store indexed by userID (session ID).  Alternatively, we may
// store persistant pan-session info in a DB indexed by cookieID.  
//---------------------------------------------------------------------------------
function disconnectUser(socket, msg) {

    var rec = getConnectRecord(socket);

    if (exists(rec)) {

        logger(rec.role + ' user disconnected - id: ' + rec.socketID + ' - ' + rec.userID);
        removeConnectRecord(rec.socketID);

        if (findMasterRecord() == null) {
            findNewMaster();
        }
    }    
    logger ("disconnect");  
    logger(CONNECTS);
}

//---------------------------------------------------------------------------------
// findNewMaster
//
// Called anytime it is detected that there is no longer a master connected
// tries to find any slave who is willing to be a master
//---------------------------------------------------------------------------------
function findNewMaster() {
    logger ("need new master");
    io.sockets.emit("needNewMaster", " ");
}
//---------------------------------------------------------------------------------
// maybeNewMaster
//
// called when a slave client says they want to be the new master
// TODO: critical section needs to be managed by a shared key if 
// using more than one server per world
//
//---------------------------------------------------------------------------------
var PROCESSING = false;

function maybeNewMaster(msg) {
    var id = msg.userID;
    logger ("maybe new master " + id);

    rec = findUserConnectionRecord(id);
    //
    // CRITICAL SECTION --- need to implement a process semphore
    //
    if (findMasterRecord() == null && !PROCESSING) {
        PROCESSING = true;
        rec.role = 'master';
        rec.socket.emit ("roleChange", "master");
    }
    PROCESSING = false;
}

LOGGING_ON = true;
//==================================================================================
// LOGGER
function logger(msg) {
    if (LOGGING_ON) {
        console.log(msg);
    }
}


