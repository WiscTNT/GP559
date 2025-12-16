import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { CEILING_Y, LANES } from './constants.js'; // Assuming LANES is defined for wall positions

// --- TEXTURE PATHS ---
const GROUND_TEXTURE_PATH = './Textures/ground_tex.jpg';
const CEILING_TEXTURE_PATH = './Textures/ceiling_tex.jpg';
const WALL_TEXTURE_PATH = './Textures/walls.png';
const LIGHT_TEXTURE_PATH = './Textures/light_tex.jpg'; // For the light meshes
// ----------------------

// --- LIGHTING CONSTANTS ---
const LIGHT_SPAWN_INTERVAL = 3; // Spawn a new light every 3 units of Z travel
const LIGHT_MESH_RADIUS = 0.5;
const LIGHT_INTENSITY = 100;
const LIGHT_DISTANCE = 200;
// --------------------------

export default class World {
    constructor(scene, prototype) {
        this.scene = scene;
        this.prototype = prototype;
        this.distanceTraveled = 0; // Tracks world movement for light spawning
        this.lastLightZ = 0;
        this.lights = [];

        // Utility function to load a texture
        const loadTexture = (path, repeatX = 10, repeatY = 10) => {
            if (this.prototype) return null;
            return new THREE.TextureLoader().load(path, (texture) => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(repeatX, repeatY); 
            });
        };

        // --- 1. Ground (Floor) ---
        // Using generic 10x10 repeat for floor/ceiling
        const groundTexture = loadTexture(GROUND_TEXTURE_PATH); 
        const groundGeo = new THREE.PlaneGeometry(10, 200);
        const groundMat = new THREE.MeshStandardMaterial({ 
            color: prototype ? 0x333333 : 0xffffff, // White when using texture
            map: groundTexture 
        });
        this.ground = new THREE.Mesh(groundGeo, groundMat);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.position.z = -90;
        scene.add(this.ground);

        // --- 2. Ceiling (Solid Object) ---
        const ceilingTexture = loadTexture(CEILING_TEXTURE_PATH);
        const ceilingGeo = new THREE.PlaneGeometry(10, 200);
        const ceilingMat = new THREE.MeshStandardMaterial({
            color: prototype ? 0x222222 : 0xffffff, // White when using texture
            map: ceilingTexture,
        });

        this.ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
        this.ceiling.rotation.x = Math.PI / 2;
        // Positioned slightly above CEILING_Y for collision visibility/clearance
        this.ceiling.position.set(0, CEILING_Y + 0.1, -90); 
        scene.add(this.ceiling);

        // --- 3. Walls (Fixed and Looping) ---
        const wallX = LANES[2] + 2; // Example side position
        const wallGeo = new THREE.PlaneGeometry(CEILING_Y * 2, 1000); // Long wall for scrolling texture

        // Load wall texture
        const wallTextureLoader = new THREE.TextureLoader();
        const wallTexture = this.prototype ? null : wallTextureLoader.load(WALL_TEXTURE_PATH);
        
        if (wallTexture) {
            wallTexture.wrapS = THREE.RepeatWrapping;
            wallTexture.wrapT = THREE.RepeatWrapping;
            wallTexture.repeat.set(20, 20); // Repeat 20 times along length and height
        }

        const wallMat = new THREE.MeshStandardMaterial({
            color: prototype ? 0x666666 : 0xffffff,
            map: wallTexture,
            side: THREE.DoubleSide // Walls should be visible from both sides
        });

        // Left Wall
        this.wallLeft = new THREE.Mesh(wallGeo, wallMat);
        this.wallLeft.rotation.y = Math.PI / 2;
        this.wallLeft.position.set(-wallX, CEILING_Y / 2, -500);
        scene.add(this.wallLeft);

        // Right Wall
        this.wallRight = new THREE.Mesh(wallGeo, wallMat);
        this.wallRight.rotation.y = -Math.PI / 2;
        this.wallRight.position.set(wallX, CEILING_Y / 2, -500);
        scene.add(this.wallRight);
    }

    // --- 4. Light Spawning and Movement Logic ---
    _spawnLight(z) {
        // --- Visual Light Mesh (with optional texture) ---
        const lightGeo = new THREE.CylinderGeometry(LIGHT_MESH_RADIUS, LIGHT_MESH_RADIUS, 0.1, 12);
        const lightTexture = this.prototype ? null : new THREE.TextureLoader().load(LIGHT_TEXTURE_PATH);
        const lightMat = new THREE.MeshStandardMaterial({
            color: this.prototype ? 0xffffff : 0xaaaaaa,
            emissive: 0xffeeaa, // Gives it a glow
            map: lightTexture,
        });
        
        const lightMesh = new THREE.Mesh(lightGeo, lightMat);
        lightMesh.rotation.x = Math.PI / 2; // Orient flat on the ceiling
        lightMesh.position.set(0, CEILING_Y - 0.1, z); // Place just below the ceiling
        this.scene.add(lightMesh);

        // --- Actual Light Source ---
        const lightSource = new THREE.PointLight(0xffffee, LIGHT_INTENSITY, LIGHT_DISTANCE);
        lightSource.position.copy(lightMesh.position);
        lightSource.position.y -= 1; // Drop the source slightly below the mesh
        this.scene.add(lightSource);

        this.lights.push({ mesh: lightMesh, source: lightSource });
    }

    _manageLights(deltaZ) {
        // Spawn new lights if world has moved far enough
        // Note: The spawning logic uses this.ceiling.position.z for relative distance tracking,
        // which resets when the ceiling loops. This is a common pattern in infinite runners.
        if (this.lastLightZ - this.ceiling.position.z > LIGHT_SPAWN_INTERVAL) {
            // Spawn a new light further down the tunnel (e.g., at z = -100)
            this._spawnLight(-100); 
            this.lastLightZ = this.ceiling.position.z;
        }

        // Move and prune existing lights
        for (let i = this.lights.length - 1; i >= 0; i--) {
            const light = this.lights[i];
            light.mesh.position.z += deltaZ;
            light.source.position.z += deltaZ;

            // Remove lights that have passed the camera/origin (z > 5)
            if (light.mesh.position.z > 5) {
                this.scene.remove(light.mesh);
                this.scene.remove(light.source);
                this.lights.splice(i, 1);
            }
        }
    }

    update(delta, gameSpeed) {
        const deltaZ = gameSpeed * delta;
        this.distanceTraveled += deltaZ;

        // Move static environment
        this.ground.position.z += deltaZ;
        this.ceiling.position.z += deltaZ;
        this.wallLeft.position.z += deltaZ;
        this.wallRight.position.z += deltaZ;

        // Scroll wall texture procedurally
        const wallTexture = this.wallLeft.material.map;
        if (wallTexture) {
            wallTexture.offset.x -= deltaZ / 50; // 1000 units / 20 repeats = 50 units per repeat
        }

        // Loop and reset static environment
        if (this.ground.position.z > 0) {
            this.ground.position.z = -90;
            this.ceiling.position.z = -90;
        }
        
        // Loop walls
        if (this.wallLeft.position.z > 500) {
            this.wallLeft.position.z = -500;
            this.wallRight.position.z = -500;
            if (wallTexture) {
                wallTexture.offset.x -= 20; // Jump back to match the position reset (1000 / 50 = 20)
            }
        }
        
        // Manage dynamic lights
        this._manageLights(deltaZ);
    }
}