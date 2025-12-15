import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import World from './World.js';
import Player from './Player.js';
import Input from './Input.js';
import ObstacleManager from './ObstacleManager.js';
import { LANES, CEILING_Y } from './constants.js';

let scene, camera, renderer;
let world, player, input, obstacles;
let clock;

// 🌟 GLOBAL REFERENCES FOR HUD ELEMENTS
let speedDiv; // Reference to the speed display element
let lastRunScoreDiv;
let highScoreDiv;

// ✅ SCORE AND SPEED MANAGEMENT
let score = 0;
let gameSpeed = 0; 
let selectedDifficulty = 'medium';
let difficultyMultiplier = 1;
let BASE_SPEED; // will be set from difficulty
const MAX_SPEED = 80;
const ACCELERATION = 0.002;

// 🌟 HIGH SCORE TRACKING
let highScore = 0;

// 🌟 GAME STATE MANAGEMENT
let gameState = 'MENU'; 
// MENU | TRANSITION | RUNNING | GAME_END | POST_COLLISION_PAUSE


// 🌟 CAMERA TRANSITION
let transitionStartTime = 0;
const TRANSITION_DURATION = 1.0; // seconds

const GAME_CAMERA_POSITION = new THREE.Vector3(0, 4, 8);

const GAME_CAMERA_LOOK = new THREE.Vector3(0, 0.8, -10);



// 🌟 DIFFICULTY SPEEDS
const DIFFICULTY_SPEEDS = { easy: 15, medium: 25, hard: 35 };

// 🌟 CAMERA CONFIG
const CAMERA_LANE_OFFSET = 1.2;
const CAMERA_Y_OFFSET = 3;
const CAMERA_LERP = 0.08;

// 🌟 MENU CAMERA CONFIG
const MENU_CAMERA_POSITION = new THREE.Vector3(-3.5, 2, 0);
const MENU_CAMERA_TARGET = new THREE.Vector3(0, 1, 0);

// 🔥 REMOVED activeExplosions

// 🌟 NEW: Pause timer for post-collision screen
let pauseStartTime = 0;
const POST_COLLISION_PAUSE_DURATION = 1.5; // seconds

init();
animate();

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202020);

    // Camera
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    // Start in menu view
    camera.position.copy(MENU_CAMERA_POSITION);
    camera.lookAt(MENU_CAMERA_TARGET);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    // Clock
    clock = new THREE.Clock();

    // Game objects
    world = new World(scene);
    player = new Player(scene);
    input = new Input();
    obstacles = new ObstacleManager(scene);

    // Set initial player position
    player.mesh.position.set(0, 1, 0);

    // ✅ Set up Score Display
    const scoreDiv = document.createElement('div');
    scoreDiv.id = 'score';
    scoreDiv.style.position = 'absolute';
    scoreDiv.style.top = '25px';
    scoreDiv.style.left = '10px';
    scoreDiv.style.color = 'white';
    scoreDiv.style.fontSize = '24px';
    scoreDiv.style.display = 'none'; // hide until game starts
    document.body.appendChild(scoreDiv);

    // 🌟 Game Speed Display
    speedDiv = document.createElement('div');
    speedDiv.id = 'gamespeed';
    speedDiv.style.position = 'absolute';
    speedDiv.style.top = '25px';
    speedDiv.style.right = '10px';
    speedDiv.style.color = 'white';
    speedDiv.style.fontSize = '24px';
    speedDiv.style.display = 'none'; // hide until game starts
    document.body.appendChild(speedDiv);

    // 🌟 Menu Score Displays
    lastRunScoreDiv = document.getElementById('last-run-score');
    highScoreDiv = document.getElementById('high-score');

    // Key listener for toggling speed display
    window.addEventListener('keydown', handleKeyToggle);

    window.addEventListener('resize', onWindowResize);

    // 🌟 Menu Elements
    const playButton = document.getElementById('play-button');
    if (playButton) playButton.addEventListener('click', startGame);

    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.difficulty-btn')
                .forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedDifficulty = btn.dataset.difficulty;
        });
    });

    // Set BASE_SPEED according to selected difficulty
    BASE_SPEED = DIFFICULTY_SPEEDS[selectedDifficulty];
}

function startGame() {
    if (gameState !== 'MENU') return;

    // Reset values
    score = 0;
    gameSpeed = DIFFICULTY_SPEEDS[selectedDifficulty];
    BASE_SPEED = DIFFICULTY_SPEEDS[selectedDifficulty];
    switch (selectedDifficulty) {
        case 'easy':
            difficultyMultiplier = 1.0;
            break;
        case 'medium':
            difficultyMultiplier = 1.5;
            break;
        case 'hard':
            difficultyMultiplier = 1.75;
            break;
    }

    // Reset player
    player.mesh.position.set(0, 1, 0);
    player.mesh.visible = true; // Ensure player is visible for the game

    // Hide menu
    const startScreen = document.getElementById('start-screen');
    if (startScreen) startScreen.classList.add('hidden');

    // Show HUD (but game still paused)
    document.getElementById('score').style.display = 'block';
    //if (speedDiv) speedDiv.style.display = 'block';

    // Start camera transition
    transitionStartTime = clock.getElapsedTime();
    gameState = 'TRANSITION';
}

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (gameState === 'RUNNING') {
        updateGameSpeed(delta);
        updateScore(delta);

        input.update();
        world.update(delta, gameSpeed);
        
        const hit = obstacles.update(delta, player, gameSpeed, score);

        if (hit) {
            endGame();
            return; // stop updating this frame
        }

        if (input.left) player.moveLeft();
        if (input.right) player.moveRight();
        player.update(delta, input, gameSpeed);

        updateGameCamera();
    }
    else if (gameState === 'POST_COLLISION_PAUSE') {
        // Linger on the crash screen
        if (clock.getElapsedTime() - pauseStartTime >= POST_COLLISION_PAUSE_DURATION) {
            transitionToMenu();
        }
    }
    else if (gameState === 'GAME_END') {
        // This state is now for the menu "fall" animation
        // We need to update the player (fall only) and menu camera
        player.update(delta, input, 0, true); // true for fall only
        updateMenuCamera();
    }
    else if (gameState === 'TRANSITION') {
        updateCameraTransition();
    }
    else if (gameState === 'MENU') {
        updateMenuCamera();
    }

    // 🔥 REMOVED updateExplosions

    renderer.render(scene, camera);
}

// Toggle HUD with 'I'
function handleKeyToggle(event) {
    if (gameState === 'RUNNING' && (event.key === 'i' || event.key === 'I')) {
        if (speedDiv.style.display === 'none') speedDiv.style.display = 'block';
        else speedDiv.style.display = 'none';
    }
}

// Update speed gradually
function updateGameSpeed(delta) {
    const elapsed = clock.getElapsedTime();
    const targetSpeed = BASE_SPEED + (elapsed * ACCELERATION * 10);
    gameSpeed = Math.min(targetSpeed, MAX_SPEED+BASE_SPEED);
}

// Update score and HUD
function updateScore(delta) {
    score += (gameSpeed * 0.5 * difficultyMultiplier) * delta;
    document.getElementById('score').innerText = `Score: ${Math.floor(score)}`;
    if (speedDiv) speedDiv.innerText = `Speed: ${gameSpeed.toFixed(1)} u/s`;
}

// Menu camera (side view)
function updateMenuCamera() {
    camera.position.copy(MENU_CAMERA_POSITION);
    camera.lookAt(MENU_CAMERA_TARGET);
    player.mesh.rotation.y = 0;

    // Transition from GAME_END to MENU when player is back at start position
    if (gameState === 'GAME_END' && player.mesh.position.y <= 1.0) {
        gameState = 'MENU';
        console.log('Returned to MENU');
        
        // Show menu
        const startScreen = document.getElementById('start-screen');
        if (startScreen) startScreen.classList.remove('hidden');
    }
}

function updateCameraTransition() {
    const elapsed = clock.getElapsedTime() - transitionStartTime;
    const t = Math.min(elapsed / TRANSITION_DURATION, 1);

    // Smoothstep easing
    const smoothT = t * t * (3 - 2 * t);

    // Interpolate position
    camera.position.lerpVectors(
        MENU_CAMERA_POSITION,
        GAME_CAMERA_POSITION,
        smoothT
    );

    // Interpolate look target
    const lookTarget = new THREE.Vector3().lerpVectors(
        MENU_CAMERA_TARGET,
        GAME_CAMERA_LOOK,
        smoothT
    );

    camera.lookAt(lookTarget);

    // Transition finished → start game
    if (t >= 1) {
        clock.start(); // start gameplay timer NOW
        gameState = 'RUNNING';
    }
}


// Game camera (behind player)
// Game camera (behind player)
function updateGameCamera() {
    // Horizontal target (slight lane bias)
    const laneX = LANES[player.laneIndex];
    const targetX = laneX * CAMERA_LANE_OFFSET;

    // Vertical target (follow player but clamp to ceiling)
    let targetY = player.mesh.position.y + CAMERA_Y_OFFSET;
    targetY = Math.min(targetY, CEILING_Y - 1);

    // Smooth camera movement
    camera.position.x += (targetX - camera.position.x) * CAMERA_LERP;
    camera.position.y += (targetY - camera.position.y) * CAMERA_LERP;

    // Always look slightly ahead of the player
    /*
    camera.lookAt(
        camera.position.x * 0.5,
        player.mesh.position.y,
        0
    );
    */
    
    // --- ✅ RECOMMENDED ADJUSTMENT START ---
    
    // Calculate the look target position
    const lookTargetX = camera.position.x;
    // To look slightly *down*, the target Y must be *lower* than the player's Y (1.0)
    // For example, 0.8 instead of 1.0 or 1.5.
    const lookTargetY = 0.8; // Original player ground level is 1.0. Lowering this points the camera down.
    const lookTargetZ = -10; // Pointing far down the lane (negative Z direction)

    camera.lookAt(
        camera.position.x,
        lookTargetY,
        -10
    );
    
    // --- ✅ RECOMMENDED ADJUSTMENT END ---
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function endGame() {
    if (gameState !== 'RUNNING') return;

    gameState = 'POST_COLLISION_PAUSE';
    input.reset?.();
    player.mesh.visible = false; // Hide player immediately
    
    // Start pause timer
    pauseStartTime = clock.getElapsedTime();

    console.log('GAME OVER - Paused on collision screen');
}

function transitionToMenu() {
    // This is called after the POST_COLLISION_PAUSE_DURATION is over
    
    gameState = 'GAME_END'; // Use this state for the player falling animation
    
    // Update scores on menu
    lastRunScoreDiv.innerText = `Last Run: ${Math.floor(score)}`;
    if (score > highScore) {
        highScore = score;
        highScoreDiv.innerText = `High Score: ${Math.floor(highScore)}`;
    }
    
    // Reset player position for the fall animation
    player.mesh.position.set(0, 10, 0); // Start high up
    player.mesh.visible = true;
    
    // Reset camera to menu view, which will now be updated in animate()
    camera.position.copy(MENU_CAMERA_POSITION);
    camera.lookAt(MENU_CAMERA_TARGET);
    
    // Hide HUD
    document.getElementById('score').style.display = 'none';
    if (speedDiv) speedDiv.style.display = 'none';

    // Remove all obstacles
    obstacles.reset?.(); // if your ObstacleManager has a reset function
    player.laneIndex = 1;
    // OR manually remove all obstacle meshes from the scene
    obstacles.obstacles.forEach(o => {
        scene.remove(o.mesh);
        // Best practice to dispose resources if needed:
        //o.mesh.geometry.dispose();
        //o.mesh.material.dispose();
    });
    obstacles.obstacles = [];
    
    console.log('Transitioning to MENU (Player Falling)');
}

// 🔥 REMOVED explodePlayer function