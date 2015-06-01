// helper function - to copy the coffee script existenstial operator
function exists(a) {return (a!==undefined && a!==null)}

NC = new NetCode({startGame: startGame,
                 NPCkill: NPCkill,
                 setRole: setRole,
                 showRemoteNPCs: showRemoteNPCs,
                 latencyUpdate: latencyUpdate,
                 updateScore: updateScore,
                 showRemotePlayers: showRemotePlayers});



// Global variables
var GAME = null;

// Store game globals into an object to keep it clean
// and prevent namespace collisions
var GV = {
    player: null,
    playerID: null,
    platforms: null,
    cursors: null,
    remotePlayers: null,

    stars: null,
    score: 0,
    scoreText: null,
    level: 1,
    fx: null,
    SEemitter: null,
    latency: 0,

    upPress: false,
    leftPress: false,
    rightPress: false
};

// "constants"
var MAX_SE_SPEED = 400;
var PLAYER_XSPEED = 200;
var PLAYER_JUMP = -450;
var GROUND_HEIGHT = 32;
var GRAVITY = 400;
var BUTTON_AREA_HEIGHT = 150;



//===========================================================================
// CALLBACKS FOR NetCode Module
//

//---------------------------------------------
// startGame
//---------------------------------------------
function startGame(id) {
    GV.playerID = id;

    if (GAME == null) {
        $("#loading").hide();
        
        GAME = new Phaser.Game(800, 700, Phaser.CANVAS, 'testing-camera', { preload: preload, create: create, update: update, render: render }); 
    } else {
        // if this is a restart, then possibly reset REMOTE characters
        if (GV.remotePlayers != null) {
            GV.remotePlayers.removeAll(true);
        }

    }
    debugText = NC.getRole();
}

//---------------------------------------------
// setRole
//---------------------------------------------
function setRole(oldRole, newRole) {
    debugText = newRole;
}

//---------------------------------------------
// latencyUpdate
//---------------------------------------------
function latencyUpdate(lat) {
    GV.latency = lat;
}

//---------------------------------------------
// showRemotePlayers
// Show players that are provided by the server
// package is expected to be an array of objects
//
// [{p1}, {p2}]
//
// may contain other lists, but here we only look at players
//
function showRemotePlayers(coords) {

    var rp;
    var rec;

    // create the group if not created yet
    if (GV.remotePlayers == null) {
        GV.remotePlayers = GAME.add.group();
    } else {
        GV.remotePlayers.removeAll(true);
    }

    for (var i=0; i<coords.length; i++) {

        // walk thorugh all provided player coords
        rec = coords[i];

        // don't do anything for our own player
        if (rec.id != NC.getUserID()) {

            rp = GV.remotePlayers.create(32, GAME.world.height - BUTTON_AREA_HEIGHT -150, 'dude');
            setPlayerCharacteristics(rp);
            rp.syncID = rec.id;
            rp.x = rec.x;
            rp.y = rec.y;
            rp.frame = rec.frame;
            rp.body.velocity.x = rec.xv;
            rp.body.velocity.y = rec.yv;
            if (rec.xv > 1) {
                rp.animations.play('right');
            } else if (rec.xv < -1) {
                rp.animations.play('left');
            }
        } else {
            // this ID is our client ID, so just grab the score
            if ('score' in rec) {
                updateScore(rec.score);
            }
        } 
    }
}

//---------------------------------------------
// showRemoteNPCs
//---------------------------------------------
function showRemoteNPCs(coords) {

    if (GV.stars != null) {
        GV.stars.removeAll(true);
    }    
    generateStars (GV.stars, coords.length, coords);
}

//---------------------------------------------
// removeNPC
//---------------------------------------------
function NPCkill(id) {

    console.log ("REMOVE NPC # " + id);
    GV.stars.forEachAlive(function(star){
        if (star.syncID == id) {
            starCollectEffect(star);
            star.kill();
            maybeRegenerate();
        }   

    }, this );
}

//---------------------------------------------
// updateScore
//---------------------------------------------
function updateScore(newScore) {

        GV.score = newScore;
        GV.scoreText.text = "Score: " + GV.score + "  ";
}

//===========================================================================
// CALLBACKS FOR Phaser Game Module
//

//---------------------------------------------
// preload
//---------------------------------------------

function preload() {

    GAME.load.image('sky', 'assets/sky.png');
    GAME.load.image('ground', 'assets/platform.png');
    GAME.load.image('star', 'assets/star.png');
    GAME.load.spritesheet('dude', 'assets/dude.png', 32, 48);
    // AUDIO
    aJSON = audioJSON();
    console.log (aJSON);
    GAME.load.audiosprite('sfx', 'assets/fx_mixdown.ogg', null, aJSON);
    GAME.load.spritesheet('uparrow', 'assets/uparrows.png', 100, 96, 2);
    GAME.load.spritesheet('leftarrow', 'assets/leftarrows.png', 100, 100, 2);
    GAME.load.spritesheet('rightarrow', 'assets/rightarrows.png', 100, 100, 2);

}

//---------------------------------------------
// create
//---------------------------------------------
function create() {

    createWorld();
    createBkg();
    createMap();
    initSound();
    createPlayers();
    initNPC();
    initControls();
    createButtons();

    // kick things off
    if (NC.getRole()=="master" || NC.getRole()=="local") {
        generateStars(GV.stars, 5);
    }    

    GV.scoreText.bringToTop();
}    

//---------------------------------------------
// update
//---------------------------------------------
function update() {

    GV.player.onGround = false;
    //  Collide the GV.player and the stars with the platforms

    GAME.physics.arcade.collide(GV.remotePlayers, GV.platforms);
    GAME.physics.arcade.collide(GV.player, GV.platforms, setPlayerState);
    GAME.physics.arcade.collide(GV.stars, GV.platforms, friction);
    GAME.physics.arcade.collide(GV.stars, GV.stars);

    //  Checks to see if the player overlaps with any of the stars, if he does call the collectStar function
    GAME.physics.arcade.overlap(GV.player, GV.stars, collectStar);

    //  Reset the players velocity (movement)
    GV.player.body.velocity.x = 0;

    if (GV.cursors.left.isDown || GV.leftPress) {
        GV.player.body.velocity.x = -PLAYER_XSPEED;
        GV.player.animations.play('left');
    }
    else if (GV.cursors.right.isDown || GV.rightPress) {
        GV.player.body.velocity.x = PLAYER_XSPEED;
        GV.player.animations.play('right');
    }
    else
    {
        //  Stand still
        GV.player.animations.stop();
        GV.player.frame = 4;
    }
    
    //  Allow the player to jump if they are touching the ground.
    if ( (GV.cursors.up.isDown || GV.upPress) && GV.player.body.touching.down && GV.player.onGround)
    {
        GV.player.body.velocity.y = PLAYER_JUMP;
    }

    updateServer();
}

//---------------------------------------------
// render
//---------------------------------------------
var debugText = "testing-->";
function render() {
    GAME.debug.text(debugText + " : "  + GV.latency + "ms", 32, 80);
}


//===========================================================================
//===========================================================================

//----------------------------------------------
// updateServer
//
// send NPC coords (if master) to server, and send player coords as well
// send {npcs: [], player: []}
//

function updateServer () {
    var coords = {};

    if (NC.getRole() == "master") {

        coords['npcs'] = [];

        GV.stars.forEachAlive(function(star) {
            coords['npcs'].push({id: star.syncID,
                         npcType: 'star',
                         opts: star.fdOpts,
                         x: star.x, 
                         y: star.y, 
                         xv: star.body.velocity.x, 
                         yv: star.body.velocity.y,
                         xb: star.body.bounce.x,
                         yb: star.body.bounce.y,
                         rt: star.body.rotation,
                         av: star.body.angularVelocity});
        }, this);
    }   

    coords['player'] = {
            x: GV.player.x,
            y: GV.player.y,
            xv: GV.player.body.velocity.x,
            yv: GV.player.body.velocity.y,
            id: NC.getUserID(),
            frame: GV.player.frame
        };

    NC.updateServerCoords(coords);
}

//---------------------------------------------
// createWorld
//---------------------------------------------
function createWorld() {

    //  We're going to be using physics, so enable the Arcade Physics system
    GAME.physics.startSystem(Phaser.Physics.ARCADE);
    GAME.stage.disableVisibilityChange = true;   


    GAME.world.setBounds(0, 0, 1600, 1200 + BUTTON_AREA_HEIGHT);
    GAME.physics.arcade.setBounds(0,0,GAME.world.width, GAME.world.height - BUTTON_AREA_HEIGHT - GROUND_HEIGHT+10);
}

//---------------------------------------------
// createButtons
//---------------------------------------------
function createButtons() {

    var button;

    // arrow buttons for mobile

    button = GAME.add.button(50, GAME.height - 100, 'leftarrow', null, this, 0, 0, 1, 0);
    button.fixedToCamera = true;
    button.onInputOver.add(function() {GV.leftPress = true; GV.rightPress = false}, this);
    button.onInputOut.add(function() {GV.leftPress = false}, this);
    //button.onInputDown.add(function() {GV.leftPress = true; GV.rightPress = false}, this);
    //button.onInputUp.add(function() {GV.leftPress = false}, this);
    button.bringToTop();
    button.scale.x = 1.5;

    button = GAME.add.button(320, GAME.height - 100, 'rightarrow', null, this, 0, 0, 1, 0);
    button.fixedToCamera = true;
    button.onInputOver.add(function() {GV.rightPress = true; GV.leftPress = false}, this);
    button.onInputOut.add(function() {GV.rightPress = false}, this);
    //button.onInputDown.add(function() {GV.leftPress = false; GV.rightPress = true}, this);
    //button.onInputUp.add(function() {GV.rightPress = false}, this);
    button.bringToTop();
    button.fixedtoCamera = false;
    button.scale.x = 1.5;

    button = GAME.add.button(640, GAME.height - 100, 'uparrow', null, this, 0, 0, 1, 0);
    button.fixedToCamera = true;
    button.onInputDown.add(function() {GV.upPress = true}, this);
    button.onInputUp.add(function() {GV.upPress = false}, this);
    button.bringToTop();
    button.fixedtoCamera = true;
    button.scale.x = 1.5;

}

//---------------------------------------------
// createBkg
//---------------------------------------------
function createBkg() {
    //  A simple background for our GAME
    var s = GAME.add.sprite(0, 0, 'sky');
    s.scale.x = 2;
    s = GAME.add.sprite(0, 600, 'sky');
    s.scale.x = 2;
    //  The score
    GV.scoreText = GAME.add.text(16, 16, ' Score: 0 ', { fontSize: '32px', fill: '#FFF' });

    GV.scoreText.font = 'Arial Black';
    GV.scoreText.fontSize = 40;
    GV.scoreText.fontWeight = 'bold';
    GV.scoreText.fixedToCamera = true;

    GV.scoreText.setShadow(3, 3, 'rgba(0, 0, 0, 0.5)', 0);

}
//---------------------------------------------
// initSound
//---------------------------------------------
function initSound(){    

    GV.fx = GAME.add.audioSprite('sfx');
    GV.fx.allowMultiple = true;
}
//---------------------------------------------
// createMap
//---------------------------------------------
function createMap() {
    //  The platforms group contains the ground and the 2 ledges we can jump on
    GV.platforms = GAME.add.group();

    //  We will enable physics for any object that is created in this group
    GV.platforms.enableBody = true;

    // Here we create the ground.
    var ground = GV.platforms.create(0, GAME.world.height - GROUND_HEIGHT - BUTTON_AREA_HEIGHT, 'ground');

    //  Scale it to fit the width of the GAME (the original sprite is 400x32 in size)
    ground.scale.setTo(4, 1);

    //  This stops it from falling away when you jump on it
    ground.body.immovable = true;

    makePlatforms(200);
    makePlatforms(600);
    makePlatforms(-200);
}

//---------------------------------------------
// createPlayers
//---------------------------------------------
function createPlayers() {
    // The player and its settings
    GV.player = GAME.add.sprite(32, GAME.world.height - 150 - BUTTON_AREA_HEIGHT, 'dude');
    GV.player.syncID = GV.playerID;
    setPlayerCharacteristics(GV.player);
    GAME.camera.follow(GV.player, Phaser.Camera.FOLLOW_TOPDOWN);
}

//---------------------------------------------
// setPlayerCharacteristics
//---------------------------------------------
function setPlayerCharacteristics(rp) {
    //  We need to enable physics on the player
    GAME.physics.arcade.enable(rp);

    //  Player physics properties. Give the little guy a slight bounce.
    rp.body.bounce.y = 0.2;
    rp.body.gravity.y = GRAVITY;
    rp.body.collideWorldBounds = true;
    rp.body.setSize(rp.body.width*.50, rp.body.height*.5, rp.body.width*.25, rp.body.height*.5)

    //  Our two animations, walking left and right.
    rp.animations.add('left', [0, 1, 2, 3], 7, true);
    rp.animations.add('right', [5, 6, 7, 8], 7, true);        
}

//---------------------------------------------
// initNPC
//---------------------------------------------
function initNPC() {
    //  Finally some stars to collect
    GV.stars = GAME.add.group();

    //  We will enable physics for any star that is created in this group
    GV.stars.enableBody = true;

    // init the emitter for the star explosion
    GV.SEemitter = GAME.add.emitter(0, 0, 300);
    GV.SEemitter.makeParticles('star');
    GV.SEemitter.gravity = 0;
}

//---------------------------------------------
// initControls
//---------------------------------------------
function initControls() {
    //  Our controls.
    GV.cursors = GAME.input.keyboard.createCursorKeys();
}

//---------------------------------------------
// makePlatforms
//---------------------------------------------
function makePlatforms(yoffset) {

    //yoffset -= BUTTON_AREA_HEIGHT*2;
    var ledge = GV.platforms.create(400, 420+yoffset, 'ground');
    ledge.body.immovable = true;
    var ledge = GV.platforms.create(1000, 420+yoffset, 'ground');
    ledge.body.immovable = true;

    ledge = GV.platforms.create(-150, 350+yoffset, 'ground');
    ledge.body.immovable = true;

    ledge = GV.platforms.create(200, 185+yoffset, 'ground');
    ledge.body.immovable = true;
    ledge = GV.platforms.create(900, 185+yoffset, 'ground');
    ledge.body.immovable = true;

    ledge = GV.platforms.create(800, 300+yoffset, 'ground');
    ledge.body.immovable = true;

}

//---------------------------------------------
// setPlayerState
//---------------------------------------------
function setPlayerState(play, platform) {
    play.onGround = true;
}

//---------------------------------------------
// generateStars
//---------------------------------------------
function generateStars(sgrp, amt, coords) {

    var spacing = GAME.world.width / amt;

    //  Here we'll create 12 of them evenly spaced apart
    for (var i = 0; i < amt; i++)
    {
        //  Create a star inside of the 'stars' group
        var star = sgrp.create(i * spacing, 0, 'star');

        // create the space for game specific options
        star.fdOpts = {inLimbo: false};

        //  Let gravity do its thing
        star.body.gravity.y = GRAVITY;
        star.body.collideWorldBounds = true;
        star.anchor.x = 0.5;
        star.anchor.y = 0.5;

        if (coords) {
            star.x = coords[i].x;
            star.y = coords[i].y;
            star.body.velocity.x = coords[i].xv;
            star.body.velocity.y = coords[i].yv;
            star.body.bounce.x = coords[i].xb;
            star.body.bounce.y = coords[i].yb;
            star.body.angularVelocity = coords[i].av;
            star.rotation = coords[i].rt;
            star.fdOpts = coords[i].opts;

            // check for special options for these NPC stars
            if (getNPCOpt(star, 'dblscore')) {
                star.scale.x = 1.5;
                star.scale.y = 1.5;
                //star.body.scale.x = 1.5;
                //star.body.scale.y = 1.5;
            }
            star.syncID = coords[i].id;

        } else {
            //  This just gives each star a slightly random bounce value
            star.body.bounce.y = 0.7 + Math.random() * 0.2;
            star.body.bounce.x = 1; //0.7 + Math.random() * 0.2;
            star.body.velocity.x = -400 + (Math.random() * 800);
            star.body.velocity.y = -100 + (Math.random() * 200);
            star.syncID = i;
            star.fdOpts.value = 10; // these values only used for local mode
            //
            // randomly determine special stars
            //
            var optRand = (Math.random)() * 100;
            if (optRand > 80) {
                star['fdOpts'] = {dblscore: true};
                star.scale.x = 1.5;
                star.scale.y = 1.5;
                star.fdOpts.value = 50;  // used for local mode, otherwise values determined by the server
            }
        }    

        star.body.setSize(star.body.width*.7, star.body.height*.8, star.body.width*.15, star.body.height*.2-2)


    }
}

//---------------------------------------------
// friction
//---------------------------------------------
function friction (star, platform) {

    var dir = -1;
    if (star.body.touching.down) {
        dir = 1;
    } 
    if (star.body.velocity.x < 0) {
        star.body.velocity.x += 0.5;
        star.body.angularVelocity = star.body.velocity.x * 3.14 * dir;
    } else {
        star.body.velocity.x -= 0.5;
        star.body.angularVelocity = star.body.velocity.x * 3.14 * dir;
    }
}

//---------------------------------------------
// getNPCOpts
//---------------------------------------------
function getNPCOpt(npc, opt) {
    if ('fdOpts' in npc && opt in npc.fdOpts) {
        return npc.fdOpts
    }
    return null;
}

//---------------------------------------------
// collectStar
//---------------------------------------------
function collectStar (player, star) {
    
    // Removes the star from the screen
    if (star.fdOpts.inLimbo) {
        return;
    }

    console.log ("trying to kill star " + star.syncID);
    starCollectEffect(star);

    NC.netRecordKill(star.syncID);

    if (NC.getRole() == 'local') {
        star.kill();  // Problem, should we kill the sprite here or wait for server message?  Alternatively, we can
                      // mark star.inLimbo to let it keep moving, but ignore future collisions
        maybeRegenerate();
        updateScore(GV.score+star.fdOpts.value);
    } else {
        star.fdOpts.inLimbo = true;  // still will exist, but cannot be collected again
        // TODO: If threshold does not match, then will not get a "kill" message
        // set a timeout value to turn limbo off since no score is registered
    }    
}

//---------------------------------------------
// maybeRegenerate
//---------------------------------------------
function maybeRegenerate() {
    if (GV.stars.total == 0 && (NC.getRole() == "local" || NC.getRole() == "master")) {

        GV.stars.removeAll(true);
        generateStars(GV.stars, 5+GV.level*3);
        GV.level++;
    }    
}

//---------------------------------------------
// starCollectEffect
//---------------------------------------------
function starCollectEffect(star) {
    if (getNPCOpt(star, 'dblscore')) {
        particleBurst(star.body.position, GV.SEemitter, 1.5);
        GV.fx.play("boss hit");
    } else {
        particleBurst(star.body.position, GV.SEemitter);
        GV.fx.play("alien death");
    }        
}

//---------------------------------------------
// particleBurst
//---------------------------------------------
function particleBurst(pointer, emitter, burstFactor) {

    if (!exists(burstFactor)) {
        burstFactor = 1;
    }
    //  Position the emitter where the mouse/touch event was
    emitter.x = pointer.x;
    emitter.y = pointer.y;
    emitter.setXSpeed (-MAX_SE_SPEED, MAX_SE_SPEED);
    emitter.setYSpeed (-MAX_SE_SPEED, MAX_SE_SPEED);

    //  The first parameter sets the effect to "explode" which means all particles are emitted at once
    //  The second gives each particle a 2000ms lifespan
    //  The third is ignored when using burst/explode mode
    //  The final parameter (10) is how many particles will be emitted in this single burst
    
    emitter.setAlpha(1, 0, 2000*burstFactor);
    emitter.start(true, 2000*burstFactor, null, 20*burstFactor);
    emitter.forEach(sizeParticle, this);

}

//---------------------------------------------
// sizeParticle
//---------------------------------------------
function sizeParticle(particle) {
    if (particle != null) {
        
        var xd = Math.abs(particle.body.velocity.x);
        var yd = Math.abs(particle.body.velocity.y);
        
        
        var sc = 1.1 - (xd+yd)/(MAX_SE_SPEED*2);
        particle.scale.x = sc/1.5;
        particle.scale.y = sc/1.5;
    }        
}



