import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { OBB } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/math/OBB.js';
import { FontLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/geometries/TextGeometry.js';
import {
    LANES,
    GROUND_Y,
    CEILING_Y,
} from './constants.js';
import RocketManager from './RocketManager.js'; 

const ROOM_HEIGHT = CEILING_Y - GROUND_Y;
const OBSTACLE_DEPTH = 1;
const THREE_LANE_WIDTH = 10;
const CYLINDER_RADIUS = 0.5; 

const CONCRETE_TEXTURE_PATH = './Textures/concrete.jpg';

const DANGER_TEXTURE_PATH = './Textures/yellowpaint.jpg';

const LaserShader = {
    uniforms: {
        time: { value: 0 },
        color: { value: new THREE.Color(0xff0000) }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float time;
        uniform vec3 color;
        varying vec2 vUv;

        void main() {
            float pulse = 0.85 + 0.15 * sin(time * 5.0);

            // Distance from center of cylinder UV
            float dist = abs(vUv.x - 0.5) * 2.0;

            // SOLID CORE
            float core = smoothstep(0.25, 0.0, dist);

            // SOFT OUTER GLOW
            float glow = pow(1.0 - dist, 3.0);

            float intensity = core + glow * 0.6;

            vec3 finalColor = color * intensity * pulse;

            // Keep alpha strong
            float alpha = clamp(intensity * pulse, 0.6, 1.0);

            gl_FragColor = vec4(finalColor, alpha);
        }
    `
};

export default class ObstacleManager {
    rocketManager; 
    loader;
    textureLoader;
    
    loadedModels = {};
    loadedTextures = {};
    uniqueModelsConfig = {}; 

    constructor(scene, prototype) {
        this.scene = scene;
        this.obstacles = [];
        this.spawnTimer = 0;
        this.spawnInterval = 1.5;
        this.spawnZ = -60;
        this.prototype = prototype; 

        this.laserMaterial = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(LaserShader.uniforms),
            vertexShader: LaserShader.vertexShader,
            fragmentShader: LaserShader.fragmentShader,
            transparent: true,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });
        
        this.lastObstacleType = null;
        this.repeatCount = 0;

        // Initialize loaders
        this.loader = new GLTFLoader();
        this.textureLoader = new THREE.TextureLoader();

        // Setup the specific asset config based on the passed 'prototype' flag
        this.setupAssetConfig();

        // Base material for collision meshes (wireframe if prototype)
        this.material = new THREE.MeshStandardMaterial({ 
            color: 0xaa0000, 
            wireframe: this.prototype 
        });

        // Reusable geometries
        this.verticalCylinderGeometry = new THREE.CylinderGeometry(CYLINDER_RADIUS, CYLINDER_RADIUS, ROOM_HEIGHT, 32);
        this.rotatingCylinderBaseGeometry = new THREE.CylinderGeometry(CYLINDER_RADIUS, CYLINDER_RADIUS, 1, 32);
        
        this.fontLoader = new FontLoader();
        this.font = null;
        this.fontLoader.load('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/fonts/droid/droid_sans_mono_regular.typeface.json', (font) => {
            this.font = font;
        });

        // Start asset loading
        this.loadAssets();

        // Instantiate RocketManager
        this.rocketManager = new RocketManager(scene, this.spawnZ, this.prototype); 
    }

    /**
     * Defines which textures/models to use.
     * If this.prototype is true, these paths are nullified to prevent loading.
     */
    setupAssetConfig() {
        const getAsset = (path) => this.prototype ? null : path;

        this.uniqueModelsConfig = {
            // Basic Cubes - Set to use concrete.jpg
            0: { model: null, texture: CONCRETE_TEXTURE_PATH }, // spawnLowThreeLane
            1: { model: null, texture: CONCRETE_TEXTURE_PATH }, // spawnHighThreeLane
            3: { model: null, texture: CONCRETE_TEXTURE_PATH }, // spawnGapObstacle
            6: { model: null, texture: CONCRETE_TEXTURE_PATH }, // spawnMiddleHorizontal
            8: { model: null, texture: CONCRETE_TEXTURE_PATH }, // spawnGroundThreeFifths
            // Cylinders / Lane Blockers
            2: { model: null, texture: getAsset('path/to/lane_blocker_texture.png') }, 
            4: { model: null, texture: getAsset('path/to/diagonal_texture.png') }, 
            5: { model: null, texture: getAsset('path/to/diagonal_texture.png')}, 
            7: { model: null, texture: getAsset('path/to/rotating_texture.png') }, 
        };

        this.dangerAsset = { texture: getAsset(DANGER_TEXTURE_PATH) };
    }

    loadAssets() {
        if (this.prototype) {
            //console.log("ObstacleManager: Prototype Mode Active. No textures/models will be loaded.");
            return;
        }

        this.textureLoader.load(DANGER_TEXTURE_PATH, (texture) => {
            // This makes the texture repeat instead of stretching one huge image across the block
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(2, 1); // Adjust these numbers until the paint looks "tight" and detailed

            this.dangerMaterial = new THREE.MeshStandardMaterial({
                map: texture,
                transparent: true,
                side: THREE.FrontSide,
                depthWrite: true, // Set to true if using 3D text to avoid transparency bugs
            });
        });

        for (const type in this.uniqueModelsConfig) {
            const asset = this.uniqueModelsConfig[type];

            // Load GLTF Models
            if (asset.model) {
                this.loader.load(asset.model, (gltf) => {
                    this.loadedModels[type] = gltf.scene; 
                });
            }

            // Load Textures
            if (asset.texture) {
                this.textureLoader.load(asset.texture, (texture) => {
                    // Enable tiling so the concrete doesn't stretch
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    
                    const color = asset.materialColor || 0xffffff; 
                    this.loadedTextures[type] = new THREE.MeshStandardMaterial({ 
                        map: texture, 
                        color: color 
                    });
                    //console.log(`Loaded Texture for type ${type}: ${asset.texture}`);
                });
            }
        }
    }

    createObstacleGroup(baseMesh, obstacleType) {
        const group = new THREE.Group();
        group.add(baseMesh);

        // 1. PROTOTYPE MODE: Exit early with basic wireframe
        if (this.prototype) {
            baseMesh.visible = true;
            return group;
        }

        const modelInfo = this.uniqueModelsConfig[obstacleType];
        const isCylinderType = [2, 4, 5, 7].includes(Number(obstacleType));

        // 2. LASER SHADER: Apply to Cylinders
        if (isCylinderType) {
            const laserMesh = baseMesh.clone();
            const material = this.laserMaterial.clone();
            
            if (modelInfo?.materialColor) {
                material.uniforms.color.value.set(modelInfo.materialColor);
            } else {
                material.uniforms.color.value.set(0xff0000);
            }

            laserMesh.material = material;
            laserMesh.position.set(0, 0, 0);
            laserMesh.rotation.set(0, 0, 0);
            laserMesh.scale.set(1.2, 1, 1.2); 
            
            group.add(laserMesh);
            baseMesh.visible = false;
            return group;
        }

        // 3. GLTF MODEL
        if (modelInfo?.model && this.loadedModels[obstacleType]) {
            const modelClone = this.loadedModels[obstacleType].clone();
            group.add(modelClone);
            baseMesh.visible = false;
            return group;
        }

        // 4. TEXTURED MESH + 3D "DANGER" TEXT
        if (modelInfo?.texture && this.loadedTextures[obstacleType]) {
            const texturedMesh = baseMesh.clone();
            texturedMesh.material = this.loadedTextures[obstacleType];

            texturedMesh.position.set(0, 0, 0);
            texturedMesh.rotation.set(0, 0, 0);
            texturedMesh.scale.set(1, 1, 1);
            texturedMesh.visible = true;
            group.add(texturedMesh);

            // Add 3D Text to specific wide obstacle types
            const threeLaneTypes = [0, 1, 3, 6, 8];
            if (threeLaneTypes.includes(Number(obstacleType)) && this.font) {
                // If we haven't created the master text mesh yet, create it
                if (!this.masterDangerMesh) {
                    this.masterDangerMesh = this.createDangerText();
                }

                if (this.masterDangerMesh) {
                    const textLabel = this.masterDangerMesh.clone();
                    
                    // Position: Center of front face
                    // Z is OBSTACLE_DEPTH / 2 + a small offset to prevent clipping
                    textLabel.position.set(0, 0, (OBSTACLE_DEPTH / 2) + 0.02);
                    group.add(textLabel);
                }
            }

            baseMesh.visible = false;
            return group;
        }

        // 5. FALLBACK
        const fallbackMesh = new THREE.Mesh(
            baseMesh.geometry,
            new THREE.MeshStandardMaterial({ color: modelInfo?.materialColor ?? 0xaa0000 })
        );
        group.add(fallbackMesh);
        baseMesh.visible = false;

        return group;
    }

    // Helper method to generate the 3D Text Geometry
    createDangerText() {
        if (!this.font) return null;

        const textGeo = new TextGeometry('DANGER', {
            font: this.font,
            size: 0.5,
            height: 0.05,
            curveSegments: 2,
            bevelEnabled: true,
            bevelThickness: 0.01,
            bevelSize: 0.01,
        });

        textGeo.computeBoundingBox();
        const xOffset = -0.5 * (textGeo.boundingBox.max.x - textGeo.boundingBox.min.x);
        const yOffset = -0.5 * (textGeo.boundingBox.max.y - textGeo.boundingBox.min.y);
        textGeo.translate(xOffset, yOffset, 0);

        // BRIGHT INDUSTRIAL MATERIAL
        const brightMat = new THREE.MeshStandardMaterial({
            map: this.dangerMaterial.map, // Keep your yellow paint texture
            color: 0xffcc00,              // Base yellow color
            emissive: 0xffaa00,           // The "Glow" color (Orange-Yellow)
            emissiveIntensity: 1,       // Overdrive the brightness (1.0 is normal, 2.0+ is very bright)
            metalness: 0.0,               // Non-metal materials usually look brighter/flatter
            roughness: 0.3                // Makes it slightly shiny
        });

        const mesh = new THREE.Mesh(textGeo, brightMat);
        return mesh;
    }

    spawnObstacleMesh(width, height, x, y, obstacleType) {
        const geometry = new THREE.BoxGeometry(width, height, OBSTACLE_DEPTH);
        const collisionMesh = new THREE.Mesh(geometry, this.material); 
        collisionMesh.position.set(x, y, this.spawnZ);
        
        const group = this.createObstacleGroup(collisionMesh, obstacleType);
        group.position.copy(collisionMesh.position); 
        collisionMesh.position.set(0, 0, 0); 
        
        this.scene.add(group);
        this.obstacles.push(group);
        return collisionMesh; 
    }

    spawnCylinderMesh(geometry, x, y, rotation, obstacleType) {
        const collisionMesh = new THREE.Mesh(geometry, this.material); 
        collisionMesh.position.set(x, y, this.spawnZ);
        if (rotation) collisionMesh.rotation.z = rotation;
        
        const group = this.createObstacleGroup(collisionMesh, obstacleType);
        group.position.copy(collisionMesh.position); 
        collisionMesh.position.set(0, 0, 0); 
        group.rotation.copy(collisionMesh.rotation); 
        collisionMesh.rotation.set(0, 0, 0); 
        
        this.scene.add(group);
        this.obstacles.push(group);
        return group; 
    }

    update(delta, player, gameSpeed, score) { 
        let collided = false;
        this.spawnTimer += delta;

        this.obstacles.forEach(group => {
            group.children.forEach(child => {
                if (child.material && child.material.uniforms && child.material.uniforms.time) {
                    child.material.uniforms.time.value += delta;
                }
            });
        });

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

            if (obsGroup.userData.isRotating) {
                obsGroup.rotation.z += obsGroup.userData.rotationSpeed * delta; 
            }

            if (obsGroup.position.z > 10) {
                this.scene.remove(obsGroup);
                this.obstacles.splice(i, 1);
                continue;
            }

            if (this.checkCollision(player.mesh, obsGroup)) { 
                collided = true;
            }
        }
        return collided;
    }

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
            this.spawnLaneBlockers(true, 2);
        }
    }

    spawnLowThreeLane(type) {
        const h = ROOM_HEIGHT / 3;
        this.spawnObstacleMesh(THREE_LANE_WIDTH, h, 0, GROUND_Y + h / 2, type);
    }

    spawnHighThreeLane(type) {
        const h = ROOM_HEIGHT / 3;
        this.spawnObstacleMesh(THREE_LANE_WIDTH, h, 0, CEILING_Y - h / 2, type);
    }

    spawnLaneBlockers(overlayOnly = false, type) {
        const lanes = overlayOnly ? [Math.floor(Math.random() * LANES.length)] : this.pickLaneSet();
        for (const i of lanes) {
            this.spawnCylinderMesh(this.verticalCylinderGeometry, LANES[i], GROUND_Y + ROOM_HEIGHT / 2, null, type);
        }
    }

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

    spawnDiagonalLeftToRight(type) { this.spawnDiagonal(-2, 2, type); }
    spawnDiagonalRightToLeft(type) { this.spawnDiagonal(2, -2, type); }

    spawnDiagonal(xStart, xEnd, type) {
        const length = Math.sqrt(Math.pow(xEnd - xStart, 2) + Math.pow(ROOM_HEIGHT, 2))*1.5;
        const geometry = this.rotatingCylinderBaseGeometry.clone();
        geometry.scale(1, length, 1);
        const rotation = Math.atan2(ROOM_HEIGHT, xEnd - xStart)*2; 
        this.spawnCylinderMesh(geometry, (xStart + xEnd) / 2, GROUND_Y + ROOM_HEIGHT / 2, rotation, type); 
    }

    spawnRotatingObstacle(type) {
        const maxLength = Math.sqrt(THREE_LANE_WIDTH**2 + ROOM_HEIGHT**2);
        const geometry = this.rotatingCylinderBaseGeometry.clone();
        geometry.scale(1, maxLength, 1);
        const group = this.spawnCylinderMesh(geometry, 0, GROUND_Y + ROOM_HEIGHT / 2, Math.PI / 2, type); 
        group.userData.isRotating = true;
        group.userData.rotationSpeed = (Math.random() > 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.3); 
    }

    spawnMiddleHorizontal(type) { 
        const h = ROOM_HEIGHT / 3; 
        this.spawnObstacleMesh(THREE_LANE_WIDTH, h, 0, GROUND_Y + ROOM_HEIGHT / 3 + h / 2, type); 
    }

    spawnGroundThreeFifths(type) {
        const h = ROOM_HEIGHT * (3 / 5);
        this.spawnObstacleMesh(THREE_LANE_WIDTH, h, 0, GROUND_Y + h / 2, type);
    }

    spawnRocketManager() {
        this.rocketManager.spawnRockets();
    }

    checkCollision(playerMesh, obstacleGroup) {
        const collisionMesh = obstacleGroup.children[0]; 
        if (!collisionMesh) return false;

        playerMesh.updateMatrixWorld(true);
        obstacleGroup.updateMatrixWorld(true); 

        if (!playerMesh.geometry.boundingBox) playerMesh.geometry.computeBoundingBox();
        const playerOBB = new OBB().fromBox3(playerMesh.geometry.boundingBox).applyMatrix4(playerMesh.matrixWorld);

        if (!collisionMesh.geometry.boundingBox) collisionMesh.geometry.computeBoundingBox();
        const obstacleOBB = new OBB().fromBox3(collisionMesh.geometry.boundingBox).applyMatrix4(collisionMesh.matrixWorld); 

        return playerOBB.intersectsOBB(obstacleOBB);
    }

    reset(){
        this.obstacles.forEach(obs => this.scene.remove(obs));
        this.obstacles = [];
        this.rocketManager.reset(); 
    }

    getNextObstacleType(score) {
        const totalTypes = 10; 
        let type = Math.floor(Math.random() * totalTypes);
        if (score < 750 && type === 9) { 
            do {
                type = Math.floor(Math.random() * (totalTypes - 1));
            } while (type === this.lastObstacleType);
        }

        if (type === this.lastObstacleType) {
            this.repeatCount++;
            if (this.repeatCount >= 2) {
                do {
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