/**
 * Weapons3D.js — Complete 10 Weapons + 2 Evolutions in 3D Low-Poly PS1 Style.
 *
 * Fully respects all locked numerical values from projectbrief:
 *   1. Spinning Blade   (Orbits player, damages on touch)
 *   2. Homing Orb       (Seeks nearest living enemy)
 *   3. Lightning Chain  (Chains between up to 4 targets)
 *   4. Thorn Aura       (Pulsing ground bio-hazard ring)
 *   5. Boomerang Axe    (Double-bladed axe flying out and returning)
 *   6. Ghost Companion  (Spectral familiar that charges through targets)
 *   7. Meteor Call      (0.8s ground warning then crashing flaming rock)
 *   8. Whip Crack       (110-degree energy sweep in facing direction)
 *   9. Turret Drone     (Sentry drone firing plasma lasers)
 *  10. Poison Cloud     (3s toxic bubbling gas zone ticking every 0.5s)
 *  Evolutions:
 *   11. Blade Storm     (Spinning Blade + Thorn Aura)
 *   12. Void Pull       (Homing Orb + Magnet Core)
 */
import * as THREE from 'three';
import { WEAPON_STATS, WEAPON_RANK_DMG_BONUS, WEAPON_RANK_CD_BONUS } from '../core/constants.js';
import { sound } from '../core/Audio.js';

function scaledDmg(base, rank, dmgMult = 1, runBonus = 0) {
  return base * (1 + WEAPON_RANK_DMG_BONUS * (rank - 1)) * dmgMult * (1 + runBonus);
}
function scaledCd(base, rank, atkMult = 1) {
  return (base * Math.pow(1 - WEAPON_RANK_CD_BONUS, rank - 1)) / atkMult;
}

export function applyDamageToEnemy(enemy, dmg, damageSpawner, fromX, fromZ) {
  if (!enemy || enemy.dead) return;
  if (enemy.takeHit) {
    enemy.takeHit(dmg, fromX, fromZ);
  } else {
    enemy.hp -= dmg;
    if (enemy.hp <= 0) enemy.dead = true;
  }
  if (damageSpawner) damageSpawner(enemy.x, enemy.z, dmg);
}

// ══════════════════════════════════════════════════════════════
//  1. SPINNING BLADE
// ══════════════════════════════════════════════════════════════
export class SpinningBlade3D {
  constructor(scene, rank = 1, offsetAngle = 0) {
    this.scene = scene;
    this.rank = rank;
    this.id = 'spinBlade';
    this.angle = offsetAngle;
    this._hitCooldowns = new Map();

    this.group = new THREE.Group();
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xffd54f,
      emissive: 0xffa000,
      emissiveIntensity: 1.8,
      metalness: 0.9,
      roughness: 0.2,
      flatShading: true,
    });

    // 4-pointed diamond saw blade
    const saw = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, 0.38), bladeMat);
    saw.rotation.y = Math.PI / 4;
    this.group.add(saw);

    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.08, 6),
      new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, flatShading: true })
    );
    this.group.add(core);

    this.scene.add(this.group);
  }

  update(dt, player, enemies, dmgMult, atkMult, runBonus, damageSpawner) {
    const cfg = WEAPON_STATS.spinBlade;
    const cd = scaledCd(cfg.cd, this.rank, atkMult);
    this.angle += dt * (3.6 + 0.4 * this.rank);

    const orbitR = 1.35;
    const bx = player.x + Math.cos(this.angle) * orbitR;
    const bz = player.z + Math.sin(this.angle) * orbitR;
    this.group.position.set(bx, 0.65, bz);
    this.group.rotation.y += dt * 16;

    // Cooldown management
    for (const [e, timer] of this._hitCooldowns.entries()) {
      const next = timer - dt;
      if (next <= 0) this._hitCooldowns.delete(e);
      else this._hitCooldowns.set(e, next);
    }

    for (const e of enemies) {
      if (e.dead || this._hitCooldowns.has(e)) continue;
      const dist = Math.hypot(e.x - bx, e.z - bz);
      if (dist < (e.radius + 0.28)) {
        const dmg = Math.round(scaledDmg(cfg.dmg, this.rank, dmgMult, runBonus));
        this._hitCooldowns.set(e, cd);
        sound.playSlash();
        applyDamageToEnemy(e, dmg, damageSpawner, bx, bz);
      }
    }
  }

  destroy() {
    this.scene.remove(this.group);
  }
}

// ══════════════════════════════════════════════════════════════
//  2. HOMING ORB
// ══════════════════════════════════════════════════════════════
export class HomingOrb3D {
  constructor(scene, rank = 1) {
    this.scene = scene;
    this.rank = rank;
    this.id = 'homingOrb';
    this.cooldown = 0;
    this.projectiles = [];

    this.orbMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00b0ff,
      emissiveIntensity: 2.5,
      roughness: 0.1,
      flatShading: true,
    });
  }

  update(dt, player, enemies, dmgMult, atkMult, runBonus, damageSpawner) {
    const cfg = WEAPON_STATS.homingOrb;
    this.cooldown -= dt;

    if (this.cooldown <= 0) {
      const live = enemies.filter(e => !e.dead);
      if (live.length > 0) {
        this.cooldown = scaledCd(cfg.cd, this.rank, atkMult);
        sound.playPlasma();
        const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), this.orbMat);
        mesh.position.set(player.x, 0.7, player.z);
        this.scene.add(mesh);
        this.projectiles.push({
          mesh,
          x: player.x,
          z: player.z,
          target: live[0],
          life: 2.5,
        });
      }
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;

      if (!p.target || p.target.dead) {
        const live = enemies.filter(e => !e.dead);
        if (live.length > 0) p.target = live[0];
      }

      if (p.target && !p.target.dead) {
        const dx = p.target.x - p.x;
        const dz = p.target.z - p.z;
        const len = Math.hypot(dx, dz) || 1;
        const spd = 6.2;
        p.x += (dx / len) * spd * dt;
        p.z += (dz / len) * spd * dt;
        p.mesh.position.set(p.x, 0.7, p.z);
        p.mesh.rotation.y += dt * 8;

        if (len < (p.target.radius + 0.3)) {
          const dmg = Math.round(scaledDmg(cfg.dmg, this.rank, dmgMult, runBonus));
          sound.playHit();
          applyDamageToEnemy(p.target, dmg, damageSpawner, p.x, p.z);
          p.life = 0;
        }
      }

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  destroy() {
    this.projectiles.forEach(p => this.scene.remove(p.mesh));
    this.projectiles = [];
  }
}

// ══════════════════════════════════════════════════════════════
//  3. LIGHTNING CHAIN
// ══════════════════════════════════════════════════════════════
export class LightningChain3D {
  constructor(scene, rank = 1) {
    this.scene = scene;
    this.rank = rank;
    this.id = 'lightChain';
    this.cooldown = 0;
    this.lines = [];
  }

  update(dt, player, enemies, dmgMult, atkMult, runBonus, damageSpawner) {
    const cfg = WEAPON_STATS.lightChain;
    this.cooldown -= dt;

    for (let i = this.lines.length - 1; i >= 0; i--) {
      this.lines[i].life -= dt;
      if (this.lines[i].life <= 0) {
        this.scene.remove(this.lines[i].mesh);
        this.lines.splice(i, 1);
      }
    }

    if (this.cooldown <= 0) {
      const live = enemies.filter(e => !e.dead && Math.hypot(e.x - player.x, e.z - player.z) < 4.8);
      if (live.length > 0) {
        this.cooldown = scaledCd(cfg.cd, this.rank, atkMult);
        sound.playLightning();
        const maxHits = Math.min(4, live.length);
        const targets = live.slice(0, maxHits);

        let prev = { x: player.x, z: player.z };
        targets.forEach(tgt => {
          const dmg = Math.round(scaledDmg(cfg.dmg, this.rank, dmgMult, runBonus));
          tgt.hp -= dmg;
          if (damageSpawner) damageSpawner(tgt.x, tgt.z, dmg);
          if (tgt.hp <= 0) tgt.dead = true;

          const points = [
            new THREE.Vector3(prev.x, 0.7, prev.z),
            new THREE.Vector3((prev.x + tgt.x) / 2 + (Math.random() - 0.5) * 0.4, 0.9, (prev.z + tgt.z) / 2),
            new THREE.Vector3(tgt.x, 0.6, tgt.z),
          ];
          const geo = new THREE.BufferGeometry().setFromPoints(points);
          const mat = new THREE.LineBasicMaterial({ color: 0x76ff03, linewidth: 2 });
          const line = new THREE.Line(geo, mat);
          this.scene.add(line);
          this.lines.push({ mesh: line, life: 0.14 });

          prev = tgt;
        });
      }
    }
  }

  destroy() {
    this.lines.forEach(l => this.scene.remove(l.mesh));
    this.lines = [];
  }
}

// ══════════════════════════════════════════════════════════════
//  4. THORN AURA
// ══════════════════════════════════════════════════════════════
export class ThornAura3D {
  constructor(scene, rank = 1, radiusMultiplier = 1.0) {
    this.scene = scene;
    this.rank = rank;
    this.radiusMultiplier = radiusMultiplier;
    this.id = 'thornAura';
    this.tickTimer = 0;

    const ringGeo = new THREE.RingGeometry(0.1, 1.4 * radiusMultiplier, 16);
    ringGeo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: 0x00e676,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      })
    );
    this.mesh.position.y = 0.03;
    this.scene.add(this.mesh);
  }

  update(dt, player, enemies, dmgMult, atkMult, runBonus, damageSpawner) {
    const cfg = WEAPON_STATS.thornAura;
    this.mesh.position.set(player.x, 0.03, player.z);
    this.mesh.rotation.y += dt * 2.0;

    this.tickTimer += dt;
    const cd = scaledCd(cfg.cd, this.rank, atkMult);
    if (this.tickTimer >= cd) {
      this.tickTimer = 0;
      let hitAny = false;
      const reach = 1.4 * this.radiusMultiplier;
      for (const e of enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - player.x, e.z - player.z);
        if (d < reach + e.radius) {
          const dmg = Math.round(scaledDmg(cfg.dmg, this.rank, dmgMult, runBonus));
          e.hp -= dmg;
          hitAny = true;
          if (damageSpawner) damageSpawner(e.x, e.z, dmg);
          if (e.hp <= 0) e.dead = true;
        }
      }
      if (hitAny) sound.playSlash();
    }
  }

  destroy() {
    this.scene.remove(this.mesh);
  }
}

// ══════════════════════════════════════════════════════════════
//  5. BOOMERANG AXE
// ══════════════════════════════════════════════════════════════
export class BoomerangAxe3D {
  constructor(scene, rank = 1) {
    this.scene = scene;
    this.rank = rank;
    this.id = 'boomerang';
    this.cooldown = 0;
    this.axes = [];

    this.axeMat = new THREE.MeshStandardMaterial({
      color: 0xb0bec5,
      metalness: 0.8,
      roughness: 0.2,
      flatShading: true,
    });
    this.handleMat = new THREE.MeshStandardMaterial({
      color: 0x8d6e63,
      roughness: 0.9,
      flatShading: true,
    });
  }

  _createAxeMesh() {
    const group = new THREE.Group();
    // Handle
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), this.handleMat);
    group.add(handle);
    // Double blades
    const blade1 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.04), this.axeMat);
    blade1.position.set(0.18, 0.2, 0);
    group.add(blade1);
    const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.04), this.axeMat);
    blade2.position.set(-0.18, 0.2, 0);
    group.add(blade2);
    return group;
  }

  update(dt, player, enemies, dmgMult, atkMult, runBonus, damageSpawner) {
    const cfg = WEAPON_STATS.boomerang;
    this.cooldown -= dt;

    if (this.cooldown <= 0) {
      const live = enemies.filter(e => !e.dead);
      if (live.length > 0) {
        this.cooldown = scaledCd(cfg.cd, this.rank, atkMult);
        sound.playSlash();
        const target = live[0];
        const dx = target.x - player.x;
        const dz = target.z - player.z;
        const len = Math.hypot(dx, dz) || 1;
        const mesh = this._createAxeMesh();
        this.scene.add(mesh);

        this.axes.push({
          mesh,
          x: player.x,
          z: player.z,
          dx: dx / len,
          dz: dz / len,
          phase: 'out',
          dist: 0,
          maxDist: 5.0,
          hitSet: new Set(),
          age: 0,
        });
      }
    }

    for (let i = this.axes.length - 1; i >= 0; i--) {
      const ax = this.axes[i];
      ax.age += dt;
      ax.mesh.rotation.y += dt * 18;
      const spd = 5.2;

      if (ax.phase === 'out') {
        ax.x += ax.dx * spd * dt;
        ax.z += ax.dz * spd * dt;
        ax.dist += spd * dt;
        if (ax.dist >= ax.maxDist) ax.phase = 'return';
      } else {
        const rdx = player.x - ax.x;
        const rdz = player.z - ax.z;
        const rlen = Math.hypot(rdx, rdz) || 1;
        ax.x += (rdx / rlen) * (spd * 1.3) * dt;
        ax.z += (rdz / rlen) * (spd * 1.3) * dt;
        if (rlen < 0.4) ax.age = 99;
      }
      ax.mesh.position.set(ax.x, 0.7, ax.z);

      for (const e of enemies) {
        if (e.dead || ax.hitSet.has(e)) continue;
        if (Math.hypot(e.x - ax.x, e.z - ax.z) < e.radius + 0.35) {
          const dmg = Math.round(scaledDmg(cfg.dmg, this.rank, dmgMult, runBonus));
          e.hp -= dmg;
          ax.hitSet.add(e);
          sound.playHit();
          if (damageSpawner) damageSpawner(e.x, e.z, dmg);
          if (e.hp <= 0) e.dead = true;
        }
      }

      if (ax.age >= 4.0) {
        this.scene.remove(ax.mesh);
        this.axes.splice(i, 1);
      }
    }
  }

  destroy() {
    this.axes.forEach(a => this.scene.remove(a.mesh));
    this.axes = [];
  }
}

// ══════════════════════════════════════════════════════════════
//  6. GHOST COMPANION
// ══════════════════════════════════════════════════════════════
export class GhostCompanion3D {
  constructor(scene, rank = 1) {
    this.scene = scene;
    this.rank = rank;
    this.id = 'ghost';
    this.cooldown = 0;
    this.x = 0;
    this.z = 0;
    this.state = 'follow';
    this.stateTimer = 0;
    this.target = null;
    this.hasHit = false;

    this.group = new THREE.Group();
    const ghostMat = new THREE.MeshStandardMaterial({
      color: 0x80d8ff,
      emissive: 0x00b0ff,
      emissiveIntensity: 1.5,
      transparent: true,
      opacity: 0.75,
      flatShading: true,
    });
    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), ghostMat);
    head.position.y = 0.8;
    this.group.add(head);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eye1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), eyeMat);
    eye1.position.set(0.08, 0.82, 0.2);
    const eye2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), eyeMat);
    eye2.position.set(-0.08, 0.82, 0.2);
    this.group.add(eye1);
    this.group.add(eye2);

    this.scene.add(this.group);
  }

  update(dt, player, enemies, dmgMult, atkMult, runBonus, damageSpawner) {
    const cfg = WEAPON_STATS.ghost;
    const cd = scaledCd(cfg.cd, this.rank, atkMult);

    if (this.state === 'follow') {
      const tu = player.x - 0.7;
      const tz = player.z + 0.6;
      this.x += (tu - this.x) * 4 * dt;
      this.z += (tz - this.z) * 4 * dt;
      this.cooldown -= dt;

      if (this.cooldown <= 0) {
        const live = enemies.filter(e => !e.dead && Math.hypot(e.x - player.x, e.z - player.z) < 4.2);
        if (live.length > 0) {
          this.cooldown = cd;
          this.target = live[0];
          this.state = 'dash';
          this.stateTimer = 0.45;
          this.hasHit = false;
          sound.playSlash();
        }
      }
    } else if (this.state === 'dash') {
      this.stateTimer -= dt;
      if (this.target && !this.target.dead) {
        const dx = this.target.x - this.x;
        const dz = this.target.z - this.z;
        const len = Math.hypot(dx, dz) || 1;
        this.x += (dx / len) * 9 * dt;
        this.z += (dz / len) * 9 * dt;

        if (!this.hasHit && len < (this.target.radius + 0.4)) {
          const dmg = Math.round(scaledDmg(cfg.dmg, this.rank, dmgMult, runBonus));
          this.target.hp -= dmg;
          this.hasHit = true;
          sound.playHit();
          if (damageSpawner) damageSpawner(this.target.x, this.target.z, dmg);
          if (this.target.hp <= 0) this.target.dead = true;
        }
      }
      if (this.stateTimer <= 0) this.state = 'follow';
    }

    const bob = Math.sin(performance.now() * 0.005) * 0.1;
    this.group.position.set(this.x, bob, this.z);
  }

  destroy() {
    this.scene.remove(this.group);
  }
}

// ══════════════════════════════════════════════════════════════
//  7. METEOR CALL
// ══════════════════════════════════════════════════════════════
export class MeteorCall3D {
  constructor(scene, rank = 1) {
    this.scene = scene;
    this.rank = rank;
    this.id = 'meteor';
    this.cooldown = 0;
    this.meteors = [];

    this.rockMat = new THREE.MeshStandardMaterial({
      color: 0xff3d00,
      emissive: 0xdd2c00,
      emissiveIntensity: 1.5,
      metalness: 0.4,
      roughness: 0.7,
      flatShading: true,
    });
  }

  update(dt, player, enemies, dmgMult, atkMult, runBonus, damageSpawner) {
    const cfg = WEAPON_STATS.meteor;
    this.cooldown -= dt;

    if (this.cooldown <= 0) {
      const live = enemies.filter(e => !e.dead);
      if (live.length > 0) {
        this.cooldown = scaledCd(cfg.cd, this.rank, atkMult);
        const tgt = live[0];
        const tx = tgt.x + (Math.random() - 0.5) * 0.5;
        const tz = tgt.z + (Math.random() - 0.5) * 0.5;

        // Warning reticle
        const ringGeo = new THREE.RingGeometry(0.1, 1.8, 16);
        ringGeo.rotateX(-Math.PI / 2);
        const reticle = new THREE.Mesh(
          ringGeo,
          new THREE.MeshBasicMaterial({ color: 0xff3d00, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
        );
        reticle.position.set(tx, 0.02, tz);
        this.scene.add(reticle);

        // Meteor rock falling
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), this.rockMat);
        rock.position.set(tx, 9.0, tz);
        this.scene.add(rock);

        this.meteors.push({
          x: tx,
          z: tz,
          warn: 0.8,
          timer: 0.8,
          exploded: false,
          reticle,
          rock,
        });
      }
    }

    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.timer -= dt;

      if (!m.exploded) {
        const prog = 1 - Math.max(0, m.timer) / m.warn;
        m.rock.position.y = 9.0 * (1 - prog) + 0.3;
        m.rock.rotation.x += dt * 5;
        m.rock.rotation.y += dt * 5;
        m.reticle.scale.set(0.3 + 0.7 * prog, 0.3 + 0.7 * prog, 1);

        if (m.timer <= 0) {
          m.exploded = true;
          m.timer = 0.35; // explosion duration
          this.scene.remove(m.rock);
          this.scene.remove(m.reticle);
          sound.playExplosion();

          // Shockwave mesh
          const expGeo = new THREE.CylinderGeometry(1.8, 1.8, 0.1, 16);
          const expMat = new THREE.MeshBasicMaterial({ color: 0xffab00, transparent: true, opacity: 0.8 });
          m.expMesh = new THREE.Mesh(expGeo, expMat);
          m.expMesh.position.set(m.x, 0.05, m.z);
          this.scene.add(m.expMesh);

          // Damage
          const dmg = Math.round(scaledDmg(cfg.dmg, this.rank, dmgMult, runBonus));
          for (const e of enemies) {
            if (e.dead) continue;
            if (Math.hypot(e.x - m.x, e.z - m.z) < 1.8 + e.radius) {
              e.hp -= dmg;
              if (damageSpawner) damageSpawner(e.x, e.z, dmg);
              if (e.hp <= 0) e.dead = true;
            }
          }
        }
      } else {
        m.expMesh.scale.x += dt * 4;
        m.expMesh.scale.z += dt * 4;
        m.expMesh.material.opacity = m.timer / 0.35;
        if (m.timer <= 0) {
          this.scene.remove(m.expMesh);
          this.meteors.splice(i, 1);
        }
      }
    }
  }

  destroy() {
    this.meteors.forEach(m => {
      if (m.reticle) this.scene.remove(m.reticle);
      if (m.rock) this.scene.remove(m.rock);
      if (m.expMesh) this.scene.remove(m.expMesh);
    });
    this.meteors = [];
  }
}

// ══════════════════════════════════════════════════════════════
//  8. WHIP CRACK
// ══════════════════════════════════════════════════════════════
export class WhipCrack3D {
  constructor(scene, rank = 1) {
    this.scene = scene;
    this.rank = rank;
    this.id = 'whipCrack';
    this.cooldown = 0;
    this.swings = [];
  }

  update(dt, player, enemies, dmgMult, atkMult, runBonus, damageSpawner) {
    const cfg = WEAPON_STATS.whipCrack;
    this.cooldown -= dt;

    for (let i = this.swings.length - 1; i >= 0; i--) {
      const s = this.swings[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        this.swings.splice(i, 1);
      }
    }

    if (this.cooldown <= 0) {
      this.cooldown = scaledCd(cfg.cd, this.rank, atkMult);
      sound.playSlash();
      const facing = player._facing || 0;
      const reach = 3.6;

      // Create 3D sweeping arc line
      const pts = [];
      const segs = 12;
      const arc = (cfg.arc / 180) * Math.PI;
      for (let i = 0; i <= segs; i++) {
        const a = facing - arc / 2 + (i / segs) * arc;
        pts.push(new THREE.Vector3(player.x + Math.sin(a) * reach, 0.45, player.z + Math.cos(a) * reach));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: 0xffea00, linewidth: 3 });
      const line = new THREE.Line(geo, mat);
      this.scene.add(line);
      this.swings.push({ mesh: line, life: 0.18 });

      // Hit detection (up to 3 enemies)
      let hits = 0;
      for (const e of enemies) {
        if (e.dead || hits >= 3) continue;
        const dx = e.x - player.x;
        const dz = e.z - player.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= reach + e.radius) {
          const angle = Math.atan2(dx, dz);
          let diff = Math.abs(angle - facing);
          if (diff > Math.PI) diff = Math.PI * 2 - diff;
          if (diff <= arc / 2 + 0.2) {
            const dmg = Math.round(scaledDmg(cfg.dmg, this.rank, dmgMult, runBonus));
            e.hp -= dmg;
            hits++;
            sound.playHit();
            if (damageSpawner) damageSpawner(e.x, e.z, dmg);
            if (e.hp <= 0) e.dead = true;
          }
        }
      }
    }
  }

  destroy() {
    this.swings.forEach(s => this.scene.remove(s.mesh));
    this.swings = [];
  }
}

// ══════════════════════════════════════════════════════════════
//  9. TURRET DRONE (Meta Unlock Lv5)
// ══════════════════════════════════════════════════════════════
export class TurretDrone3D {
  constructor(scene, rank = 1) {
    this.scene = scene;
    this.rank = rank;
    this.id = 'turretDrone';
    this.cooldown = 0;
    this.angle = 0;
    this.lasers = [];

    this.group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x37474f, metalness: 0.8, flatShading: true });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.35), bodyMat);
    this.group.add(body);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.08), eyeMat);
    eye.position.set(0, 0, 0.18);
    this.group.add(eye);

    this.scene.add(this.group);
  }

  update(dt, player, enemies, dmgMult, atkMult, runBonus, damageSpawner) {
    const cfg = WEAPON_STATS.turretDrone;
    this.angle += dt * 1.8;
    const dx = player.x + Math.cos(this.angle) * 1.5;
    const dz = player.z + Math.sin(this.angle) * 1.5;
    this.group.position.set(dx, 1.2, dz);

    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      const live = enemies.filter(e => !e.dead && Math.hypot(e.x - dx, e.z - dz) < 5.2);
      if (live.length > 0) {
        this.cooldown = scaledCd(cfg.cd, this.rank, atkMult);
        sound.playPlasma();
        const tgt = live[0];
        const dirX = tgt.x - dx;
        const dirZ = tgt.z - dz;
        const len = Math.hypot(dirX, dirZ) || 1;
        this.group.rotation.y = Math.atan2(dirX, dirZ);

        const boltGeo = new THREE.BoxGeometry(0.08, 0.08, 0.35);
        const boltMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
        const bolt = new THREE.Mesh(boltGeo, boltMat);
        bolt.position.set(dx, 1.2, dz);
        this.scene.add(bolt);

        this.lasers.push({
          mesh: bolt,
          x: dx,
          z: dz,
          vx: (dirX / len) * 7.5,
          vz: (dirZ / len) * 7.5,
          target: tgt,
          life: 1.2,
        });
      }
    }

    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i];
      l.life -= dt;
      l.x += l.vx * dt;
      l.z += l.vz * dt;
      l.mesh.position.set(l.x, 1.1, l.z);

      if (l.target && !l.target.dead && Math.hypot(l.target.x - l.x, l.target.z - l.z) < l.target.radius + 0.25) {
        const dmg = Math.round(scaledDmg(cfg.dmg, this.rank, dmgMult, runBonus));
        l.target.hp -= dmg;
        sound.playHit();
        if (damageSpawner) damageSpawner(l.target.x, l.target.z, dmg);
        if (l.target.hp <= 0) l.target.dead = true;
        l.life = 0;
      }

      if (l.life <= 0) {
        this.scene.remove(l.mesh);
        this.lasers.splice(i, 1);
      }
    }
  }

  destroy() {
    this.scene.remove(this.group);
    this.lasers.forEach(l => this.scene.remove(l.mesh));
    this.lasers = [];
  }
}

// ══════════════════════════════════════════════════════════════
//  10. POISON CLOUD (Meta Unlock Lv15)
// ══════════════════════════════════════════════════════════════
export class PoisonCloud3D {
  constructor(scene, rank = 1) {
    this.scene = scene;
    this.rank = rank;
    this.id = 'poisonCloud';
    this.cooldown = 0;
    this.clouds = [];
  }

  update(dt, player, enemies, dmgMult, atkMult, runBonus, damageSpawner) {
    const cfg = WEAPON_STATS.poisonCloud;
    this.cooldown -= dt;

    if (this.cooldown <= 0) {
      const live = enemies.filter(e => !e.dead);
      if (live.length > 0) {
        this.cooldown = scaledCd(cfg.cd, this.rank, atkMult) * 3; // every 1.5s
        const tgt = live[0];
        const cx = tgt.x + (Math.random() - 0.5) * 0.4;
        const cz = tgt.z + (Math.random() - 0.5) * 0.4;

        const cloudGeo = new THREE.DodecahedronGeometry(1.4, 0);
        const cloudMat = new THREE.MeshBasicMaterial({
          color: 0x76ff03,
          transparent: true,
          opacity: 0.35,
          wireframe: true,
        });
        const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
        cloudMesh.position.set(cx, 0.4, cz);
        this.scene.add(cloudMesh);

        this.clouds.push({
          mesh: cloudMesh,
          x: cx,
          z: cz,
          life: 3.0,
          tick: 0,
        });
      }
    }

    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.life -= dt;
      c.tick += dt;
      c.mesh.rotation.y += dt * 1.5;

      if (c.tick >= 0.5) {
        c.tick = 0;
        const dmg = Math.round(scaledDmg(cfg.dmg, this.rank, dmgMult, runBonus));
        let hit = false;
        for (const e of enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.x - c.x, e.z - c.z) < 1.4 + e.radius) {
            e.hp -= dmg;
            hit = true;
            if (damageSpawner) damageSpawner(e.x, e.z, dmg);
            if (e.hp <= 0) e.dead = true;
          }
        }
        if (hit) sound.playHit();
      }

      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        this.clouds.splice(i, 1);
      }
    }
  }

  destroy() {
    this.clouds.forEach(c => this.scene.remove(c.mesh));
    this.clouds = [];
  }
}

// ══════════════════════════════════════════════════════════════
//  11. BLADE STORM (Evolution: Spinning Blade + Thorn Aura)
// ══════════════════════════════════════════════════════════════
export class BladeStorm3D {
  constructor(scene, rank = 1) {
    this.scene = scene;
    this.rank = rank;
    this.id = 'bladeStorm';
    this.blade1 = new SpinningBlade3D(scene, rank, 0);
    this.blade2 = new SpinningBlade3D(scene, rank, Math.PI); // opposite orbit
    this.aura = new ThornAura3D(scene, rank, 1.5);
  }

  update(dt, player, enemies, dmgMult, atkMult, runBonus, damageSpawner) {
    this.blade1.update(dt, player, enemies, dmgMult * 1.25, atkMult, runBonus, damageSpawner);
    this.blade2.update(dt, player, enemies, dmgMult * 1.25, atkMult, runBonus, damageSpawner);
    this.aura.update(dt, player, enemies, dmgMult * 1.1, atkMult, runBonus, damageSpawner);
  }

  destroy() {
    this.blade1.destroy();
    this.blade2.destroy();
    this.aura.destroy();
  }
}

// ══════════════════════════════════════════════════════════════
//  12. VOID PULL (Evolution: Homing Orb + Magnet Core)
// ══════════════════════════════════════════════════════════════
export class VoidPull3D {
  constructor(scene, rank = 1) {
    this.scene = scene;
    this.rank = rank;
    this.id = 'voidPull';
    this.orb1 = new HomingOrb3D(scene, rank);
    this.orb2 = new HomingOrb3D(scene, rank);
    this.orb3 = new HomingOrb3D(scene, rank);
    this.orb2.cooldown = 0.35;
    this.orb3.cooldown = 0.7;

    const pullRingGeo = new THREE.RingGeometry(0.1, 3.2, 24);
    pullRingGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(
      pullRingGeo,
      new THREE.MeshBasicMaterial({
        color: 0xaa00ff,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
      })
    );
    this.ring.position.y = 0.04;
    this.scene.add(this.ring);
  }

  update(dt, player, enemies, dmgMult, atkMult, runBonus, damageSpawner) {
    this.ring.position.set(player.x, 0.04, player.z);
    this.ring.rotation.y += dt * 3;

    // Pull living enemies towards player with gravitational force
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = player.x - e.x;
      const dz = player.z - e.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 3.2 && dist > 0.4) {
        e.x += (dx / dist) * 1.8 * dt;
        e.z += (dz / dist) * 1.8 * dt;
        e.clampToBounds?.();
      }
    }

    this.orb1.update(dt, player, enemies, dmgMult * 1.3, atkMult, runBonus, damageSpawner);
    this.orb2.update(dt, player, enemies, dmgMult * 1.3, atkMult, runBonus, damageSpawner);
    this.orb3.update(dt, player, enemies, dmgMult * 1.3, atkMult, runBonus, damageSpawner);
  }

  destroy() {
    this.scene.remove(this.ring);
    this.orb1.destroy();
    this.orb2.destroy();
    this.orb3.destroy();
  }
}

// ══════════════════════════════════════════════════════════════
//  FACTORY FOR ALL WEAPONS
// ══════════════════════════════════════════════════════════════
export function createWeapon3D(scene, id, rank = 1) {
  switch (id) {
    case 'spinBlade':   return new SpinningBlade3D(scene, rank);
    case 'homingOrb':   return new HomingOrb3D(scene, rank);
    case 'lightChain':  return new LightningChain3D(scene, rank);
    case 'thornAura':   return new ThornAura3D(scene, rank);
    case 'boomerang':   return new BoomerangAxe3D(scene, rank);
    case 'ghost':       return new GhostCompanion3D(scene, rank);
    case 'meteor':      return new MeteorCall3D(scene, rank);
    case 'whipCrack':   return new WhipCrack3D(scene, rank);
    case 'turretDrone': return new TurretDrone3D(scene, rank);
    case 'poisonCloud': return new PoisonCloud3D(scene, rank);
    case 'bladeStorm':  return new BladeStorm3D(scene, rank);
    case 'voidPull':    return new VoidPull3D(scene, rank);
    default:            return new SpinningBlade3D(scene, rank);
  }
}
