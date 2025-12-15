import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
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
const CYLINDER_RADIUS = 0.5; // Controls the thickness of the cylindrical obstacles
// Note: DIAGONAL_THICKNESS is no longer used for diagonal/rotating, but kept for non-cylindrical obstacles that might call spawnBox.

export default class ObstacleManager {
    // 2. Add variable for RocketManager
    rocketManager; 
    
    constructor(scene) {
        this.scene = scene;
        this.obstacles = [];
        this.spawnTimer = 0;
        this.spawnInterval = 1.5;
        this.spawnZ = -60;

        // Repetition control
        this.lastObstacleType = null;
        this.repeatCount = 0;

        this.material = new THREE.MeshStandardMaterial({ color: 0xaa0000 });

        // Create the reusable cylinder geometry for lane blockers (vertical orientation)
        this.verticalCylinderGeometry = new THREE.CylinderGeometry(CYLINDER_RADIUS, CYLINDER_RADIUS, ROOM_HEIGHT, 32);

        // Create the reusable cylinder geometry for diagonal/rotating obstacles
        this.rotatingCylinderBaseGeometry = new THREE.CylinderGeometry(CYLINDER_RADIUS, CYLINDER_RADIUS, 1, 32);

        // 3. Instantiate RocketManager
        this.rocketManager = new RocketManager(scene, this.spawnZ); 
    }

    // Update signature changed to accept score
    update(delta, player, gameSpeed, score) { 
        let collided = false;
        this.spawnTimer += delta;

        // 4. Update the RocketManager and check for collisions
        if (this.rocketManager.update(delta, player, gameSpeed)) {
            collided = true;
        }

        if (this.spawnTimer >= this.spawnInterval/(1+(gameSpeed/10)*0.2)) {
            // Pass the current score to the spawning logic
            this.spawnObstacle(score); 
            this.spawnTimer = 0;
        }

        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obs = this.obstacles[i];
            obs.position.z += gameSpeed * delta;

            // Handle rotating/scaling logic
            if (obs.userData.isRotating) {
                obs.rotation.z += obs.userData.rotationSpeed * delta;
            }

            // Cleanup
            if (obs.position.z > 10) {
                this.scene.remove(obs);
                this.obstacles.splice(i, 1);
                continue;
            }

            // Collision Detection
            if (this.checkCollision(player.mesh, obs)) {
                collided = true;
            }
        }
        return collided;
    }

    /* ======================================================
        MASTER SPAWN
    ====================================================== */
    // Score added to spawnObstacle
    spawnObstacle(score) {
        const spawnLaneOverlay = Math.random() < 0.5;
        // Pass score to getNextObstacleType
        const type = this.getNextObstacleType(score); 

        switch (type) {
            case 0: this.spawnLowThreeLane(); break;
            case 1: this.spawnHighThreeLane(); break;
            case 2: this.spawnLaneBlockers(); return; // Early return for blockers
            case 3: this.spawnGapObstacle(); break;
            case 4: this.spawnDiagonalLeftToRight(); break;
            case 5: this.spawnDiagonalRightToLeft(); break;
            case 6: this.spawnMiddleHorizontal(); break;
            case 7: this.spawnRotatingObstacle(); break;
            case 8: this.spawnGroundThreeFifths(); break;
            // New case for Rocket Manager (type 9)
            case 9: this.spawnRocketManager(); break; 
        }

        // Don't overlay lane blockers on top of the rocket manager (type 9) or other exceptions
        if (spawnLaneOverlay && type !== 2 && type !== 7 && type !== 8 && type !== 9) {
            this.spawnLaneBlockers(true);
        }
    }

    /* ======================================================
        REPETITION CONTROL (Score added)
    ====================================================== */
    getNextObstacleType(score) {
        // Total types is now 10 (0 to 9)
        const totalTypes = 10; 
        let type = Math.floor(Math.random() * totalTypes);
        
        // Conditional spawning for Rocket Manager (type 9)
        // If score is less than 750 AND the random type is 9, re-roll until a valid type is chosen.
        if (score < 0 && type === 9) {
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

    /* ======================================================
        EXISTING OBSTACLES (spawnBox calls remain unchanged, they are not cylinders)
    ====================================================== */
    spawnLowThreeLane() {
        const h = ROOM_HEIGHT / 3;
        this.spawnObstacleMesh(THREE_LANE_WIDTH, h, 0, GROUND_Y + h / 2);
    }

    spawnHighThreeLane() {
        const h = ROOM_HEIGHT / 3;
        this.spawnObstacleMesh(THREE_LANE_WIDTH, h, 0, CEILING_Y - h / 2);
    }

    // Lane Blockers are now Cylinders
    spawnLaneBlockers(overlayOnly = false) {
        const lanes = overlayOnly
            ? [Math.floor(Math.random() * LANES.length)]
            : this.pickLaneSet();

        for (const i of lanes) {
            // New Cylinder Mesh
            const mesh = new THREE.Mesh(this.verticalCylinderGeometry, this.material);
            
            // Position the cylinder at the correct lane center and vertical center
            mesh.position.set(LANES[i], GROUND_Y + ROOM_HEIGHT / 2, this.spawnZ); 
            
            this.scene.add(mesh);
            this.obstacles.push(mesh);
        }
    }

    pickLaneSet() {
        if (Math.random() < 0.5) return [Math.floor(Math.random() * 3)];
        const lanes = [0, 1, 2];
        const first = lanes.splice(Math.floor(Math.random() * lanes.length), 1)[0];
        return [first, lanes[Math.floor(Math.random() * lanes.length)]];
    }

    spawnGapObstacle() {
        const h = ROOM_HEIGHT / 4;
        this.spawnObstacleMesh(THREE_LANE_WIDTH, h, 0, GROUND_Y + h / 2);
        this.spawnObstacleMesh(THREE_LANE_WIDTH, h, 0, CEILING_Y - h / 2);
    }

    /* ======================================================
        DIAGONAL & ROTATING OBSTACLES (Now Cylinders)
    ====================================================== */
    spawnDiagonalLeftToRight() { this.spawnDiagonal(-2, 2); }
    spawnDiagonalRightToLeft() { this.spawnDiagonal(2, -2); }

    spawnDiagonal(xStart, xEnd) {
        // Calculate the length of the diagonal spanning three lanes (width=6) and room height
        const length = Math.sqrt(Math.pow(xEnd - xStart, 2) + Math.pow(ROOM_HEIGHT, 2));
        
        // Use the base cylinder geometry (height 1)
        const mesh = new THREE.Mesh(this.rotatingCylinderBaseGeometry, this.material);

        const midY = GROUND_Y + ROOM_HEIGHT / 2;
        const midX = (xStart + xEnd) / 2;

        mesh.position.set(midX, midY, this.spawnZ);
        
        // 1. Scale the cylinder length (y-axis)
        mesh.scale.y = length;

        // 2. Rotate the cylinder from its default Y-axis (vertical) to the X-Z plane (horizontal for rotation)
        mesh.rotation.z = Math.PI / 2; // 90 degrees on X
        
        // 3. Apply the diagonal angle on the Z-axis
        // The angle calculation is correct for the XZ plane.
        // xEnd - xStart is the width change, ROOM_HEIGHT is the height change.
        mesh.rotation.z = Math.atan2(ROOM_HEIGHT, xEnd - xStart)*2; 

        this.scene.add(mesh);
        this.obstacles.push(mesh);
    }

    spawnRotatingObstacle() {

        // Length that always spans the room diagonally
        const maxLength = Math.sqrt(
            THREE_LANE_WIDTH * THREE_LANE_WIDTH +
            ROOM_HEIGHT * ROOM_HEIGHT
        );

        // Use the base cylinder geometry (height 1)
        const mesh = new THREE.Mesh(this.rotatingCylinderBaseGeometry, this.material);

        const midY = GROUND_Y + ROOM_HEIGHT / 2;
        mesh.position.set(0, midY, this.spawnZ);

        // 1. Scale the cylinder length (y-axis)
        mesh.scale.y = maxLength;
        
        // 2. Rotate the cylinder from its default Y-axis (vertical) to the X-Z plane (horizontal for rotation)
        mesh.rotation.z = Math.PI / 2; // 90 degrees on X

        mesh.userData.isRotating = true;

        // Much slower, readable rotation speed
        mesh.userData.rotationSpeed =
            (Math.random() > 0.5 ? 1 : -1) *
            (0.4 + Math.random() * 0.3); // ~0.4–0.7 rad/sec

        this.scene.add(mesh);
        this.obstacles.push(mesh);
    }

    spawnMiddleHorizontal() { const h = ROOM_HEIGHT / 3; const y = GROUND_Y + ROOM_HEIGHT / 3 + h / 2; this.spawnObstacleMesh(THREE_LANE_WIDTH, h, 0, y); }

    spawnGroundThreeFifths() {
        const h = ROOM_HEIGHT * (3 / 5);
        const y = GROUND_Y + h / 2;

        this.spawnObstacleMesh(
            THREE_LANE_WIDTH, // full width
            h,                // 3/5 height
            0,                // centered in lanes
            y
        );
    }

    /* ======================================================
        NEW ROCKET MANAGER OBSTACLE
    ====================================================== */
    spawnRocketManager() {
        console.log('Rocket Manager Obstacle Spawned');
        this.rocketManager.spawnRockets();
        // NOTE: The RocketManager handles its own meshes (rockets) and collision.
    }

    /* ======================================================
        Utility
    ====================================================== */
    // Renamed from spawnBox to better reflect its continued use of BoxGeometry
    spawnObstacleMesh(width, height, x, y) {
        const geometry = new THREE.BoxGeometry(width, height, OBSTACLE_DEPTH);
        const mesh = new THREE.Mesh(geometry, this.material);
        mesh.position.set(x, y, this.spawnZ);
        this.scene.add(mesh);
        this.obstacles.push(mesh);
    }

    // No change to collision detection (OBB will work with cylinders)
    checkCollision(playerMesh, obstacleMesh) {
        playerMesh.updateMatrixWorld(true);
        obstacleMesh.updateMatrixWorld(true);

        // Use OBB for accurate collision detection, which works even for rotated/scaled meshes
        if (!playerMesh.geometry.boundingBox) playerMesh.geometry.computeBoundingBox();
        const playerOBB = new OBB().fromBox3(playerMesh.geometry.boundingBox);
        playerOBB.applyMatrix4(playerMesh.matrixWorld);

        if (!obstacleMesh.geometry.boundingBox) obstacleMesh.geometry.computeBoundingBox();
        const obstacleOBB = new OBB().fromBox3(obstacleMesh.geometry.boundingBox);
        obstacleOBB.applyMatrix4(obstacleMesh.matrixWorld);

        return playerOBB.intersectsOBB(obstacleOBB);
    }

    reset(){
        this.obstacles.forEach(obs => {
            this.scene.remove(obs);
        });
        this.obstacles = [];
        // Reset the RocketManager
        this.rocketManager.reset(); 
    }
}