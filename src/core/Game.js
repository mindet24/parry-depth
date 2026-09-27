/**
 * Game.js — Parry Roguelike Master Orchestrator (Phase 1).
 *
 * Phase 1 scope:
 *   - Player movement with dagger + back-mounted sword
 *   - F → Parry (with timing window and speed buff)
 *   - Space → Dash (consumes a stack)
 *   - Backstab angle detection on enemy contact
 *   - HUD: HP, Dash Stacks, Parry Chain counter
 *   - Enemies still use old Enemies3D as standin (Phase 2 will rework them)
 *   - Weapons3D removed; manual Jab/Backstab replaces it
 */
import gsap from 'gsap';
import { Input } from './Input.js';
import { Renderer3D } from './Renderer3D.js';
import { Room3D } from '../rooms/Room3D.js';
import { RoomGraph } from '../rooms/RoomGraph.js';
import { Player3D } from '../player/Player3D.js';
import { UIManager } from '../ui/UIManager.js';
import { SaveManager } from './SaveManager.js';
import { gameStore } from '../state/gameStore.js';
import {
  EnemyBasic3D,
  EnemyFast3D,
  EliteWarden3D,
  EliteHunter3D,
  Boss3D,
} from '../combat/Enemies3D.js';
import { DeathBurst3D } from '../combat/DeathBurst3D.js';
import { ROOM_TYPE, spawnCount, BACKSTAB_MULT, BACKSTAB_BASE_DMG, JABS_BASE_DMG } from './constants.js';
import { MYSTERY_POOL, SHOP_POOL } from './constants.js';
import { sound } from './Audio.js';
import { MissionManager } from '../mission/MissionManager.js';
import { SkillManager } from '../combat/SkillManager.js';

// ─────────────────────────────────────────────────────────────────
//  Tiny inline HUD sync helper (replaces old HUD.js dependency)
// ─────────────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

function syncHUD(run) {
  // HP bar
  const pct = run.maxHp > 0 ? (run.hp / run.maxHp) * 100 : 0;
  const hpFill = el('hp-bar-fill');
  if (hpFill) hpFill.style.width = `${pct}%`;
  const hpLabel = el('hp-label');
  if (hpLabel) hpLabel.textContent = `${Math.ceil(run.hp)}/${run.maxHp}`;

  // Floor / room
  const floorLbl = el('floor-label');
  if (floorLbl) floorLbl.textContent = `FLOOR ${run.floor}`;
  const roomLbl = el('room-label');
  if (roomLbl) roomLbl.textContent = `ROOM ${run.roomIndex + 1}/${run.routeLength || '?'}`;

  // Dash stacks
  const dashEl = el('dash-stacks');
  if (dashEl) {
    const filled = '◆'.repeat(run.dashStacks);
    const empty  = '◇'.repeat(Math.max(0, run.maxDashStacks - run.dashStacks));
    dashEl.textContent = filled + empty;
    dashEl.style.color = run.dashStacks > 0 ? '#00e5ff' : '#446';
  }

  // Parry chain counter
  const chainEl = el('parry-chain');
  if (chainEl) {
    const mod = run.parryChain % 3;
    const pips = '●'.repeat(mod) + '○'.repeat(3 - mod);
    chainEl.textContent = `${pips}  ×${Math.floor(run.parryChain / 3)}`;
    chainEl.style.color = run.parryChain > 0 ? '#ffe000' : '#446';
  }

  // Parry buff indicator
  const buffEl = el('parry-buff');
  if (buffEl) {
    buffEl.style.opacity = run.parrySpeedBuff > 0 ? '1' : '0';
  }

  // Guard / Block indicator
  const guardEl = el('guard-status');
  if (guardEl && window.__playerRef) {
    guardEl.style.opacity = window.__playerRef.isBlocking ? '1' : '0';
  }

  // Sekiro Player Posture
  const player = window.__playerRef;
  if (player) {
    const postPct = Math.min(100, (player.posture / player.maxPosture) * 100);
    const postFill = el('posture-bar-fill');
    if (postFill) {
      postFill.style.width = `${postPct}%`;
      postFill.style.background = player.isPostureStaggered
        ? 'linear-gradient(90deg, #d50000, #ff1744)'
        : (postPct > 70 ? 'linear-gradient(90deg, #ff3d00, #ff6e40)' : 'linear-gradient(90deg, #e65100, #ff9800)');
    }
    const postLbl = el('posture-label');
    if (postLbl) {
      postLbl.textContent = player.isPostureStaggered ? 'STAGGERED!' : `POSTURE ${Math.round(postPct)}%`;
      postLbl.style.color = player.isPostureStaggered ? '#ff1744' : (postPct > 70 ? '#ff7043' : '#ffb74d');
    }
  }

  // Sekiro Enemy Target HUD (closest or boss enemy)
  const targetHud = el('enemy-target-hud');
  if (targetHud) {
    const enemies = window.__activeEnemies;
    const living = enemies ? enemies.filter(e => !e.dead) : [];
    if (living.length > 0 && player) {
      living.sort((a, b) => {
        if (a.constructor?.name === 'Boss3D') return -1;
        if (b.constructor?.name === 'Boss3D') return 1;
        const da = Math.hypot(player.x - a.x, player.z - a.z);
        const db = Math.hypot(player.x - b.x, player.z - b.z);
        return da - db;
      });
      const target = living[0];
      const dist = Math.hypot(player.x - target.x, player.z - target.z);
      if (dist < 8.5) {
        targetHud.classList.remove('hidden');
        const tName = el('target-name');
        if (tName) {
          const cName = target.constructor?.name;
          tName.textContent = cName === 'Boss3D' ? 'CORE BEHEMOTH' :
                              cName === 'EliteWarden3D' ? 'IRON WARDEN' :
                              cName === 'EliteHunter3D' ? 'RAZOR HUNTER' :
                              cName === 'EnemyFast3D' ? 'THE SKITTERER' : 'THE SHAMBLER';
        }
        const tHpFill = el('target-hp-fill');
        if (tHpFill) {
          const hpPct = Math.max(0, Math.min(100, (target.hp / target.maxHp) * 100));
          tHpFill.style.width = `${hpPct}%`;
        }
        const tPostFill = el('target-posture-fill');
        if (tPostFill) {
          const postPct = Math.max(0, Math.min(100, (target.posture / target.maxPosture) * 100));
          tPostFill.style.width = `${postPct}%`;
          tPostFill.style.background = target.isPostureStaggered
            ? 'linear-gradient(90deg, #d50000, #ff1744)'
            : 'linear-gradient(90deg, #ef6c00, #ff9800)';
        }
        const tDeathblowCue = el('target-deathblow-cue');
        if (tDeathblowCue) {
          if (target.isPostureStaggered) {
            tDeathblowCue.classList.remove('hidden');
          } else {
            tDeathblowCue.classList.add('hidden');
          }
        }
      } else {
        targetHud.classList.add('hidden');
      }
    } else {
      targetHud.classList.add('hidden');
    }
  }

  // Phase 6: Active skill badges in HUD
  const skillsEl = el('hud-skills');
  if (skillsEl) {
    const activeKeys = Object.keys(run.skills || {});
    skillsEl.innerHTML = activeKeys.map(id => {
      const meta = SkillManager.getSkill(id);
      return `<span class="hud-skill-badge" title="${meta?.name || id}: ${meta?.desc || ''}">${meta?.icon || '✦'}</span>`;
    }).join('');
  }

  // ── Mission HUD ────────────────────────────────────────────────
  // (updated via syncMission() — leave this stub blank for syncHUD)
}

// Spawn a floating combat text node on screen
function spawnCombatText(x, y, text, color = '#fff', big = false) {
  const div = document.createElement('div');
  div.className = 'damage-number';
  div.textContent = text;
  div.style.cssText = `left:${x}px;top:${y}px;color:${color};font-size:${big ? '2em' : '1.2em'};`;
  el('damage-numbers').appendChild(div);
  gsap.to(div, { y: -55, opacity: 0, duration: 0.9, ease: 'power2.out',
                 onComplete: () => div.remove() });
}

// ─────────────────────────────────────────────────────────────────
export class Game {
  constructor(canvas) {
    this.canvas     = canvas;
    this.renderer3d = new Renderer3D(canvas);
    this._input     = new Input();

    this._ui = new UIManager({
      onStartRun:    () => this._startNewRun(),
      onContinueRun: () => this._continueRun(),
      onResume:      () => this._setRunning(true),
      onSaveExit:    () => this._saveAndExit(),
      onAbandon:     () => this._abandonRun(),
    });

    this._graph           = null;
    this._room3d          = null;
    this._player          = null;
    this._enemies         = [];
    this._bursts          = [];
    this._mission         = null;   // Phase 3 MissionManager

    this._roomCleared     = false;
    this._combatStarted   = false;
    this._isTransitioning = false;
    this._lastTime        = 0;
    this._running         = false;
    this._paused          = false;
    this._attackRecovery  = 0;

    this._fadeEl = document.getElementById('fade');

    window.addEventListener('keydown', e => {
      if (e.code === 'Escape') this._togglePause();
      if (e.code === 'KeyM')   sound.toggleMute();
    });
  }

  start() {
    gsap.set(this._fadeEl, { opacity: 1 });
    gsap.to(this._fadeEl, { opacity: 0, duration: 1.2, ease: 'power2.out',
      onComplete: () => { this._fadeEl.style.pointerEvents = 'none'; } });

    this._lastTime = performance.now();
    requestAnimationFrame(this._loop.bind(this));
  }

  // ─── Game loop ───────────────────────────────────────────────
  _loop(now) {
    requestAnimationFrame(this._loop.bind(this));
    const dt = Math.min((now - this._lastTime) / 1000, 0.05);
    this._lastTime = now;

    // Freeze-frame: skip _update for a few ms to create backstab impact pause
    if (this._freezeFrameTimer > 0) {
      this._freezeFrameTimer -= dt;
      this._draw(); // still render, just don't simulate
      return;
    }

    if (this._running && !this._paused) {
      this._update(dt);
    }
    this._draw();
  }

  _update(dt) {
    if (!this._player || !this._room3d) return;

    const bounds = this._room3d.getBounds();
    const { run } = gameStore.getState();

    window.__playerRef = this._player;
    window.__activeEnemies = this._enemies;

    // ── Player update (movement, parry window, dash) ──────────
    this._player.update(dt, this._input, bounds, this._room3d.props || []);

    // ── Parry resolution — must hit during enemy's isParryable glint window ──
    // (isParryable = the วิ้งๆ glint moment in windup, NOT the active attack)
    if (this._player.isParrying) {
      let parried = false;
      for (const e of this._enemies) {
        if (e.dead || !e.isParryable) continue;
        const dist = Math.hypot(this._player.x - e.x, this._player.z - e.z);
        if (dist < 2.8) {
          // ✅ Successful timing-window parry!
          const result = gameStore.getState().onSuccessfulParry();
          sound.playParry?.();
          this._player.isParrying  = false;
          this._player._parryTimer = 0;
          if (this._player.posture) {
            this._player.posture = Math.max(0, this._player.posture - 25);
          }

          // Phase 6: Aegis Bulwark (invincibility guard on parry)
          if (gameStore.getState().hasSkill?.('AEGIS_BULWARK')) {
            this._player._iframes = Math.max(this._player._iframes, 0.8);
          }

          // Stagger enemy, cancel attack, flash cyan
          if (e.onParried) {
            e.onParried();
          } else {
            e._staggerTimer = 0.75;
          }

          // Phase 6: Concussive Chain (shockwave on 3rd consecutive parry)
          if (result.bonusStack && gameStore.getState().hasSkill?.('CONCUSSIVE_CHAIN')) {
            this._bursts.push(new DeathBurst3D(this.renderer3d.scene, this._player.x, this._player.z, 0x00e5ff, 16));
            sound.playHit?.();
            for (const other of this._enemies) {
              if (other.dead) continue;
              const d = Math.hypot(other.x - this._player.x, other.z - this._player.z);
              if (d < 5.0) {
                other._staggerTimer = Math.max(other._staggerTimer || 0, 1.2);
                if (d > 0.05) {
                  other.x += ((other.x - this._player.x) / d) * 1.5;
                  other.z += ((other.z - this._player.z) / d) * 1.5;
                  other.clampToBounds?.();
                }
              }
            }
          }

          // Visual feedback
          const sPos = this.renderer3d.toScreenXY(this._player.x, 1.2, this._player.z);
          const chainText = result.bonusStack ? 'BONUS STACK! ×3 CHAIN!' : `PARRY ✓`;
          if (result.bonusStack) sound.playChainBonus?.();
          spawnCombatText(sPos.x, sPos.y - 20, chainText, result.bonusStack ? '#ffe000' : '#00e5ff', true);

          // SATISFYING PARRY EFFECT: Blood splatter, cyan sparks, freeze frame, and shake!
          this._bursts.push(new DeathBurst3D(this.renderer3d.scene, e.x, e.z, 0xff0033, 24)); // Blood
          this._bursts.push(new DeathBurst3D(this.renderer3d.scene, (this._player.x + e.x)/2, (this._player.z + e.z)/2, 0x00e5ff, 12)); // Cyan sparks
          this._freezeFrameTimer = 0.12; // Heavy impact freeze
          const hud = document.getElementById('hud');
          if (hud) {
            hud.classList.remove('shake');
            void hud.offsetWidth; // trigger reflow
            hud.classList.add('shake');
          }
          parried = true;
          break;
        }
      }

      // No parryable enemy in range — Player3D handles the whiff penalty
      // when the timer expires (onMissedParry is called there already).
      // We just mark whether this press had a chance to match an enemy.
      if (!parried && this._player.isParrying && !this._player._shownWhiffText) {
        this._player._shownWhiffText = true; // prevent repeat per-frame firing
      }
    }

    // ── Active Dagger Attack (Left click / J / E / K) ──────────
    // Recovery guard: one click = one thrust; player cannot spam attacks
    if (this._attackRecovery > 0) this._attackRecovery -= dt;

    if (this._attackRecovery <= 0 && this._input.consumeAttack()) {
      this._attackRecovery = 0.28; // 280ms recovery before next thrust is allowed
      this._player.triggerAttack();

      let hitTarget = null;
      let closestDist = 2.1;

      for (const e of this._enemies) {
        if (e.dead) continue;
        const dist = Math.hypot(this._player.x - e.x, this._player.z - e.z);
        if (dist <= closestDist) {
          // Check if enemy is in front of player
          const dx = e.x - this._player.x;
          const dz = e.z - this._player.z;
          const fx = Math.sin(this._player._facing);
          const fz = Math.cos(this._player._facing);
          const dot = (fx * (dx / dist)) + (fz * (dz / dist));
          if (dot > 0.05) { // within ~160° forward arc
            hitTarget = e;
            closestDist = dist;
          }
        }
      }

      if (hitTarget) {
        if (hitTarget.isPostureStaggered) {
          // SEKIRO DEATHBLOW EXECUTION!
          hitTarget.hp = 0;
          hitTarget.dead = true;
          this._freezeFrameTimer = 0.35; // Heavy cinematic hit stop
          const ePos = this.renderer3d.toScreenXY(hitTarget.x, 1.2, hitTarget.z);
          spawnCombatText(ePos.x, ePos.y - 45, 'DEATHBLOW 忍殺!', '#ff0033', true);
          spawnCombatText(ePos.x, ePos.y + 10, 'INSTANT EXECUTION', '#ffcc00', false);
          if (sound.playDeathblow) sound.playDeathblow();
          else if (sound.playBackstab) sound.playBackstab();

          const hud = document.getElementById('hud');
          if (hud) {
            hud.classList.remove('shake');
            void hud.offsetWidth;
            hud.classList.add('shake');
          }
          // Massive arterial blood spray
          this._bursts.push(new DeathBurst3D(this.renderer3d.scene, hitTarget.x, hitTarget.z, 0x8b0000, 48));
          this._bursts.push(new DeathBurst3D(this.renderer3d.scene, hitTarget.x, hitTarget.z, 0xff0033, 28));
        } else {
          const isBackstab = hitTarget.isAttackerBehind
            ? hitTarget.isAttackerBehind(this._player.x, this._player.z)
            : false;

          // Front stabs are deliberately weak (4-5 dmg); backstab is rewarded with ~5x multiplier
          let dmg = isBackstab
            ? Math.round(5 * 5.5)   // 27 base backstab
            : 5;                    // weak front jab

          const dmgMult = 1.0 + (gameStore.getState().run?.damageBonus || 0);
          const bsMult  = 1.0 + (gameStore.getState().run?.backstabBonus || 0);
          if (isBackstab) {
            dmg = Math.round(dmg * bsMult * dmgMult);
            if (gameStore.getState().hasSkill?.('SHARPENED_BLADE')) dmg = Math.round(dmg * 1.5);
          } else {
            dmg = Math.round(dmg * dmgMult);
          }
          if (hitTarget._ruptureTimer > 0) dmg = Math.round(dmg * 1.4);

          if (hitTarget.takeHit) {
            hitTarget.takeHit(dmg, this._player.x, this._player.z);
          } else {
            hitTarget.hp -= dmg;
            if (hitTarget.hp <= 0) hitTarget.dead = true;
          }

          const ePos = this.renderer3d.toScreenXY(hitTarget.x, 1.2, hitTarget.z);
          if (isBackstab) {
            // Freeze-frame (18ms pause) to punctuate the backstab
            this._freezeFrameTimer = 0.018;

            spawnCombatText(ePos.x, ePos.y - 40, 'BACKSTAB!', '#ffd54f', true);
            spawnCombatText(ePos.x, ePos.y + 8, `-${dmg}`, '#ffcc00', true);
            if (sound.playBackstab) sound.playBackstab(); else sound.playSlash?.();
            document.getElementById('hud')?.classList.add('shake');
            setTimeout(() => document.getElementById('hud')?.classList.remove('shake'), 200);
          } else {
            spawnCombatText(ePos.x, ePos.y, `-${dmg}`, hitTarget._ruptureTimer > 0 ? '#e040fb' : '#ccc');
            sound.playSlash?.();
          }
        }
      }
    }

    // ── Enemy updates ─────────────────────────────────────────
    for (const e of this._enemies) {
      if (e.dead) continue;
      e.separate?.(this._enemies);

      e.update(dt, this._player);

      // Contact damage — ONLY during enemy's active attack frames (not on idle contact)
      // Per brief: "ศัตรูจะทำ Damage ได้ก็ต่อเมื่อเกิดการโจมตีเท่านั้น"
      if (!e.dead && e.isAttacking) {
        const dist = Math.hypot(this._player.x - e.x, this._player.z - e.z);
        const reach = e.attackReach || (e.radius + this._player.radius);
        if (dist < reach && !e._hasHitPlayerThisAttack) {
          e._hasHitPlayerThisAttack = true; // one hit per attack swing
          const dmg = (e.currentAttack === 'delayed_overhead' ? Math.round(e.contactDmg * 1.5) : (e.currentAttack === 'seismic_slam' ? Math.round(e.contactDmg * 1.6) : e.contactDmg));
          const hitRes = this._player.hit(dmg);
          if (hitRes) {
            const pPos = this.renderer3d.toScreenXY(this._player.x, 1.4, this._player.z);
            if (hitRes.guardBroken) {
              spawnCombatText(pPos.x, pPos.y - 30, 'POSTURE BROKEN! ⚡', '#ff9800', true);
              const hud = document.getElementById('hud');
              if (hud) {
                hud.classList.remove('shake');
                void hud.offsetWidth;
                hud.classList.add('shake');
              }
            } else if (hitRes.blocked) {
              // Successfully blocked with sword!
              const label = e.isPerilous ? 'HEAVY GUARD 🛡' : 'BLOCKED 🛡';
              spawnCombatText(pPos.x, pPos.y - 25, label, e.isPerilous ? '#ff9800' : '#60a5fa', false);
              spawnCombatText(pPos.x, pPos.y + 10, `-${hitRes.dmg}`, '#93c5fd', false);
            } else {
              // Full unblocked hit
              sound.playHurt?.();
              if (e.isPerilous) {
                spawnCombatText(pPos.x, pPos.y - 25, 'PERILOUS HIT! ⚠️', '#ff1744', true);
              }
              spawnCombatText(pPos.x, pPos.y + 10, `-${hitRes.dmg}`, '#ff3333', false);
              document.getElementById('hud')?.classList.add('shake');
              setTimeout(() => document.getElementById('hud')?.classList.remove('shake'), 320);
            }
          }
        }
      } else if (!e.dead && !e.isAttacking) {
        e._hasHitPlayerThisAttack = false;
      }

      // Ground hazard zones (e.g. shockwaves from unparryable slams)
      if (!e.dead && e.getHazardZones) {
        for (const h of e.getHazardZones()) {
          const hDist = Math.hypot(this._player.x - h.x, this._player.z - h.z);
          if (hDist < h.r && !h._hasHit) {
            h._hasHit = true;
            const hitRes = this._player.hit(h.dmg);
            if (hitRes) {
              const pPos = this.renderer3d.toScreenXY(this._player.x, 1.4, this._player.z);
              sound.playHurt?.();
              spawnCombatText(pPos.x, pPos.y - 25, 'SHOCKWAVE! ⚠️', '#ff1744', true);
              spawnCombatText(pPos.x, pPos.y + 10, `-${hitRes.dmg}`, '#ff3333', false);
              document.getElementById('hud')?.classList.add('shake');
              setTimeout(() => document.getElementById('hud')?.classList.remove('shake'), 350);
            }
          }
        }
      }
    }

    // ── Dash logic: pass through enemies (ghosting) ──
    if (this._player.isDashing) {
      const hasRupture = gameStore.getState().hasSkill?.('RUPTURE_DASH');
      for (const e of this._enemies) {
        if (e.dead) continue;
        const dist = Math.hypot(this._player.x - e.x, this._player.z - e.z);

        // Phase 6: Rupture mark on dash near enemies
        if (hasRupture && dist < 2.5 && !e._ruptureTimer) {
          e._ruptureTimer = 5.0;
          const ePos = this.renderer3d.toScreenXY(e.x, 1.2, e.z);
          spawnCombatText(ePos.x, ePos.y - 35, 'RUPTURED!', '#e040fb', false);
        }
      }
    }

    // ── Death resolution ───────────────────────────────────────
    const justDied = this._enemies.filter(e => e.dead && !e._dropped);
    for (const e of justDied) {
      e._dropped = true;
      this._bursts.push(new DeathBurst3D(
        this.renderer3d.scene, e.x, e.z, e.deathColor || 0xff4444, 8
      ));
      document.getElementById('hud')?.classList.add('shake');
      setTimeout(() => document.getElementById('hud')?.classList.remove('shake'), 250);
      e.destroy();
    }
    this._enemies = this._enemies.filter(e => !e.dead);

    // ── Burst updates ──────────────────────────────────────────
    for (const b of this._bursts) b.update(dt);
    this._bursts = this._bursts.filter(b => !b.done);

    // ── Room clear check ───────────────────────────────────────
    if (!this._roomCleared && this._combatStarted && this._enemies.length === 0) {
      this._roomCleared = true;
      this._room3d.openAllDoors();
      sound.playDoorOpen?.();
      this.renderer3d.setExitLight(true);
      gameStore.getState().clearRoom();
      this._saveCheckpoint();

      // Mission: fire appropriate event based on room type
      if (this._mission) {
        const roomType = this._currentRoomType;
        if (roomType === ROOM_TYPE.ELITE) {
          this._mission.fireEvent('elite_killed');
        } else if (roomType === ROOM_TYPE.BOSS) {
          this._mission.fireEvent('boss_killed');
        } else {
          this._mission.fireEvent('combat_cleared');
        }
        this._syncMissionHUD();
        this._saveMission();
      }

      // Special presentation on Boss victory
      if (this._currentRoomType === ROOM_TYPE.BOSS) {
        sound.playBossAlert?.();
        this._showObjectiveToast('⚡ BOSS SLAIN — DESCENT SHAFT UNLOCKED! ⚡', '#ffd700', true);
        setTimeout(() => {
          if (this._running && !this._isTransitioning && gameStore.getState().run.active) {
            this._showObjectiveToast('STEP THROUGH NORTH BLAST DOOR TO DESCEND', '#00e5ff', true);
          }
        }, 3200);
      }

      // Phase 6: Milestone skill reward on Elite victory
      if (this._currentRoomType === ROOM_TYPE.ELITE) {
        const choices = SkillManager.getAvailableChoices(3);
        if (choices.length > 0) {
          this._setRunning(false);
          this._ui.showSkillSelection(choices, (chosenId) => {
            if (chosenId) SkillManager.selectSkill(chosenId);
            this._setRunning(true);
            this._saveCheckpoint();
          });
        }
      }
    }

    // ── Door crossing → enter neighbor room ────────────────────────────
    // Check each open exit door for the player crossing the threshold
    if (this._roomCleared && this._room3d && !this._isTransitioning) {
      const node = this._graph.getRoom(gameStore.getState().run.roomIndex);
      if (node) {
        for (let i = 0; i < this._room3d._doors.length; i++) {
          if (!this._room3d.isDoorOpen(i)) continue;
          const doorPos = this._room3d.getDoorPos(i);
          const dist = Math.hypot(this._player.x - doorPos.x, this._player.z - doorPos.z);
          if (dist < 1.1) {
            const exit = node.exits[i];
            if (exit) {
              this._enterRoom(exit.toIdx, exit.dir);
            }
            break;
          }
        }
      }
    }

    // ── Player death ───────────────────────────────────────────
    if (gameStore.getState().run.hp <= 0) {
      this._running = false;
      setTimeout(() => this._onPlayerDeath(), 600);
    }

    // ── Camera follow ──────────────────────────────────────────
    this.renderer3d.updateCamera(this._player.x, this._player.z, dt);
  }

  _draw() {
    this.renderer3d.render();
    const { run } = gameStore.getState();
    if (run.active) syncHUD(run);
  }

  // ─── Run lifecycle ───────────────────────────────────────────
  _startNewRun() {
    const seed = (Math.random() * 0xffffff) | 0;
    gameStore.getState().startRun();
    const { run: r } = gameStore.getState();

    this._graph = new RoomGraph(seed, r.floor);
    gameStore.getState().setRouteInfo(this._graph.length, seed);

    // Phase 3: create mission for Floor 1
    this._mission = new MissionManager(r.floor, seed);
    this._bindMissionCallbacks();

    this._loadRoom(0);
    this._ui.hideMainMenu();
    this._ui.showHUD();
    this._setRunning(true);
    this._saveCheckpoint();
  }

  _continueRun() {
    const saved = SaveManager.loadRun();
    if (!saved) return;
    Object.assign(gameStore.getState().run, saved.run);
    const r = gameStore.getState().run;
    this._graph = RoomGraph.restore({ seed: r.routeSeed, floorNum: r.floor });

    // Phase 3: restore mission from saved state
    if (r.missionData) {
      this._mission = MissionManager.restore(r.missionData);
      this._bindMissionCallbacks();
    } else {
      this._mission = new MissionManager(r.floor, r.routeSeed);
      this._bindMissionCallbacks();
    }

    this._loadRoom(r.roomIndex);
    this._ui.hideMainMenu();
    this._ui.showHUD();
    this._setRunning(true);
  }

  _loadRoom(idx, entryDir = 'south') {
    const node = this._graph.getRoom(idx);
    if (!node) return;

    // Clean up previous room
    this._enemies.forEach(e => e.destroy());
    this._bursts = [];
    if (this._player) this._player.destroy();
    if (this._room3d) this._room3d.destroy();

    this._enemies         = [];
    this._roomCleared     = false;
    this._currentRoomType = node.type;
    this._combatStarted   = [ROOM_TYPE.COMBAT, ROOM_TYPE.ELITE, ROOM_TYPE.BOSS].includes(node.type);

    const roomSeed  = (idx * 6271 + (this._graph.seed || 0)) | 0;
    const exitDirs  = node.exits.map(e => e.dir);  // which walls need exit doors

    this._room3d = new Room3D(
      this.renderer3d.scene,
      node.type,
      roomSeed,
      exitDirs,
      entryDir
    );

    this._player = new Player3D(
      this.renderer3d.scene,
      this._room3d.entryPos.x,
      this._room3d.entryPos.z
    );

    gameStore.getState().setRoomIndex(idx);  // track current node for graph nav
    this._spawnForRoom(node.type, idx);

    sound.startAmbientDrone?.();
    if (node.type === ROOM_TYPE.BOSS) {
      sound.playBossAlert?.();
    }

    // Phase 3: mission events
    if (this._mission) {
      this._mission.enterRoom(node.type, roomSeed);
      this._syncMissionHUD();
      if (node.type === ROOM_TYPE.BOSS) {
        this._mission.fireEvent('boss_reached');
        this._syncMissionHUD();
      }
    }

    const nonCombat = [ROOM_TYPE.SAFE, ROOM_TYPE.SHOP, ROOM_TYPE.REST,
                       ROOM_TYPE.MYSTERY, ROOM_TYPE.TREASURE];
    if (nonCombat.includes(node.type)) {
      this._roomCleared = true;
      this._room3d.openAllDoors();
      this.renderer3d.setExitLight(true);
      this._triggerRoomEvent(node.type);
    } else {
      this.renderer3d.setExitLight(false);
    }
  }

  _spawnForRoom(type, idx) {
    const { run }  = gameStore.getState();
    const depth    = idx;
    const routeLen = this._graph.length;
    const floor    = run.floor;
    const W = 18, R = 13;  // new larger room dims

    const randX = () => 2.5 + Math.random() * (W - 5);
    const randZ = () => 2.5 + Math.random() * (R - 5);

    if (type === ROOM_TYPE.COMBAT) {
      const { basic, fast } = spawnCount(depth, routeLen, floor);
      for (let i = 0; i < basic; i++) {
        this._enemies.push(new EnemyBasic3D(
          this.renderer3d.scene, randX(), randZ(), depth, floor
        ));
      }
      for (let i = 0; i < fast; i++) {
        this._enemies.push(new EnemyFast3D(
          this.renderer3d.scene, randX(), randZ(), depth, floor
        ));
      }
    } else if (type === ROOM_TYPE.ELITE) {
      if (Math.random() < 0.5) {
        this._enemies.push(new EliteWarden3D(this.renderer3d.scene, W / 2, R / 2 - 2, floor));
      } else {
        this._enemies.push(new EliteHunter3D(this.renderer3d.scene, W / 2, R / 2 - 2, floor));
      }
    } else if (type === ROOM_TYPE.BOSS) {
      this._enemies.push(new Boss3D(this.renderer3d.scene, W / 2, R / 2 - 2, routeLen, floor));
    }
  }

  _triggerRoomEvent(type) {
    const resume = () => this._setRunning(true);
    if (type === ROOM_TYPE.REST) {
      this._setRunning(false);
      this._ui.showRest(resume);
    } else if (type === ROOM_TYPE.TREASURE) {
      // Treasure chest: free skill upgrade choice
      const choices = SkillManager.getAvailableChoices(3);
      if (choices.length > 0) {
        this._setRunning(false);
        this._ui.showSkillSelection(choices, (chosenId) => {
          if (chosenId) SkillManager.selectSkill(chosenId);
          resume();
          this._saveCheckpoint();
        });
      } else {
        // No more skills — treat as a rest instead
        this._setRunning(false);
        this._ui.showRest(resume);
      }
    } else if (type === ROOM_TYPE.MYSTERY) {
      // Mystery shrine: 3 random risk/reward options
      this._setRunning(false);
      const pool = [...MYSTERY_POOL];
      // Shuffle and pick 3
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const options = pool.slice(0, 3);
      this._ui.showMystery(options, (chosen) => {
        if (chosen) {
          chosen.apply(gameStore.getState());
          // Show feedback toast
          this._showObjectiveToast(`☣ ${chosen.title}`, '#ff80ab');
          this._saveCheckpoint();
        }
        resume();
      });
    } else if (type === ROOM_TYPE.SHOP) {
      // Black market: HP-sacrifice trades
      this._setRunning(false);
      const pool = [...SHOP_POOL];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const offers = pool.slice(0, 4);
      this._ui.showShop(offers, (chosen) => {
        if (chosen) {
          chosen.apply(gameStore.getState());
          this._showObjectiveToast(`◈ ${chosen.title}`, '#ffd54f');
          this._saveCheckpoint();
        }
        resume();
      });
    }
  }

  /** Enter a specific neighboring room by node index. */
  _enterRoom(toIdx, fromDir) {
    if (this._isTransitioning) return;
    this._isTransitioning = true;

    const toNode = this._graph.getRoom(toIdx);
    if (!toNode) {
      // No such node — treat as boss beaten if this was the boss room
      this._onBossDefeated();
      return;
    }

    // entryDir for the destination is the opposite of the exit direction we used
    const entryDir = { north: 'south', south: 'north', east: 'west', west: 'east' }[fromDir] || 'south';

    gameStore.getState().advanceRoom();
    this._fadeEl.style.pointerEvents = 'all';
    this._ui.fadeIn(() => {
      this._loadRoom(toIdx, entryDir);
      this._saveCheckpoint();
      this._ui.fadeOut(() => { this._isTransitioning = false; });
    });
  }

  _onBossDefeated() {
    if (this._isAdvancingFloor) return;
    this._isAdvancingFloor = true;

    // Phase 3: fire boss_killed before advancing floor
    if (this._mission) {
      this._mission.fireEvent('boss_killed');
      this._syncMissionHUD();
    }

    const advance = () => {
      gameStore.getState().nextFloor();
      const newFloor = gameStore.getState().run.floor;
      const newSeed  = (Math.random() * 0xffffff) | 0;
      this._graph = new RoomGraph(newSeed, newFloor);
      gameStore.getState().setRouteInfo(this._graph.length, this._graph.seed);

      // Phase 3: new mission for next floor
      this._mission = new MissionManager(newFloor, newSeed);
      this._bindMissionCallbacks();

      this._fadeEl.style.pointerEvents = 'all';
      this._ui.fadeIn(() => {
        this._loadRoom(0);
        this._saveCheckpoint();
        this._ui.fadeOut(() => {
          this._isTransitioning = false;
          this._isAdvancingFloor = false;
          this._showObjectiveToast(`FLOOR ${newFloor} REACHED`, '#00e5ff', true);
        });
      });
    };

    // Phase 6: Milestone skill reward on Boss victory
    const choices = SkillManager.getAvailableChoices(3);
    if (choices.length > 0) {
      this._setRunning(false);
      this._ui.showSkillSelection(choices, (chosenId) => {
        if (chosenId) SkillManager.selectSkill(chosenId);
        this._setRunning(true);
        advance();
      });
    } else {
      advance();
    }
  }

  _onPlayerDeath() {
    sound.stopAmbientDrone?.();
    this._ui.showGameOver(false);
    SaveManager.clearRun();
    gameStore.getState().endRun();
  }

  _abandonRun() {
    sound.stopAmbientDrone?.();
    this._ui.showGameOver(true);
    SaveManager.clearRun();
    gameStore.getState().endRun();
  }

  _saveAndExit() {
    sound.stopAmbientDrone?.();
    this._saveCheckpoint();
    gameStore.getState().endRun();
  }

  _saveCheckpoint() {
    const { run } = gameStore.getState();
    SaveManager.saveRun({ run });
  }

  // ── Phase 3: Mission helpers ─────────────────────────────────
  _bindMissionCallbacks() {
    if (!this._mission) return;
    this._mission.onFloorProgress((step, total, done) => {
      this._syncMissionHUD();
      const text = done ? 'MISSION OBJECTIVE COMPLETE!' : `OBJECTIVE: ${this._mission.floorStepLabel}`;
      this._showObjectiveToast(text, done ? '#ffe000' : '#00e5ff');
    });
    this._mission.onFloorComplete(() => {
      this._showObjectiveToast('FLOOR MISSION COMPLETE — FIND THE BOSS', '#ffe000', true);
    });
    this._mission.onRoomObjective((label) => {
      this._showObjectiveToast(`✓ ${label}`, '#aaffaa');
      this._syncMissionHUD();
    });
    // Initial HUD sync
    this._syncMissionHUD();
  }

  _saveMission() {
    if (!this._mission) return;
    gameStore.getState().setMissionData(this._mission.serialise());
  }

  _syncMissionHUD() {
    if (!this._mission) return;
    const titleEl = document.getElementById('mission-title');
    const stepEl  = document.getElementById('mission-step');
    const roomEl  = document.getElementById('mission-room-obj');

    if (titleEl) titleEl.textContent = this._mission.floorObjectiveTitle;
    if (stepEl)  stepEl.textContent  = this._mission.floorStepLabel;
    if (roomEl) {
      const lbl  = this._mission.roomObjectiveLabel;
      const done = this._mission.roomObjectiveDone;
      if (lbl) {
        roomEl.textContent = (done ? '✓ ' : '▸ ') + lbl;
        roomEl.style.color = done ? '#aaffaa' : '#cccccc';
        roomEl.style.opacity = '1';
      } else {
        roomEl.style.opacity = '0';
      }
    }
  }

  _showObjectiveToast(text, color = '#00e5ff', big = false) {
    const container = document.getElementById('objective-toast');
    if (!container) return;
    container.textContent = text;
    container.style.color   = color;
    container.style.fontSize = big ? '1.1em' : '0.9em';
    container.style.opacity = '1';
    container.style.transform = 'translateY(0)';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      container.style.opacity   = '0';
      container.style.transform = 'translateY(-8px)';
    }, big ? 3200 : 2200);
  }

  _togglePause() {
    if (!this._running && !this._paused) return;
    if (!gameStore.getState().run.active) return;
    this._paused = !this._paused;
    if (this._paused) this._ui.showPause();
    else this._ui.hideAll();
  }

  _setRunning(v) {
    this._running = v;
    this._paused  = false;
  }
}
