/**
 * Player.js — Isometric player entity.
 *
 * Handles:
 *   - Ground-plane movement (WASD → ground du/dv, normalised)
 *   - PS1 vertex jitter on foot position
 *   - Walk bob + facing direction
 *   - Collision with room bounds
 *   - Drawing: low-poly armour figure anchored at feet
 *   - Invincibility frames after taking damage (0.6s)
 *
 * Reads live player stats from gameStore on each update so
 * upgrades apply immediately.
 */

import { isoProject, screenToGround, depthKey } from '../core/iso.js';
import { JITTER_AMP, ROOM_COLS, ROOM_ROWS, WORLD_SCALE } from '../core/constants.js';
import { gameStore } from '../state/gameStore.js';

const IFRAMES = 0.6;   // invincibility seconds after hit

export class Player {
  constructor(u = ROOM_COLS / 2, v = ROOM_ROWS - 1.5) {
    this.u = u;
    this.v = v;
    this.facing   = 0;    // radians
    this._walkT   = 0;
    this._bobY    = 0;
    this._moving  = false;
    this._jx      = 0;
    this._jy      = 0;
    this._jTimer  = 0;
    this._iframes = 0;    // invincibility timer
    this._hitFlash= 0;    // red flash timer
  }

  get depth() { return depthKey(this.u, this.v); }

  // ── Getters from store ─────────────────────────────────────
  get speed()   { const r = gameStore.getState().run; return r.baseSpeed + r.runDmgBonus * 0; }
  get pickupR() { return gameStore.getState().run.pickupR; }
  get isAlive() { return gameStore.getState().run.hp > 0; }

  // ─────────────────────────────────────────────────────────────

  /**
   * @param {number} dt
   * @param {import('../core/Input.js').Input} input
   * @param {{ minU,maxU,minV,maxV }} bounds
   */
  update(dt, input, bounds) {
    // Invincibility frames
    if (this._iframes > 0) this._iframes -= dt;
    if (this._hitFlash > 0) this._hitFlash -= dt;

    const raw = input.getRaw();
    const { du, dv } = screenToGround(raw.x, raw.y);
    const len = Math.sqrt(du * du + dv * dv);
    this._moving = len > 0.001;

    if (this._moving) {
      const spd = (gameStore.getState().run.baseSpeed || 150) / WORLD_SCALE;
      const nu = du / len, nv = dv / len;
      this.u += nu * spd * dt;
      this.v += nv * spd * dt;
      this.facing   = Math.atan2(nv, nu);
      this._walkT  += dt * 7;
      this._bobY    = Math.sin(this._walkT) * 1.8;
    } else {
      this._bobY   *= 0.85;
      this._walkT   = 0;
    }

    // Clamp to room
    this.u = Math.max(bounds.minU, Math.min(this.u, bounds.maxU));
    this.v = Math.max(bounds.minV, Math.min(this.v, bounds.maxV));

    // PS1 jitter (~15 fps snap)
    this._jTimer += dt;
    if (this._jTimer > 1/15) {
      this._jTimer = 0;
      this._jx = (Math.random() - 0.5) * JITTER_AMP * 2;
      this._jy = (Math.random() - 0.5) * JITTER_AMP;
    }
  }

  /** Called by enemy collision system. Returns true if damage was applied. */
  hit(amount) {
    if (this._iframes > 0) return false;
    gameStore.getState().takeDamage(amount);
    this._iframes = IFRAMES;
    this._hitFlash = 0.15;
    return true;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} ox  room originX
   * @param {number} oy  room originY
   * @param {number} cx  camX
   * @param {number} cy  camY
   */
  render(ctx, ox, oy, cx, cy) {
    const foot = isoProject(this.u, this.v, ox, oy);
    const sx = foot.x - cx + this._jx;
    const sy = foot.y - cy + this._jy + this._bobY;

    ctx.save();
    ctx.translate(sx, sy);

    // Flash red on hit
    if (this._hitFlash > 0) {
      ctx.globalAlpha = 0.55 + Math.sin(this._hitFlash * 40) * 0.45;
      this._drawShadow(ctx);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      this._drawBody(ctx, true);
    } else {
      this._drawShadow(ctx);
      this._drawBody(ctx, false);
    }

    ctx.restore();
  }

  // ── Draw helpers ──────────────────────────────────────────────
  _drawShadow(ctx) {
    ctx.save();
    ctx.translate(2, 3 - this._bobY * 0.3);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawBody(ctx, flash) {
    const tint = flash ? '#ff2020' : null;

    // Legs
    ctx.fillStyle = tint || '#1c1410';
    ctx.fillRect(-5, -14, 4, 14);
    ctx.fillRect(1, -14, 4, 14);
    ctx.fillStyle = tint || '#2a1e14';
    ctx.fillRect(-5, -4, 4, 4);
    ctx.fillRect(1, -4, 4, 4);

    // Torso
    const tg = flash ? null : ctx.createLinearGradient(-8, -36, 8, -14);
    if (tg) { tg.addColorStop(0,'#3e3028'); tg.addColorStop(0.5,'#2a2018'); tg.addColorStop(1,'#1a1410'); }
    ctx.fillStyle = tint || tg;
    ctx.beginPath();
    ctx.moveTo(-8,-14); ctx.lineTo(8,-14); ctx.lineTo(10,-28); ctx.lineTo(-10,-28);
    ctx.closePath(); ctx.fill();

    // Chest plate highlight
    ctx.fillStyle = 'rgba(100,80,55,0.15)';
    ctx.fillRect(-4,-27,8,5);
    ctx.strokeStyle='rgba(80,65,45,0.3)'; ctx.lineWidth=0.8;
    ctx.beginPath(); ctx.moveTo(-8,-21); ctx.lineTo(8,-21); ctx.stroke();

    // Shoulders
    ctx.fillStyle = tint || '#302418';
    [[[-10,-28],[-14,-24],[-9,-20],[-8,-25]], [[10,-28],[14,-24],[9,-20],[8,-25]]].forEach(pts => {
      ctx.beginPath(); ctx.moveTo(...pts[0]);
      pts.slice(1).forEach(p => ctx.lineTo(...p));
      ctx.closePath(); ctx.fill();
    });

    // Neck
    ctx.fillStyle = tint || '#1e1810';
    ctx.fillRect(-3,-32,6,4);

    // Helmet
    const hg = flash ? null : ctx.createRadialGradient(-2,-38,2,0,-36,9);
    if (hg) { hg.addColorStop(0,'#504030'); hg.addColorStop(1,'#201810'); }
    ctx.fillStyle = tint || hg;
    ctx.beginPath();
    ctx.moveTo(-7,-32); ctx.lineTo(7,-32); ctx.lineTo(8,-36);
    ctx.lineTo(4,-42); ctx.lineTo(-4,-42); ctx.lineTo(-8,-36);
    ctx.closePath(); ctx.fill();

    // Visor
    ctx.fillStyle = '#181210'; ctx.fillRect(-5,-37,10,6);
    ctx.fillStyle = flash ? 'rgba(255,80,80,0.8)' : 'rgba(180,100,30,0.5)';
    ctx.fillRect(-4,-36,8,2);

    // Facing indicator
    const ax = Math.cos(this.facing) * 5, ay = Math.sin(this.facing) * 3.5;
    ctx.fillStyle = flash ? 'rgba(255,80,80,0.7)' : 'rgba(220,160,60,0.6)';
    ctx.beginPath();
    ctx.moveTo(ax,-44+ay);
    ctx.lineTo(ax-2.5-ay*0.5,-47-ax*0.3);
    ctx.lineTo(ax+2.5-ay*0.5,-47-ax*0.3);
    ctx.closePath(); ctx.fill();
  }
}
