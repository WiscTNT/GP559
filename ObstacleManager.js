import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { OBB } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/math/OBB.js';
import {
    LANES,
    GROUND_Y,
    CEILING_Y,
} from './constants.js';
// 1. IMPORT THE NEW ROCKET MANAGER
import RocketManager from './RocketManager.js'; 

const ROOM_HEIGHT = CEILING_Y - GROUND_Y;
const OBSTACLE_DEPTH = 1;
const THREE_LANE_WIDTH = 6;
// New constant for cylinder radius
const CYLINDER_RADIUS = 0.5; 

// New: Define models/textures for each type using the switch name 'prototype'
// const prototype = true; // <<< DELETE THIS HARDCODED GLOBAL VARIABLE

// Define unique assets for each obstacle type (using 0-8 for now, 9 is RocketManager)
// NOTE: The asset paths now rely on the local 'prototype' variable (which will be `this.prototype` after class init)
let PROTOTYPE_FLAG = true; // Temporary flag for asset path definition only

const UNIQUE_MODELS = {
    // Basic Cubes
    0: { model: PROTOTYPE_FLAG ? null : 'path/to/low_three_lane.gltf', texture: null }, // spawnLowThreeLane
    1: { model: PROTOTYPE_FLAG ? null : 'path/to/high_three_lane.gltf', texture: null }, // spawnHighThreeLane
    3: { model: PROTOTYPE_FLAG ? null : 'path/to/gap_obstacle.gltf', texture: null }, // spawnGapObstacle
    6: { model: PROTOTYPE_FLAG ? null : 'path/to/middle_horizontal.gltf', texture: null }, // spawnMiddleHorizontal
    8: { model: PROTOTYPE_FLAG ? null : 'path/to/ground_three_fifths.gltf', texture: null }, // spawnGroundThreeFifths

    // Vertical Cylinders (Lane Blockers)
    2: { model: null, texture: PROTOTYPE_FLAG ? null : 'path/to/lane_blocker_texture.png' }, // spawnLaneBlockers

    // Diagonal/Rotating Cylinders
    4: { model: null, texture: PROTOTYPE_FLAG ? null : 'path/to/diagonal_texture.png' }, // spawnDiagonalLeftToRight
    5: { model: null, texture: PROTOTYPE_FLAG ? null : 'path/to/diagonal_texture.png', materialColor: 0x00FF00 }, // spawnDiagonalRightToLeft (Added a unique color hint)
    7: { model: null, texture: PROTOTYPE_FLAG ? null : 'path/to/rotating_texture.png' }, // spawnRotatingObstacle
};

export default class ObstacleManager {
    // 2. Add variable for RocketManager
    rocketManager; 
    loader;
    textureLoader;
    
    // Store loaded assets
    loadedModels = {};
    loadedTextures = {};
    
    // 🚀 NEW: Store the prototype mode state
    prototype = true; 
    
    // 🚀 MODIFIED: Constructor now accepts the prototype mode flag
    constructor(scene, prototype) {
        this.scene = scene;
        this.obstacles = [];
        this.spawnTimer = 0;
        this.spawnInterval = 1.5;
        this.spawnZ = -60;
        this.prototype = prototype; // 🚀 STORE THE MODE
        
        // Repetition control
        this.lastObstacleType = null;
        this.repeatCount = 0;

        // Base material for non-prototype collision meshes
        // The material is created once, but its wireframe property depends on this.prototype
        this.material = new THREE.MeshStandardMaterial({ 
            color: 0xaa0000, 
            wireframe: this.prototype // 🚀 Use instance prototype flag
        });
        
        // Loader initialization
        this.loader = new GLTFLoader();
        this.textureLoader = new THREE.TextureLoader();

        // Create the reusable geometries
        this.verticalCylinderGeometry = new THREE.CylinderGeometry(CYLINDER_RADIUS, CYLINDER_RADIUS, ROOM_HEIGHT, 32);
        this.rotatingCylinderBaseGeometry = new THREE.CylinderGeometry(CYLINDER_RADIUS, CYLINDER_RADIUS, 1, 32);
        
        // NEW: Load all unique assets at startup
        this.loadAssets();

        // 3. Instantiate RocketManager and PASS THE PROTOTYPE FLAG
        this.rocketManager = new RocketManager(scene, this.spawnZ, this.prototype); 
    }
    
    // ======================================================
    // NEW: Asset Loading Logic
    // ======================================================
    loadAssets() {
        // NOTE: The `UNIQUE_MODELS` paths are set based on a static check, 
        // so we need to manually check `this.prototype` here for the load logic.
        console.log(`ObstacleManager Prototype Mode is: ${this.prototype}. Loading assets...`);
        
        for (const type in UNIQUE_MODELS) {
            
            // Only load assets if NOT in prototype mode
            if (this.prototype) continue; 
            
            const asset = UNIQUE_MODELS[type];

            // Load Model
            if (asset.model) {
                this.loader.load(
                    asset.model,
                    (gltf) => {
                        this.loadedModels[type] = gltf.scene; 
                        console.log(`Loaded Model for type ${type}: ${asset.model}`);
                    },
                    undefined,
                    (error) => {
                        console.error(`Error loading model for type ${type}:`, error);
                    }
                );
            }

            // Load Texture (and create a material from it)
            if (asset.texture) {
                this.textureLoader.load(
                    asset.texture,
                    (texture) => {
                        // Use a basic color if specified, otherwise default to white light reflection
                        const color = asset.materialColor || 0xffffff; 
                        this.loadedTextures[type] = new THREE.MeshStandardMaterial({ map: texture, color: color });
                        console.log(`Loaded Texture for type ${type}: ${asset.texture}`);
                    },
                    undefined,
                    (error) => {
                        console.error(`Error loading texture for type ${type}:`, error);
                    }
                );
            }
        }
    }

    // ======================================================
    // NEW: Obstacle Mesh Creator (handles conditional visuals)
    // ======================================================
    createObstacleGroup(baseMesh, obstacleType) {
        const group = new THREE.Group();
        group.add(baseMesh);

        const modelInfo = UNIQUE_MODELS[obstacleType];

        // -------------------------
        // PROTOTYPE MODE
        // -------------------------
        if (this.prototype) {
            // Collision mesh IS the visual (wireframe)
            baseMesh.visible = true;
            return group;
        }

        // -------------------------
        // FULL VISUAL MODE
        // -------------------------
        baseMesh.visible = false; // hide collision mesh by default

        // A. GLTF MODEL
        if (modelInfo?.model && this.loadedModels[obstacleType]) {
            const modelClone = this.loadedModels[obstacleType].clone();
            group.add(modelClone);
            group.userData.visualMesh = modelClone;
            return group;
        }

        // B. TEXTURED GEOMETRY
        if (modelInfo?.texture && this.loadedTextures[obstacleType]) {
            const texturedMesh = baseMesh.clone();
            texturedMesh.material = this.loadedTextures[obstacleType];
            texturedMesh.visible = true;

            group.add(texturedMesh);
            group.userData.visualMesh = texturedMesh;
            return group;
        }

        // -------------------------
        // 🔥 FALLBACK: SOLID GEOMETRY
        // -------------------------
        const fallbackMesh = new THREE.Mesh(
            baseMesh.geometry, // SAME geometry
            new THREE.MeshStandardMaterial({
                color: modelInfo?.materialColor ?? 0xaa0000
            })
        );
        fallbackMesh.position.set(0, 0, 0);
        fallbackMesh.rotation.set(0, 0, 0);
        fallbackMesh.scale.set(1, 1, 1);
        fallbackMesh.visible = true;

        group.add(fallbackMesh);
        group.userData.visualMesh = fallbackMesh;

        return group;
    }

    // ======================================================
    // Utility for Box Geometry Obstacles
    // ======================================================
    spawnObstacleMesh(width, height, x, y, obstacleType) {
        // The collision mesh uses a BoxGeometry
        const geometry = new THREE.BoxGeometry(width, height, OBSTACLE_DEPTH);
        // Uses this.material, which respects this.prototype for wireframe setting
        const collisionMesh = new THREE.Mesh(geometry, this.material); 
        collisionMesh.position.set(x, y, this.spawnZ);
        
        // Create the group and add collision/visual meshes
        const group = this.createObstacleGroup(collisionMesh, obstacleType);
        group.position.copy(collisionMesh.position); 
        collisionMesh.position.set(0, 0, 0); 
        
        this.scene.add(group);
        this.obstacles.push(group);
        return collisionMesh; 
    }

    // ======================================================
    // Utility for Cylinder Geometry Obstacles
    // ======================================================
    spawnCylinderMesh(geometry, x, y, rotation, obstacleType) {
        // The collision mesh uses a CylinderGeometry
        // Uses this.material, which respects this.prototype for wireframe setting
        const collisionMesh = new THREE.Mesh(geometry, this.material); 
        collisionMesh.position.set(x, y, this.spawnZ);
        if (rotation) collisionMesh.rotation.z = rotation;
        
        // Create the group and add collision/visual meshes
        const group = this.createObstacleGroup(collisionMesh, obstacleType);
        group.position.copy(collisionMesh.position); 
        collisionMesh.position.set(0, 0, 0); 
        group.rotation.copy(collisionMesh.rotation); 
        collisionMesh.rotation.set(0, 0, 0); 
        
        this.scene.add(group);
        this.obstacles.push(group);
        return group; 
    }

    // ======================================================
    // Update Logic 
    // ======================================================
    update(delta, player, gameSpeed, score) { 
        let collided = false;
        this.spawnTimer += delta;

        // RocketManager update logic remains the same
        if (this.rocketManager.update(delta, player, gameSpeed)) {
            collided = true;
        }

        if (this.spawnTimer >= this.spawnInterval/(1+(gameSpeed/10)*0.2)) {
            this.spawnObstacle(score); 
            this.spawnTimer = 0;
        }

        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obsGroup = this.obstacles[i]; 
            obsGroup.position.z += gameSpeed * delta;

            // Handle rotating/scaling logic (applied to the group)
            if (obsGroup.userData.isRotating) {
                obsGroup.rotation.z += obsGroup.userData.rotationSpeed * delta; 
            }

            // Cleanup
            if (obsGroup.position.z > 10) {
                this.scene.remove(obsGroup);
                this.obstacles.splice(i, 1);
                continue;
            }

            // Collision Detection
            if (this.checkCollision(player.mesh, obsGroup)) { 
                collided = true;
            }
        }
        return collided;
    }


    /* ======================================================
        MASTER SPAWN (Type passing unchanged)
    ====================================================== */
    spawnObstacle(score) {
        const spawnLaneOverlay = Math.random() < 0.5;
        const type = this.getNextObstacleType(score); 

        switch (type) {
            case 0: this.spawnLowThreeLane(type); break;
            case 1: this.spawnHighThreeLane(type); break;
            case 2: this.spawnLaneBlockers(false, type); return; 
            case 3: this.spawnGapObstacle(type); break;
            case 4: this.spawnDiagonalLeftToRight(type); break;
            case 5: this.spawnDiagonalRightToLeft(type); break;
            case 6: this.spawnMiddleHorizontal(type); break;
            case 7: this.spawnRotatingObstacle(type); break;
            case 8: this.spawnGroundThreeFifths(type); break;
            case 9: this.spawnRocketManager(); break; 
        }

        if (spawnLaneOverlay && type !== 2 && type !== 7 && type !== 8 && type !== 9) {
            this.spawnLaneBlockers(true, 2); // Type 2 is always Lane Blockers
        }
    }


    /* ======================================================
        REFIT: EXISTING OBSTACLES (Now passing the type to the spawners)
    ====================================================== */

    spawnLowThreeLane(type) {
        const h = ROOM_HEIGHT / 3;
        this.spawnObstacleMesh(THREE_LANE_WIDTH, h, 0, GROUND_Y + h / 2, type);
    }

    spawnHighThreeLane(type) {
        const h = ROOM_HEIGHT / 3;
        this.spawnObstacleMesh(THREE_LANE_WIDTH, h, 0, CEILING_Y - h / 2, type);
    }

    spawnLaneBlockers(overlayOnly = false, type) {
        const lanes = overlayOnly
            ? [Math.floor(Math.random() * LANES.length)]
            : this.pickLaneSet();

        for (const i of lanes) {
            const x = LANES[i];
            const y = GROUND_Y + ROOM_HEIGHT / 2;
            
            // spawnCylinderMesh now handles the creation of the THREE.Group
            this.spawnCylinderMesh(this.verticalCylinderGeometry, x, y, null, type);
        }
    }

    // ... (pickLaneSet remains unchanged) ...

    pickLaneSet() {
        if (Math.random() < 0.5) return [Math.floor(Math.random() * 3)];
        const lanes = [0, 1, 2];
        const first = lanes.splice(Math.floor(Math.random() * lanes.length), 1)[0];
        return [first, lanes[Math.floor(Math.random() * lanes.length)]];
    }

    spawnGapObstacle(type) {
        const h = ROOM_HEIGHT / 4;
        this.spawnObstacleMesh(THREE_LANE_WIDTH, h, 0, GROUND_Y + h / 2, type);
        this.spawnObstacleMesh(THREE_LANE_WIDTH, h, 0, CEILING_Y - h / 2, type);
    }

    /* ======================================================
        REFIT: DIAGONAL & ROTATING OBSTACLES (Now Cylinders)
    ====================================================== */
    spawnDiagonalLeftToRight(type) { this.spawnDiagonal(-2, 2, type); }
    spawnDiagonalRightToLeft(type) { this.spawnDiagonal(2, -2, type); }

    spawnDiagonal(xStart, xEnd, type) {
        const length = Math.sqrt(Math.pow(xEnd - xStart, 2) + Math.pow(ROOM_HEIGHT, 2));
        const midY = GROUND_Y + ROOM_HEIGHT / 2;
        const midX = (xStart + xEnd) / 2;
        
        // Clone the base geometry, scale it, and calculate rotation *before* passing it to spawnCylinderMesh
        const geometry = this.rotatingCylinderBaseGeometry.clone();
        geometry.scale(1, length, 1);
        
        // Pre-calculate rotation
        const rotation = Math.atan2(ROOM_HEIGHT, xEnd - xStart)*2; 
        
        // spawnCylinderMesh handles the creation of the collision mesh and group
        this.spawnCylinderMesh(geometry, midX, midY, rotation, type); 
    }

    spawnRotatingObstacle(type) {
        const maxLength = Math.sqrt(
            THREE_LANE_WIDTH * THREE_LANE_WIDTH +
            ROOM_HEIGHT * ROOM_HEIGHT
        );

        const midY = GROUND_Y + ROOM_HEIGHT / 2;
        
        // Clone the base geometry and scale it *before* passing it to spawnCylinderMesh
        const geometry = this.rotatingCylinderBaseGeometry.clone();
        geometry.scale(1, maxLength, 1);
        
        // Start rotation at 90 degrees for horizontal orientation
        const group = this.spawnCylinderMesh(geometry, 0, midY, Math.PI / 2, type); 

        group.userData.isRotating = true;

        group.userData.rotationSpeed =
            (Math.random() > 0.5 ? 1 : -1) *
            (0.4 + Math.random() * 0.3); 
    }

    spawnMiddleHorizontal(type) { 
        const h = ROOM_HEIGHT / 3; 
        const y = GROUND_Y + ROOM_HEIGHT / 3 + h / 2; 
        this.spawnObstacleMesh(THREE_LANE_WIDTH, h, 0, y, type); 
    }

    spawnGroundThreeFifths(type) {
        const h = ROOM_HEIGHT * (3 / 5);
        const y = GROUND_Y + h / 2;

        this.spawnObstacleMesh(
            THREE_LANE_WIDTH, // full width
            h,                // 3/5 height
            0,                // centered in lanes
            y,
            type
        );
    }

    // ... (spawnRocketManager remains unchanged) ...

    spawnRocketManager() {
        console.log('Rocket Manager Obstacle Spawned');
        this.rocketManager.spawnRockets();
    }

    /* ======================================================
        Utility
    ====================================================== */

    // Modified collision detection to find the *collision mesh* within the *group*
    checkCollision(playerMesh, obstacleGroup) {
        // The collision mesh is always the first child of the group
        const collisionMesh = obstacleGroup.children[0]; 

        if (!collisionMesh) return false; // Safety check

        playerMesh.updateMatrixWorld(true);
        // We update the group's matrix world, which updates the child's matrix world
        obstacleGroup.updateMatrixWorld(true); 

        // Collision Detection logic uses the collisionMesh
        
        // Use OBB for accurate collision detection, which works even for rotated/scaled meshes
        if (!playerMesh.geometry.boundingBox) playerMesh.geometry.computeBoundingBox();
        const playerOBB = new OBB().fromBox3(playerMesh.geometry.boundingBox);
        playerOBB.applyMatrix4(playerMesh.matrixWorld);

        if (!collisionMesh.geometry.boundingBox) collisionMesh.geometry.computeBoundingBox();
        const obstacleOBB = new OBB().fromBox3(collisionMesh.geometry.boundingBox);
        // Use the collisionMesh's matrixWorld, which accounts for group position/rotation
        obstacleOBB.applyMatrix4(collisionMesh.matrixWorld); 

        return playerOBB.intersectsOBB(obstacleOBB);
    }

    // ... (reset remains unchanged) ...

    reset(){
        this.obstacles.forEach(obs => {
            this.scene.remove(obs);
        });
        this.obstacles = [];
        this.rocketManager.reset(); 
    }
    
    // ... (getNextObstacleType remains unchanged) ...
    getNextObstacleType(score) {
        // Total types is now 10 (0 to 9)
        const totalTypes = 10; 
        let type = Math.floor(Math.random() * totalTypes);
        //type = 9;
        
        // Conditional spawning for Rocket Manager (type 9)
        // If score is less than 750 AND the random type is 9, re-roll until a valid type is chosen.
        if (score < 750 && type === 9) { 
            do {
                type = Math.floor(Math.random() * (totalTypes - 1)); // Exclude type 9
            } while (type === this.lastObstacleType);
        }

        if (type === this.lastObstacleType) {
            this.repeatCount++;
            if (this.repeatCount >= 2) {
                do {
                    // Check if score is high enough to include the rocket manager (type 9)
                    let maxType = (score >= 750) ? totalTypes : totalTypes - 1; 
                    type = Math.floor(Math.random() * maxType);
                } while (type === this.lastObstacleType);
                this.repeatCount = 0;
            }
        } else {
            this.repeatCount = 0;
        }

        this.lastObstacleType = type;
        return type;
    }
}