/**
 * Player3D.js — Parry Roguelike: Dagger Survivor with Dynamic Back Sword.
 *
 * Visual & Combat Mechanics:
 *   - Character visibly carries a broad SWORD sheathed on their BACK.
 *   - Character holds a DAGGER in the right hand ready for jabs/backstabs.
 *   - LEFT CLICK (or F key) controls the Sword Defense:
 *       • Quick Tap (<0.20s): Draws sword from behind back in a crisp PARRY deflect animation.
 *         Timed with enemy rhythm tells to deflect attacks, grant Dash Stacks, Parry Chain, and Speed buff.
 *       • Hold (>0.20s): Enters continuous BLOCK guard stance holding sword in front.
 *         STRICTLY NOT A PARRY — absorbs 80% incoming damage, never grants Dash Stacks or Parry bonuses!
 *       • Release: Smoothly sheathes sword back onto the character's back.
 *   - RIGHT CLICK (or E/J keys): Quick Dagger Jab / Backstab strike.
 *   - SPACE: Dash burst consuming 1 Dash Stack.
 */
import * as THREE from 'three';
import { gameStore } from '../state/gameStore.js';
import {
  PARRY_WINDOW,
  PARRY_TAP_THRESHOLD,
  PARRY_COOLDOWN,
  BLOCK_DMG_REDUCTION,
  DASH_DISTANCE,
  DASH_DURATION,
  PLAYER_SPEED,
} from '../core/constants.js';
import { sound } from '../core/Audio.js';

const IFRAMES_DURATION = 0.6;
const SPEED_UNITS = 80; // 180 world-units/s ÷ 80 = 2.25 Three.js units/s

export class Player3D {
  constructor(scene, startX = 6, startZ = 6.8) {
    this.scene  = scene;
    this.x      = startX;
    this.z      = startZ;
    this.radius = 0.35;

    this._iframes   = 0;
    this._hitFlash  = 0;
    this._walkTime  = 0;
    this._facing    = Math.PI; // face toward room initially

    // Parry & Block states
    this.isParrying      = false;
    this.isBlocking      = false;
    this._parryTimer     = 0;
    this._parryHoldTimer = 0;
    this._blockRecoil    = 0;

    // Dagger attack animation
    this._jabTimer = 0;

    // Dash state
    this.isDashing  = false;
    this._dashTimer = 0;
    this._dashDx    = 0;
    this._dashDz    = 0;
    this._parryCooldown = 0;

    // Posture (Sekiro Fatigue / Stance Meter)
    this.posture = 0;
    this.maxPosture = 100;
    this.isPostureStaggered = false;
    this._staggerTimer = 0;

    this.group = new THREE.Group();
    this._buildMesh();
    this.group.position.set(this.x, 0, this.z);
    scene.add(this.group);
  }

  _buildMesh() {
    this.model = new THREE.Group();

    // ── 1. Armored Torso ─────────────────────────────────────
    const torsoMat = new THREE.MeshStandardMaterial({
      color: 0x3a3530,
      roughness: 0.85,
      metalness: 0.2,
      flatShading: true,
    });
    this.torsoMat = torsoMat;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.36), torsoMat);
    torso.position.y = 0.68;
    torso.castShadow = true;
    this.model.add(torso);

    // Back sheath bracket on torso
    const sheathMat = new THREE.MeshStandardMaterial({
      color: 0x221e1a, roughness: 0.9, flatShading: true,
    });
    const sheathBracket = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.40, 0.08), sheathMat);
    sheathBracket.position.set(0.06, 0.72, -0.22);
    sheathBracket.rotation.z = 0.22;
    this.model.add(sheathBracket);

    // ── 2. DYNAMIC SWORD (draws from back to front) ───────────
    this.swordGroup = new THREE.Group();

    const swordMat = new THREE.MeshStandardMaterial({
      color: 0xa8b0c0,
      emissive: 0x203045,
      emissiveIntensity: 0.5,
      roughness: 0.35,
      metalness: 0.92,
      flatShading: true,
    });
    // Blade
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.74, 0.04), swordMat);
    blade.position.y = 0.37;
    blade.castShadow = true;
    this.swordGroup.add(blade);

    // Glowing edge line along blade
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0x88ddff, wireframe: false });
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.72, 0.05), edgeMat);
    edge.position.set(0.04, 0.37, 0);
    this.swordGroup.add(edge);

    // Crossguard
    const crossguardMat = new THREE.MeshStandardMaterial({
      color: 0xd4a048, metalness: 0.8, roughness: 0.28, flatShading: true,
    });
    const crossguard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.09), crossguardMat);
    crossguard.position.y = 0.0;
    this.swordGroup.add(crossguard);

    // Grip
    const gripMat = new THREE.MeshStandardMaterial({
      color: 0x4a2a10, roughness: 0.9, flatShading: true,
    });
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.06), gripMat);
    grip.position.y = -0.14;
    this.swordGroup.add(grip);

    // Pommel
    const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.08), crossguardMat);
    pommel.position.y = -0.27;
    this.swordGroup.add(pommel);

    // Default rest pose: fixed diagonally across back
    this._swordBackPos = new THREE.Vector3(0.06, 0.82, -0.25);
    this._swordBackRot = new THREE.Euler(0, 0, 0.22);

    // Guard pose: held horizontally in front of chest to block
    this._swordGuardPos = new THREE.Vector3(0.04, 0.68, 0.36);
    this._swordGuardRot = new THREE.Euler(0.35, 0.25, 1.45);

    this.swordGroup.position.copy(this._swordBackPos);
    this.swordGroup.rotation.copy(this._swordBackRot);
    this.model.add(this.swordGroup);

    // ── 3. Helmet & Orange Visor ──────────────────────────────
    const helmetMat = new THREE.MeshStandardMaterial({
      color: 0x3d3731, roughness: 0.7, metalness: 0.3, flatShading: true,
    });
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), helmetMat);
    helmet.position.y = 1.18;
    helmet.castShadow = true;
    this.model.add(helmet);

    const visorMat = new THREE.MeshStandardMaterial({
      color: 0xff9800, emissive: 0xff6d00, emissiveIntensity: 1.5,
      roughness: 0.2, flatShading: true,
    });
    this.visorMat = visorMat;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.11, 0.10), visorMat);
    visor.position.set(0, 1.19, 0.19);
    this.model.add(visor);

    // ── 4. Left Arm (defend / brace arm) ─────────────────────
    this.leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.45, 0.16), torsoMat);
    this.leftArm.position.set(-0.33, 0.63, 0);
    this.leftArm.castShadow = true;
    this.model.add(this.leftArm);

    // ── 5. Right Arm + DAGGER in hand ─────────────────────────
    this.rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.45, 0.16), torsoMat);
    this.rightArm.position.set(0.33, 0.63, 0);
    this.rightArm.castShadow = true;
    this.model.add(this.rightArm);

    // Dagger blade — short, keen, gleaming
    const daggerBladeMat = new THREE.MeshStandardMaterial({
      color: 0xd0d8e8, emissive: 0x6080a0, emissiveIntensity: 0.6,
      roughness: 0.2, metalness: 0.95, flatShading: true,
    });
    this.daggerGroup = new THREE.Group();
    const daggerBlade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.32, 0.05), daggerBladeMat);
    daggerBlade.position.y = 0.16;
    this.daggerGroup.add(daggerBlade);
    const dCross = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.04, 0.06), crossguardMat);
    this.daggerGroup.add(dCross);
    const dGrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.05), gripMat);
    dGrip.position.y = -0.09;
    this.daggerGroup.add(dGrip);

    // Mount dagger at right hand
    this.daggerGroup.position.set(0.33, 0.30, 0.18);
    this.daggerGroup.rotation.x = -0.3;
    this.model.add(this.daggerGroup);

    // ── 6. Legs ───────────────────────────────────────────────
    const legMat = new THREE.MeshStandardMaterial({
      color: 0x252320, roughness: 0.85, metalness: 0.1, flatShading: true,
    });
    this.leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.46, 0.20), legMat);
    this.leftLeg.position.set(-0.15, 0.23, 0);
    this.leftLeg.castShadow = true;
    this.model.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.46, 0.20), legMat);
    this.rightLeg.position.set(0.15, 0.23, 0);
    this.rightLeg.castShadow = true;
    this.model.add(this.rightLeg);

    // ── 7. Parry flash ring (pulsing cyan floor ring) ─────────
    const ringGeo = new THREE.RingGeometry(0.40, 0.58, 24);
    ringGeo.rotateX(-Math.PI / 2);
    this._parryRingMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff, transparent: true, opacity: 0, side: THREE.DoubleSide,
    });
    this._parryRing = new THREE.Mesh(ringGeo, this._parryRingMat);
    this._parryRing.position.y = 0.04;
    this.group.add(this._parryRing);

    // ── 8. Block guard shield glow (subtle blue dome) ─────────
    const shieldGeo = new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
    shieldGeo.rotateX(Math.PI / 2);
    this._blockShieldMat = new THREE.MeshBasicMaterial({
      color: 0x4488ff, transparent: true, opacity: 0, side: THREE.DoubleSide, wireframe: true,
    });
    this._blockShield = new THREE.Mesh(shieldGeo, this._blockShieldMat);
    this._blockShield.position.set(0, 0.72, 0.4);
    this.model.add(this._blockShield);

    this.group.add(this.model);
  }

  /**
   * Main update called every frame by Game.js.
   * @param {number} dt
   * @param {Input}  input
   * @param {object} bounds  { minX, maxX, minZ, maxZ }
   * @param {Array}  props   collision props
   */
  update(dt, input, bounds, props = []) {
    // ── Invincibility & hit flash ─────────────────────────────
    if (this._iframes > 0)    this._iframes -= dt;
    if (this._hitFlash > 0) {
      this._hitFlash -= dt;
      if (this._hitFlash <= 0) this.torsoMat.color.setHex(0x3a3530);
    }
    if (this._blockRecoil > 0) {
      this._blockRecoil = Math.max(0, this._blockRecoil - dt * 4.5);
    }
    if (this._jabTimer > 0) {
      this._jabTimer = Math.max(0, this._jabTimer - dt);
    }

    // ── Stagger & Posture exhaustion (Sekiro posture broken) ──
    if (this._staggerTimer > 0) {
      this._staggerTimer -= dt;
      this.isPostureStaggered = true;
      this.isParrying = false;
      this.isBlocking = false;
      this.isDashing = false;
      this.isMoving = false;
      // Stagger pose: heavy stumble forward, arms hanging limp
      this.torso.rotation.x = 0.45;
      this.head.rotation.x = 0.4;
      this.leftArm.rotation.x = 0.4;
      this.rightArm.rotation.x = 0.4;
      this.model.position.y = -0.12;

      if (this._staggerTimer <= 0) {
        this.isPostureStaggered = false;
        this.posture = 0;
        this.torso.rotation.x = 0;
        this.head.rotation.x = 0;
        this.model.position.y = 0;
      }
      this.model.rotation.y = this._facing;
      this.group.position.set(this.x, 0, this.z);
      return;
    } else {
      this.isPostureStaggered = false;
      this.model.position.y = 0;
      // Passive posture recovery:
      if (this.posture > 0) {
        // Fast recovery when idle (26/s), moderate when moving (16/s), slow when blocking (7/s)
        const decayRate = this.isBlocking ? 7 : (this.isMoving ? 16 : 26);
        this.posture = Math.max(0, this.posture - dt * decayRate);
      }
    }

    const { run } = gameStore.getState();

    // ── LEFT CLICK / F PARRY & BLOCK LOGIC ────────────────────
    const justPressedParry = input.consumeParryPress();
    const isHoldingParry   = input.isParryHeld();

    if (this._parryCooldown > 0) {
      this._parryCooldown = Math.max(0, this._parryCooldown - dt);
    }

    if (justPressedParry) {
      // If not on whiff cooldown, initiate parry tap!
      // If currently on whiff cooldown from spamming, button press is ignored!
      if (this._parryCooldown <= 0) {
        const echoBonus = gameStore.getState().run?.parryEcho || 0;
        const parryWin = PARRY_WINDOW + (gameStore.getState().hasSkill?.('TEMPORAL_GUARD') ? 0.04 : 0) + echoBonus;
        this.isParrying           = true;
        this.isBlocking           = false;
        this._parryWindowMax      = parryWin;
        this._parryTimer          = parryWin;
        this._parryHoldTimer      = 0;
        this._hasParriedThisWindow = false;
        this._shownWhiffText      = false; // reset per-press miss marker
        sound.playSwordDraw();
      }
    }

    if (isHoldingParry) {
      this._parryHoldTimer += dt;
      // If held past the quick-tap window, TRANSITION TO BLOCK!
      // "ถ้าเรากดค้าง มันจะไม่เป็นการ Parry มันจะเป็นการบล็อกแทน จะไม่นับว่าเป็นการparry เด็ดขาด"
      if (this._parryHoldTimer >= PARRY_TAP_THRESHOLD) {
        this.isParrying = false;
        this.isBlocking = true;
      }
    } else {
      // Button released
      this.isBlocking = false;
    }

    // Tick down parry window
    if (this.isParrying) {
      this._parryTimer -= dt;
      const maxWin = this._parryWindowMax || PARRY_WINDOW;
      const progress = Math.max(0, this._parryTimer / maxWin);
      this._parryRingMat.opacity = progress * 0.95;
      this._parryRing.scale.setScalar(1 + (1 - progress) * 0.4);
      if (this._parryTimer <= 0) {
        this.isParrying = false;
        this._parryRingMat.opacity = 0;
        // WHIFF PENALTY: tapped parry at wrong time (no enemy attack glint)
        // "ไม่เอานะ ที่เป็นแบบกดรัวๆ แล้วแพรี่ได้ อะไม่เอาต้องตรงจังหวะเท่านั้น"
        if (!this._hasParriedThisWindow && !this.isBlocking) {
          this._parryCooldown = PARRY_COOLDOWN; // lock for 0.35s
          this.posture = Math.min(this.maxPosture - 1, this.posture + 12);
          sound.playWhiff?.();
          gameStore.getState().onMissedParry();
        }
      }
    } else {
      this._parryRingMat.opacity = 0;
    }

    // Block visual indicator
    this._blockShieldMat.opacity = this.isBlocking ? 0.35 + Math.sin(performance.now() * 0.01) * 0.1 : 0;

    // ── Dash activation (Space key) ────────────────────────────
    if (input.consumePress('Space') && !this.isDashing) {
      if (gameStore.getState().consumeDash()) {
        this.isDashing    = true;
        this._dashTimer   = DASH_DURATION;
        this._dashDx      = Math.sin(this._facing);
        this._dashDz      = Math.cos(this._facing);
        sound.playDash?.();
      }
    }

    if (this.isDashing) {
      const distBonus = gameStore.getState().hasSkill?.('FLEET_STEP') ? 1.35 : 1.0;
      const dashSpeed = (DASH_DISTANCE * distBonus) / DASH_DURATION;
      const stepX = this._dashDx * dashSpeed * dt;
      const stepZ = this._dashDz * dashSpeed * dt;
      const nx = this.x + stepX;
      const nz = this.z + stepZ;
      if (nx >= bounds.minX && nx <= bounds.maxX) this.x = nx;
      if (nz >= bounds.minZ && nz <= bounds.maxZ) this.z = nz;
      this._dashTimer -= dt;
      if (this._dashTimer <= 0) this.isDashing = false;
    }

    // ── WASD movement (when not dashing) ──────────────────────
    if (!this.isDashing) {
      const raw = input.getRaw();
      let moveX = 0, moveZ = 0;
      if (raw.x !== 0 || raw.y !== 0) {
        const isoDx = (raw.x + raw.y) * 0.7071;
        const isoDz = (-raw.x + raw.y) * 0.7071;
        moveX = isoDx;
        moveZ = isoDz;
      }

      const len = Math.hypot(moveX, moveZ);
      this.isMoving = len > 0.01;
      if (len > 0.01) {
        const base = (run.baseSpeed || PLAYER_SPEED) / SPEED_UNITS;
        const mult = run.parrySpeedBuff > 0 ? run.parryBuffMult : 1.0;
        // Moving while actively blocking slows speed slightly (70% speed)
        const blockSlow = this.isBlocking ? 0.70 : 1.0;
        const speed = base * mult * blockSlow;

        const nx = this.x + (moveX / len) * speed * dt;
        const nz = this.z + (moveZ / len) * speed * dt;
        if (nx >= bounds.minX && nx <= bounds.maxX) this.x = nx;
        if (nz >= bounds.minZ && nz <= bounds.maxZ) this.z = nz;

        // Prop collision
        for (const p of props) {
          const d = Math.hypot(this.x - p.x, this.z - p.z);
          if (d < this.radius + p.r && d > 0) {
            const push = (this.radius + p.r) - d;
            this.x += ((this.x - p.x) / d) * push;
            this.z += ((this.z - p.z) / d) * push;
          }
        }

        // Turn toward movement
        const targetAngle = Math.atan2(moveX, moveZ);
        let diff = targetAngle - this._facing;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff >  Math.PI) diff -= Math.PI * 2;
        this._facing += diff * Math.min(dt * 12, 1);

        // Footstep audio (every 0.32s while walking)
        this._stepTimer = (this._stepTimer || 0) - dt;
        if (this._stepTimer <= 0) {
          sound.playFootstep?.();
          this._stepTimer = 0.32;
        }

        // Walk cycle
        this._walkTime += dt * 10;
        this.model.position.y    = Math.abs(Math.sin(this._walkTime)) * 0.08;
        this.leftLeg.rotation.x  =  Math.sin(this._walkTime) * 0.45;
        this.rightLeg.rotation.x = -Math.sin(this._walkTime) * 0.45;
      } else {
        this.isMoving = false;
        this._stepTimer = 0.1;
        this.model.position.y    *= 0.8;
        this.leftLeg.rotation.x  *= 0.8;
        this.rightLeg.rotation.x *= 0.8;
      }
    }

    // ── SWORD & ARM PROCEDURAL RIG ANIMATION ──────────────────
    if (this.isParrying) {
      // PARRY DEFLECT SWING ARC:
      // Draws sword forward from back in a fast sweeping deflect slash
      const p = 1 - Math.max(0, this._parryTimer / PARRY_WINDOW);
      this.swordGroup.position.set(
        0.06 - p * 0.12,
        0.72 + Math.sin(p * Math.PI) * 0.14,
        -0.20 + p * 0.58
      );
      this.swordGroup.rotation.set(
        0.2 + p * 0.5,
        -0.4 + p * 1.5,
        0.2 + p * 1.8
      );
      // Right arm swings across chest holding sword hilt
      this.rightArm.rotation.x = -1.4 + p * 0.7;
      this.rightArm.rotation.z = -0.5 + p * 0.9;
      // Left arm braces
      this.leftArm.rotation.x  = -0.8;
      this.leftArm.rotation.z  = 0.4;

    } else if (this.isBlocking) {
      // BLOCK GUARD STANCE:
      // Steady two-handed cross-guard held horizontally in front of chest
      const recoilOffset = this._blockRecoil * 0.08;
      this.swordGroup.position.set(
        this._swordGuardPos.x,
        this._swordGuardPos.y,
        this._swordGuardPos.z - recoilOffset
      );
      this.swordGroup.rotation.copy(this._swordGuardRot);

      this.rightArm.rotation.x = -0.95;
      this.rightArm.rotation.z = -0.35;
      this.leftArm.rotation.x  = -0.90;
      this.leftArm.rotation.z  =  0.42;

    } else {
      // IDLE / WALKING STANCE:
      // Sword smoothly rests back in sheath
      this.swordGroup.position.lerp(this._swordBackPos, Math.min(dt * 12, 1));
      this.swordGroup.rotation.x = THREE.MathUtils.lerp(this.swordGroup.rotation.x, this._swordBackRot.x, dt * 12);
      this.swordGroup.rotation.y = THREE.MathUtils.lerp(this.swordGroup.rotation.y, this._swordBackRot.y, dt * 12);
      this.swordGroup.rotation.z = THREE.MathUtils.lerp(this.swordGroup.rotation.z, this._swordBackRot.z, dt * 12);

      if (this.isMoving) {
        this.leftArm.rotation.x  = -Math.sin(this._walkTime) * 0.35;
        this.leftArm.rotation.z  = 0;
        this.rightArm.rotation.x =  Math.sin(this._walkTime) * 0.35;
        this.rightArm.rotation.z = 0;
      } else {
        this.leftArm.rotation.x  *= 0.8;
        this.leftArm.rotation.z  *= 0.8;
        this.rightArm.rotation.x *= 0.8;
        this.rightArm.rotation.z *= 0.8;
      }
    }

    // Dagger jab thrust animation
    if (this._jabTimer > 0) {
      const jabProgress = 1 - (this._jabTimer / 0.18);
      const thrust = Math.sin(jabProgress * Math.PI) * 0.28;
      this.daggerGroup.position.z = 0.18 + thrust;
      this.rightArm.rotation.x = -1.1;
    } else {
      this.daggerGroup.position.z = 0.18;
    }

    // Sync parry speed buff timer in store
    gameStore.getState().tickParryBuff(dt);

    this.model.rotation.y = this._facing;
    this.group.position.set(this.x, 0, this.z);
  }

  /** Trigger dagger jab strike animation */
  triggerAttack() {
    this._jabTimer = 0.18;
    sound.playSlash();
  }

  /**
   * Called when an enemy attack contacts the player.
   * Returns:
   *   null - if invulnerable (iframes)
   *   { blocked: true, dmg: reduced } - if blocking with sword
   *   { blocked: false, dmg: full } - if hit unprotected
   */
  hit(amount) {
    if (this._iframes > 0) return null;

    if (this.isBlocking) {
      // Attack is successfully BLOCKED!
      // Absorbs 80% damage, player recoils slightly, heavy clank sound
      this._blockRecoil = 0.25;
      sound.playBlock();
      const blockedDmg = Math.max(1, Math.round(amount * (1 - BLOCK_DMG_REDUCTION)));
      gameStore.getState().takeDamage(blockedDmg);

      // Sekiro Posture damage on block (guarding builds posture quickly!)
      this.posture += amount * 1.5;
      let guardBroken = false;
      if (this.posture >= this.maxPosture) {
        this.posture = this.maxPosture;
        this.isPostureStaggered = true;
        this._staggerTimer = 1.8; // 1.8 seconds of player stagger
        guardBroken = true;
        this.isBlocking = false;
        sound.playPostureBreak?.();
      }
      return { blocked: true, guardBroken, dmg: blockedDmg };
    }

    // Normal hit
    this._iframes  = IFRAMES_DURATION;
    this._hitFlash = 0.2;
    this.torsoMat.color.setHex(0xff3333);
    gameStore.getState().takeDamage(amount);

    // Sekiro Posture damage on unblocked hit
    this.posture += amount * 0.9;
    let guardBroken = false;
    if (this.posture >= this.maxPosture) {
      this.posture = this.maxPosture;
      this.isPostureStaggered = true;
      this._staggerTimer = 1.8;
      guardBroken = true;
      sound.playPostureBreak?.();
    }
    return { blocked: false, guardBroken, dmg: amount };
  }

  /**
   * Check if a given world position is behind this player.
   */
  isPositionBehind(ex, ez) {
    const dx = ex - this.x;
    const dz = ez - this.z;
    const fx = Math.sin(this._facing);
    const fz = Math.cos(this._facing);
    return (fx * dx + fz * dz) < 0;
  }

  destroy() {
    this.scene.remove(this.group);
  }
}
