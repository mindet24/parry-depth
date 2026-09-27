/**
 * Enemies3D.js — Fully Articulated Retro-Horror Creatures (Full Enemy Rework).
 *
 * Each enemy archetype features:
 *   - Distinct low-poly silhouette with articulated anatomical body parts
 *     (Head with glowing optics/jaw, Torso/Carapace, Arms/Weapons, Legs/Talons).
 *   - Procedural locomotion & animation states:
 *     idle (breathing/twitching), walking (leg cadence, arm swing, spine sway),
 *     windup/anticipation (exaggerated telegraph postures), active attack (committed strikes),
 *     recovery (vulnerable backstab windows), hit stagger, and death burst.
 *   - Soulslike telegraphs:
 *     • Parryable attacks show golden glint star ("วิ้งๆ") in the final 0.18s-0.20s of windup.
 *     • Unparryable attacks show Crimson Danger Cross ("危" Perilous) & hazard zones.
 *
 * Archetypes:
 *   1. EnemyBasic3D (The Shambler) — Slow, necrotic hunched biped with club arm and claw
 *   2. EnemyFast3D (The Skitterer) — Quadruped insectoid stalker with twin mantis pincers
 *   3. EliteWarden3D (The Iron Warden) — Heavy ironclad furnace golem with steam hammer & shield
 *   4. EliteHunter3D (The Razor Hunter) — Sleek digitigrade assassin with dual radiant scythes
 *   5. Boss3D (The Biomechanical Core Behemoth) — Colossal 3-phase floating core with titan appendages
 */

import * as THREE from 'three';
import { ENEMY, BOSS_BASE_HP, BOSS_HP_PER_ROUTE, BOSS_FLOOR_SCALE } from '../core/constants.js';
import { sound } from '../core/Audio.js';

function scaledHp(base, depth, floor) {
  return Math.round(
    base * (1 + 0.10 * Math.floor((depth - 1) / 2)) * (1 + 0.08 * (floor - 1))
  );
}

// ───────────────────────────────────────────────────────────────
//  Base 3D Enemy Class
// ───────────────────────────────────────────────────────────────
export class BaseEnemy3D {
  constructor(scene, x, z) {
    this.scene = scene;
    this.x = x;
    this.z = z;
    this.y = 0;
    this.hp = 30;
    this.maxHp = 30;
    this.speed = 1.0;
    this.radius = 0.45;
    this.contactDmg = 8;
    this.dead = false;
    this.state = 'chase';
    this.stateTimer = 0;

    this.expDrop = 4;
    this.coinDrop = 1;
    this.deathColor = 0xff3333;

    this._flashTimer = 0;
    this._mainMat = null;
    this._origColor = null;
    this._allMats = []; // stores all materials for white hit-flash & cyan parry-flash
    this._origColors = new Map();

    this.posture = 0;
    this.maxPosture = 80;
    this.isPostureStaggered = false;

    this._isAttacking = false;
    this.isParryable = false;
    this._staggerTimer = 0;
    this._glintSoundPlayed = false;
    this._hasHitPlayerThisAttack = false;

    // Knockback
    this._kbVx = 0;
    this._kbVz = 0;
    this._kbTime = 0;

    // Animation timer for procedural walk/idle cycles
    this._animTime = Math.random() * 10;
    this._walkPhase = 0;

    this.group = new THREE.Group();
    this.group.position.set(this.x, 0, this.z);

    // Inner model container for procedural body bobbing/tilting
    this.modelGroup = new THREE.Group();
    this.group.add(this.modelGroup);

    // ── Parry Glint ("วิ้งๆ") Visual Effects ───────────────────
    const glintSphereGeo = new THREE.SphereGeometry(0.18, 8, 8);
    this._glintMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false,
    });
    this._glintMesh = new THREE.Mesh(glintSphereGeo, this._glintMat);
    this._glintMesh.position.set(0, 1.2, 0.3);
    this._glintMesh.visible = false;
    this.group.add(this._glintMesh);

    // 4-point cross star flare
    const glintStarGeo = new THREE.PlaneGeometry(0.7, 0.7);
    this._glintStarMat = new THREE.MeshBasicMaterial({
      color: 0xffea00,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    this._glintStar = new THREE.Mesh(glintStarGeo, this._glintStarMat);
    this._glintStar.position.set(0, 1.2, 0.31);
    this._glintStar.visible = false;
    this.group.add(this._glintStar);

    // ── Deathblow Marker (Sekiro Red Dot & Reticle) ───────────
    this._deathblowMarker = new THREE.Group();
    this._deathblowMarker.position.set(0, 1.3, 0);

    // 1. Bright glowing crimson core dot
    const coreGeo = new THREE.SphereGeometry(0.24, 16, 16);
    this._deathblowCoreMat = new THREE.MeshBasicMaterial({
      color: 0xff0022,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    });
    const coreMesh = new THREE.Mesh(coreGeo, this._deathblowCoreMat);
    coreMesh.renderOrder = 999;
    this._deathblowMarker.add(coreMesh);

    // 2. White hot pinpoint center (makes it look like a burning reticle)
    const pinGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const pinMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 });
    const pinMesh = new THREE.Mesh(pinGeo, pinMat);
    pinMesh.renderOrder = 1000;
    this._deathblowMarker.add(pinMesh);

    // 3. Pulsing targeting ring
    const deathblowRingGeo = new THREE.RingGeometry(0.32, 0.40, 24);
    this._deathblowRingMat = new THREE.MeshBasicMaterial({
      color: 0xff1744,
      side: THREE.DoubleSide,
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    });
    this._deathblowRing = new THREE.Mesh(deathblowRingGeo, this._deathblowRingMat);
    this._deathblowRing.renderOrder = 998;
    this._deathblowMarker.add(this._deathblowRing);

    this._deathblowMarker.visible = false;
    this.group.add(this._deathblowMarker);

    // ── Perilous (Unparryable) Danger Marker ("危" Danger Cross) ──
    this.isPerilous = false;
    this._perilousSoundPlayed = false;
    this.currentAttack = null;
    this._perilousGroup = new THREE.Group();
    this._perilousGroup.position.set(0, 1.5, 0.3);

    const redMat = new THREE.MeshBasicMaterial({
      color: 0xff0033,
      transparent: true,
      opacity: 0,
      depthTest: false,
    });
    const hBar = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.12), redMat);
    const vBar = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.6), redMat);
    const perilousRingGeo = new THREE.RingGeometry(0.25, 0.34, 16);
    const ringMesh = new THREE.Mesh(perilousRingGeo, redMat);
    this._perilousGroup.add(hBar);
    this._perilousGroup.add(vBar);
    this._perilousGroup.add(ringMesh);
    this._perilousMat = redMat;
    this._perilousGroup.visible = false;
    this.group.add(this._perilousGroup);

    this.scene.add(this.group);
  }

  get isAttacking() {
    return this._isAttacking || this.state === 'attack' || this.state === 'slam' || this.state === 'slash1_attack' || this.state === 'slash2_attack';
  }

  _registerMat(mat) {
    if (!mat || this._allMats.includes(mat)) return;
    this._allMats.push(mat);
    if (mat.color) {
      this._origColors.set(mat, mat.color.getHex());
    }
  }

  setGlint(active, progress = 0) {
    if (active) {
      if (!this._glintSoundPlayed) {
        sound.playGlint?.();
        this._glintSoundPlayed = true;
      }
      this.isParryable = true;
      this.isPerilous = false;
      if (this._glintMesh) {
        this._glintMesh.visible = true;
        const s = 1.0 + Math.sin(progress * Math.PI * 10) * 0.45;
        this._glintMesh.scale.setScalar(s);
        this._glintMat.opacity = 1.0;
      }
      if (this._glintStar) {
        this._glintStar.visible = true;
        const s = 1.2 + Math.sin(progress * Math.PI * 10) * 0.6;
        this._glintStar.scale.setScalar(s);
        this._glintStar.rotation.z += 0.25;
        this._glintStarMat.opacity = 0.95;
      }
    } else {
      this.isParryable = false;
      this._glintSoundPlayed = false;
      if (this._glintMesh) this._glintMesh.visible = false;
      if (this._glintStar) this._glintStar.visible = false;
    }
  }

  setPerilous(active, progress = 0) {
    if (active) {
      if (!this._perilousSoundPlayed) {
        sound.playPerilousDanger?.();
        this._perilousSoundPlayed = true;
      }
      this.isPerilous = true;
      this.isParryable = false;
      if (this._perilousGroup) {
        this._perilousGroup.visible = true;
        const s = 1.0 + Math.sin(progress * Math.PI * 12) * 0.35;
        this._perilousGroup.scale.setScalar(s);
        this._perilousGroup.rotation.z += 0.08;
        this._perilousMat.opacity = 0.95;
      }
    } else {
      this.isPerilous = false;
      this._perilousSoundPlayed = false;
      if (this._perilousGroup) this._perilousGroup.visible = false;
    }
  }

  isAttackerBehind(px, pz) {
    const dx = px - this.x;
    const dz = pz - this.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.001) return true;
    const maxRange = Math.max(2.4, this.radius + 1.6);
    if (len > maxRange) return false;
    const fx = Math.sin(this.group.rotation.y);
    const fz = Math.cos(this.group.rotation.y);
    const dot = (fx * (dx / len)) + (fz * (dz / len));
    return dot < -0.25; // rear ~150° cone
  }

  breakPosture() {
    this.posture = this.maxPosture;
    this.isPostureStaggered = true;
    this._staggerTimer = 4.0; // 4 seconds of stagger
    this.state = 'recover';
    this.stateTimer = 4.0;
    this._isAttacking = false;
    this.setGlint(false);
    this.setPerilous(false);
    sound.playPostureBreak?.();
    if (this._deathblowMarker) this._deathblowMarker.visible = true;
  }

  onParried() {
    this.posture += 50; // High posture damage on parry
    if (this.posture >= this.maxPosture) {
      this.breakPosture();
    } else {
      this._staggerTimer = 0.85;
      this.state = 'recover';
      this.stateTimer = 0.85;
      this._isAttacking = false;
      this.setGlint(false);
      this.setPerilous(false);
    }

    if (this.telegraphMesh) this.telegraphMesh.visible = false;
    if (this.telegraphRing) this.telegraphRing.visible = false;
    if (this.slamTelegraph) this.slamTelegraph.visible = false;
    if (this.telegraphLine) this.telegraphLine.visible = false;

    // Cyan parry flash across all body materials
    this._flashTimer = 0.38;
    for (const m of this._allMats) {
      if (m.color) m.color.setHex(0x00e5ff);
    }
  }

  takeHit(dmg, fromX, fromZ) {
    this.hp -= dmg;
    this.posture += dmg * 1.5; // Posture damage from standard hits
    if (this.posture >= this.maxPosture && !this.isPostureStaggered) {
      this.breakPosture();
    }

    this._flashTimer = 0.14;
    // White impact flash
    for (const m of this._allMats) {
      if (m.color) m.color.setHex(0xffffff);
    }

    if (fromX !== undefined && fromZ !== undefined) {
      const dx = this.x - fromX;
      const dz = this.z - fromZ;
      const len = Math.hypot(dx, dz) || 1;
      const kbPower = 2.6;
      this._kbVx = (dx / len) * kbPower;
      this._kbVz = (dz / len) * kbPower;
      this._kbTime = 0.18;
    } else {
      const angle = Math.random() * Math.PI * 2;
      this._kbVx = Math.cos(angle) * 1.5;
      this._kbVz = Math.sin(angle) * 1.5;
      this._kbTime = 0.15;
    }

    if (this.hp <= 0) this.dead = true;
    return this.dead;
  }

  updateFlash(dt) {
    if (this._ruptureTimer > 0) {
      this._ruptureTimer -= dt;
    }

    // ── Posture System ──
    if (this.isPostureStaggered) {
      if (this._staggerTimer <= 0) {
        this.isPostureStaggered = false;
        this.posture = 0;
        if (this._deathblowMarker) this._deathblowMarker.visible = false;
      } else if (this._deathblowMarker) {
        this._deathblowMarker.visible = true;
        // Pulse Sekiro deathblow reticle!
        const pulse = 1.0 + Math.sin(performance.now() * 0.012) * 0.28;
        this._deathblowMarker.scale.setScalar(pulse);
        if (this._deathblowRing) this._deathblowRing.rotation.z += dt * 2.5;
      }
    } else {
      if (this.posture >= this.maxPosture) {
        this.breakPosture();
      } else if (this.posture > 0) {
        this.posture -= dt * 6;
        if (this.posture < 0) this.posture = 0;
      }
      if (this._deathblowMarker) this._deathblowMarker.visible = false;
    }

    if (this._flashTimer > 0) {
      this._flashTimer -= dt;
      if (this._flashTimer <= 0) {
        for (const m of this._allMats) {
          const orig = this._origColors.get(m);
          if (orig !== undefined && m.color) {
            m.color.setHex(orig);
          }
        }
      }
    }
  }

  updateKnockback(dt) {
    if (this._kbTime <= 0) return;
    this._kbTime -= dt;
    const decay = Math.max(0, this._kbTime / 0.18);
    this.x += this._kbVx * decay * dt;
    this.z += this._kbVz * decay * dt;
    this.clampToBounds();
  }

  /**
   * Move toward the player with a clamped turn rate.
   * Max angular speed: ~200 deg/s so enemies can never snap-face mid-attack.
   * Set this._lockFacing = true during windup/attack to prevent any turning.
   */
  _moveToward(dt, player, spd) {
    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const len = Math.hypot(dx, dz);
    if (len > 0.1) {
      this.x += (dx / len) * spd * dt;
      this.z += (dz / len) * spd * dt;

      // Facing update: clamped angular speed so enemies can't snap-track
      if (!this._lockFacing) {
        const targetFacing = Math.atan2(dx, dz);
        const MAX_TURN_RAD_PER_S = 3.49; // ~200°/s
        let diff = targetFacing - this.group.rotation.y;
        while (diff >  Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const maxStep = MAX_TURN_RAD_PER_S * dt;
        const step = Math.sign(diff) * Math.min(Math.abs(diff), maxStep);
        this.group.rotation.y += step;
      }

      this._walkPhase += dt * spd * 7.5;
    }
    this.clampToBounds();
  }

  separate(otherEnemies) {
    for (const other of otherEnemies) {
      if (other === this || other.dead) continue;
      const dx = this.x - other.x;
      const dz = this.z - other.z;
      const dist = Math.hypot(dx, dz);
      const minDist = this.radius + other.radius;
      if (dist < minDist && dist > 0.001) {
        const push = (minDist - dist) * 0.5;
        this.x += (dx / dist) * push;
        this.z += (dz / dist) * push;
      }
    }
  }

  clampToBounds(cols = 18, rows = 13) {
    this.x = Math.max(0.8, Math.min(this.x, cols - 0.8));
    this.z = Math.max(0.8, Math.min(this.z, rows - 0.8));
    this.group.position.set(this.x, 0, this.z);
  }

  destroy() {
    this.scene.remove(this.group);
  }
}

// ═══════════════════════════════════════════════════════════════
//  1. BASIC ENEMY: The Shambler (EnemyBasic3D)
//  Slow, twitching necrotic biped with club pummel arm & claw
// ═══════════════════════════════════════════════════════════════
export class EnemyBasic3D extends BaseEnemy3D {
  constructor(scene, x, z, depth = 1, floor = 1) {
    super(scene, x, z);
    const cfg = ENEMY.basic;
    this.maxHp = scaledHp(cfg.hp, depth, floor);
    this.hp = this.maxHp;
    this.maxPosture = 50;
    this.speed = cfg.speed / 80; // ~0.56 units/s
    this.radius = 0.42;
    this.contactDmg = cfg.dmg;
    this._lungeCd = cfg.lunge_cd;
    this._lungeTimer = Math.random() * 1.5;
    this._lungeDx = 0;
    this._lungeDz = 0;
    this.deathColor = 0x8b2020;

    this._buildCreature();
  }

  _buildCreature() {
    // Flesh material with decaying purple-brown undertone
    const fleshMat = new THREE.MeshStandardMaterial({
      color: 0x483236,
      roughness: 0.8,
      metalness: 0.15,
      flatShading: true,
    });
    this._registerMat(fleshMat);
    this._mainMat = fleshMat;
    this._origColor = 0x483236;

    // Bone / spine plates
    const boneMat = new THREE.MeshStandardMaterial({
      color: 0x8d6e63,
      roughness: 0.65,
      metalness: 0.1,
      flatShading: true,
    });
    this._registerMat(boneMat);

    // Glowing eye optics
    const opticMat = new THREE.MeshStandardMaterial({
      color: 0xff1744,
      emissive: 0xd50000,
      emissiveIntensity: 2.5,
      roughness: 0.3,
      flatShading: true,
    });
    this._registerMat(opticMat);

    // ── Torso (hunched necrotic chest + spine) ──────────────────
    this.torso = new THREE.Group();
    this.torso.position.y = 0.65;
    this.modelGroup.add(this.torso);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.55, 0.38), fleshMat);
    chest.rotation.x = 0.22; // hunched forward
    chest.castShadow = true;
    this.torso.add(chest);

    // Spines along hunched back
    for (let i = 0; i < 3; i++) {
      const spine = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 4), boneMat);
      spine.position.set(0, 0.12 - i * 0.14, -0.22);
      spine.rotation.x = -Math.PI / 3;
      this.torso.add(spine);
    }

    // ── Head & Necrotic Jaw ─────────────────────────────────────
    this.head = new THREE.Group();
    this.head.position.set(0, 0.36, 0.12);
    this.torso.add(this.head);

    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.32), fleshMat);
    skull.castShadow = true;
    this.head.add(skull);

    // Asymmetric glowing optic slits
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.08), opticMat);
    eyeR.position.set(0.08, 0.04, 0.17);
    this.head.add(eyeR);

    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.08), opticMat);
    eyeL.position.set(-0.08, 0.06, 0.17);
    this.head.add(eyeL);

    // Jaw
    this.jaw = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.24), boneMat);
    this.jaw.position.set(0, -0.14, 0.08);
    this.head.add(this.jaw);

    // ── Left Arm (withered reaching claw) ─────────────────────────
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(-0.32, 0.18, 0.0);
    this.torso.add(this.leftArm);

    const lShoulder = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.14), fleshMat);
    lShoulder.position.y = -0.14;
    this.leftArm.add(lShoulder);

    const lForearm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.12), fleshMat);
    lForearm.position.set(0, -0.38, 0.06);
    this.leftArm.add(lForearm);

    // Claw fingers
    const lClaw = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), boneMat);
    lClaw.position.set(0, -0.55, 0.1);
    lClaw.rotation.x = Math.PI / 2;
    this.leftArm.add(lClaw);

    // ── Right Arm (mutated colossal pummel club/fist) ──────────────
    this.rightArm = new THREE.Group();
    this.rightArm.position.set(0.36, 0.2, 0.0);
    this.torso.add(this.rightArm);

    const rShoulder = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.26), fleshMat);
    rShoulder.position.y = -0.16;
    this.rightArm.add(rShoulder);

    const rForearm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.28), boneMat);
    rForearm.position.set(0, -0.42, 0.08);
    this.rightArm.add(rForearm);

    // Heavy mutated fist with spikes
    this.rightFist = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.38), boneMat);
    this.rightFist.position.set(0, -0.68, 0.12);
    this.rightFist.castShadow = true;
    this.rightArm.add(this.rightFist);

    const fistSpike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 4), opticMat);
    fistSpike.position.set(0, 0, 0.2);
    fistSpike.rotation.x = Math.PI / 2;
    this.rightFist.add(fistSpike);

    // ── Left Leg (thigh + shin + foot) ───────────────────────────
    this.leftLeg = new THREE.Group();
    this.leftLeg.position.set(-0.16, 0.42, 0.0);
    this.modelGroup.add(this.leftLeg);

    const lThigh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.16), fleshMat);
    lThigh.position.y = -0.13;
    this.leftLeg.add(lThigh);

    const lShin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.14), fleshMat);
    lShin.position.set(0, -0.34, -0.02);
    this.leftLeg.add(lShin);

    const lFoot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.24), boneMat);
    lFoot.position.set(0, -0.46, 0.06);
    this.leftLeg.add(lFoot);

    // ── Right Leg (thigh + shin + foot) ──────────────────────────
    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(0.16, 0.42, 0.0);
    this.modelGroup.add(this.rightLeg);

    const rThigh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.18), fleshMat);
    rThigh.position.y = -0.13;
    this.rightLeg.add(rThigh);

    const rShin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 0.16), fleshMat);
    rShin.position.set(0, -0.34, -0.02);
    this.rightLeg.add(rShin);

    const rFoot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.26), boneMat);
    rFoot.position.set(0, -0.46, 0.06);
    this.rightLeg.add(rFoot);

    // ── Telegraph Ring on floor ──────────────────────────────────
    const telRingGeo = new THREE.RingGeometry(0.2, 1.4, 24);
    telRingGeo.rotateX(-Math.PI / 2);
    this.telegraphRingMat = new THREE.MeshBasicMaterial({
      color: 0xff1744,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    this.telegraphMesh = new THREE.Mesh(telRingGeo, this.telegraphRingMat);
    this.telegraphMesh.position.set(0, 0.02, 0);
    this.telegraphMesh.visible = false;
    this.group.add(this.telegraphMesh);
  }

  update(dt, player) {
    if (this.dead) return;
    this.updateFlash(dt);
    this.updateKnockback(dt);
    this._animTime += dt;

    if (this._staggerTimer > 0) {
      this._staggerTimer -= dt;
      this._isAttacking = false;
      // Stagger animation: head and arms thrown back, knees buckle
      this.torso.rotation.x = -0.45;
      this.head.rotation.x = -0.3;
      this.leftArm.rotation.x = -1.2;
      this.rightArm.rotation.x = -1.4;
      this.modelGroup.position.y = -0.1;
      return;
    }

    if (this._kbTime > 0.08) return;

    switch (this.state) {
      case 'chase': {
        this._isAttacking = false;
        this.setGlint(false);
        this._moveToward(dt, player, this.speed);

        // Procedural Shambling Walk Cycle
        const wp = this._walkPhase;
        this.leftLeg.rotation.x = Math.sin(wp) * 0.55;
        this.rightLeg.rotation.x = -Math.sin(wp) * 0.55;
        this.modelGroup.position.y = Math.abs(Math.sin(wp * 2)) * 0.06;

        // Limping asymmetric arm swings and twitches
        this.torso.rotation.z = Math.sin(wp * 0.5) * 0.08;
        this.torso.rotation.x = 0.25 + Math.sin(wp) * 0.05;
        this.head.rotation.y = Math.sin(this._animTime * 4) * 0.15;
        this.head.rotation.x = Math.cos(this._animTime * 3) * 0.1;
        this.leftArm.rotation.x = -Math.sin(wp) * 0.4;
        this.rightArm.rotation.x = Math.sin(wp) * 0.25;

        // Lunge timing check
        this._lungeTimer += dt;
        if (this._lungeTimer >= this._lungeCd) {
          const dist = Math.hypot(player.x - this.x, player.z - this.z);
          if (dist < 3.8) {
            this._lungeTimer = 0;
            const dx = player.x - this.x;
            const dz = player.z - this.z;
            const len = Math.hypot(dx, dz) || 1;
            this._lungeDx = dx / len;
            this._lungeDz = dz / len;

            // Soulslike moveset selection:
            // 55% Quick Claw Swipe, 45% Delayed Overhead Pummel
            this.currentAttack = Math.random() < 0.55 ? 'quick_swipe' : 'delayed_overhead';
            this.totalWindup   = this.currentAttack === 'delayed_overhead' ? 0.95 : 0.48;
            this.attackReach   = this.currentAttack === 'delayed_overhead' ? 1.45 : 1.15;

            this.state = 'windup';
            this.stateTimer = this.totalWindup;
            this.telegraphMesh.visible = true;
          }
        }
        break;
      }

      case 'windup': {
        this.stateTimer -= dt;
        this.group.rotation.y = Math.atan2(this._lungeDx, this._lungeDz);

        const totalWindup = this.totalWindup || 0.6;
        const progress = 1 - (this.stateTimer / totalWindup);

        // Expressive anticipation postures
        if (this.currentAttack === 'delayed_overhead') {
          // Arches spine far back, raises massive right pummel arm high overhead with trembling tension
          this.torso.rotation.x = -0.45 + Math.sin(progress * Math.PI * 18) * 0.05;
          this.rightArm.rotation.x = -2.4 + Math.sin(progress * Math.PI * 22) * 0.08;
          this.leftArm.rotation.x = -0.4;
          this.head.rotation.x = 0.35; // glaring at player
          this.jaw.position.y = -0.18; // jaw hangs open
        } else {
          // Coils claw back across chest for quick horizontal strike
          this.torso.rotation.x = 0.1;
          this.torso.rotation.y = -0.45;
          this.rightArm.rotation.x = -0.8;
          this.rightArm.rotation.y = 0.8;
          this.leftArm.rotation.x = 0.2;
        }

        // Contracting warning ring on floor
        const scale = Math.max(0.2, 1.4 - progress * 1.0);
        this.telegraphMesh.scale.set(scale, scale, 1);
        const pulse = Math.sin(progress * Math.PI * 12);
        this.telegraphRingMat.color.setHex(progress > 0.72 ? 0xffffff : 0xff1744);
        this.telegraphRingMat.opacity = 0.45 + 0.45 * Math.abs(pulse);

        // "วิ้งๆ" Parry window: strictly final 0.18s
        if (this.stateTimer <= 0.18) {
          this._glintMesh.position.set(0, 1.15, 0.35);
          this._glintStar.position.set(0, 1.15, 0.36);
          this.setGlint(true, 1 - (this.stateTimer / 0.18));
        } else {
          this.setGlint(false);
        }

        if (this.stateTimer <= 0) {
          this.state = 'attack';
          this.stateTimer = this.currentAttack === 'delayed_overhead' ? 0.26 : 0.20;
          this.telegraphMesh.visible = false;
          this.setGlint(false);
          this._isAttacking = true;
          this._hasHitPlayerThisAttack = false;
        }
        break;
      }

      case 'attack': {
        this._isAttacking = true;
        this.isParryable = false;
        this.setGlint(false);

        const lungeSpd = this.currentAttack === 'delayed_overhead' ? 2.8 : 2.2;
        this.x += this._lungeDx * lungeSpd * dt;
        this.z += this._lungeDz * lungeSpd * dt;
        this.clampToBounds();

        // Attack swing postures
        if (this.currentAttack === 'delayed_overhead') {
          // Crushes pummel arm down onto the earth
          this.torso.rotation.x = 0.65;
          this.rightArm.rotation.x = 1.35;
          this.head.rotation.x = -0.2;
        } else {
          // Full horizontal cleave swing
          this.torso.rotation.y = 0.8;
          this.rightArm.rotation.x = 0.3;
          this.rightArm.rotation.y = -1.2;
        }

        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = 'recover';
          // Committed recovery window:
          // Delayed overhead gives a generous 1.15s punish window for Backstabs!
          this.stateTimer = this.currentAttack === 'delayed_overhead' ? 1.15 : 0.55;
          this._isAttacking = false;
        }
        break;
      }

      case 'recover':
        this._isAttacking = false;
        this.setGlint(false);
        this.stateTimer -= dt;
        // Vulnerable recovery posture: leaning forward, arm heavy on the ground
        this.torso.rotation.x = 0.35;
        this.head.rotation.x = 0.3;
        this.rightArm.rotation.x = 0.8;
        if (this.stateTimer <= 0) {
          this.torso.rotation.set(0, 0, 0);
          this.state = 'chase';
        }
        break;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  2. FAST ENEMY: The Skitterer (EnemyFast3D)
//  Agile quadruped insectoid stalker with twin razor mandibles
// ═══════════════════════════════════════════════════════════════
export class EnemyFast3D extends BaseEnemy3D {
  constructor(scene, x, z, depth = 1, floor = 1) {
    super(scene, x, z);
    const cfg = ENEMY.fast;
    this.maxHp = scaledHp(cfg.hp, depth, floor);
    this.hp = this.maxHp;
    this.maxPosture = 45;
    this.speed = cfg.speed / 80; // ~1.4 units/s
    this.radius = 0.38;
    this.contactDmg = cfg.dmg;
    this._dashCd = cfg.dash_cd;
    this._dashTimer = Math.random() * 2.0;
    this._angle = Math.random() * Math.PI * 2;
    this._dashDx = 0;
    this._dashDz = 0;

    this.expDrop = 3;
    this.coinDrop = 1;
    this.deathColor = 0x00e5ff;

    this._buildCreature();
  }

  _buildCreature() {
    const carapaceMat = new THREE.MeshStandardMaterial({
      color: 0x16282b,
      roughness: 0.45,
      metalness: 0.65,
      flatShading: true,
    });
    this._registerMat(carapaceMat);
    this._mainMat = carapaceMat;
    this._origColor = 0x16282b;

    // Cyan bioluminescent optics
    const sensorMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00b0ff,
      emissiveIntensity: 2.6,
      roughness: 0.2,
      flatShading: true,
    });
    this._registerMat(sensorMat);

    // Razor mandibles / pincers
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x80deea,
      roughness: 0.3,
      metalness: 0.8,
      flatShading: true,
    });
    this._registerMat(bladeMat);

    // ── Thorax (central low-profile segmented body) ──────────────
    this.thorax = new THREE.Group();
    this.thorax.position.y = 0.32;
    this.modelGroup.add(this.thorax);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.46), carapaceMat);
    chest.castShadow = true;
    this.thorax.add(chest);

    // Abdomen (rear sensory node)
    this.abdomen = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.36), carapaceMat);
    this.abdomen.position.set(0, 0.04, -0.36);
    this.abdomen.castShadow = true;
    this.thorax.add(this.abdomen);

    // ── Head & Optics ───────────────────────────────────────────
    this.head = new THREE.Group();
    this.head.position.set(0, 0.02, 0.26);
    this.thorax.add(this.head);

    const headMesh = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.32, 5), carapaceMat);
    headMesh.rotation.x = Math.PI / 2;
    headMesh.castShadow = true;
    this.head.add(headMesh);

    // Quad optic cluster
    const eye1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.06), sensorMat);
    eye1.position.set(-0.08, 0.06, 0.16);
    this.head.add(eye1);

    const eye2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.06), sensorMat);
    eye2.position.set(0.08, 0.06, 0.16);
    this.head.add(eye2);

    // Mandibles / twin scythe pincers
    this.leftMandible = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 4), bladeMat);
    this.leftMandible.position.set(-0.16, -0.04, 0.22);
    this.leftMandible.rotation.z = -0.5;
    this.leftMandible.rotation.x = Math.PI / 2;
    this.head.add(this.leftMandible);

    this.rightMandible = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 4), bladeMat);
    this.rightMandible.position.set(0.16, -0.04, 0.22);
    this.rightMandible.rotation.z = 0.5;
    this.rightMandible.rotation.x = Math.PI / 2;
    this.head.add(this.rightMandible);

    // ── 4 Articulated Spider/Insectoid Legs ───────────────────────
    this.legs = [];
    const legPositions = [
      { x: -0.22, z: 0.14, side: -1, id: 'FL' }, // Front Left
      { x: 0.22, z: 0.14, side: 1, id: 'FR' },  // Front Right
      { x: -0.22, z: -0.16, side: -1, id: 'BL' }, // Back Left
      { x: 0.22, z: -0.16, side: 1, id: 'BR' },  // Back Right
    ];

    for (const pos of legPositions) {
      const legRoot = new THREE.Group();
      legRoot.position.set(pos.x, 0.0, pos.z);
      this.thorax.add(legRoot);

      // Upper femur
      const femur = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), carapaceMat);
      femur.position.set(pos.side * 0.12, 0.08, 0);
      femur.rotation.z = pos.side * -0.65;
      legRoot.add(femur);

      // Lower tibia / talon
      const tibia = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.36, 4), bladeMat);
      tibia.position.set(pos.side * 0.26, -0.16, 0);
      tibia.rotation.z = pos.side * 0.45;
      legRoot.add(tibia);

      this.legs.push({ root: legRoot, side: pos.side, id: pos.id });
    }

    // ── Directional Telegraph Line ──────────────────────────────
    const telGeo = new THREE.PlaneGeometry(0.45, 3.6);
    telGeo.rotateX(-Math.PI / 2);
    this.telegraphMesh = new THREE.Mesh(
      telGeo,
      new THREE.MeshBasicMaterial({
        color: 0x00e5ff,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
      })
    );
    this.telegraphMesh.position.set(0, 0.02, 1.8);
    this.telegraphMesh.visible = false;
    this.group.add(this.telegraphMesh);
  }

  update(dt, player) {
    if (this.dead) return;
    this.updateFlash(dt);
    this.updateKnockback(dt);
    this._animTime += dt;

    if (this._staggerTimer > 0) {
      this._staggerTimer -= dt;
      this._isAttacking = false;
      this.thorax.rotation.x = -0.4;
      this.head.rotation.x = -0.3;
      return;
    }

    if (this._kbTime > 0.06) return;

    switch (this.state) {
      case 'chase': {
        this._isAttacking = false;
        this.setGlint(false);

        // Circling predation pattern
        this._angle += dt * 1.8;
        const targetX = player.x + Math.cos(this._angle) * 2.5;
        const targetZ = player.z + Math.sin(this._angle) * 2.5;
        const dx = targetX - this.x;
        const dz = targetZ - this.z;
        const len = Math.hypot(dx, dz) || 1;
        this.x += (dx / len) * this.speed * dt;
        this.z += (dz / len) * this.speed * dt;
        // Clamped turn rate (fast enemy turns quickly but not instantly)
        const targetFacing = Math.atan2(dx, dz);
        const MAX_TURN = 5.0 * dt; // ~285°/s — fast but not snap
        let faceDiff = targetFacing - this.group.rotation.y;
        while (faceDiff >  Math.PI) faceDiff -= Math.PI * 2;
        while (faceDiff < -Math.PI) faceDiff += Math.PI * 2;
        this.group.rotation.y += Math.sign(faceDiff) * Math.min(Math.abs(faceDiff), MAX_TURN);
        this.clampToBounds();

        // Diagonal Insectoid Gait Cycle
        this._walkPhase += dt * 16.0;
        const wp = this._walkPhase;
        this.legs[0].root.rotation.x = Math.sin(wp) * 0.45; // FL
        this.legs[3].root.rotation.x = Math.sin(wp) * 0.45; // BR
        this.legs[1].root.rotation.x = -Math.sin(wp) * 0.45; // FR
        this.legs[2].root.rotation.x = -Math.sin(wp) * 0.45; // BL
        this.modelGroup.position.y = Math.abs(Math.sin(wp * 2)) * 0.04;

        // Twitching mandibles and abdomen
        this.leftMandible.rotation.z = -0.5 + Math.sin(this._animTime * 12) * 0.15;
        this.rightMandible.rotation.z = 0.5 - Math.sin(this._animTime * 12) * 0.15;
        this.abdomen.rotation.y = Math.sin(this._animTime * 6) * 0.1;

        this._dashTimer += dt;
        if (this._dashTimer >= this._dashCd) {
          this._dashTimer = 0;
          const toPx = player.x - this.x;
          const toPz = player.z - this.z;
          const dLen = Math.hypot(toPx, toPz) || 1;
          this._dashDx = toPx / dLen;
          this._dashDz = toPz / dLen;

          this.currentAttack = Math.random() < 0.55 ? 'pounce_lunge' : 'twin_slash';
          this.attackReach   = this.currentAttack === 'twin_slash' ? 1.4 : 1.25;

          if (this.currentAttack === 'twin_slash') {
            this.state = 'slash1_windup';
            this.stateTimer = 0.38;
          } else {
            this.state = 'windup';
            this.stateTimer = 0.46;
            this.telegraphMesh.visible = true;
          }
        }
        break;
      }

      // ── Pounce Lunge (Single Dash Strike) ───────────────────
      case 'windup': {
        this.stateTimer -= dt;
        this.group.rotation.y = Math.atan2(this._dashDx, this._dashDz);

        // Crouch low to ground with coiled leg compression
        const prog = 1 - (this.stateTimer / 0.46);
        this.thorax.position.y = 0.18 - prog * 0.08;
        this.leftMandible.rotation.z = -0.85; // flared wide
        this.rightMandible.rotation.z = 0.85;

        const pulse = Math.sin(prog * Math.PI * 10);
        this.telegraphMesh.material.color.setHex(prog > 0.7 ? 0xffffff : 0x00e5ff);
        this.telegraphMesh.material.opacity = 0.4 + 0.5 * Math.abs(pulse);

        // "วิ้งๆ" Parry window: final 0.18s
        if (this.stateTimer <= 0.18) {
          this._glintMesh.position.set(0, 0.45, 0.42);
          this._glintStar.position.set(0, 0.45, 0.43);
          this.setGlint(true, 1 - (this.stateTimer / 0.18));
        } else {
          this.setGlint(false);
        }

        if (this.stateTimer <= 0) {
          this.state = 'attack';
          this.stateTimer = 0.28;
          this.telegraphMesh.visible = false;
          this.setGlint(false);
          this._isAttacking = true;
          this._hasHitPlayerThisAttack = false;
        }
        break;
      }

      case 'attack': {
        this._isAttacking = true;
        this.isParryable = false;
        this.setGlint(false);

        const dashSpd = 3.9;
        this.x += this._dashDx * dashSpd * dt;
        this.z += this._dashDz * dashSpd * dt;
        this.clampToBounds();

        // Leaping snap posture
        this.thorax.position.y = 0.42;
        this.leftMandible.rotation.z = 0.1; // snapped closed
        this.rightMandible.rotation.z = -0.1;

        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = 'recover';
          this.stateTimer = 0.65;
          this._isAttacking = false;
          this.thorax.position.y = 0.32;
        }
        break;
      }

      // ── Twin Slash Combo (2-Hit Sequential Rhythm) ───────────
      case 'slash1_windup': {
        this.stateTimer -= dt;
        this.group.rotation.y = Math.atan2(this._dashDx, this._dashDz);
        this.leftMandible.rotation.z = -0.9; // prepare left slash

        if (this.stateTimer <= 0.16) {
          this._glintMesh.position.set(0, 0.45, 0.42);
          this._glintStar.position.set(0, 0.45, 0.43);
          this.setGlint(true, 1 - (this.stateTimer / 0.16));
        } else {
          this.setGlint(false);
        }

        if (this.stateTimer <= 0) {
          this.state = 'slash1_attack';
          this.stateTimer = 0.16;
          this.setGlint(false);
          this._isAttacking = true;
          this._hasHitPlayerThisAttack = false;
        }
        break;
      }

      case 'slash1_attack': {
        this._isAttacking = true;
        this.leftMandible.rotation.z = 0.3; // inward slash
        this.stateTimer -= dt;
        const stepSpd = 2.1;
        this.x += this._dashDx * stepSpd * dt;
        this.z += this._dashDz * stepSpd * dt;
        this.clampToBounds();

        if (this.stateTimer <= 0) {
          this.state = 'slash2_windup';
          this.stateTimer = 0.22;
          this._isAttacking = false;
        }
        break;
      }

      case 'slash2_windup': {
        this.stateTimer -= dt;
        this.group.rotation.y = Math.atan2(this._dashDx, this._dashDz);
        this.rightMandible.rotation.z = 0.9; // prepare right slash

        if (this.stateTimer <= 0.16) {
          this._glintMesh.position.set(0, 0.45, 0.42);
          this._glintStar.position.set(0, 0.45, 0.43);
          this.setGlint(true, 1 - (this.stateTimer / 0.16));
        } else {
          this.setGlint(false);
        }

        if (this.stateTimer <= 0) {
          this.state = 'slash2_attack';
          this.stateTimer = 0.18;
          this.setGlint(false);
          this._isAttacking = true;
          this._hasHitPlayerThisAttack = false;
        }
        break;
      }

      case 'slash2_attack': {
        this._isAttacking = true;
        this.rightMandible.rotation.z = -0.3; // inward cross slash
        this.stateTimer -= dt;
        const stepSpd = 2.4;
        this.x += this._dashDx * stepSpd * dt;
        this.z += this._dashDz * stepSpd * dt;
        this.clampToBounds();

        if (this.stateTimer <= 0) {
          this.state = 'recover';
          this.stateTimer = 0.72;
          this._isAttacking = false;
        }
        break;
      }

      case 'recover':
        this._isAttacking = false;
        this.setGlint(false);
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.state = 'chase';
        break;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  3. ELITE WARDEN: The Iron Golem (EliteWarden3D)
//  Towering ironclad colossus with furnace core & steam hammer
// ═══════════════════════════════════════════════════════════════
export class EliteWarden3D extends BaseEnemy3D {
  constructor(scene, x, z, floor = 1) {
    super(scene, x, z);
    const cfg = ENEMY.warden;
    this.maxHp = Math.round(cfg.hp * (1 + 0.15 * (floor - 1)));
    this.hp = this.maxHp;
    this.maxPosture = 110;
    this.speed = cfg.speed / 80; // ~0.45 units/s heavy march
    this.radius = 0.75;
    this.contactDmg = cfg.dmg;
    this.expDrop = 20;
    this.coinDrop = 4;
    this.deathColor = 0x00e676;

    this.slamTimer = 0;
    this.slamCd = 4.0;
    this.slamRadius = 2.5;
    this.isSlamActive = false;
    this.activeHazards = [];

    this._buildCreature();
  }

  _buildCreature() {
    const armorMat = new THREE.MeshStandardMaterial({
      color: 0x223328,
      roughness: 0.75,
      metalness: 0.65,
      flatShading: true,
    });
    this._registerMat(armorMat);
    this._mainMat = armorMat;
    this._origColor = 0x223328;

    // Glowing emerald furnace core
    this.coreMat = new THREE.MeshStandardMaterial({
      color: 0x00e676,
      emissive: 0x00c853,
      emissiveIntensity: 2.8,
      roughness: 0.25,
      flatShading: true,
    });
    this._registerMat(this.coreMat);

    // Dark iron weapon / plates
    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x111c16,
      roughness: 0.5,
      metalness: 0.85,
      flatShading: true,
    });
    this._registerMat(ironMat);

    // ── Torso (massive iron boiler chest) ────────────────────────
    this.torso = new THREE.Group();
    this.torso.position.y = 1.15;
    this.modelGroup.add(this.torso);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.7), armorMat);
    chest.castShadow = true;
    this.torso.add(chest);

    // Glowing central furnace grate
    const furnaceGrate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.16), this.coreMat);
    furnaceGrate.position.set(0, 0.05, 0.34);
    this.torso.add(furnaceGrate);

    // Twin steam exhaust stacks on back
    for (const sx of [-0.25, 0.25]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.45, 6), ironMat);
      pipe.position.set(sx, 0.45, -0.28);
      pipe.rotation.x = -0.2;
      this.torso.add(pipe);
    }

    // ── Helmet / Head ───────────────────────────────────────────
    this.head = new THREE.Group();
    this.head.position.set(0, 0.6, 0.08);
    this.torso.add(this.head);

    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.4, 0.45), armorMat);
    helm.castShadow = true;
    this.head.add(helm);

    // Glowing visor slit
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.1), this.coreMat);
    visor.position.set(0, 0.04, 0.22);
    this.head.add(visor);

    // Spiked iron crest
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.5), ironMat);
    crest.position.set(0, 0.24, 0.0);
    this.head.add(crest);

    // ── Heavy Armored Shoulders ─────────────────────────────────
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(-0.65, 0.35, 0.0);
    this.torso.add(this.leftArm);

    const lPauldron = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.36, 0.44), ironMat);
    lPauldron.position.y = 0.05;
    this.leftArm.add(lPauldron);

    // Left shield arm / hydraulic fist
    const lFist = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.65, 0.34), armorMat);
    lFist.position.set(0, -0.4, 0.1);
    this.leftArm.add(lFist);

    // ── Right Arm with Colossal Steam Hammer ────────────────────
    this.rightArm = new THREE.Group();
    this.rightArm.position.set(0.65, 0.35, 0.0);
    this.torso.add(this.rightArm);

    const rPauldron = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.36, 0.44), ironMat);
    rPauldron.position.y = 0.05;
    this.rightArm.add(rPauldron);

    const rArmLimb = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.55, 0.28), armorMat);
    rArmLimb.position.set(0, -0.35, 0.0);
    this.rightArm.add(rArmLimb);

    // Massive hammer handle + head
    this.hammer = new THREE.Group();
    this.hammer.position.set(0, -0.5, 0.15);
    this.rightArm.add(this.hammer);

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 6), ironMat);
    handle.rotation.x = Math.PI / 2;
    this.hammer.add(handle);

    const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.8), ironMat);
    hammerHead.position.set(0, 0, 0.65);
    hammerHead.castShadow = true;
    this.hammer.add(hammerHead);

    const hammerCore = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.82), this.coreMat);
    hammerCore.position.set(0, 0, 0.65);
    this.hammer.add(hammerCore);

    // ── Legs (hydraulic armored pillars) ────────────────────────
    this.leftLeg = new THREE.Group();
    this.leftLeg.position.set(-0.3, 0.65, 0.0);
    this.modelGroup.add(this.leftLeg);

    const lPillar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.75, 0.34), armorMat);
    lPillar.position.y = -0.32;
    lPillar.castShadow = true;
    this.leftLeg.add(lPillar);

    const lFoot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.15, 0.48), ironMat);
    lFoot.position.set(0, -0.65, 0.08);
    this.leftLeg.add(lFoot);

    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(0.3, 0.65, 0.0);
    this.modelGroup.add(this.rightLeg);

    const rPillar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.75, 0.34), armorMat);
    rPillar.position.y = -0.32;
    rPillar.castShadow = true;
    this.rightLeg.add(rPillar);

    const rFoot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.15, 0.48), ironMat);
    rFoot.position.set(0, -0.65, 0.08);
    this.rightLeg.add(rFoot);

    // ── Slam Ring Telegraph on floor ────────────────────────────
    const ringGeo = new THREE.RingGeometry(0.1, this.slamRadius, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.telegraphRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: 0x00e676,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      })
    );
    this.telegraphRing.position.set(0, 0.02, 0);
    this.telegraphRing.visible = false;
    this.group.add(this.telegraphRing);
  }

  update(dt, player) {
    if (this.dead) return;
    this.updateFlash(dt);
    this.updateKnockback(dt);
    this._animTime += dt;

    if (this._staggerTimer > 0) {
      this._staggerTimer -= dt;
      this._isAttacking = false;
      this.isSlamActive = false;
      this.torso.rotation.x = -0.35;
      this.rightArm.rotation.x = -0.6;
      this.leftArm.rotation.x = -0.6;
      return;
    }

    this.isSlamActive = false;
    this.activeHazards = [];
    if (this._kbTime > 0.05) return;

    switch (this.state) {
      case 'chase': {
        this._isAttacking = false;
        this.setGlint(false);
        this.setPerilous(false);
        this._moveToward(dt, player, this.speed);

        // Heavy Stomping March animation
        const wp = this._walkPhase;
        this.leftLeg.rotation.x = Math.sin(wp) * 0.45;
        this.rightLeg.rotation.x = -Math.sin(wp) * 0.45;
        this.modelGroup.position.y = Math.abs(Math.sin(wp * 2)) * 0.08;
        this.torso.rotation.z = Math.sin(wp * 0.5) * 0.06;

        // Arm motion while marching
        this.rightArm.rotation.x = -Math.sin(wp) * 0.25;
        this.leftArm.rotation.x = Math.sin(wp) * 0.25;

        // Pulsing furnace core
        const pulse = Math.sin(this._animTime * 3) * 0.5 + 0.5;
        this.coreMat.emissiveIntensity = 2.0 + pulse * 1.5;

        this.slamTimer += dt;
        if (this.slamTimer >= this.slamCd) {
          const dist = Math.hypot(player.x - this.x, player.z - this.z);
          if (dist < 4.8) {
            this.slamTimer = 0;
            const r = Math.random();
            if (r < 0.42) {
              this.currentAttack = 'seismic_slam';
              this.totalWindup   = 1.05;
              this.attackReach   = 2.6;
              this.telegraphRing.material.color.setHex(0xff0033);
            } else if (r < 0.75) {
              this.currentAttack = 'sweeping_cleave';
              this.totalWindup   = 0.75;
              this.attackReach   = 2.2;
              this.telegraphRing.material.color.setHex(0x00e676);
            } else {
              this.currentAttack = 'forward_thrust';
              this.totalWindup   = 0.52;
              this.attackReach   = 1.9;
              this.telegraphRing.material.color.setHex(0x00e5ff);
            }

            const dx = player.x - this.x;
            const dz = player.z - this.z;
            const len = Math.hypot(dx, dz) || 1;
            this._aimDx = dx / len;
            this._aimDz = dz / len;

            this.state = 'windup';
            this.stateTimer = this.totalWindup;
            this.telegraphRing.visible = true;
          }
        }
        break;
      }

      case 'windup': {
        this.stateTimer -= dt;
        if (this._aimDx !== undefined) {
          this.group.rotation.y = Math.atan2(this._aimDx, this._aimDz);
        }

        const totalWindup = this.totalWindup || 0.9;
        const progress = 1 - (this.stateTimer / totalWindup);
        this.telegraphRing.scale.set(progress, progress, 1);
        const pulse = Math.sin(progress * Math.PI * 10);
        this.telegraphRing.material.opacity = 0.4 + 0.5 * Math.abs(pulse);

        if (this.currentAttack === 'seismic_slam') {
          // ⚠️ UNPARRYABLE: Both arms hoist the massive iron hammer high overhead!
          this._perilousGroup.position.set(0, 2.3, 0.4);
          this.setPerilous(true, progress);
          this.setGlint(false);

          this.torso.rotation.x = -0.35 + Math.sin(progress * Math.PI * 14) * 0.05;
          this.rightArm.rotation.x = -2.5 + Math.sin(progress * Math.PI * 16) * 0.08;
          this.leftArm.rotation.x = -2.2;
          this.coreMat.emissive.setHex(0xff1744);
        } else if (this.currentAttack === 'sweeping_cleave') {
          // Pulls hammer far back laterally for horizontal sweep
          this.setPerilous(false);
          this.torso.rotation.y = -0.55;
          this.rightArm.rotation.x = -0.6;
          this.rightArm.rotation.y = 0.9;

          if (this.stateTimer <= 0.20) {
            this._glintMesh.position.set(0, 1.5, 0.5);
            this._glintStar.position.set(0, 1.5, 0.51);
            this.setGlint(true, 1 - (this.stateTimer / 0.20));
          } else {
            this.setGlint(false);
          }
        } else {
          // Forward thrust windup
          this.setPerilous(false);
          this.leftArm.rotation.x = -0.8;
          this.torso.rotation.x = -0.15;

          if (this.stateTimer <= 0.18) {
            this._glintMesh.position.set(0, 1.5, 0.5);
            this._glintStar.position.set(0, 1.5, 0.51);
            this.setGlint(true, 1 - (this.stateTimer / 0.18));
          } else {
            this.setGlint(false);
          }
        }

        if (this.stateTimer <= 0) {
          this.state = 'attack';
          this.stateTimer = this.currentAttack === 'seismic_slam' ? 0.32 : 0.22;
          this.isSlamActive = true;
          this._isAttacking = true;
          this.telegraphRing.visible = false;
          this.setGlint(false);
          this.setPerilous(false);
          this._hasHitPlayerThisAttack = false;

          if (this.currentAttack === 'seismic_slam') {
            this.activeHazards.push({
              x: this.x,
              z: this.z,
              r: this.slamRadius,
              dmg: Math.round(this.contactDmg * 1.6),
            });
          }
        }
        break;
      }

      case 'attack': {
        this._isAttacking = true;
        this.isParryable = false;
        this.setGlint(false);
        this.setPerilous(false);

        // Forward momentum during swing
        if (this._aimDx !== undefined) {
          const lungeSpd = this.currentAttack === 'forward_thrust' ? 2.4 : 1.2;
          this.x += this._aimDx * lungeSpd * dt;
          this.z += this._aimDz * lungeSpd * dt;
          this.clampToBounds();
        }

        if (this.currentAttack === 'seismic_slam') {
          // Hammer crashes down into the ground!
          this.torso.rotation.x = 0.55;
          this.rightArm.rotation.x = 1.2;
          this.leftArm.rotation.x = 1.0;
        } else if (this.currentAttack === 'sweeping_cleave') {
          this.torso.rotation.y = 0.7;
          this.rightArm.rotation.y = -1.1;
        } else {
          this.leftArm.rotation.x = 0.9;
        }

        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = 'recover';
          // Committed recovery window:
          // Seismic slam leaves arms planted for 1.45s — massive Backstab punish window!
          this.stateTimer = this.currentAttack === 'seismic_slam' ? 1.45 : 0.75;
          this._isAttacking = false;
          this.isSlamActive = false;
          this.coreMat.emissive.setHex(0x00c853);
        }
        break;
      }

      case 'recover':
        this._isAttacking = false;
        this.setGlint(false);
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.torso.rotation.set(0, 0, 0);
          this.state = 'chase';
        }
        break;
    }
  }

  getHazardZones() {
    return this.activeHazards;
  }
}

// ═══════════════════════════════════════════════════════════════
//  4. ELITE HUNTER: The Razor Mantis (EliteHunter3D)
//  Sleek digitigrade assassin with dual radiant scythes
// ═══════════════════════════════════════════════════════════════
export class EliteHunter3D extends BaseEnemy3D {
  constructor(scene, x, z, floor = 1) {
    super(scene, x, z);
    const cfg = ENEMY.hunter;
    this.maxHp = Math.round(cfg.hp * (1 + 0.15 * (floor - 1)));
    this.hp = this.maxHp;
    this.maxPosture = 90;
    this.speed = cfg.speed / 80; // ~0.6 units/s
    this.radius = 0.55;
    this.contactDmg = cfg.dmg;
    this.expDrop = 20;
    this.coinDrop = 4;
    this.deathColor = 0xd500f9;

    this.dashTimer = 0;
    this.dashCd = 3.4;
    this._dashDx = 0;
    this._dashDz = 0;

    this._buildCreature();
  }

  _buildCreature() {
    const chitinMat = new THREE.MeshStandardMaterial({
      color: 0x240e3b,
      roughness: 0.4,
      metalness: 0.7,
      flatShading: true,
    });
    this._registerMat(chitinMat);
    this._mainMat = chitinMat;
    this._origColor = 0x240e3b;

    // Glowing purple scythe energy
    const scytheMat = new THREE.MeshStandardMaterial({
      color: 0xe040fb,
      emissive: 0xaa00ff,
      emissiveIntensity: 2.8,
      roughness: 0.25,
      flatShading: true,
    });
    this._registerMat(scytheMat);

    // ── Torso (sleek aerodynamic assassin chassis) ──────────────
    this.torso = new THREE.Group();
    this.torso.position.y = 0.95;
    this.modelGroup.add(this.torso);

    const chest = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.8, 5), chitinMat);
    chest.rotation.x = Math.PI; // upside down cone for sleek V-taper
    chest.castShadow = true;
    this.torso.add(chest);

    // ── Head / Cowl ─────────────────────────────────────────────
    this.head = new THREE.Group();
    this.head.position.set(0, 0.48, 0.05);
    this.torso.add(this.head);

    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.34), chitinMat);
    skull.castShadow = true;
    this.head.add(skull);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.1), scytheMat);
    visor.position.set(0, 0.02, 0.18);
    this.head.add(visor);

    // Horned crest
    const crestL = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32, 4), scytheMat);
    crestL.position.set(-0.14, 0.22, -0.06);
    crestL.rotation.z = -0.4;
    this.head.add(crestL);

    const crestR = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32, 4), scytheMat);
    crestR.position.set(0.14, 0.22, -0.06);
    crestR.rotation.z = 0.4;
    this.head.add(crestR);

    // ── Dual Articulated Scythe Arms ─────────────────────────────
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(-0.45, 0.25, 0.0);
    this.torso.add(this.leftArm);

    const lUpper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.14), chitinMat);
    lUpper.position.y = -0.2;
    this.leftArm.add(lUpper);

    this.leftScythe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.28), scytheMat);
    this.leftScythe.position.set(0, -0.55, 0.18);
    this.leftScythe.rotation.x = 0.3;
    this.leftArm.add(this.leftScythe);

    this.rightArm = new THREE.Group();
    this.rightArm.position.set(0.45, 0.25, 0.0);
    this.torso.add(this.rightArm);

    const rUpper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.14), chitinMat);
    rUpper.position.y = -0.2;
    this.rightArm.add(rUpper);

    this.rightScythe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.28), scytheMat);
    this.rightScythe.position.set(0, -0.55, 0.18);
    this.rightScythe.rotation.x = 0.3;
    this.rightArm.add(this.rightScythe);

    // ── Digitigrade Legs ─────────────────────────────────────────
    this.leftLeg = new THREE.Group();
    this.leftLeg.position.set(-0.2, 0.55, 0.0);
    this.modelGroup.add(this.leftLeg);

    const lFemur = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.35, 0.16), chitinMat);
    lFemur.position.set(0, -0.15, 0.05);
    lFemur.rotation.x = -0.3;
    this.leftLeg.add(lFemur);

    const lTibia = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.14), chitinMat);
    lTibia.position.set(0, -0.4, -0.05);
    lTibia.rotation.x = 0.45;
    this.leftLeg.add(lTibia);

    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(0.2, 0.55, 0.0);
    this.modelGroup.add(this.rightLeg);

    const rFemur = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.35, 0.16), chitinMat);
    rFemur.position.set(0, -0.15, 0.05);
    rFemur.rotation.x = -0.3;
    this.rightLeg.add(rFemur);

    const rTibia = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.14), chitinMat);
    rTibia.position.set(0, -0.4, -0.05);
    rTibia.rotation.x = 0.45;
    this.rightLeg.add(rTibia);

    // Charge Line Telegraph
    const lineGeo = new THREE.PlaneGeometry(0.5, 4.8);
    lineGeo.rotateX(-Math.PI / 2);
    this.telegraphLine = new THREE.Mesh(
      lineGeo,
      new THREE.MeshBasicMaterial({
        color: 0xd500f9,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
      })
    );
    this.telegraphLine.position.set(0, 0.02, 2.4);
    this.telegraphLine.visible = false;
    this.group.add(this.telegraphLine);
  }

  update(dt, player) {
    if (this.dead) return;
    this.updateFlash(dt);
    this.updateKnockback(dt);
    this._animTime += dt;

    if (this._staggerTimer > 0) {
      this._staggerTimer -= dt;
      this._isAttacking = false;
      this.torso.rotation.x = -0.4;
      this.leftArm.rotation.x = -1.0;
      this.rightArm.rotation.x = -1.0;
      return;
    }

    if (this._kbTime > 0.05) return;

    switch (this.state) {
      case 'chase': {
        this._isAttacking = false;
        this.setGlint(false);
        this.setPerilous(false);
        this._moveToward(dt, player, this.speed);

        // Gliding sprint locomotion
        const wp = this._walkPhase;
        this.leftLeg.rotation.x = Math.sin(wp) * 0.5;
        this.rightLeg.rotation.x = -Math.sin(wp) * 0.5;
        this.modelGroup.position.y = Math.abs(Math.sin(wp * 2)) * 0.04;

        // Scythes poised in cross formation
        this.leftArm.rotation.x = -0.4 + Math.sin(this._animTime * 4) * 0.08;
        this.rightArm.rotation.x = -0.4 - Math.sin(this._animTime * 4) * 0.08;

        this.dashTimer += dt;
        if (this.dashTimer >= this.dashCd) {
          const dist = Math.hypot(player.x - this.x, player.z - this.z);
          if (dist < 5.2) {
            this.dashTimer = 0;
            const r = Math.random();
            if (r < 0.40) {
              this.currentAttack = 'needle_thrust';
              this.totalWindup   = 0.55;
              this.attackReach   = 2.2;
              this.telegraphLine.visible = true;
            } else if (r < 0.72) {
              this.currentAttack = 'shadow_warp';
              this.totalWindup   = 0.50;
              this.attackReach   = 1.8;
              this.telegraphLine.visible = false;
              // Teleport to flank of player
              const angle = Math.random() * Math.PI * 2;
              this.x = player.x + Math.cos(angle) * 2.2;
              this.z = player.z + Math.sin(angle) * 2.2;
              this.clampToBounds();
            } else {
              this.currentAttack = 'cyclone_spin';
              this.totalWindup   = 0.68;
              this.attackReach   = 2.4;
              this.telegraphLine.visible = false;
            }

            const dx = player.x - this.x;
            const dz = player.z - this.z;
            const len = Math.hypot(dx, dz) || 1;
            this._dashDx = dx / len;
            this._dashDz = dz / len;

            this.state = 'windup';
            this.stateTimer = this.totalWindup;
          }
        }
        break;
      }

      case 'windup': {
        this.stateTimer -= dt;
        this.group.rotation.y = Math.atan2(this._dashDx, this._dashDz);

        const totalWindup = this.totalWindup || 0.65;
        const prog = 1 - this.stateTimer / totalWindup;

        if (this.currentAttack === 'cyclone_spin') {
          // ⚠️ UNPARRYABLE: Flings both scythes perpendicular into spinning stance!
          this._perilousGroup.position.set(0, 1.8, 0.3);
          this.setPerilous(true, prog);
          this.setGlint(false);
          this.group.rotation.y += dt * 10;
          this.leftArm.rotation.z = -1.4;
          this.rightArm.rotation.z = 1.4;
        } else {
          this.setPerilous(false);
          if (this.telegraphLine.visible) {
            const pulse = Math.sin(prog * Math.PI * 10);
            this.telegraphLine.material.color.setHex(prog > 0.7 ? 0xffffff : 0xd500f9);
            this.telegraphLine.material.opacity = 0.4 + 0.5 * Math.abs(pulse);
          }

          // "วิ้งๆ" Parry window: final 0.20s
          if (this.stateTimer <= 0.20) {
            this._glintMesh.position.set(0, 1.2, 0.4);
            this._glintStar.position.set(0, 1.2, 0.41);
            this.setGlint(true, 1 - (this.stateTimer / 0.20));
          } else {
            this.setGlint(false);
          }
        }

        if (this.stateTimer <= 0) {
          this.state = 'attack';
          this.stateTimer = this.currentAttack === 'cyclone_spin' ? 0.35 : 0.35;
          this._isAttacking = true;
          this.telegraphLine.visible = false;
          this.setGlint(false);
          this.setPerilous(false);
          this._hasHitPlayerThisAttack = false;
        }
        break;
      }

      case 'attack': {
        this._isAttacking = true;
        this.isParryable = false;
        this.setGlint(false);
        this.setPerilous(false);

        if (this.currentAttack === 'cyclone_spin') {
          this.group.rotation.y += dt * 26; // 360 rapid cyclone spin
        } else {
          const chargeSpd = 4.6;
          this.x += this._dashDx * chargeSpd * dt;
          this.z += this._dashDz * chargeSpd * dt;
          this.clampToBounds();
        }

        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = 'recover';
          // Cyclone spin recovery is 1.25s — prime Backstab punish window!
          this.stateTimer = this.currentAttack === 'cyclone_spin' ? 1.25 : 0.65;
          this._isAttacking = false;
          this.leftArm.rotation.set(0, 0, 0);
          this.rightArm.rotation.set(0, 0, 0);
        }
        break;
      }

      case 'recover':
        this._isAttacking = false;
        this.setGlint(false);
        this.setPerilous(false);
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.state = 'chase';
        break;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  5. BOSS: The Biomechanical Core Behemoth (Boss3D)
//  Colossal 3-phase titan with floating mechanical appendages
// ═══════════════════════════════════════════════════════════════
export class Boss3D extends BaseEnemy3D {
  constructor(scene, x, z, routeLen = 10, floor = 1) {
    super(scene, x, z);
    this.baseHp = BOSS_BASE_HP + BOSS_HP_PER_ROUTE * routeLen;
    this.maxHp = Math.round(this.baseHp * (1 + BOSS_FLOOR_SCALE * (floor - 1)));
    this.hp = this.maxHp;
    this.maxPosture = 160;
    this.speed = 0.75;
    this.radius = 1.1;
    this.contactDmg = 14;
    this.expDrop = 50;
    this.coinDrop = 8;
    this.deathColor = 0xff0055;

    this.phase = 1;
    this.attackTimer = 0;
    this.activeHazards = [];

    this._buildCreature();
  }

  _buildCreature() {
    // Dark alloy chassis
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x180b24,
      roughness: 0.55,
      metalness: 0.85,
      flatShading: true,
    });
    this._registerMat(chassisMat);
    this._mainMat = chassisMat;
    this._origColor = 0x180b24;

    // Glowing core crystal
    this.coreMat = new THREE.MeshStandardMaterial({
      color: 0xff0055,
      emissive: 0xd50000,
      emissiveIntensity: 3.2,
      roughness: 0.2,
      flatShading: true,
    });
    this._registerMat(this.coreMat);

    // Glowing energy scythe/fist edge
    this.energyMat = new THREE.MeshStandardMaterial({
      color: 0xff4081,
      emissive: 0xf50057,
      emissiveIntensity: 2.5,
      roughness: 0.3,
      flatShading: true,
    });
    this._registerMat(this.energyMat);

    // ── Floating Central Core ────────────────────────────────────
    this.coreGroup = new THREE.Group();
    this.coreGroup.position.y = 1.6;
    this.modelGroup.add(this.coreGroup);

    // Inner pulsating heart
    this.coreMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85, 0), this.coreMat);
    this.coreMesh.castShadow = true;
    this.coreGroup.add(this.coreMesh);

    // Concentric Gyroscope Rings
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x2e1840,
      roughness: 0.4,
      metalness: 0.9,
      flatShading: true,
    });
    this._registerMat(ringMat);

    this.innerRing = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.08, 6, 24), ringMat);
    this.coreGroup.add(this.innerRing);

    this.outerRing = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.09, 6, 24), ringMat);
    this.coreGroup.add(this.outerRing);

    // ── Monolithic Armored Crown / Visor ─────────────────────────
    this.crown = new THREE.Group();
    this.crown.position.set(0, 0.85, 0.2);
    this.coreGroup.add(this.crown);

    const crest = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.6), chassisMat);
    this.crown.add(crest);

    this.eyeVisor = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.2), this.coreMat);
    this.eyeVisor.position.set(0, 0, 0.28);
    this.crown.add(this.eyeVisor);

    // ── Left Titan Appendage: Colossal Plasma Scythe ─────────────
    this.leftTitanArm = new THREE.Group();
    this.leftTitanArm.position.set(-1.6, 0.2, 0.0);
    this.coreGroup.add(this.leftTitanArm);

    const lPiston = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.9, 6), chassisMat);
    this.leftTitanArm.add(lPiston);

    this.leftTitanBlade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 0.6), this.energyMat);
    this.leftTitanBlade.position.set(0, -0.8, 0.3);
    this.leftTitanBlade.rotation.x = 0.4;
    this.leftTitanArm.add(this.leftTitanBlade);

    // ── Right Titan Appendage: Colossal Hydraulic Crusher Fist ───
    this.rightTitanArm = new THREE.Group();
    this.rightTitanArm.position.set(1.6, 0.2, 0.0);
    this.coreGroup.add(this.rightTitanArm);

    const rPiston = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.9, 6), chassisMat);
    this.rightTitanArm.add(rPiston);

    this.rightTitanFist = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.8), chassisMat);
    this.rightTitanFist.position.set(0, -0.65, 0.2);
    this.rightTitanArm.add(this.rightTitanFist);

    const fistSpikes = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.3), this.energyMat);
    fistSpikes.position.set(0, 0, 0.45);
    this.rightTitanFist.add(fistSpikes);

    // ── 4 Orbiting Perimeter Shards ──────────────────────────────
    this.shardsGroup = new THREE.Group();
    this.coreGroup.add(this.shardsGroup);
    this.shards = [];
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const shard = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.6, 4), chassisMat);
      shard.position.set(Math.cos(angle) * 2.2, 0, Math.sin(angle) * 2.2);
      this.shardsGroup.add(shard);
      this.shards.push(shard);
    }

    // ── Slam Ring Telegraph on floor ────────────────────────────
    const ringGeo = new THREE.RingGeometry(0.1, 2.8, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.slamTelegraph = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: 0xff0055,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      })
    );
    this.slamTelegraph.position.set(0, 0.02, 0);
    this.slamTelegraph.visible = false;
    this.group.add(this.slamTelegraph);
  }

  update(dt, player, spawnCallback) {
    if (this.dead) return;
    this.updateFlash(dt);
    this.updateKnockback(dt);
    this._animTime += dt;

    if (this._staggerTimer > 0) {
      this._staggerTimer -= dt;
      this._isAttacking = false;
      return;
    }

    // Floating levitation and concentric ring gyroscopic rotation
    const t = this._animTime;
    const hoverY = 1.6 + Math.sin(t * 2.5) * 0.18;
    this.coreGroup.position.y = hoverY;
    this.innerRing.rotation.x = t * 1.5;
    this.innerRing.rotation.y = t * 0.8;
    this.outerRing.rotation.z = -t * 1.2;
    this.outerRing.rotation.y = t * 0.5;
    this.shardsGroup.rotation.y = t * 1.8;

    // Titan appendages idle breathing float
    this.leftTitanArm.position.y = Math.sin(t * 3.0) * 0.15;
    this.rightTitanArm.position.y = Math.cos(t * 3.0) * 0.15;

    // Phase evaluation
    const hpFrac = this.hp / this.maxHp;
    if (hpFrac <= 0.33) {
      if (this.phase < 3) {
        this.phase = 3;
        // Phase 3: Blazing molten amber energy
        this.coreMat.color.setHex(0xffea00);
        this.coreMat.emissive.setHex(0xff6d00);
        this.energyMat.color.setHex(0xffea00);
        this.energyMat.emissive.setHex(0xff9100);
        sound.playBossAlert?.();
      }
    } else if (hpFrac <= 0.66) {
      if (this.phase < 2) {
        this.phase = 2;
        // Phase 2: Radiant violet energy
        this.coreMat.color.setHex(0xd500f9);
        this.coreMat.emissive.setHex(0xaa00ff);
        this.energyMat.color.setHex(0xe040fb);
        this.energyMat.emissive.setHex(0xd500f9);
        sound.playBossAlert?.();
      }
    }

    this.activeHazards = [];

    switch (this.state) {
      case 'chase': {
        this._isAttacking = false;
        this.setGlint(false);
        this.setPerilous(false);

        const curSpd = this.phase === 3 ? 0.95 : (this.phase === 2 ? 0.85 : this.speed);
        this._moveToward(dt, player, curSpd);

        this.attackTimer += dt;
        const cd = this.phase === 3 ? 2.4 : (this.phase === 2 ? 3.0 : 3.6);
        if (this.attackTimer >= cd) {
          this.attackTimer = 0;

          // Select move based on current phase:
          const r = Math.random();
          if (this.phase === 1) {
            // Phase 1: 50% Cleave Arc (Parryable), 50% Rupture Slam (UNPARRYABLE)
            this.currentAttack = r < 0.5 ? 'cleave_arc' : 'rupture_slam';
          } else if (this.phase === 2) {
            // Phase 2: 35% Cleave Arc, 35% Twin Scythe (Parryable Combo), 30% Rupture Slam (UNPARRYABLE)
            if (r < 0.35) this.currentAttack = 'cleave_arc';
            else if (r < 0.70) this.currentAttack = 'twin_scythe';
            else this.currentAttack = 'rupture_slam';
          } else {
            // Phase 3: 40% Cataclysm Smash (UNPARRYABLE Overload), 30% Twin Scythe, 30% Rupture Slam
            if (r < 0.40) this.currentAttack = 'cataclysm_smash';
            else if (r < 0.70) this.currentAttack = 'twin_scythe';
            else this.currentAttack = 'rupture_slam';
          }

          const dx = player.x - this.x;
          const dz = player.z - this.z;
          const len = Math.hypot(dx, dz) || 1;
          this._aimDx = dx / len;
          this._aimDz = dz / len;

          if (this.currentAttack === 'cataclysm_smash') {
            this.totalWindup = 1.25;
            this.attackReach = 3.5;
            this.slamTelegraph.material.color.setHex(0xff0033);
            this.slamTelegraph.visible = true;
          } else if (this.currentAttack === 'rupture_slam') {
            this.totalWindup = 0.95;
            this.attackReach = 2.8;
            this.slamTelegraph.material.color.setHex(0xff0055);
            this.slamTelegraph.visible = true;
          } else if (this.currentAttack === 'twin_scythe') {
            this.totalWindup = 0.45;
            this.attackReach = 2.4;
            this.slamTelegraph.visible = false;
          } else {
            // cleave_arc
            this.totalWindup = 0.75;
            this.attackReach = 2.5;
            this.slamTelegraph.visible = false;
          }

          this.state = 'windup';
          this.stateTimer = this.totalWindup;
        }
        break;
      }

      case 'windup': {
        this.stateTimer -= dt;
        if (this._aimDx !== undefined) {
          this.group.rotation.y = Math.atan2(this._aimDx, this._aimDz);
        }

        const totalWindup = this.totalWindup || 0.9;
        const prog = 1 - (this.stateTimer / totalWindup);

        if (this.slamTelegraph.visible) {
          this.slamTelegraph.scale.set(prog, prog, 1);
          const pulse = Math.sin(prog * Math.PI * 10);
          this.slamTelegraph.material.opacity = 0.4 + 0.5 * Math.abs(pulse);
        }

        const isUnparryable = this.currentAttack === 'cataclysm_smash' || this.currentAttack === 'rupture_slam';

        if (isUnparryable) {
          // ⚠️ UNPARRYABLE: Both titan appendages raise high into the air charging energy!
          this._perilousGroup.position.set(0, 2.7, 0.4);
          this.setPerilous(true, prog);
          this.setGlint(false);

          this.leftTitanArm.position.y = 0.8 + prog * 0.8;
          this.rightTitanArm.position.y = 0.8 + prog * 0.8;
          this.leftTitanArm.rotation.x = -1.2;
          this.rightTitanArm.rotation.x = -1.2;
        } else {
          // Parryable Attacks: Golden glint star in final 0.20s!
          this.setPerilous(false);
          if (this.stateTimer <= 0.20) {
            this._glintMesh.position.set(0, 2.0, 0.8);
            this._glintStar.position.set(0, 2.0, 0.81);
            this.setGlint(true, 1 - (this.stateTimer / 0.20));
          } else {
            this.setGlint(false);
          }

          // Windup arm postures
          if (this.currentAttack === 'cleave_arc') {
            this.leftTitanArm.rotation.y = -1.2;
            this.leftTitanArm.rotation.x = -0.5;
          } else {
            this.leftTitanArm.position.z = -0.5;
            this.rightTitanArm.position.z = 0.5;
          }
        }

        if (this.stateTimer <= 0) {
          this.state = 'attack';
          this.stateTimer = 0.35;
          this._isAttacking = true;
          this.slamTelegraph.visible = false;
          this.setGlint(false);
          this.setPerilous(false);
          this._hasHitPlayerThisAttack = false;

          if (isUnparryable) {
            const rad = this.currentAttack === 'cataclysm_smash' ? 3.5 : 2.8;
            const dmg = this.currentAttack === 'cataclysm_smash' ? 28 : 18;
            this.activeHazards.push({ x: this.x, z: this.z, r: rad, dmg });
          }

          // Minion summon during Phase 2/3
          if (this.phase >= 2 && Math.random() < 0.30 && spawnCallback) {
            spawnCallback('fast', 1);
          }
        }
        break;
      }

      case 'attack': {
        this._isAttacking = true;
        this.isParryable = false;
        this.setGlint(false);
        this.setPerilous(false);

        // Appendages slam into ground
        this.leftTitanArm.position.y = -0.6;
        this.rightTitanArm.position.y = -0.6;
        this.leftTitanArm.rotation.x = 0.8;
        this.rightTitanArm.rotation.x = 0.8;

        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          if (this.currentAttack === 'cataclysm_smash') {
            // ⭐ High-Risk/High-Reward: Boss enters VENTED OVERHEAT state for 2.4s!
            this.state = 'vented';
            this.stateTimer = 2.4;
            this._isAttacking = false;
            this.coreGroup.position.y = 0.6; // collapses to ground
          } else {
            this.state = 'recover';
            this.stateTimer = this.currentAttack === 'rupture_slam' ? 1.2 : 0.8;
            this._isAttacking = false;
          }
        }
        break;
      }

      case 'vented':
        // Boss is overheated, cooled down, and immobilized:
        // Free Backstab punish window for the player who dodged the Cataclysm!
        this._isAttacking = false;
        this.setGlint(false);
        this.setPerilous(false);
        this.stateTimer -= dt;
        // Mild vibrating shake while cooling
        this.coreGroup.position.x = (Math.random() - 0.5) * 0.05;
        this.coreGroup.position.z = (Math.random() - 0.5) * 0.05;
        if (this.stateTimer <= 0) {
          this.coreGroup.position.set(0, 1.6, 0);
          this.state = 'chase';
        }
        break;

      case 'recover':
        this._isAttacking = false;
        this.setGlint(false);
        this.setPerilous(false);
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.state = 'chase';
        break;
    }
  }

  getHazardZones() {
    return this.activeHazards;
  }
}
