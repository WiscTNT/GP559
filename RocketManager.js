import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OBB } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/math/OBB.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import {
    LANES,
    GROUND_Y,
    CEILING_Y,
} from './constants.js';

// --- Asset Paths ---
// NOTE: These variables are set here, but the 'prototype' switch is now in the constructor.
const ROCKET_MODEL_PATH = './Models/Missile.glb';
const MARKER_TEXTURE_PATH = './Textures/rocket_marker.png'; // Suggested path

// --- Timing Constants ---
const TARGETING_DURATION = 2.0;
const LAUNCH_DELAY = 0.5;
const ROCKET_SPAWN_INTERVAL = 1.0;
const TOTAL_LAUNCH_TIME = TARGETING_DURATION + LAUNCH_DELAY;

// --- Visual & Speed Constants ---
const ROCKET_BASE_SPEED = 9; 
const ROCKET_RADIUS = 0.3;
const ROCKET_LENGTH = 5;
const MARKER_RADIUS = 1.2;

const SPIN_SPEED = 1 * Math.PI; // radians per second, 1 rotation per second

// --- State Definitions ---
const PHASE = {
    INACTIVE: 0,
    TARGETING: 1,
    LAUNCHING: 2,
    COOLDOWN: 3,
};

export default class RocketManager {
    loadedRocketModel = null;
    loadedMarkerMaterial = null;

    // 🚀 NEW: Accept 'prototype' flag from main.js/ObstacleManager
    constructor(scene, spawnZ, prototype) {
        this.scene = scene;
        this.spawnZ = spawnZ;
        this.attacks = []; 
        this.prototype = prototype; // Store the prototype mode flag
        
        // Asset paths based on mode
        this.ROCKET_ASSETS = {
            rocketModel: this.prototype ? null : ROCKET_MODEL_PATH,
            markerTexture: this.prototype ? null : MARKER_TEXTURE_PATH
        };
        
        // Loaders
        this.loader = new GLTFLoader();
        this.textureLoader = new THREE.TextureLoader();

        // 1. BASE GEOMETRY (Used for Collision)
        this.rocketGeometry = new THREE.CylinderGeometry(ROCKET_RADIUS, ROCKET_RADIUS, ROCKET_LENGTH, 16);
        this.rocketGeometry.rotateX(Math.PI / 2); // Align with Z-axis
        this.rocketMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xff4444, 
            emissive: 0x880000, 
            wireframe: this.prototype // Use the stored prototype flag
        });
        
        // 2. MARKER GEOMETRY (Used for Collision/Visual fallback)
        const circleShape = new THREE.Shape();
        circleShape.absarc(0, 0, MARKER_RADIUS, 0, Math.PI * 2, false);

        this.circleGeometry = new THREE.ShapeGeometry(circleShape);

        // Cross lines geometry/material
        this.crossMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8 });
        this.crossGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-MARKER_RADIUS, 0, 0),
            new THREE.Vector3(MARKER_RADIUS, 0, 0),
            new THREE.Vector3(0, -MARKER_RADIUS, 0),
            new THREE.Vector3(0, MARKER_RADIUS, 0),
        ]);

        // Base Marker Material (used if no unique texture is loaded)
        this.markerMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x00ff00, 
            transparent: true, 
            opacity: 0.8, 
            side: THREE.DoubleSide 
        });

        this.currentState = PHASE.INACTIVE;

        // NEW: Load unique assets
        this.loadAssets();
    }

    // ======================================================
    // Asset Loading Logic
    // ======================================================
    loadAssets() {
        console.log(`RocketManager Prototype Mode is: ${this.prototype}. Loading assets...`);
        
        // Load Unique Rocket Model
        if (this.ROCKET_ASSETS.rocketModel) {
            this.loader.load(
                this.ROCKET_ASSETS.rocketModel,
                (gltf) => {
                    // Store the loaded model scene
                    this.loadedRocketModel = gltf.scene; 
                    console.log(`Loaded Unique Rocket Model: ${this.ROCKET_ASSETS.rocketModel}`);
                },
                undefined,
                (error) => {
                    console.error(`Error loading rocket model:`, error);
                }
            );
        }

        // Load Unique Marker Texture
        if (this.ROCKET_ASSETS.markerTexture) {
            this.textureLoader.load(
                this.ROCKET_ASSETS.markerTexture,
                (texture) => {
                    this.loadedMarkerMaterial = new THREE.MeshBasicMaterial({ 
                        map: texture, 
                        transparent: true, 
                        opacity: 0.8, 
                        side: THREE.DoubleSide 
                    });
                    console.log(`Loaded Unique Marker Texture: ${this.ROCKET_ASSETS.markerTexture}`);
                },
                undefined,
                (error) => {
                    console.error(`Error loading marker texture:`, error);
                }
            );
        }
    }


    // ======================================================
    // Spawn Logic
    // ======================================================
    spawnRockets() {
        const numRockets = Math.floor(Math.random() * 3) + 1;

        for (let i = 0; i < numRockets; i++) {
            const marker = new THREE.Group();
            
            // Marker Material: use loaded texture if available, otherwise fallback
            const visualMaterial = this.loadedMarkerMaterial || this.markerMaterial;

            // Circle mesh (Collision/Visual base)
            const circleMesh = new THREE.Mesh(this.circleGeometry, visualMaterial.clone());
            marker.add(circleMesh);

            // Cross lines (X and Y) - Always use the basic lines for clarity/collision check area
            const line1 = new THREE.Line(this.crossGeometry, this.crossMaterial.clone());
            marker.add(line1);
            
            // If not in prototype mode and a texture is used, hide the circle mesh wireframe if needed
            if (!this.prototype && this.loadedMarkerMaterial) {
                // No specific change needed here as the visualMaterial handles the texture
            } else if (this.prototype) {
                 // In prototype, show the circle mesh wireframe
                 circleMesh.material = this.markerMaterial.clone();
            }


            const offsetX = (i - 1) * 0.6;
            marker.userOffsetX = offsetX;
            marker.position.set(0, 0, -10+offsetX);

            this.scene.add(marker);

            const launchTime = i * ROCKET_SPAWN_INTERVAL;

            this.attacks.push({
                phase: PHASE.TARGETING,
                timer: -launchTime,
                marker: marker,
                rocket: null,
                targetPosition: new THREE.Vector3(),
                rocketLaunchPos: new THREE.Vector3(),
            });
        }
    }

    // ======================================================
    // Launch Logic
    // ======================================================
    launchRocket(attack) {
        // 1. Create the collision mesh (basic cylinder)
        const collisionMesh = new THREE.Mesh(this.rocketGeometry, this.rocketMaterial);
        
        // 2. Create the wrapper group
        const rocketGroup = new THREE.Group();
        rocketGroup.add(collisionMesh);
        
        // Set collision mesh visibility based on prototype
        collisionMesh.visible = this.prototype; // Use the stored prototype flag

        // 3. Add the unique visual model if available
        if (!this.prototype && this.loadedRocketModel) {
            const visualModel = this.loadedRocketModel.clone();
            
            // ** Recommended Scale/Rotation for THREE.js GLB model **
            // The collision cylinder is L=5 along the Z-axis (due to rotationX in constructor)
            // Scale and adjust the visual model to match the collision mesh visually.
            visualModel.scale.set(0.35, 0.35, 0.35); // Adjust scale as needed
            visualModel.rotation.set(0, 0, 0); // Reset or adjust rotation if necessary
            
            // Ensure the visual model is centered correctly within the cylinder bounding box
            
            rocketGroup.add(visualModel);

            rocketGroup.userData.visualModel = visualModel;
            rocketGroup.userData.spinSpeed = SPIN_SPEED; 
        }

        // The group is the object we track and move
        const rocket = rocketGroup; 
        rocket.position.copy(attack.rocketLaunchPos);

        const direction = new THREE.Vector3().subVectors(attack.targetPosition, attack.rocketLaunchPos).normalize();
        attack.rocketDirection = direction;

        // LookAt applies to the group, rotating all its children (collision + visual)
        const lookAtMatrix = new THREE.Matrix4().lookAt(rocket.position, attack.targetPosition, new THREE.Vector3(0, 1, 0));
        rocket.quaternion.setFromRotationMatrix(lookAtMatrix);
        if (!this.prototype) {
            rocket.rotateX(-Math.PI / 2); // adjust if needed: ±Math.PI/2
            //rocket.scale(1.5,1.5,1.5);
        }

        this.scene.add(rocket);
        attack.rocket = rocket;
    }

    // ======================================================
    // Collision Logic (checkCollision)
    // ======================================================
    checkCollision(playerMesh, rocketGroup) {
        // The collision mesh is always the first child (the CylinderGeometry)
        const rocketCollisionMesh = rocketGroup.children[0]; 

        playerMesh.updateMatrixWorld(true);
        rocketGroup.updateMatrixWorld(true); // Update the group, which updates the collision mesh

        if (!playerMesh.geometry.boundingBox) playerMesh.geometry.computeBoundingBox();
        const playerOBB = new OBB().fromBox3(playerMesh.geometry.boundingBox);
        playerOBB.applyMatrix4(playerMesh.matrixWorld);

        if (!rocketCollisionMesh.geometry.boundingBox) rocketCollisionMesh.geometry.computeBoundingBox();
        const rocketOBB = new OBB().fromBox3(rocketCollisionMesh.geometry.boundingBox);
        // Use the collision mesh's matrix world for collision detection
        rocketOBB.applyMatrix4(rocketCollisionMesh.matrixWorld); 

        return playerOBB.intersectsOBB(rocketOBB);
    }
    
    // ======================================================
    // Update Logic
    // ======================================================
    update(delta, player, gameSpeed) {
        let collided = false;
        const currentRocketSpeed = ROCKET_BASE_SPEED * gameSpeed;

        for (let i = this.attacks.length - 1; i >= 0; i--) {
            const attack = this.attacks[i];
            attack.timer += delta;

            // TARGETING PHASE
            if (attack.phase === PHASE.TARGETING && attack.marker) {
                attack.marker.position.x = player.mesh.position.x;
                attack.marker.position.y = player.mesh.position.y;
                attack.marker.position.z = player.mesh.position.z + attack.marker.userOffsetX*4 -6 ;

                if (attack.timer >= TARGETING_DURATION) {
                    attack.targetPosition = attack.marker.position.clone();
                    attack.rocketLaunchPos = attack.targetPosition.clone();
                    attack.rocketLaunchPos.z = this.spawnZ;

                    attack.phase = PHASE.LAUNCHING;
                    attack.timer = 0;
                }
            }

            // LAUNCHING PHASE
            if (attack.phase === PHASE.LAUNCHING) {
                if (attack.marker) {
                    attack.marker.position.copy(attack.targetPosition);

                    // Fade marker smoothly over LAUNCH_DELAY
                    const t = Math.min(attack.timer / LAUNCH_DELAY, 1);

                    // Fade circle mesh (child 0)
                    attack.marker.children.forEach(child => {
                        if (child.material && 'opacity' in child.material) {
                            child.material.opacity = 0.8 * (1 - t);
                        }
                    });

                }

                if (attack.timer >= LAUNCH_DELAY) {
                    this.launchRocket(attack);
                    attack.phase = PHASE.COOLDOWN;
                }
            }

            // COOLDOWN PHASE
            if (attack.rocket) {
                attack.rocket.position.addScaledVector(attack.rocketDirection, currentRocketSpeed * delta);

                if (attack.rocket && attack.rocket.userData.visualModel) {
                    attack.rocket.userData.visualModel.rotateY(
                        attack.rocket.userData.spinSpeed * delta
                    );
                }

                if (attack.rocket.position.z > 10 || attack.rocket.position.z < -80) {
                    if (attack.marker) {
                        this.scene.remove(attack.marker);
                        attack.marker = null;
                    }
                    this.cleanupAttack(i);
                    continue;
                }

                // Check collision using the Group
                if (this.checkCollision(player.mesh, attack.rocket)) {
                    collided = true;
                    if (attack.marker) {
                        this.scene.remove(attack.marker);
                        attack.marker = null;
                    }
                    this.cleanupAttack(i);
                    continue;
                }
            }
        }

        return collided;
    }

    cleanupAttack(index) {
        const attack = this.attacks[index];
        if (attack.marker) this.scene.remove(attack.marker);
        if (attack.rocket) this.scene.remove(attack.rocket);
        this.attacks.splice(index, 1);
    }


    reset() {
        this.attacks.forEach(attack => {
            if (attack.marker) this.scene.remove(attack.marker);
            if (attack.rocket) this.scene.remove(attack.rocket);
        });
        this.attacks = [];
    }
}