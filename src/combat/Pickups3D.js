/**
 * Pickups3D.js — 3D Low-Poly EXP Crystals & Coins.
 */
import * as THREE from 'three';

export class Pickup3D {
  constructor(scene, x, z, type = 'exp', value = 1) {
    this.scene = scene;
    this.x = x;
    this.z = z;
    this.y = 0.25;
    this.type = type; // 'exp' | 'coin'
    this.value = value;
    this.collected = false;
    this._age = Math.random() * Math.PI * 2;

    this.group = new THREE.Group();
    this.group.position.set(this.x, this.y, this.z);

    if (type === 'exp') {
      const expMat = new THREE.MeshStandardMaterial({
        color: 0x00b0ff,
        emissive: 0x0091ea,
        emissiveIntensity: 2.0,
        roughness: 0.1,
        metalness: 0.8,
        flatShading: true,
      });
      // Octahedron crystal
      this.mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), expMat);
      this.group.add(this.mesh);
    } else {
      const coinMat = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        emissive: 0xffa000,
        emissiveIntensity: 1.5,
        roughness: 0.3,
        metalness: 0.9,
        flatShading: true,
      });
      // Gold spinning disk
      this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 8), coinMat);
      this.mesh.rotation.x = Math.PI / 4;
      this.group.add(this.mesh);
    }

    this.scene.add(this.group);
  }

  update(dt, player) {
    if (this.collected) return;
    this._age += dt;

    // Bobbing and rotation
    this.group.position.y = 0.3 + Math.sin(this._age * 4) * 0.08;
    this.group.rotation.y += dt * 3.5;

    // Magnetic collection
    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const dist = Math.hypot(dx, dz);

    const pickupThreshold = (player.pickupR || 80) / 50; // ~1.6 units
    if (dist < 0.45) {
      this.collected = true;
      this.destroy();
      return;
    }

    if (dist < pickupThreshold) {
      const spd = 4.5;
      this.x += (dx / dist) * spd * dt;
      this.z += (dz / dist) * spd * dt;
      this.group.position.set(this.x, this.group.position.y, this.z);
    }
  }

  destroy() {
    this.scene.remove(this.group);
  }
}
