import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { CEILING_Y, LANES } from './constants.js';

// --- TEXTURE PATHS ---
const GROUND_TEXTURE_PATH  = './Textures/floors.jpg';
const CEILING_TEXTURE_PATH = './Textures/walls.png';
const WALL_TEXTURE_PATH    = './Textures/walls.png';
const LIGHT_TEXTURE_PATH   = './Textures/light_tex.jpg';

// --- LIGHTING CONSTANTS ---
const LIGHT_SPAWN_INTERVAL = 50;
const LIGHT_MESH_RADIUS = 0.5;
const LIGHT_INTENSITY = 100;
const LIGHT_DISTANCE = 200;

export default class World {
    constructor(scene, prototype) {
        this.scene = scene;
        this.prototype = !prototype;

        this.distanceTraveled = 0;
        this.lastLightZ = 0;
        this.lights = [];

        this.textureLoader = new THREE.TextureLoader();

        // ======================================================
        // PRE-LOAD AND CACHE ALL MATERIALS
        // ======================================================
        this.materials = {
            ground: {
                textured: new THREE.MeshStandardMaterial({
                    color: 0xffffff,
                    map: this.loadTexture(GROUND_TEXTURE_PATH, 50, 10)
                }),
                prototype: new THREE.MeshStandardMaterial({ color: 0x333333 })
            },
            ceiling: {
                textured: new THREE.MeshStandardMaterial({
                    color: 0xffffff,
                    map: this.loadTexture(CEILING_TEXTURE_PATH, 50, 10)
                }),
                prototype: new THREE.MeshStandardMaterial({ color: 0x222222 })
            },
            wall: {
                textured: new THREE.MeshStandardMaterial({
                    color: 0xffffff,
                    side: THREE.DoubleSide,
                    map: this.loadTexture(WALL_TEXTURE_PATH, 20, 20)
                }),
                prototype: new THREE.MeshStandardMaterial({
                    color: 0x666666,
                    side: THREE.DoubleSide
                })
            },
            light: {
                textured: new THREE.MeshStandardMaterial({
                    color: 0xaaaaaa,
                    emissive: 0xffeeaa,
                    map: this.loadTexture(LIGHT_TEXTURE_PATH, 1, 1)
                }),
                prototype: new THREE.MeshStandardMaterial({
                    color: 0xffffff,
                    emissive: 0xffeeaa
                })
            }
        };

        // ======================================================
        // GROUND
        // ======================================================
        const groundGeo = new THREE.PlaneGeometry(10, 200);
        this.ground = new THREE.Mesh(groundGeo, this.getCurrentMaterial('ground'));
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.position.z = -90;
        scene.add(this.ground);

        // ======================================================
        // CEILING
        // ======================================================
        const ceilingGeo = new THREE.PlaneGeometry(10, 200);
        this.ceiling = new THREE.Mesh(ceilingGeo, this.getCurrentMaterial('ceiling'));
        this.ceiling.rotation.x = Math.PI / 2;
        this.ceiling.position.set(0, CEILING_Y + 0.1, -90);
        scene.add(this.ceiling);

        // ======================================================
        // WALLS
        // ======================================================
        const wallX = LANES[2] + 2;
        const wallGeo = new THREE.PlaneGeometry(1000, CEILING_Y * 2);

        this.wallLeft = new THREE.Mesh(wallGeo, this.getCurrentMaterial('wall'));
        this.wallLeft.rotation.y = Math.PI / 2;
        this.wallLeft.position.set(-wallX, CEILING_Y / 2, -90);
        scene.add(this.wallLeft);

        this.wallRight = new THREE.Mesh(wallGeo, this.getCurrentMaterial('wall'));
        this.wallRight.rotation.y = -Math.PI / 2;
        this.wallRight.position.set(wallX, CEILING_Y / 2, -90);
        scene.add(this.wallRight);
    }

    // ======================================================
    // MATERIAL HELPER
    // ======================================================
    getCurrentMaterial(type) {
        return this.prototype ? this.materials[type].prototype : this.materials[type].textured;
    }

    // ======================================================
    // SET PROTOTYPE MODE (CALL THIS TO SWITCH MODES)
    // ======================================================
    setPrototypeMode(enabled) {
        this.prototype = enabled;
        this.ground.material = this.getCurrentMaterial('ground');
        this.ceiling.material = this.getCurrentMaterial('ceiling');
        this.wallLeft.material = this.getCurrentMaterial('wall');
        this.wallRight.material = this.getCurrentMaterial('wall');
        
        // Update existing lights
        for (const light of this.lights) {
            light.mesh.material = this.getCurrentMaterial('light');
        }
    }

    // ======================================================
    // SAFE TEXTURE LOADER
    // ======================================================
    loadTexture(path, repeatX = 1, repeatY = 1) {
        const texture = this.textureLoader.load(path);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(repeatX, repeatY);
        return texture;
    }

    // ======================================================
    // LIGHTS
    // ======================================================
    _spawnLight(z) {
        const lightGeo = new THREE.CylinderGeometry(
            LIGHT_MESH_RADIUS,
            LIGHT_MESH_RADIUS,
            0.1,
            12
        );

        const lightMesh = new THREE.Mesh(lightGeo, this.getCurrentMaterial('light'));
        lightMesh.rotation.x = Math.PI / 2;
        lightMesh.position.set(0, CEILING_Y - 0.1, z);
        this.scene.add(lightMesh);

        const lightSource = new THREE.PointLight(
            0xffffee,
            LIGHT_INTENSITY,
            LIGHT_DISTANCE
        );
        lightSource.position.copy(lightMesh.position);
        lightSource.position.y -= 1;
        this.scene.add(lightSource);

        this.lights.push({ mesh: lightMesh, source: lightSource });
    }

    _manageLights(deltaZ) {
        if (this.distanceTraveled - this.lastLightZ > LIGHT_SPAWN_INTERVAL) {
            this._spawnLight(-100); // Spawn far ahead
            this.lastLightZ = this.distanceTraveled; 
        }

        for (let i = this.lights.length - 1; i >= 0; i--) {
            const light = this.lights[i];

            light.mesh.position.z += deltaZ;
            light.source.position.z += deltaZ;

            if (light.mesh.position.z > 5) {
                this.scene.remove(light.mesh);
                this.scene.remove(light.source);
                this.lights.splice(i, 1);
            }
        }
    }

    // ======================================================
    // UPDATE
    // ======================================================
    update(delta, gameSpeed) {
        const deltaZ = gameSpeed * delta;
        this.distanceTraveled += deltaZ;

        this.ground.position.z += deltaZ;
        this.ceiling.position.z += deltaZ;
        this.wallLeft.position.z += deltaZ;
        this.wallRight.position.z += deltaZ;

        const wallTexture = this.wallLeft.material.map;
        if (wallTexture) {
            wallTexture.offset.x -= deltaZ / 50;
        }

        if (this.ground.position.z > 0) {
            this.ground.position.z = -90;
            this.ceiling.position.z = -90;
        }

        if (this.wallLeft.position.z > 0) {
            this.wallLeft.position.z = -90;
            this.wallRight.position.z = -90;

            if (wallTexture) {
                wallTexture.offset.x -= 20;
            }
        }

        this._manageLights(deltaZ);
    }
    // Add this inside your World class in world.js
    destroy() {
        // Remove main meshes
        this.scene.remove(this.ground);
        this.scene.remove(this.ceiling);
        this.scene.remove(this.wallLeft);
        this.scene.remove(this.wallRight);

        // Remove all dynamically spawned lights and their meshes
        for (const light of this.lights) {
            this.scene.remove(light.mesh);
            this.scene.remove(light.source);
        }

        // Clear the array
        this.lights = [];

        // Optional: Dispose of geometries and materials to free up GPU memory
        this.ground.geometry.dispose();
        this.ceiling.geometry.dispose();
        this.wallLeft.geometry.dispose();
        this.wallRight.geometry.dispose();
        
        // Note: You could also dispose materials/textures here if you 
        // don't plan on using them again immediately.
    }
}