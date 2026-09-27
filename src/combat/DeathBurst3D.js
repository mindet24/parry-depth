/**
 * DeathBurst3D.js — Enemy death explosion effect.
 * Spawns colored low-poly geometry fragments that fly outward and fade.
 */
import * as THREE from 'three';

const _fragmentGeos = [
  new THREE.TetrahedronGeometry(0.12, 0),
  new THREE.OctahedronGeometry(0.10, 0),
  new THREE.BoxGeometry(0.14, 0.10, 0.08),
];

export class DeathBurst3D {
  /**
   * @param {THREE.Scene} scene
   * @param {number} x
   * @param {number} z
   * @param {number} color  - hex color matching the enemy
   * @param {number} count  - number of fragments (default 8)
   */
  constructor(scene, x, z, color = 0xff4444, count = 8) {
    this.scene = scene;
    this.fragments = [];
    this._done = false;

    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.2,
      roughness: 0.6,
      metalness: 0.3,
      flatShading: true,
    });

    for (let i = 0; i < count; i++) {
      const geo = _fragmentGeos[i % _fragmentGeos.length];
      const mesh = new THREE.Mesh(geo, mat.clone());
      mesh.position.set(x, 0.4 + Math.random() * 0.6, z);

      // Random outward velocity
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
      const speed = 2.5 + Math.random() * 3.5;
      const vx = Math.cos(angle) * speed;
      const vy = 2.0 + Math.random() * 3.0;
      const vz = Math.sin(angle) * speed;

      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      mesh.castShadow = false;
      scene.add(mesh);

      this.fragments.push({ mesh, vx, vy, vz, life: 0.55 + Math.random() * 0.25 });
    }

    // Flash sphere (big bright pop)
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
    });
    this._flash = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 4), flashMat);
    this._flash.position.set(x, 0.55, z);
    scene.add(this._flash);
    this._flashLife = 0.12;
  }

  get done() { return this._done; }

  update(dt) {
    if (this._done) return;

    const gravity = 6.0;
    let anyAlive = false;

    // Flash
    if (this._flashLife > 0) {
      this._flashLife -= dt;
      const s = 1 + (1 - this._flashLife / 0.12) * 2;
      this._flash.scale.setScalar(s);
      this._flash.material.opacity = Math.max(0, this._flashLife / 0.12 * 0.9);
      if (this._flashLife <= 0) this.scene.remove(this._flash);
    }

    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const f = this.fragments[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        this.fragments.splice(i, 1);
        continue;
      }
      anyAlive = true;

      // Apply gravity & velocity
      f.vy -= gravity * dt;
      f.mesh.position.x += f.vx * dt;
      f.mesh.position.y += f.vy * dt;
      f.mesh.position.z += f.vz * dt;

      // Floor bounce / clamp
      if (f.mesh.position.y < 0.05) {
        f.mesh.position.y = 0.05;
        f.vy *= -0.3;
        f.vx *= 0.7;
        f.vz *= 0.7;
      }

      // Tumble
      f.mesh.rotation.x += f.vx * dt * 3;
      f.mesh.rotation.z += f.vz * dt * 3;

      // Fade out in last 40% of life
      const maxLife = 0.55;
      if (f.life < maxLife * 0.4) {
        f.mesh.material.opacity = f.life / (maxLife * 0.4);
        f.mesh.material.transparent = true;
      }
    }

    if (!anyAlive && this._flashLife <= 0) {
      this._done = true;
    }
  }
}
