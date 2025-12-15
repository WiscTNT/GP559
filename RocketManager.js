// RocketManager.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OBB } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/math/OBB.js';
import {
    LANES,
    GROUND_Y,
    CEILING_Y,
} from './constants.js';

// --- Timing Constants ---
const TARGETING_DURATION = 2.0;
const LAUNCH_DELAY = 0.5;
const ROCKET_SPAWN_INTERVAL = 1.0;
const TOTAL_LAUNCH_TIME = TARGETING_DURATION + LAUNCH_DELAY;

// --- Visual & Speed Constants ---
const ROCKET_BASE_SPEED = 10; 
const ROCKET_RADIUS = 0.3;
const ROCKET_LENGTH = 5;
const MARKER_RADIUS = 1.2;

// --- State Definitions ---
const PHASE = {
    INACTIVE: 0,
    TARGETING: 1,
    LAUNCHING: 2,
    COOLDOWN: 3,
};

export default class RocketManager {
    constructor(scene, spawnZ) {
        this.scene = scene;
        this.spawnZ = spawnZ;
        this.attacks = []; 
        
        // Rocket geometry
        this.rocketGeometry = new THREE.CylinderGeometry(ROCKET_RADIUS, ROCKET_RADIUS, ROCKET_LENGTH, 16);
        this.rocketGeometry.rotateX(Math.PI / 2); 
        this.rocketMaterial = new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0x880000 });
        
        // Marker geometry: circle with a cross
        const circleShape = new THREE.Shape();
        circleShape.absarc(0, 0, MARKER_RADIUS, 0, Math.PI * 2, false);

        const circleGeometry = new THREE.ShapeGeometry(circleShape);

        // Cross lines
        const crossMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8 });
        const crossGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-MARKER_RADIUS, 0, 0),
            new THREE.Vector3(MARKER_RADIUS, 0, 0),
            new THREE.Vector3(0, -MARKER_RADIUS, 0),
            new THREE.Vector3(0, MARKER_RADIUS, 0),
        ]);

        this.markerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
        this.circleGeometry = circleGeometry;
        this.crossGeometry = crossGeometry;
        this.crossMaterial = crossMaterial;

        this.currentState = PHASE.INACTIVE;
    }

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

                    // Fade circle mesh
                    attack.marker.children.forEach(child => {
                        if (child.material && 'opacity' in child.material) {
                            child.material.opacity = 0.8 * (1 - t);
                        }
                    });

                    // Fade marker group material (optional, if mesh itself has material)
                    if (attack.marker.material && 'opacity' in attack.marker.material) {
                        attack.marker.material.opacity = 0.8 * (1 - t);
                    }
                }

                if (attack.timer >= LAUNCH_DELAY) {
                    this.launchRocket(attack);
                    attack.phase = PHASE.COOLDOWN;
                }
            }

            // COOLDOWN PHASE
            if (attack.rocket) {
                attack.rocket.position.addScaledVector(attack.rocketDirection, currentRocketSpeed * delta);

                if (attack.rocket.position.z > 10 || attack.rocket.position.z < -80) {
                    if (attack.marker) {
                        this.scene.remove(attack.marker);
                        attack.marker = null;
                    }
                    this.cleanupAttack(i);
                    continue;
                }

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

    spawnRockets() {
        const numRockets = Math.floor(Math.random() * 3) + 1;

        for (let i = 0; i < numRockets; i++) {
            const marker = new THREE.Group();

            // Circle mesh
            const circleMesh = new THREE.Mesh(this.circleGeometry, this.markerMaterial.clone());
            marker.add(circleMesh);

            // Cross lines (X and Y)
            const line1 = new THREE.Line(this.crossGeometry, this.crossMaterial.clone());
            marker.add(line1);

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

    launchRocket(attack) {
        const rocket = new THREE.Mesh(this.rocketGeometry, this.rocketMaterial);
        rocket.position.copy(attack.rocketLaunchPos);

        const direction = new THREE.Vector3().subVectors(attack.targetPosition, attack.rocketLaunchPos).normalize();
        attack.rocketDirection = direction;

        const lookAtMatrix = new THREE.Matrix4().lookAt(rocket.position, attack.targetPosition, new THREE.Vector3(0, 1, 0));
        rocket.quaternion.setFromRotationMatrix(lookAtMatrix);

        this.scene.add(rocket);
        attack.rocket = rocket;
    }

    cleanupAttack(index) {
        const attack = this.attacks[index];
        if (attack.marker) this.scene.remove(attack.marker);
        if (attack.rocket) this.scene.remove(attack.rocket);
        this.attacks.splice(index, 1);
    }

    checkCollision(playerMesh, rocketMesh) {
        playerMesh.updateMatrixWorld(true);
        rocketMesh.updateMatrixWorld(true);

        if (!playerMesh.geometry.boundingBox) playerMesh.geometry.computeBoundingBox();
        const playerOBB = new OBB().fromBox3(playerMesh.geometry.boundingBox);
        playerOBB.applyMatrix4(playerMesh.matrixWorld);

        if (!rocketMesh.geometry.boundingBox) rocketMesh.geometry.computeBoundingBox();
        const rocketOBB = new OBB().fromBox3(rocketMesh.geometry.boundingBox);
        rocketOBB.applyMatrix4(rocketMesh.matrixWorld);

        return playerOBB.intersectsOBB(rocketOBB);
    }

    reset() {
        this.attacks.forEach(attack => {
            if (attack.marker) this.scene.remove(attack.marker);
            if (attack.rocket) this.scene.remove(attack.rocket);
        });
        this.attacks = [];
    }
}
