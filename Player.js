import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  LANES,
  GRAVITY,
  JETPACK_FORCE,
  GROUND_Y,
  CEILING_Y
} from './constants.js';

const LANE_SWITCH_TIME = 0.2; // seconds

export default class Player {
  constructor(scene) {
    const geometry = new THREE.BoxGeometry(1, 2, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0xff4444 });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(LANES[1], GROUND_Y, 0);
    scene.add(this.mesh);

    this.laneIndex = 1;
    this.currentX = LANES[1];
    this.targetX = LANES[1];

    this.velocityY = 0;

    // Lane switching state
    this.isSwitchingLane = false;
    this.laneTimer = 0;
    this.startX = this.currentX;
  }

  update(delta, input, gameSpeed) {
    let moveSpeed = 1+(gameSpeed-10)*0.05;
    /* =====================
       Vertical (Jetpack)
    ====================== */
    if (input.up) {
      if(this.velocityY < 0){
        this.velocityY += JETPACK_FORCE * delta * 2*moveSpeed;
      }
      this.velocityY += JETPACK_FORCE * delta*moveSpeed;
    }

    this.velocityY += GRAVITY * delta*moveSpeed;
    this.mesh.position.y += this.velocityY * delta;

    if (this.mesh.position.y < GROUND_Y) {
      this.mesh.position.y = GROUND_Y;
      this.velocityY = 0;
    }

    if (this.mesh.position.y > CEILING_Y) {
      this.mesh.position.y = CEILING_Y;
      this.velocityY = 0;
    }

    /* =====================
       Horizontal (Lane Slide)
    ====================== */
    if (this.isSwitchingLane) {
      this.laneTimer += delta;
      const t = Math.min(this.laneTimer / LANE_SWITCH_TIME, 1);

      // Smoothstep interpolation (feels better than linear)
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
