import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import World from './World.js';
import Player from './Player.js';
import Input from './Input.js';
import ObstacleManager from './ObstacleManager.js';
import { LANES, CEILING_Y } from './constants.js';

let scene, camera, renderer;
let world, player, input, obstacles;
let clock;

// HUD Elements
let speedDiv;
let lastRunScoreDiv;
let highScoreDiv;

// Game state
let score = 0;
let gameSpeed = 0;
let selectedDifficulty = 'medium';
let difficultyMultiplier = 1;
let BASE_SPEED;
const MAX_SPEED = 80;
let ACCELERATION = 0.002;
let highScore = 0;

let gameState = 'MENU'; // MENU | TRANSITION | RUNNING | GAME_END | POST_COLLISION_PAUSE

// Camera & transitions
let transitionStartTime = 0;
const TRANSITION_DURATION = 1.0;
const GAME_CAMERA_POSITION = new THREE.Vector3(0, 4, 8);
const GAME_CAMERA_LOOK = new THREE.Vector3(0, 0.8, -10);
const MENU_CAMERA_POSITION = new THREE.Vector3(-3.5, 2, 0);
const MENU_CAMERA_TARGET = new THREE.Vector3(0, 1.5, 0);
const CAMERA_LANE_OFFSET = 1.2;
const CAMERA_Y_OFFSET = 3;
const CAMERA_LERP = 0.08;
let pauseStartTime = 0;
const POST_COLLISION_PAUSE_DURATION = 1.5;

let isFullMode = false;

const DIFFICULTY_SPEEDS = { easy: 15, medium: 25, hard: 35 };

init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202020);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.copy(MENU_CAMERA_POSITION);
    camera.lookAt(MENU_CAMERA_TARGET);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    clock = new THREE.Clock();

    input = new Input();

    const modeToggle = document.getElementById('modeToggle');
    isFullMode = modeToggle.checked;
    modeToggle.addEventListener('change', (event) => {
        isFullMode = event.target.checked;
        //console.log(`Switched to: ${isFullMode ? 'Full Mode' : 'Prototype Mode'}`);
        resetGameObjects(isFullMode);
    });

    resetGameObjects(isFullMode);
    player.mesh.position.set(0, 2, 0);

    // Score display
    const scoreDivElem = document.createElement('div');
    scoreDivElem.id = 'score';
    scoreDivElem.style.position = 'absolute';
    scoreDivElem.style.top = '25px';
    scoreDivElem.style.left = '10px';
    scoreDivElem.style.color = 'white';
    scoreDivElem.style.fontSize = '24px';
    scoreDivElem.style.display = 'none';
    document.body.appendChild(scoreDivElem);

    speedDiv = document.createElement('div');
    speedDiv.id = 'gamespeed';
    speedDiv.style.position = 'absolute';
    speedDiv.style.top = '25px';
    speedDiv.style.right = '10px';
    speedDiv.style.color = 'white';
    speedDiv.style.fontSize = '24px';
    speedDiv.style.display = 'none';
    document.body.appendChild(speedDiv);

    lastRunScoreDiv = document.getElementById('last-run-score');
    highScoreDiv = document.getElementById('high-score');

    window.addEventListener('keydown', handleKeyToggle);
    window.addEventListener('resize', onWindowResize);

    const playButton = document.getElementById('play-button');
    if (playButton) playButton.addEventListener('click', startGame);

    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedDifficulty = btn.dataset.difficulty;
        });
    });

    BASE_SPEED = DIFFICULTY_SPEEDS[selectedDifficulty];
}

function resetGameObjects(isFullMode) {
    // 1. Cleanup old World (Remove meshes/lights from scene)
    if (world && typeof world.destroy === 'function') {
        world.destroy();
    }

    // 2. Cleanup Obstacles and Player
    if (obstacles) obstacles.reset?.();
    if (player && player.mesh) scene.remove(player.mesh);

    // 3. Re-instantiate with the new mode
    // Note: If your World class uses 'prototype' as the second arg, 
    // pass !isFullMode (or however your logic defines prototype).
    world = new World(scene, !isFullMode); 
    player = new Player(scene, isFullMode);
    obstacles = new ObstacleManager(scene, isFullMode);

    player.mesh.position.set(0, 2, 0);

    // Visibility logic
    if (gameState === 'MENU' || gameState === 'GAME_END') {
        player.mesh.visible = true;
    } else {
        player.mesh.visible = true;
    }
}

function startGame() {
    if (gameState !== 'MENU') return;

    score = 0;
    gameSpeed = DIFFICULTY_SPEEDS[selectedDifficulty];
    BASE_SPEED = DIFFICULTY_SPEEDS[selectedDifficulty];
    switch (selectedDifficulty) {
        case 'easy': difficultyMultiplier = 1.0; break;
        case 'medium': difficultyMultiplier = 1.5; break;
        case 'hard': difficultyMultiplier = 1.75; break;
    }

    switch (selectedDifficulty) {
        case 'easy': ACCELERATION = 0.002; break;
        case 'medium': ACCELERATION = 0.003; break;
        case 'hard': ACCELERATION = 0.005; break;
    }

    player.mesh.position.set(0, 2, 0);
    player.mesh.visible = true;

    const startScreen = document.getElementById('start-screen');
    if (startScreen) startScreen.classList.add('hidden');

    document.getElementById('score').style.display = 'block';
    // speedDiv.style.display = 'block'; // optional

    transitionStartTime = clock.getElapsedTime();
    gameState = 'TRANSITION';
}

function animate() {
    requestAnimationFrame(animate);
    
    // --- LOADING CHECK ---
    // If the player object or its 3D mesh haven't loaded yet, stop here.
    if (!player || !player.mesh) {
        //console.log("Waiting for player model...");
        return; 
    }
    // ---------------------

    const delta = clock.getDelta();

    switch (gameState) {
        case 'RUNNING':
            updateGameSpeed(delta);
            updateScore(delta);
            input.update();
            world.update(delta, gameSpeed);

            const hit = obstacles.update(delta, player, gameSpeed, score);
            if (hit) { endGame(); return; }

            if (input.left) player.moveLeft();
            if (input.right) player.moveRight();
            player.update(delta, input, gameSpeed);

            updateGameCamera();
            break;

        case 'POST_COLLISION_PAUSE':
            if (clock.getElapsedTime() - pauseStartTime >= POST_COLLISION_PAUSE_DURATION) {
                transitionToMenu();
            }
            break;

        case 'GAME_END':
            updateMenuCamera(delta);
            break;

        case 'TRANSITION':
            updateCameraTransition();
            break;

        case 'MENU':
            // Ensure player is at start position once loaded
            if (player.mesh.position.y !== 2 && gameState === 'MENU') {
                 player.mesh.position.set(0, 2, 0);
                 player.mesh.visible = true;
            }
            updateMenuCamera(delta);
            break;
    }

    renderer.render(scene, camera);
}

function handleKeyToggle(event) {
    if (gameState === 'RUNNING' && (event.key === 'i' || event.key === 'I')) {
        if (speedDiv.style.display === 'none') speedDiv.style.display = 'block';
        else speedDiv.style.display = 'none';
    }
}

function updateGameSpeed(delta) {
    const elapsed = clock.getElapsedTime();
    const targetSpeed = BASE_SPEED + (elapsed * ACCELERATION * 10);
    gameSpeed = Math.min(targetSpeed, MAX_SPEED + BASE_SPEED);
}

function updateScore(delta) {
    score += (gameSpeed * 0.5 * difficultyMultiplier) * delta;
    document.getElementById('score').innerText = `Score: ${Math.floor(score)}`;
    if (speedDiv) speedDiv.innerText = `Speed: ${gameSpeed.toFixed(1)} u/s`;
}

function updateMenuCamera(delta) {
    camera.position.copy(MENU_CAMERA_POSITION);
    camera.lookAt(MENU_CAMERA_TARGET);
    player.mesh.rotation.y = 0;

    if (gameState === 'GAME_END') {
        // fall animation
        player.mesh.position.y -= 5 * delta; // fall speed
        if (player.mesh.position.y <= 2) {
            player.mesh.position.y = 2;
            gameState = 'MENU';
            //console.log('Returned to MENU');

            const startScreen = document.getElementById('start-screen');
            if (startScreen) startScreen.classList.remove('hidden');
        }
    }
}

function updateCameraTransition() {
    const elapsed = clock.getElapsedTime() - transitionStartTime;
    const t = Math.min(elapsed / TRANSITION_DURATION, 1);
    const smoothT = t * t * (3 - 2 * t);

    camera.position.lerpVectors(MENU_CAMERA_POSITION, GAME_CAMERA_POSITION, smoothT);

    const lookTarget = new THREE.Vector3().lerpVectors(MENU_CAMERA_TARGET, GAME_CAMERA_LOOK, smoothT);
    camera.lookAt(lookTarget);

    if (t >= 1) {
        clock.start();
        gameState = 'RUNNING';
    }
}

function updateGameCamera() {
    const laneX = LANES[player.laneIndex];
    const targetX = laneX * CAMERA_LANE_OFFSET;

    let targetY = player.mesh.position.y + CAMERA_Y_OFFSET;
    targetY = Math.min(targetY, CEILING_Y - 1);

    camera.position.x += (targetX - camera.position.x) * CAMERA_LERP;
    camera.position.y += (targetY - camera.position.y) * CAMERA_LERP;

    camera.lookAt(camera.position.x, 0.8, -10);
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
    player.mesh.visible = false;
    pauseStartTime = clock.getElapsedTime();

    //console.log('GAME OVER - Paused on collision screen');
}

function transitionToMenu() {
    gameState = 'GAME_END';

    lastRunScoreDiv.innerText = `Last Run: ${Math.floor(score)}`;
    if (score > highScore) {
        highScore = score;
        highScoreDiv.innerText = `High Score: ${Math.floor(highScore)}`;
    }

    player.mesh.position.set(0, 10, 0);
    player.mesh.visible = true;

    camera.position.copy(MENU_CAMERA_POSITION);
    camera.lookAt(MENU_CAMERA_TARGET);

    document.getElementById('score').style.display = 'none';
    if (speedDiv) speedDiv.style.display = 'none';

    obstacles.reset?.();
    player.laneIndex = 1;
    obstacles.obstacles.forEach(o => scene.remove(o.mesh));
    obstacles.obstacles = [];

    //console.log('Transitioning to MENU (Player Falling)');
}
