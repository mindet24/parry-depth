/**
 * Weapons.js — All 10 weapon implementations.
 *
 * Each weapon is a class with:
 *   update(dt, player, enemies, projectiles)
 *   render(ctx, ox, oy, cx, cy, player)
 *
 * Rank scaling: damage × (1 + 0.20*(rank-1)), cooldown × (1-0.08)^(rank-1)
 *
 * Weapons manage their own projectile/effect lists internally.
 * They call back into the combat manager to deal damage.
 *
 * All weapons auto-attack; no manual fire needed.
 */

import { isoProject, depthKey } from '../core/iso.js';
import { WEAPON_STATS, ISO_H, ISO_V, WEAPON_RANK_DMG_BONUS, WEAPON_RANK_CD_BONUS } from '../core/constants.js';

// ── Helpers ───────────────────────────────────────────────────
function scaledDmg(base, rank, dmgMult = 1, runBonus = 0) {
  return base * (1 + WEAPON_RANK_DMG_BONUS * (rank - 1)) * dmgMult * (1 + runBonus);
}
function scaledCd(base, rank, atkMult = 1) {
  return base * Math.pow(1 - WEAPON_RANK_CD_BONUS, rank - 1) / atkMult;
}
function groundDist(a, b) {
  const du = a.u - b.u, dv = a.v - b.v;
  return Math.sqrt(du*du + dv*dv);
}
function isoSx(u, v, ox, oy, cx, cy) {
  const p = isoProject(u, v, ox, oy);
  return { x: p.x - cx, y: p.y - cy };
}

// ══════════════════════════════════════════════════════════════
//  1. SPINNING BLADE
// ══════════════════════════════════════════════════════════════
export class SpinningBlade {
  constructor(rank = 1) {
    this.rank  = rank;
    this.id    = 'spinBlade';
    this.angle = 0;
    this._lockTimer = 0;
    this._hitSet = new WeakSet();
  }

  update(dt, player, enemies, _proj, dmgMult, atkMult, runBonus) {
    const cfg = WEAPON_STATS.spinBlade;
    const cd  = scaledCd(cfg.cd, this.rank, atkMult);
    this.angle += dt * (2.2 + 0.3 * this.rank);
    this._lockTimer -= dt;

    // Blade position in ground coords
    const r = cfg.range / 60; // convert px to ground units (~ISO_H unit)
    const bu = player.u + Math.cos(this.angle) * r;
    const bv = player.v + Math.sin(this.angle) * r * 0.5;

    if (this._lockTimer <= 0) {
      this._hitSet = new WeakSet();
    }

    for (const e of enemies) {
      if (e.dead || this._hitSet.has(e)) continue;
      if (groundDist({ u:bu, v:bv }, e) < (e.radius / 60 + r * 0.4)) {
        const dmg = scaledDmg(cfg.dmg, this.rank, dmgMult, runBonus);
        e.hp -= dmg;
        this._hitSet.add(e);
        if (this._lockTimer <= 0) this._lockTimer = cd;
        if (e.hp <= 0) e.dead = true;
      }
    }
  }

  render(ctx, ox, oy, cx, cy, player) {
    const cfg = WEAPON_STATS.spinBlade;
    const r   = cfg.range / 60;
    const bu  = player.u + Math.cos(this.angle) * r;
    const bv  = player.v + Math.sin(this.angle) * r * 0.5;
    const sp  = isoSx(bu, bv, ox, oy, cx, cy);

    // Orbit trail
    ctx.strokeStyle = 'rgba(200,180,60,0.2)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * Math.PI * 2 + this.angle;
      const tp = isoSx(player.u + Math.cos(a)*r, player.v + Math.sin(a)*r*0.5, ox, oy, cx, cy);
      i === 0 ? ctx.moveTo(tp.x, tp.y) : ctx.lineTo(tp.x, tp.y);
    }
    ctx.closePath(); ctx.stroke();

    // Blade
    ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(this.angle + Math.PI/4);
    const glow = ctx.createRadialGradient(0,0,0,0,0,9);
    glow.addColorStop(0,'rgba(255,220,60,0.8)'); glow.addColorStop(1,'rgba(200,140,20,0)');
    ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(0,0,9,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#f0d040';
    ctx.beginPath(); ctx.moveTo(0,-8); ctx.lineTo(4,0); ctx.lineTo(0,8); ctx.lineTo(-4,0); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(255,255,200,0.7)';
    ctx.beginPath(); ctx.moveTo(0,-8); ctx.lineTo(2,-3); ctx.lineTo(0,0); ctx.lineTo(-2,-3); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════════════
//  2. HOMING ORB
// ══════════════════════════════════════════════════════════════
export class HomingOrb {
  constructor(rank = 1) {
    this.rank = rank; this.id = 'homingOrb';
    this._cd  = 0;
    this._orbs = [];
  }

  update(dt, player, enemies, _proj, dmgMult, atkMult, runBonus) {
    const cfg = WEAPON_STATS.homingOrb;
    const cd  = scaledCd(cfg.cd, this.rank, atkMult);
    this._cd -= dt;

    // Find nearest living enemy
    const nearest = enemies.filter(e => !e.dead)
      .sort((a,b) => groundDist(a,player) - groundDist(b,player))[0];

    if (this._cd <= 0 && nearest) {
      this._cd = cd;
      this._orbs.push({
        u: player.u, v: player.v,
        targetId: nearest,
        age: 0, hit: false,
      });
    }

    // Update orbs
    for (const orb of this._orbs) {
      if (orb.hit) continue;
      orb.age += dt;
      const target = orb.targetId;
      if (!target || target.dead) { orb.hit = true; continue; }
      const du = target.u - orb.u, dv = target.v - orb.v;
      const len = Math.sqrt(du*du+dv*dv)||1;
      const spd = cfg.speed / 60;
      orb.u += (du/len)*spd*dt;
      orb.v += (dv/len)*spd*dt;
      if (groundDist(orb, target) < target.radius/60 + 0.2) {
        const dmg = scaledDmg(cfg.dmg, this.rank, dmgMult, runBonus);
        target.hp -= dmg;
        if (target.hp <= 0) target.dead = true;
        orb.hit = true;
      }
      if (orb.age > 4) orb.hit = true;
    }
    this._orbs = this._orbs.filter(o => !o.hit);
  }

  render(ctx, ox, oy, cx, cy) {
    for (const orb of this._orbs) {
      const sp = isoSx(orb.u, orb.v, ox, oy, cx, cy);
      const g = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 10);
      g.addColorStop(0,'rgba(140,60,255,0.9)'); g.addColorStop(1,'rgba(80,20,200,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(sp.x,sp.y,10,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(200,150,255,0.8)';
      ctx.beginPath(); ctx.arc(sp.x,sp.y,4,0,Math.PI*2); ctx.fill();
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  3. LIGHTNING CHAIN
// ══════════════════════════════════════════════════════════════
export class LightningChain {
  constructor(rank = 1) {
    this.rank = rank; this.id = 'lightChain';
    this._cd = 0; this._bolts = [];
  }

  update(dt, player, enemies, _proj, dmgMult, atkMult, runBonus) {
    const cfg = WEAPON_STATS.lightChain;
    const cd  = scaledCd(cfg.cd, this.rank, atkMult);
    this._cd -= dt;
    this._bolts = this._bolts.filter(b => b.age < 0.2);
    this._bolts.forEach(b => b.age += dt);

    if (this._cd <= 0) {
      const living = enemies.filter(e => !e.dead)
        .sort((a,b) => groundDist(a,player) - groundDist(b,player));
      if (living.length === 0) return;
      this._cd = cd;

      const maxTargets = Math.min(cfg.targets + (this.rank > 3 ? 1 : 0), living.length);
      const targets = living.slice(0, maxTargets);
      const dmg = scaledDmg(cfg.dmg, this.rank, dmgMult, runBonus);
      const chain = [player]; // start from player
      for (const t of targets) {
        chain.push(t);
        t.hp -= dmg;
        if (t.hp <= 0) t.dead = true;
      }
      this._bolts.push({ chain, age: 0 });
    }
  }

  render(ctx, ox, oy, cx, cy, player) {
    for (const bolt of this._bolts) {
      const alpha = 1 - bolt.age / 0.2;
      ctx.strokeStyle = `rgba(180,160,255,${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 6; ctx.shadowColor = 'rgba(160,120,255,0.8)';
      const pts = bolt.chain;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b2 = pts[i+1];
        const ap = isoSx(a.u ?? player.u, a.v ?? player.v, ox, oy, cx, cy);
        const bp = isoSx(b2.u, b2.v, ox, oy, cx, cy);
        ctx.beginPath();
        // Jagged bolt
        const mx = (ap.x + bp.x)/2 + (Math.random()-0.5)*12;
        const my = (ap.y + bp.y)/2 + (Math.random()-0.5)*6;
        ctx.moveTo(ap.x, ap.y); ctx.lineTo(mx, my); ctx.lineTo(bp.x, bp.y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  4. THORN AURA
// ══════════════════════════════════════════════════════════════
export class ThornAura {
  constructor(rank = 1) {
    this.rank = rank; this.id = 'thornAura';
    this._timers = new Map(); // enemy → last hit timer
    this._pulse = 0;
  }

  update(dt, player, enemies, _proj, dmgMult, atkMult, runBonus) {
    const cfg = WEAPON_STATS.thornAura;
    const cd  = scaledCd(cfg.cd, this.rank, atkMult);
    const r   = cfg.range / 60;
    this._pulse = (this._pulse + dt * 2) % (Math.PI * 2);

    for (const e of enemies) {
      if (e.dead) continue;
      const dist = groundDist(e, player);
      if (dist <= r) {
        const last = this._timers.get(e) || 0;
        if (last >= cd) {
          const dmg = scaledDmg(cfg.dmg, this.rank, dmgMult, runBonus);
          e.hp -= dmg;
          this._timers.set(e, 0);
          if (e.hp <= 0) e.dead = true;
        } else {
          this._timers.set(e, last + dt);
        }
      }
    }
  }

  render(ctx, ox, oy, cx, cy, player) {
    const cfg = WEAPON_STATS.thornAura;
    const r   = cfg.range / 60;
    const sp  = isoProject(player.u, player.v, ox, oy);
    const sx  = sp.x - cx, sy = sp.y - cy;
    const rx  = r * ISO_H, ry = rx * 0.5;
    const pulse = 0.5 + 0.2 * Math.sin(this._pulse);

    ctx.beginPath(); ctx.ellipse(sx, sy, rx * (1 + 0.05*Math.sin(this._pulse)), ry * (1 + 0.05*Math.sin(this._pulse)), 0, 0, Math.PI*2);
    ctx.strokeStyle = `rgba(40,200,60,${pulse * 0.5})`;
    ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = `rgba(20,140,40,${pulse * 0.06})`; ctx.fill();

    // Thorn spikes
    const spikes = 8 + this.rank * 2;
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2 + this._pulse * 0.3;
      const tx = sx + Math.cos(a) * rx;
      const ty = sy + Math.sin(a) * ry;
      ctx.fillStyle = `rgba(60,200,80,${0.5 + pulse * 0.3})`;
      ctx.beginPath();
      ctx.moveTo(tx + Math.cos(a)*4, ty + Math.sin(a)*2);
      ctx.lineTo(tx + Math.cos(a+0.3)*2, ty + Math.sin(a+0.3));
      ctx.lineTo(tx + Math.cos(a-0.3)*2, ty + Math.sin(a-0.3));
      ctx.closePath(); ctx.fill();
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  5. BOOMERANG AXE
// ══════════════════════════════════════════════════════════════
export class BoomerangAxe {
  constructor(rank = 1) {
    this.rank = rank; this.id = 'boomerang';
    this._cd = 0; this._axes = [];
  }

  update(dt, player, enemies, _proj, dmgMult, atkMult, runBonus) {
    const cfg = WEAPON_STATS.boomerang;
    const cd  = scaledCd(cfg.cd, this.rank, atkMult);
    this._cd -= dt;

    if (this._cd <= 0 && enemies.some(e => !e.dead)) {
      this._cd = cd;
      const nearest = enemies.filter(e=>!e.dead)
        .sort((a,b)=>groundDist(a,player)-groundDist(b,player))[0];
      if (nearest) {
        const du = nearest.u - player.u, dv = nearest.v - player.v;
        const len = Math.sqrt(du*du+dv*dv)||1;
        this._axes.push({
          u: player.u, v: player.v,
          du: du/len, dv: dv/len,
          phase: 'out', // 'out' | 'return'
          dist: 0, maxDist: cfg.range / 60,
          hitSet: new WeakSet(), age: 0,
          angle: 0,
        });
      }
    }

    for (const ax of this._axes) {
      ax.age += dt; ax.angle += dt * 8;
      const spd = cfg.speed / 60;
      if (ax.phase === 'out') {
        ax.u += ax.du * spd * dt;
        ax.v += ax.dv * spd * dt;
        ax.dist += spd * dt;
        if (ax.dist >= ax.maxDist) ax.phase = 'return';
      } else {
        const du = player.u - ax.u, dv = player.v - ax.v;
        const len = Math.sqrt(du*du+dv*dv)||1;
        ax.u += (du/len)*spd*1.3*dt;
        ax.v += (dv/len)*spd*1.3*dt;
        if (groundDist(ax, player) < 0.3) ax.age = 99;
      }
      // Hit enemies
      for (const e of enemies) {
        if (e.dead || ax.hitSet.has(e)) continue;
        if (groundDist(ax, e) < e.radius/60 + 0.3) {
          const dmg = scaledDmg(cfg.dmg, this.rank, dmgMult, runBonus);
          e.hp -= dmg; ax.hitSet.add(e);
          if (e.hp <= 0) e.dead = true;
        }
      }
    }
    this._axes = this._axes.filter(ax => ax.age < 5);
  }

  render(ctx, ox, oy, cx, cy) {
    for (const ax of this._axes) {
      const sp = isoSx(ax.u, ax.v, ox, oy, cx, cy);
      ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(ax.angle);
      ctx.fillStyle='#c08020';
      ctx.beginPath();
      ctx.moveTo(-10,0); ctx.lineTo(0,-4); ctx.lineTo(10,0); ctx.lineTo(0,4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle='rgba(255,180,60,0.6)';
      ctx.beginPath(); ctx.moveTo(-8,0); ctx.lineTo(0,-2); ctx.lineTo(8,0); ctx.lineTo(0,2); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  6. GHOST COMPANION
// ══════════════════════════════════════════════════════════════
export class GhostCompanion {
  constructor(rank = 1) {
    this.rank = rank; this.id = 'ghost';
    this._cd = 0; this._u = 0; this._v = 0;
    this._state = 'follow'; // 'follow' | 'dash'
    this._dashTimer = 0;
    this._dashDu = 0; this._dashDv = 0;
    this._target = null;
    this._hitInDash = false;
  }

  update(dt, player, enemies, _proj, dmgMult, atkMult, runBonus) {
    const cfg = WEAPON_STATS.ghost;
    const cd  = scaledCd(cfg.cd, this.rank, atkMult);
    const seekR = cfg.range / 60;

    if (this._state === 'follow') {
      // Float behind player
      const tu = player.u - 1.2, tv = player.v - 0.6;
      this._u += (tu - this._u) * 4 * dt;
      this._v += (tv - this._v) * 4 * dt;
      this._cd -= dt;

      if (this._cd <= 0) {
        const target = enemies.filter(e => !e.dead && groundDist(e, player) < seekR)
          .sort((a,b)=>groundDist(a,player)-groundDist(b,player))[0];
        if (target) {
          this._cd = cd;
          this._target = target;
          const du = target.u - this._u, dv = target.v - this._v;
          const len = Math.sqrt(du*du+dv*dv)||1;
          this._dashDu = du/len; this._dashDv = dv/len;
          this._state = 'dash'; this._dashTimer = 0.4; this._hitInDash = false;
        }
      }
    } else {
      this._u += this._dashDu * 10 * dt;
      this._v += this._dashDv * 10 * dt;
      this._dashTimer -= dt;

      if (!this._hitInDash && this._target && !this._target.dead) {
        if (groundDist({ u:this._u, v:this._v }, this._target) < this._target.radius/60 + 0.3) {
          const dmg = scaledDmg(cfg.dmg, this.rank, dmgMult, runBonus);
          this._target.hp -= dmg;
          this._hitInDash = true;
          if (this._target.hp <= 0) this._target.dead = true;
        }
      }
      if (this._dashTimer <= 0) this._state = 'follow';
    }
  }

  render(ctx, ox, oy, cx, cy) {
    const sp = isoSx(this._u, this._v, ox, oy, cx, cy);
    const bob = Math.sin(Date.now() / 300) * 3;
    ctx.save(); ctx.translate(sp.x, sp.y + bob);
    const alpha = this._state === 'dash' ? 0.9 : 0.6;
    const glow = ctx.createRadialGradient(0,-8,0,0,-8,14);
    glow.addColorStop(0,`rgba(200,220,255,${alpha})`);
    glow.addColorStop(1,'rgba(100,150,255,0)');
    ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(0,-8,14,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=`rgba(220,230,255,${alpha})`;
    ctx.beginPath(); ctx.moveTo(0,-18); ctx.lineTo(7,-6); ctx.lineTo(5,2);
    ctx.lineTo(-5,2); ctx.lineTo(-7,-6); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(60,80,255,0.8)';
    ctx.beginPath(); ctx.arc(-3,-12,2,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( 3,-12,2,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════════════
//  7. METEOR CALL
// ══════════════════════════════════════════════════════════════
export class MeteorCall {
  constructor(rank = 1) {
    this.rank = rank; this.id = 'meteor';
    this._cd = 0; this._meteors = [];
  }

  update(dt, player, enemies, _proj, dmgMult, atkMult, runBonus) {
    const cfg = WEAPON_STATS.meteor;
    const cd  = scaledCd(cfg.cd, this.rank, atkMult);
    this._cd -= dt;

    if (this._cd <= 0 && enemies.some(e => !e.dead)) {
      this._cd = cd;
      const target = enemies.filter(e=>!e.dead)
        .sort((a,b)=>groundDist(a,player)-groundDist(b,player))[0];
      if (target) {
        this._meteors.push({
          u: target.u + (Math.random()-0.5), v: target.v + (Math.random()-0.5)*0.5,
          warn: cfg.warn, timer: cfg.warn + 0.3,
          exploded: false, r: cfg.range,
          dmg: scaledDmg(cfg.dmg, this.rank, dmgMult, runBonus),
        });
      }
    }

    for (const m of this._meteors) {
      m.timer -= dt;
      if (!m.exploded && m.timer <= m.warn - m.warn) {
        // Explode at t=0
      }
      if (!m.exploded && m.timer <= 0) {
        m.exploded = true;
        const r2 = m.r / 60;
        for (const e of enemies) {
          if (e.dead) continue;
          if (groundDist({ u:m.u, v:m.v }, e) < r2 + e.radius/60) {
            e.hp -= m.dmg;
            if (e.hp <= 0) e.dead = true;
          }
        }
      }
    }
    this._meteors = this._meteors.filter(m => m.timer > -0.4);
  }

  render(ctx, ox, oy, cx, cy) {
    for (const m of this._meteors) {
      const sp = isoSx(m.u, m.v, ox, oy, cx, cy);
      const warnFrac = Math.max(0, m.timer) / m.warn;
      const rx = m.r * ISO_H / 40, ry = rx * 0.5;

      if (!m.exploded) {
        // Warning circle
        ctx.beginPath(); ctx.ellipse(sp.x, sp.y, rx, ry, 0, 0, Math.PI*2);
        ctx.fillStyle = `rgba(255,100,20,${(1-warnFrac)*0.2})`; ctx.fill();
        ctx.strokeStyle = `rgba(255,100,20,${0.4 + (1-warnFrac)*0.5})`; ctx.lineWidth=1.5; ctx.stroke();
        // Incoming meteor
        const h = warnFrac * 60;
        ctx.fillStyle = `rgba(255,140,40,${0.5 + (1-warnFrac)*0.3})`;
        ctx.beginPath(); ctx.arc(sp.x, sp.y - h, 6 + (1-warnFrac)*4, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle='rgba(255,200,100,0.4)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(sp.x, sp.y-h); ctx.lineTo(sp.x, sp.y); ctx.stroke();
      } else {
        // Explosion
        const ef = 1 - (m.timer/-0.4);
        const er = rx * (1 + ef * 0.5);
        const g = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, er);
        g.addColorStop(0, `rgba(255,220,80,${(1-ef)*0.7})`);
        g.addColorStop(0.5, `rgba(255,80,20,${(1-ef)*0.4})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(sp.x, sp.y, er, er*0.5, 0, 0, Math.PI*2); ctx.fill();
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  8. WHIP CRACK
// ══════════════════════════════════════════════════════════════
export class WhipCrack {
  constructor(rank = 1) {
    this.rank = rank; this.id = 'whipCrack';
    this._cd = 0; this._swings = [];
  }

  update(dt, player, enemies, _proj, dmgMult, atkMult, runBonus) {
    const cfg = WEAPON_STATS.whipCrack;
    const cd  = scaledCd(cfg.cd, this.rank, atkMult);
    this._cd -= dt;

    if (this._cd <= 0) {
      this._cd = cd;
      const arc = (cfg.arc / 180) * Math.PI;
      const dir = player.facing || 0;
      const r   = cfg.range / 60;
      const hitSet = new Set();
      let hits = 0;
      for (const e of enemies) {
        if (e.dead || hits >= 3) continue;
        const eu = e.u - player.u, ev = e.v - player.v;
        const eDist = Math.sqrt(eu*eu+ev*ev);
        if (eDist > r) continue;
        const eAngle = Math.atan2(ev, eu);
        let diff = Math.abs(eAngle - dir);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff <= arc / 2) {
          const dmg = scaledDmg(cfg.dmg, this.rank, dmgMult, runBonus);
          e.hp -= dmg; hits++;
          if (e.hp <= 0) e.dead = true;
        }
      }
      this._swings.push({ dir, r, arc, age: 0 });
    }
    this._swings = this._swings.filter(s => { s.age += dt; return s.age < 0.25; });
  }

  render(ctx, ox, oy, cx, cy, player) {
    for (const s of this._swings) {
      const alpha = 1 - s.age / 0.25;
      const sp = isoSx(player.u, player.v, ox, oy, cx, cy);
      const rx = s.r * ISO_H, ry = rx * 0.5;
      // Draw arc
      ctx.strokeStyle = `rgba(220,200,60,${alpha * 0.8})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, rx, ry, 0, s.dir - s.arc/2, s.dir + s.arc/2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,240,120,${alpha * 0.4})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  9. TURRET DRONE (meta-unlock Lv5)
// ══════════════════════════════════════════════════════════════
export class TurretDrone {
  constructor(rank = 1) {
    this.rank = rank; this.id = 'turretDrone';
    this._cd = 0; this._angle = 0; this._shots = [];
  }

  update(dt, player, enemies, _proj, dmgMult, atkMult, runBonus) {
    const cfg = WEAPON_STATS.turretDrone;
    const cd  = scaledCd(cfg.cd, this.rank, atkMult);
    this._cd -= dt; this._angle += dt * 1.5;

    // Drone hovers offset from player
    const du = player.u + Math.cos(this._angle) * 1.5;
    const dv = player.v + Math.sin(this._angle) * 0.75;
    this._droneU = du; this._droneV = dv;

    if (this._cd <= 0) {
      const target = enemies.filter(e=>!e.dead)
        .sort((a,b)=>groundDist(a,player)-groundDist(b,player))[0];
      if (target) {
        this._cd = cd;
        const tdu = target.u - du, tdv = target.v - dv;
        const len = Math.sqrt(tdu*tdu+tdv*tdv)||1;
        this._shots.push({ u:du, v:dv, du:tdu/len, dv:tdv/len, age:0, target,
          dmg: scaledDmg(cfg.dmg, this.rank, dmgMult, runBonus) });
      }
    }

    for (const s of this._shots) {
      s.age += dt;
      const spd = cfg.speed / 60;
      s.u += s.du * spd * dt; s.v += s.dv * spd * dt;
      if (!s.target.dead && groundDist(s, s.target) < s.target.radius/60 + 0.2) {
        s.target.hp -= s.dmg; if (s.target.hp <= 0) s.target.dead = true;
        s.age = 99;
      }
    }
    this._shots = this._shots.filter(s => s.age < 3);
  }

  render(ctx, ox, oy, cx, cy) {
    // Drone
    const dp = isoSx(this._droneU || 0, this._droneV || 0, ox, oy, cx, cy);
    ctx.save(); ctx.translate(dp.x, dp.y - 8);
    ctx.fillStyle='#203050'; ctx.fillRect(-8,-5,16,10);
    ctx.fillStyle='#4080c0'; ctx.fillRect(-6,-3,12,6);
    ctx.fillStyle='rgba(80,160,255,0.7)';
    ctx.beginPath(); ctx.arc(0,0,3,0,Math.PI*2); ctx.fill();
    ctx.restore();
    // Shots
    for (const s of this._shots) {
      const sp = isoSx(s.u, s.v, ox, oy, cx, cy);
      ctx.fillStyle='rgba(100,200,255,0.8)';
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 3, 0, Math.PI*2); ctx.fill();
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  10. POISON CLOUD (meta-unlock Lv15)
// ══════════════════════════════════════════════════════════════
export class PoisonCloud {
  constructor(rank = 1) {
    this.rank = rank; this.id = 'poisonCloud';
    this._cd = 0; this._clouds = [];
  }

  update(dt, player, enemies, _proj, dmgMult, atkMult, runBonus) {
    const cfg = WEAPON_STATS.poisonCloud;
    const cd  = scaledCd(cfg.cd, this.rank, atkMult);
    this._cd -= dt;

    if (this._cd <= 0 && enemies.some(e=>!e.dead)) {
      this._cd = cd * 3; // spawn every 1.5s
      const target = enemies.filter(e=>!e.dead)
        .sort((a,b)=>groundDist(a,player)-groundDist(b,player))[0];
      if (target) {
        this._clouds.push({
          u: target.u + (Math.random()-0.5), v: target.v + (Math.random()-0.5)*0.5,
          life: cfg.lifetime, r: cfg.range / 60, tick: 0,
          dmg: scaledDmg(cfg.dmg, this.rank, dmgMult, runBonus),
        });
      }
    }

    for (const c of this._clouds) {
      c.life -= dt; c.tick += dt;
      if (c.tick >= 0.5) { // tick every 0.5s
        c.tick = 0;
        for (const e of enemies) {
          if (e.dead) continue;
          if (groundDist({ u:c.u, v:c.v }, e) < c.r + e.radius/60) {
            e.hp -= c.dmg;
            if (e.hp <= 0) e.dead = true;
          }
        }
      }
    }
    this._clouds = this._clouds.filter(c => c.life > 0);
  }

  render(ctx, ox, oy, cx, cy) {
    for (const c of this._clouds) {
      const sp = isoSx(c.u, c.v, ox, oy, cx, cy);
      const lifeFrac = c.life / WEAPON_STATS.poisonCloud.lifetime;
      const alpha = lifeFrac * 0.5;
      const rx = c.r * ISO_H, ry = rx * 0.5;
      const g = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, rx);
      g.addColorStop(0, `rgba(60,200,60,${alpha})`);
      g.addColorStop(0.6, `rgba(30,140,30,${alpha*0.6})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(sp.x, sp.y, rx, ry, 0, 0, Math.PI*2); ctx.fill();
      // Bubble particles
      for (let i = 0; i < 3; i++) {
        const angle = (i/3)*Math.PI*2 + c.life * 2;
        const bx = sp.x + Math.cos(angle) * rx * 0.5;
        const by = sp.y + Math.sin(angle) * ry * 0.5;
        ctx.fillStyle = `rgba(100,220,80,${alpha * 0.8})`;
        ctx.beginPath(); ctx.arc(bx, by, 2.5, 0, Math.PI*2); ctx.fill();
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  EVOLUTIONS
// ══════════════════════════════════════════════════════════════

/** Blade Storm = SpinningBlade + ThornAura → 2 blades + larger thorn */
export class BladeStorm {
  constructor(rank = 1) {
    this.rank = rank; this.id = 'bladeStorm';
    this._blade1 = new SpinningBlade(rank);
    this._blade2 = new SpinningBlade(rank);
    this._thorn  = new ThornAura(rank);
    this._blade2.angle = Math.PI; // offset 180°
  }
  update(dt, player, enemies, proj, dmgMult, atkMult, runBonus) {
    this._blade1.update(dt, player, enemies, proj, dmgMult * 1.2, atkMult, runBonus);
    this._blade2.update(dt, player, enemies, proj, dmgMult * 1.2, atkMult, runBonus);
    this._thorn.update(dt, player, enemies, proj, dmgMult * 0.8, atkMult, runBonus);
  }
  render(ctx, ox, oy, cx, cy, player) {
    this._blade1.render(ctx, ox, oy, cx, cy, player);
    this._blade2.render(ctx, ox, oy, cx, cy, player);
    this._thorn.render(ctx, ox, oy, cx, cy, player);
  }
}

/** Void Pull = HomingOrb + MagnetCore → 3 orbs, pulls enemies */
export class VoidPull {
  constructor(rank = 1) {
    this.rank = rank; this.id = 'voidPull';
    this._orbs = [new HomingOrb(rank), new HomingOrb(rank), new HomingOrb(rank)];
    this._orbs[1]._cd = 0.4; this._orbs[2]._cd = 0.8;
  }
  update(dt, player, enemies, proj, dmgMult, atkMult, runBonus) {
    // Pull enemies slightly toward player
    for (const e of enemies) {
      if (e.dead) continue;
      const du = player.u - e.u, dv = player.v - e.v;
      const len = Math.sqrt(du*du+dv*dv)||1;
      e.u += (du/len) * 15 * dt;
      e.v += (dv/len) * 15 * dt;
    }
    this._orbs.forEach(o => o.update(dt, player, enemies, proj, dmgMult * 1.3, atkMult, runBonus));
  }
  render(ctx, ox, oy, cx, cy, player) {
    this._orbs.forEach(o => o.render(ctx, ox, oy, cx, cy, player));
  }
}

// ── Factory ───────────────────────────────────────────────────
export function createWeapon(id, rank = 1) {
  const map = {
    spinBlade: SpinningBlade, homingOrb: HomingOrb, lightChain: LightningChain,
    thornAura: ThornAura, boomerang: BoomerangAxe, ghost: GhostCompanion,
    meteor: MeteorCall, whipCrack: WhipCrack, turretDrone: TurretDrone,
    poisonCloud: PoisonCloud, bladeStorm: BladeStorm, voidPull: VoidPull,
  };
  const Cls = map[id];
  return Cls ? new Cls(rank) : null;
}
