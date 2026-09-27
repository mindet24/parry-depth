/**
 * Pickups.js — EXP crystals and coin drops.
 *
 * Spawned by enemies on death. Collected when the player's
 * pickup radius overlaps the pickup position.
 * Visual: EXP = blue glowing crystal, Coin = gold spinning quad.
 */
import { isoProject, depthKey } from '../core/iso.js';
import { ISO_H, ISO_V, WORLD_SCALE } from '../core/constants.js';

export class Pickup {
  constructor(u, v, type = 'exp', value = 1) {
    this.u = u; this.v = v;
    this.type  = type;   // 'exp' | 'coin'
    this.value = value;
    this.collected = false;
    this._age = 0;
    this._bob = Math.random() * Math.PI * 2;
  }

  get depth() { return depthKey(this.u, this.v) - 0.01; } // below entities

  update(dt, player) {
    if (this.collected) return;
    this._age += dt;

    // Magnet: move toward player when within pickup radius
    const du = player.u - this.u, dv = player.v - this.v;
    // Convert pickup radius (world units) to ground distance
    const pickupR = player.pickupR;
    // Approximate ground distance: world units map roughly as screenPx / ISO_H
    const dist = Math.sqrt(
      (du * ISO_H * 2) ** 2 + (dv * ISO_V * 2) ** 2
    );

    if (dist < pickupR * 0.4) {
      this.collected = true;
      return;
    }
    if (dist < pickupR) {
      // Magnetic attraction
      const spd = 220 / WORLD_SCALE;
      const len = Math.sqrt(du*du + dv*dv) || 1;
      this.u += (du/len) * spd * dt;
      this.v += (dv/len) * spd * dt;
    }
  }

  render(ctx, ox, oy, cx, cy) {
    if (this.collected) return;
    const p = isoProject(this.u, this.v, ox, oy);
    const sx = p.x - cx, sy = p.y - cy;
    const bob = Math.sin(this._age * 4 + this._bob) * 2;

    ctx.save(); ctx.translate(sx, sy + bob);

    if (this.type === 'exp') {
      // Blue crystal
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath(); ctx.ellipse(0, 2, 5, 2.5, 0, 0, Math.PI*2); ctx.fill();
      const glow = ctx.createRadialGradient(0,-6,0,0,-6,10);
      glow.addColorStop(0,'rgba(80,160,255,0.4)');
      glow.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(0,-6,10,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#40a0ff';
      ctx.beginPath(); ctx.moveTo(0,-12); ctx.lineTo(4,-4); ctx.lineTo(0,0); ctx.lineTo(-4,-4); ctx.closePath(); ctx.fill();
      ctx.fillStyle='rgba(180,220,255,0.7)';
      ctx.beginPath(); ctx.moveTo(0,-12); ctx.lineTo(2,-7); ctx.lineTo(0,-5); ctx.lineTo(-2,-7); ctx.closePath(); ctx.fill();
    } else {
      // Gold coin
      ctx.fillStyle='rgba(0,0,0,0.2)';
      ctx.beginPath(); ctx.ellipse(0,2,5,2.5,0,0,Math.PI*2); ctx.fill();
      const glow2 = ctx.createRadialGradient(0,-5,0,0,-5,8);
      glow2.addColorStop(0,'rgba(255,200,40,0.4)'); glow2.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=glow2; ctx.beginPath(); ctx.arc(0,-5,8,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#c09020';
      ctx.beginPath();
      const t = this._age * 3;
      ctx.ellipse(0,-6, Math.abs(Math.cos(t))*5+1, 6, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle='#ffd040';
      ctx.beginPath(); ctx.ellipse(0,-6, Math.abs(Math.cos(t))*3, 4, 0, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }
}
