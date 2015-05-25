

var game = null;
var role = "n/a";

init()


// helper function - to copy the coffee script existenstial operator
function exists(a) {return (a!==undefined && a!==null)}

function init() {
    networkSetup();
}

function startGame(r, id) {
    role = r;
    playerID = id;

    if (game == null) {
        $("#loading").hide();
        
        game = new Phaser.Game(800, 600, Phaser.CANVAS, 'testing-camera', { preload: preload, create: create, update: update, render: render }); 
    } else {
        // if this is a restart, then possibly reset REMOTE characters
        if (remotePlayers != null) {
            remotePlayers.removeAll(true);
        }

    }
    debugText = r;
}

function preload() {

    game.load.image('sky', 'assets/sky.png');
    game.load.image('ground', 'assets/platform.png');
    game.load.image('star', 'assets/star.png');
    game.load.spritesheet('dude', 'assets/dude.png', 32, 48);
    // AUDIO
    aJSON = audioJSON();
    console.log (aJSON);
    game.load.audiosprite('sfx', 'assets/fx_mixdown.ogg', null, aJSON);

}

// Global variables
var player;
var playerID;
var platforms;
var cursors;
var remotePlayers = null;

var stars;
var score = 0;
var scoreText;
var level = 1;
var fx;
var SEemitter;
var MAX_SE_SPEED = 400;

var PLAYER_XSPEED = 200;
var PLAYER_JUMP = -450;

var GROUND_HEIGHT = 32;

var GRAVITY = 400;

function create() {

    createWorld();
    createBkg();
    createMap();
    initSound();
    createPlayers();
    initNPC();
    initControls();

    // kick things off
    if (role=="master" || role=="local") {
        generateStars(stars, 5);
    }    

    scoreText.bringToTop();
}    

function createWorld() {
    //  We're going to be using physics, so enable the Arcade Physics system
    game.physics.startSystem(Phaser.Physics.ARCADE);
    game.stage.disableVisibilityChange = true;   


    game.world.setBounds(0, 0, 1600, 1200);
    game.physics.arcade.setBounds(0,0,game.world.width, game.world.height-GROUND_HEIGHT+10);

}
function createBkg() {
    //  A simple background for our game
    var s = game.add.sprite(0, 0, 'sky');
    s.scale.x = 2;
    s = game.add.sprite(0, 600, 'sky');
    s.scale.x = 2;
    //  The score
    scoreText = game.add.text(16, 16, ' Score: 0 ', { fontSize: '32px', fill: '#FFF' });

    scoreText.font = 'Arial Black';
    scoreText.fontSize = 40;
    scoreText.fontWeight = 'bold';
    scoreText.fixedToCamera = true;

    scoreText.setShadow(3, 3, 'rgba(0, 0, 0, 0.5)', 0);

}
function initSound(){    

    fx = game.add.audioSprite('sfx');
    fx.allowMultiple = true;
}
function createMap() {
    //  The platforms group contains the ground and the 2 ledges we can jump on
    platforms = game.add.group();

    //  We will enable physics for any object that is created in this group
    platforms.enableBody = true;

    // Here we create the ground.
    var ground = platforms.create(0, game.world.height - GROUND_HEIGHT, 'ground');

    //  Scale it to fit the width of the game (the original sprite is 400x32 in size)
    ground.scale.setTo(4, 2);

    //  This stops it from falling away when you jump on it
    ground.body.immovable = true;

    makePlatforms(200);
    makePlatforms(600);
    makePlatforms(-200);
}

// Show players that are provided by the server
//
// package is expected to be an array of objects
//
// [{p1}, {p2}]
//
// may contain other lists, but here we only look at players
//
function showPlayers(coords) {

    var rp;
    var rec;

    // create the group if not created yet
    if (remotePlayers == null) {
        remotePlayers = game.add.group();
    } else {
        remotePlayers.removeAll(true);
    }

    for (var i=0; i<coords.length; i++) {

        // walk thorugh all provided player coords
        rec = coords[i];

        // don't do anything for our own player
        if (rec.id != netUserID) {

            rp = remotePlayers.create(32, game.world.height - 150, 'dude');
            setPlayerCharacteristics(rp);
            rp.syncID = rec.id;
            rp.x = rec.x;
            rp.y = rec.y;
            rp.frame = rec.frame;
            rp.body.velocity.x = rec.vx;
            rp.body.velocity.y = rec.vy;
            if (rec.vx > 1) {
                rp.animations.play('right');
            } else if (rec.vx < -1) {
                rp.animations.play('left');
            }
        }    
    }
}


function createPlayers() {
    // The player and its settings
    player = game.add.sprite(32, game.world.height - 150, 'dude');
    player.syncID = playerID;
    setPlayerCharacteristics(player);
    game.camera.follow(player, Phaser.Camera.FOLLOW_TOPDOWN);
}

function setPlayerCharacteristics(rp) {
    //  We need to enable physics on the player
    game.physics.arcade.enable(rp);

    //  Player physics properties. Give the little guy a slight bounce.
    rp.body.bounce.y = 0.2;
    rp.body.gravity.y = GRAVITY;
    rp.body.collideWorldBounds = true;
    rp.body.setSize(rp.body.width*.50, rp.body.height*.5, rp.body.width*.25, rp.body.height*.5)

    //  Our two animations, walking left and right.
    rp.animations.add('left', [0, 1, 2, 3], 7, true);
    rp.animations.add('right', [5, 6, 7, 8], 7, true);        
}

function initNPC() {
    //  Finally some stars to collect
    stars = game.add.group();

    //  We will enable physics for any star that is created in this group
    stars.enableBody = true;
    SEemitter = game.add.emitter(0, 0, 300);

    SEemitter.makeParticles('star');
    SEemitter.gravity = 0;
}

function initControls() {
    //  Our controls.
    cursors = game.input.keyboard.createCursorKeys();
}

function makePlatforms(yoffset) {

    var ledge = platforms.create(400, 420+yoffset, 'ground');
    ledge.body.immovable = true;
    var ledge = platforms.create(1000, 420+yoffset, 'ground');
    ledge.body.immovable = true;

    ledge = platforms.create(-150, 350+yoffset, 'ground');
    ledge.body.immovable = true;

    ledge = platforms.create(200, 185+yoffset, 'ground');
    ledge.body.immovable = true;
    ledge = platforms.create(900, 185+yoffset, 'ground');
    ledge.body.immovable = true;

    ledge = platforms.create(800, 300+yoffset, 'ground');
    ledge.body.immovable = true;

}
function setPlayerState(play, platform) {
    play.onGround = true;
}

function update() {

    player.onGround = false;
    //  Collide the player and the stars with the platforms

    game.physics.arcade.collide(remotePlayers, platforms);
    game.physics.arcade.collide(player, platforms, setPlayerState);
    game.physics.arcade.collide(stars, platforms, friction);
    game.physics.arcade.collide(stars, stars);

    //  Checks to see if the player overlaps with any of the stars, if he does call the collectStar function
    game.physics.arcade.overlap(player, stars, collectStar, checkOverlapBounds, this);
    //game.physics.arcade.collide(player, stars, collectStar);

    //  Reset the players velocity (movement)
    player.body.velocity.x = 0;

    if (cursors.left.isDown) {
        player.body.velocity.x = -PLAYER_XSPEED;
        player.animations.play('left');
    }
    else if (cursors.right.isDown) {
        player.body.velocity.x = PLAYER_XSPEED;
        player.animations.play('right');
    }
    else
    {
        //  Stand still
        player.animations.stop();
        player.frame = 4;
    }
    
    //  Allow the player to jump if they are touching the ground.
    if (cursors.up.isDown && player.body.touching.down && player.onGround)
    {
        player.body.velocity.y = PLAYER_JUMP;
    }
    updateServerCoords(stars, player, role);
}

function checkOverlapBounds(player, star) {
    return true;
}

function syncSlaveCoords(coords) {

    stars.removeAll(true);
    generateStars (stars, coords.length, coords);
}


function generateStars(sgrp, amt, coords) {

    var spacing = game.world.width / amt;

    //  Here we'll create 12 of them evenly spaced apart
    for (var i = 0; i < amt; i++)
    {
        //  Create a star inside of the 'stars' group
        var star = sgrp.create(i * spacing, 0, 'star');

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
            star.syncID = coords[i].id;

        } else {
            //  This just gives each star a slightly random bounce value
            star.body.bounce.y = 0.7 + Math.random() * 0.2;
            star.body.bounce.x = 1; //0.7 + Math.random() * 0.2;
            star.body.velocity.x = -400 + (Math.random() * 800);
            star.body.velocity.y = -100 + (Math.random() * 200);
            star.syncID = i;
        }    

        star.body.setSize(star.body.width*.7, star.body.height*.8, star.body.width*.15, star.body.height*.2-2)


    }
}

var debugText = "testing-->";
function render() {

    game.debug.text(debugText, 32, 80);

}

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

function recordStarKill(id) {

    stars.forEachAlive(function(star){

        if (star.syncID == id) {
            particleBurst(star.body.position, SEemitter);
            fx.play("alien death");
            star.kill();
            maybeRegenerate();

            console.log ("killed star " + star.syncID);
        }   

    }, this );
}

function collectStar (player, star) {
    
    // Removes the star from the screen
    particleBurst(star.body.position, SEemitter);
    fx.play("alien death");

    //  Add and update the score
    score += 10;
    scoreText.text = ' Score: ' + score + " ";
    updateServerScore(score);

    console.log ("killing star " + star.syncID);
    netRecordKill(star.syncID);
    star.kill();
    maybeRegenerate();
}

function maybeRegenerate() {
    if (stars.total == 0 && (role == "local" || role == "master")) {

        stars.removeAll(true);
        generateStars(stars, 5+level*3);
        level++;
    }    
}

function particleBurst(pointer, emitter) {

    //  Position the emitter where the mouse/touch event was
    emitter.x = pointer.x;
    emitter.y = pointer.y;
    emitter.setXSpeed (-MAX_SE_SPEED, MAX_SE_SPEED);
    emitter.setYSpeed (-MAX_SE_SPEED, MAX_SE_SPEED);

    //  The first parameter sets the effect to "explode" which means all particles are emitted at once
    //  The second gives each particle a 2000ms lifespan
    //  The third is ignored when using burst/explode mode
    //  The final parameter (10) is how many particles will be emitted in this single burst
    
    emitter.setAlpha(1, 0, 2000);
    emitter.start(true, 2000, null, 20);
    emitter.forEach(sizeParticle, this);

}

function sizeParticle(particle) {
    if (particle != null) {
        
        var xd = Math.abs(particle.body.velocity.x);
        var yd = Math.abs(particle.body.velocity.y);
        
        
        var sc = 1.1 - (xd+yd)/(MAX_SE_SPEED*2);
        particle.scale.x = sc/1.5;
        particle.scale.y = sc/1.5;
    }        
}