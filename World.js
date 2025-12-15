import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { CEILING_Y } from './constants.js';

export default class World {
  constructor(scene) {
    this.scene = scene;

    // Ground
    const groundGeo = new THREE.PlaneGeometry(10, 200);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.z = -90;
    scene.add(this.ground);

    // Ceiling
    const ceilingGeo = new THREE.PlaneGeometry(10, 200);
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      side: THREE.DoubleSide
    });

    this.ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    this.ceiling.rotation.x = Math.PI / 2;
    this.ceiling.position.set(0, CEILING_Y + 1, -90);
    scene.add(this.ceiling);
  }

  update(delta, gameSpeed) {
    this.ground.position.z += gameSpeed * delta;
    this.ceiling.position.z += gameSpeed * delta;

    if (this.ground.position.z > 0) {
      this.ground.position.z = -90;
      this.ceiling.position.z = -90;
    }
  }
}
