import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import {
  LANES,
  GRAVITY,
  JETPACK_FORCE,
  GROUND_Y,
  CEILING_Y
} from './constants.js';

const LANE_SWITCH_TIME = 0.2;

// --- NEW CONSTANT FOR ANIMATION SPEED ---
const ANIMATION_SLOWDOWN_FACTOR = 0.2; // 0.2 means 20% speed (5x slower)
// ----------------------------------------

// Optional future assets
const PLAYER_MODEL_PATH = './Models/Player.glb'; // 'path/to/player.gltf'
const PLAYER_TEXTURE_PATH = null; // 'path/to/player_texture.png'

// Define the dimensions of the collision box
const COLLISION_WIDTH = 1;
const COLLISION_HEIGHT = 2;
const COLLISION_DEPTH = 1;

export default class Player {
  constructor(scene, prototype = false) {
    this.scene = scene;
    this.prototype = prototype;

    // =====================
    // ANIMATION PROPERTIES
    // =====================
    this.mixer = null;     // The AnimationMixer to handle time
    this.animations = [];  // Array of animation clips
    this.actions = [];     // Array of currently playing animation actions (changed to array)

    /* =====================
        Collision Mesh (Always)
    ====================== */
    const geometry = new THREE.BoxGeometry(COLLISION_WIDTH, COLLISION_HEIGHT, COLLISION_DEPTH);
    const material = new THREE.MeshStandardMaterial({
      color: 0xff4444,
      wireframe: prototype,
      visible: prototype // Only visible in prototype mode
    });

    // The collision mesh position will be the center of the box
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(LANES[1], GROUND_Y + COLLISION_HEIGHT / 2, 0); // Position Y is now centered
    this.mesh.visible = prototype; // Hide collision mesh unless in prototype mode
    scene.add(this.mesh);

    /* =====================
        Visual Representation
    ====================== */
    this.visual = null;

    if (!prototype) {
      if (PLAYER_MODEL_PATH) {
        const loader = new GLTFLoader();
        loader.load(
          PLAYER_MODEL_PATH, 
          (gltf) => {
            this.visual = gltf.scene;
            
            // --- UPDATED ANIMATION LOGIC: Play all clips and slow them down ---
            this.animations = gltf.animations;

            if (this.animations.length > 0) {
              this.mixer = new THREE.AnimationMixer(this.visual); 
              
              // 1. Loop through ALL clips
              this.animations.forEach(clip => {
                const action = this.mixer.clipAction(clip);
                
                // 2. Set the timeScale to slow the animation down
                action.timeScale = ANIMATION_SLOWDOWN_FACTOR; 
                
                // 3. Play the action
                action.play();
                
                // 4. Store the action
                this.actions.push(action);
              });
            }
            // --- END UPDATED ANIMATION LOGIC ---

            // 1. Reset the visual model's scale to (1,1,1) before applying a new one.
            this.visual.scale.set(1, 1, 1);
            
            // 2. Apply a uniform scale factor.
            const MODEL_SCALE_FACTOR = 0.35; 
            this.visual.scale.multiplyScalar(MODEL_SCALE_FACTOR);
            
            // 3. Adjust Y position to place the model on the ground relative to the center of the collision box.
            this.visual.position.y = - (COLLISION_HEIGHT/4)+0.5; 
            
            this.mesh.add(this.visual); // parent to collision mesh

            // <<< FIX: Hide collision mesh *only* after visual model is loaded and attached
            this.mesh.visible = false; 
          },
          // Optional progress callback (omitted here)
          undefined, 
          // Error callback for debugging
          (error) => {
            console.error('Error loading player model. Collision box remains visible.', error);
          }
        );
      } else if (PLAYER_TEXTURE_PATH) {
        const texture = new THREE.TextureLoader().load(PLAYER_TEXTURE_PATH, () => {
          // Hide collision mesh *after* texture loads
          this.mesh.visible = false;
        });
        const visualMesh = new THREE.Mesh(
          geometry.clone(),
          new THREE.MeshStandardMaterial({ map: texture })
        );
        this.visual = visualMesh;
        this.mesh.add(this.visual);
      }
    }

    /* =====================
        Movement State
    ====================== */
    this.laneIndex = 1;
    this.currentX = LANES[1];
    this.targetX = LANES[1];
    this.velocityY = 0;

    this.isSwitchingLane = false;
    this.laneTimer = 0;
    this.startX = this.currentX;
  }

  update(delta, input, gameSpeed) {
    // --- ANIMATION LOGIC: Update the mixer with the frame delta time ---
    if (this.mixer) {
      // Speed up animation with the game speed
      this.mixer.update(delta * gameSpeed); 
    }
    // -------------------------------------------------------------------
    
    const moveSpeed = 1 + (gameSpeed - 10) * 0.05;

    /* =====================
        Vertical Movement
    ====================== */
    if (input.up) {
      if (this.velocityY < 0) {
        this.velocityY += JETPACK_FORCE * delta * 2 * moveSpeed;
      }
      this.velocityY += JETPACK_FORCE * delta * moveSpeed;
    }

    this.velocityY += GRAVITY * delta * moveSpeed;
    this.mesh.position.y += this.velocityY * delta;

    // Use COLLISION_HEIGHT / 2 since the mesh position is its center
    const min_y = GROUND_Y + COLLISION_HEIGHT / 2;
    const max_y = CEILING_Y - COLLISION_HEIGHT / 2;


    if (this.mesh.position.y < min_y) {
      this.mesh.position.y = min_y;
      this.velocityY = 0;
    }

    if (this.mesh.position.y > max_y) {
      this.mesh.position.y = max_y;
      this.velocityY = 0;
    }

    /* =====================
        Lane Switching
    ====================== */
    if (this.isSwitchingLane) {
      this.laneTimer += delta;
      const t = Math.min(this.laneTimer / LANE_SWITCH_TIME, 1);
      const smoothT = t * t * (3 - 2 * t);

      this.currentX =
        this.startX + (this.targetX - this.startX) * smoothT;

      this.mesh.position.x = this.currentX;

      if (t >= 1) {
        this.isSwitchingLane = false;
        this.mesh.position.x = this.targetX;
        this.currentX = this.targetX;
      }
    }
  }

  moveLeft() {
    if (this.isSwitchingLane || this.laneIndex === 0) return;
    this.laneIndex--;
    this.startLaneSwitch();
  }

  moveRight() {
    if (this.isSwitchingLane || this.laneIndex === LANES.length - 1) return;
    this.laneIndex++;
    this.startLaneSwitch();
  }

  startLaneSwitch() {
    this.isSwitchingLane = true;
    this.laneTimer = 0;
    this.startX = this.mesh.position.x;
    this.targetX = LANES[this.laneIndex];
  }
}