/**
 * Enemies.js — All enemy types: Basic, Fast, EliteWarden, EliteHunter, Boss.
 *
 * Every enemy:
 *   - Has (u, v) ground coords, HP, radius
 *   - Implements update(dt, player, room) → drops/events
 *   - Implements render(ctx, ox, oy, cx, cy)
 *   - Has a depth getter for Y-sorting
 *
 * Attack states use a simple FSM:
 *   CHASE → WINDUP → ATTACK → RECOVER
 *
 * Telegraph visuals are drawn on the floor BEFORE the attack lands.
 */

import { isoProject, depthKey } from '../core/iso.js';
import { ENEMY, ISO_H, ISO_V, WORLD_SCALE } from '../core/constants.js';

// ── Base enemy ────────────────────────────────────────────────
class BaseEnemy {
  constructor(u, v) {
    this.u = u; this.v = v;
    this.hp = 0; this.maxHp = 0;
    this.speed = 0; this.radius = 10;
    this.contactDmg = 0;
    this.dead = false;
    this.state = 'chase';
    this.stateTimer = 0;
    this._jx = 0; this._jy = 0; this._jt = 0;
    this.expDrop  = 3;
    this.coinDrop = 1;
  }
  get depth() { return depthKey(this.u, this.v); }

  /** Screen position of this enemy's foot. */
  screenPos(ox, oy) { return isoProject(this.u, this.v, ox, oy); }

  /** Ground-space distance² to player. */
  dist2(player) {
    const du = this.u - player.u, dv = this.v - player.v;
    return du*du + dv*dv;
  }

  /** Keep enemy within room bounds. */
  clampToBounds() {
    this.u = Math.max(0.8, Math.min(this.u, 11.2));
    this.v = Math.max(0.8, Math.min(this.v, 7.2));
  }

  /** Move toward player at given speed (scaled to ground units/s). */
  _moveToward(dt, player, spd) {
    const du = player.u - this.u, dv = player.v - this.v;
    const len = Math.sqrt(du*du + dv*dv);
    if (len > 0.01) {
      const gSpd = (spd || 45) / WORLD_SCALE;
      this.u += (du/len) * gSpd * dt;
      this.v += (dv/len) * gSpd * dt;
    }
    this.clampToBounds();
  }

  /** PS1 jitter update. */
  _updateJitter(dt) {
    this._jt += dt;
    if (this._jt > 1/12) {
      this._jt = 0;
      this._jx = (Math.random() - 0.5) * 0.3;
      this._jy = (Math.random() - 0.5) * 0.15;
    }
  }

  /** Draw floor telegraph circle (world-unit radius, at enemy u/v). */
  _telegraph(ctx, ox, oy, cx, cy, worldRadius, color = 'rgba(220,60,30,0.45)', fill = 'rgba(220,60,30,0.10)') {
    const p = isoProject(this.u, this.v, ox, oy);
    const sx = p.x - cx, sy = p.y - cy;
    // Isometric ellipse approximating the circle on the ground plane
    const rx = worldRadius * ISO_H / 40;
    const ry = rx * 0.5;
    ctx.beginPath();
    ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI*2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

// ── HP scaling formula ────────────────────────────────────────
function scaledHp(baseHp, roomDepth, floorNum) {
  return Math.round(baseHp *
    (1 + 0.10 * Math.floor((roomDepth - 1) / 2)) *
    (1 + 0.08 * (floorNum - 1)));
}

// ══════════════════════════════════════════════════════════════
//  BASIC ENEMY
// ══════════════════════════════════════════════════════════════
export class EnemyBasic extends BaseEnemy {
  constructor(u, v, roomDepth = 1, floorNum = 1) {
    super(u, v);
    const cfg     = ENEMY.basic;
    this.maxHp    = scaledHp(cfg.hp, roomDepth, floorNum);
    this.hp       = this.maxHp;
    this.speed    = cfg.speed;
    this.radius   = cfg.radius;
    this.contactDmg = cfg.dmg;
    this._lunge_cd  = cfg.lunge_cd;
    this._lunge_t   = 0;
    this.expDrop    = 4;
    this.coinDrop   = 1;
    // Lunge target position
    this._lungeTargetU = 0;
    this._lungeTargetV = 0;
    this._lungeDu = 0; this._lungeDv = 0;
  }

  update(dt, player) {
    if (this.dead) return;
    this._updateJitter(dt);

    switch (this.state) {
      case 'chase':
        this._moveToward(dt, player, this.speed);
        this._lunge_t += dt;
        if (this._lunge_t >= this._lunge_cd) {
          this._lunge_t = 0;
          this._lungeTargetU = player.u;
          this._lungeTargetV = player.v;
          const du = player.u - this.u, dv = player.v - this.v;
          const len = Math.sqrt(du*du+dv*dv) || 1;
          this._lungeDu = du/len; this._lungeDv = dv/len;
          this.state = 'windup'; this.stateTimer = ENEMY.basic.lunge_warn;
        }
        break;

      case 'windup':
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) { this.state = 'attack'; this.stateTimer = ENEMY.basic.lunge_dur; }
        break;

      case 'attack': {
        const spd = (this.speed * 2.2) / WORLD_SCALE;
        this.u += this._lungeDu * spd * dt;
        this.v += this._lungeDv * spd * dt;
        this.clampToBounds();
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) { this.state = 'recover'; this.stateTimer = ENEMY.basic.lunge_rec; }
        break;
      }

      case 'recover':
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.state = 'chase';
        break;
    }
  }

  render(ctx, ox, oy, cx, cy) {
    if (this.dead) return;
    const p = isoProject(this.u, this.v, ox, oy);
    const sx = p.x - cx + this._jx, sy = p.y - cy + this._jy;

    // Telegraph
    if (this.state === 'windup') {
      this._telegraph(ctx, ox, oy, cx, cy, 55,
        `rgba(220,80,30,${0.5 + (1 - this.stateTimer / ENEMY.basic.lunge_warn) * 0.4})`);
    }

    ctx.save(); ctx.translate(sx, sy);
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(1, 2, 9, 4.5, 0, 0, Math.PI*2); ctx.fill();
    // Body — angular low-poly pursuer
    const hpFrac = this.hp / this.maxHp;
    const r = 180 + (1 - hpFrac) * 60 | 0;
    ctx.fillStyle = `rgb(${r},40,30)`;
    ctx.beginPath();
    ctx.moveTo(0,-22); ctx.lineTo(8,-8); ctx.lineTo(0,-2); ctx.lineTo(-8,-8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,80,60,0.5)';
    ctx.beginPath();
    ctx.moveTo(0,-22); ctx.lineTo(5,-14); ctx.lineTo(0,-10); ctx.lineTo(-5,-14);
    ctx.closePath(); ctx.fill();
    // Eyes
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath(); ctx.arc(-3,-16,2,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( 3,-16,2,0,Math.PI*2); ctx.fill();
    // HP bar
    this._hpBar(ctx, hpFrac);
    ctx.restore();
  }

  _hpBar(ctx, frac) {
    const w = 20, h = 2;
    ctx.fillStyle = '#200000'; ctx.fillRect(-w/2, -28, w, h);
    ctx.fillStyle = frac > 0.5 ? '#40a040' : frac > 0.25 ? '#c0a020' : '#c02020';
    ctx.fillRect(-w/2, -28, w * frac, h);
  }
}

// ══════════════════════════════════════════════════════════════
//  FAST ENEMY
// ══════════════════════════════════════════════════════════════
export class EnemyFast extends BaseEnemy {
  constructor(u, v, roomDepth = 1, floorNum = 1) {
    super(u, v);
    const cfg = ENEMY.fast;
    this.maxHp = scaledHp(cfg.hp, roomDepth, floorNum);
    this.hp    = this.maxHp;
    this.speed = cfg.speed;
    this.radius = cfg.radius;
    this.contactDmg = cfg.dmg;
    this._dash_cd = cfg.dash_cd;
    this._dash_t  = Math.random() * cfg.dash_cd; // stagger
    this._dashDu  = 0; this._dashDv = 0;
    this.expDrop  = 3;
    this.coinDrop = 1;
    this._angle   = Math.random() * Math.PI * 2; // circling angle
  }

  update(dt, player) {
    if (this.dead) return;
    this._updateJitter(dt);

    switch (this.state) {
      case 'chase': {
        // Circle + approach
        this._angle += dt * 1.4;
        const dist = Math.sqrt(this.dist2(player));
        const targetU = player.u + Math.cos(this._angle) * 2.5;
        const targetV = player.v + Math.sin(this._angle) * 2.5;
        const du2 = targetU - this.u, dv2 = targetV - this.v;
        const len2 = Math.sqrt(du2*du2 + dv2*dv2) || 1;
        const gSpd = (this.speed || 72) / WORLD_SCALE;
        this.u += (du2/len2) * gSpd * dt;
        this.v += (dv2/len2) * gSpd * dt;
        this.clampToBounds();
        this._dash_t += dt;
        if (this._dash_t >= this._dash_cd && dist < 5) {
          this._dash_t = 0;
          const du = player.u - this.u, dv = player.v - this.v;
          const len3 = Math.sqrt(du*du+dv*dv) || 1;
          this._dashDu = du/len3; this._dashDv = dv/len3;
          this.state = 'windup'; this.stateTimer = ENEMY.fast.dash_warn;
        }
        break;
      }
      case 'windup':
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) { this.state = 'attack'; this.stateTimer = ENEMY.fast.dash_dur; }
        break;

      case 'attack': {
        const spd = 160 / WORLD_SCALE;
        this.u += this._dashDu * spd * dt;
        this.v += this._dashDv * spd * dt;
        this.clampToBounds();
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) { this.state = 'recover'; this.stateTimer = ENEMY.fast.dash_rec; }
        break;
      }
      case 'recover':
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.state = 'chase';
        break;
    }
  }

  render(ctx, ox, oy, cx, cy) {
    if (this.dead) return;
    const p = isoProject(this.u, this.v, ox, oy);
    const sx = p.x - cx + this._jx, sy = p.y - cy + this._jy;

    if (this.state === 'windup') {
      const f = 1 - this.stateTimer / ENEMY.fast.dash_warn;
      // Draw dash trajectory line
      const ep = isoProject(this.u + this._dashDu * 3, this.v + this._dashDv * 3, ox, oy);
      ctx.strokeStyle = `rgba(100,180,255,${0.3 + f * 0.5})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ep.x - cx, ep.y - cy);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.save(); ctx.translate(sx, sy);
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(1, 2, 7, 3.5, 0, 0, Math.PI*2); ctx.fill();
    // Body — thin diamond
    const hpFrac = this.hp / this.maxHp;
    ctx.fillStyle = `rgb(30,${130 + (1-hpFrac)*80|0},200)`;
    ctx.beginPath();
    ctx.moveTo(0,-18); ctx.lineTo(5,-6); ctx.lineTo(0,2); ctx.lineTo(-5,-6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(150,220,255,0.5)';
    ctx.beginPath();
    ctx.moveTo(0,-17); ctx.lineTo(3,-9); ctx.lineTo(0,-5); ctx.lineTo(-3,-9);
    ctx.closePath(); ctx.fill();
    // Eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(-2,-13,1.5,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( 2,-13,1.5,0,Math.PI*2); ctx.fill();
    this._hpBar(ctx, hpFrac);
    ctx.restore();
  }

  _hpBar(ctx, frac) {
    const w = 16, h = 2;
    ctx.fillStyle = '#000820'; ctx.fillRect(-w/2,-22,w,h);
    ctx.fillStyle = frac > 0.5 ? '#20aaff' : frac > 0.25 ? '#8080ff' : '#ff4080';
    ctx.fillRect(-w/2,-22,w*frac,h);
  }
}

// ══════════════════════════════════════════════════════════════
//  ELITE WARDEN
// ══════════════════════════════════════════════════════════════
export class EliteWarden extends BaseEnemy {
  constructor(u, v, floorNum = 1) {
    super(u, v);
    const cfg = ENEMY.warden;
    this.maxHp = Math.round(cfg.hp * (1 + 0.08 * (floorNum - 1)));
    this.hp    = this.maxHp;
    this.speed = cfg.speed;
    this.radius = cfg.radius;
    this.contactDmg = cfg.dmg;
    this._slam_cd = 3.5;
    this._slam_t  = 1.5;
    this.expDrop  = 20;
    this.coinDrop = 3;
    this._slamU = 0; this._slamV = 0;
  }

  update(dt, player) {
    if (this.dead) return;
    this._updateJitter(dt);
    this._slam_t += dt;

    switch (this.state) {
      case 'chase':
        this._moveToward(dt, player, this.speed);
        if (this._slam_t >= this._slam_cd) {
          this._slam_t = 0;
          this._slamU = player.u; this._slamV = player.v;
          this.state = 'windup'; this.stateTimer = ENEMY.warden.slam_warn;
        }
        break;
      case 'windup':
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          // Deal damage is handled by combat manager checking telegraph
          this.state = 'attack'; this.stateTimer = 0.2;
        }
        break;
      case 'attack':
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) { this.state = 'recover'; this.stateTimer = ENEMY.warden.slam_rec; }
        break;
      case 'recover':
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.state = 'chase';
        break;
    }
  }

  /** Returns active slam zone or null. */
  getSlamZone() {
    if (this.state === 'windup' || this.state === 'attack') {
      return { u: this._slamU, v: this._slamV, r: ENEMY.warden.slam_r,
               dmg: ENEMY.warden.slam_dmg, active: this.state === 'attack' };
    }
    return null;
  }

  render(ctx, ox, oy, cx, cy) {
    if (this.dead) return;
    const p = isoProject(this.u, this.v, ox, oy);
    const sx = p.x - cx, sy = p.y - cy;

    // Draw slam telegraph
    const zone = this.getSlamZone();
    if (zone) {
      const sp = isoProject(zone.u, zone.v, ox, oy);
      const rx = zone.r * ISO_H / 40, ry = rx * 0.5;
      const alpha = zone.active ? 0.7 : 0.3 + (1 - this.stateTimer / ENEMY.warden.slam_warn) * 0.4;
      ctx.beginPath(); ctx.ellipse(sp.x - cx, sp.y - cy, rx, ry, 0, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,120,30,${alpha * 0.2})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(255,120,30,${alpha})`;
      ctx.lineWidth = 1.5; ctx.stroke();
    }

    ctx.save(); ctx.translate(sx, sy);
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(2, 3, 18, 9, 0, 0, Math.PI*2); ctx.fill();
    // Heavy body
    const hpFrac = this.hp / this.maxHp;
    const g = ctx.createLinearGradient(-14,-34,14,0);
    g.addColorStop(0,'#5a3010'); g.addColorStop(0.5,'#3a2008'); g.addColorStop(1,'#1a1004');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0,-40); ctx.lineTo(14,-20); ctx.lineTo(14,0);
    ctx.lineTo(-14,0); ctx.lineTo(-14,-20); ctx.closePath(); ctx.fill();
    // Shoulder guards
    ctx.fillStyle='#6a4018';
    ctx.beginPath(); ctx.moveTo(-14,-20); ctx.lineTo(-22,-12); ctx.lineTo(-18,-2); ctx.lineTo(-14,0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(14,-20); ctx.lineTo(22,-12); ctx.lineTo(18,-2); ctx.lineTo(14,0); ctx.closePath(); ctx.fill();
    // Head
    ctx.fillStyle = '#4a2808';
    ctx.beginPath(); ctx.moveTo(-8,-40); ctx.lineTo(8,-40);
    ctx.lineTo(10,-50); ctx.lineTo(-10,-50); ctx.closePath(); ctx.fill();
    // Eyes glowing orange
    ctx.fillStyle = '#ff8000';
    ctx.beginPath(); ctx.arc(-4,-45,3,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( 4,-45,3,0,Math.PI*2); ctx.fill();
    // HP bar (larger)
    const bw = 32;
    ctx.fillStyle='#200000'; ctx.fillRect(-bw/2,-56,bw,3);
    ctx.fillStyle=hpFrac>0.5?'#c04010':hpFrac>0.25?'#a02008':'#600000';
    ctx.fillRect(-bw/2,-56,bw*hpFrac,3);
    ctx.strokeStyle='#401010'; ctx.lineWidth=0.5; ctx.strokeRect(-bw/2,-56,bw,3);
    // Elite marker
    ctx.fillStyle='rgba(255,100,20,0.7)'; ctx.font='8px VT323,monospace';
    ctx.textAlign='center'; ctx.fillText('★ WARDEN', 0, -60); ctx.textAlign='left';
    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════════════
//  ELITE HUNTER
// ══════════════════════════════════════════════════════════════
export class EliteHunter extends BaseEnemy {
  constructor(u, v, floorNum = 1) {
    super(u, v);
    const cfg = ENEMY.hunter;
    this.maxHp = Math.round(cfg.hp * (1 + 0.08 * (floorNum - 1)));
    this.hp    = this.maxHp;
    this.speed = cfg.speed;
    this.radius = cfg.radius;
    this.contactDmg = cfg.dmg;
    this._dash_cd = 4.0;
    this._dash_t  = 2.0;
    this.expDrop  = 20;
    this.coinDrop = 3;
    this._dashDu = 0; this._dashDv = 0;
    this._dashDmg = cfg.dash_dmg;
    this._dashActive = false;
  }

  get isDashActive() { return this._dashActive; }

  update(dt, player) {
    if (this.dead) return;
    this._updateJitter(dt);
    this._dash_t += dt;

    switch (this.state) {
      case 'chase':
        this._moveToward(dt, player, this.speed);
        if (this._dash_t >= this._dash_cd) {
          this._dash_t = 0;
          const du = player.u - this.u, dv = player.v - this.v;
          const len = Math.sqrt(du*du+dv*dv)||1;
          this._dashDu = du/len; this._dashDv = dv/len;
          this._dashActive = false;
          this.state = 'windup'; this.stateTimer = ENEMY.hunter.dash_warn;
        }
        break;
      case 'windup':
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this._dashActive = true;
          this.state = 'attack'; this.stateTimer = ENEMY.hunter.dash_dur;
        }
        break;
      case 'attack':
        this.u += this._dashDu * ENEMY.hunter.dash_speed * dt;
        this.v += this._dashDv * ENEMY.hunter.dash_speed * dt;
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this._dashActive = false;
          this.state = 'recover'; this.stateTimer = ENEMY.hunter.dash_rec;
        }
        break;
      case 'recover':
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.state = 'chase';
        break;
    }
  }

  render(ctx, ox, oy, cx, cy) {
    if (this.dead) return;
    const p = isoProject(this.u, this.v, ox, oy);
    const sx = p.x - cx, sy = p.y - cy;

    // Dash direction indicator
    if (this.state === 'windup') {
      const f = 1 - this.stateTimer / ENEMY.hunter.dash_warn;
      const tp = isoProject(this.u + this._dashDu * 4, this.v + this._dashDv * 4, ox, oy);
      ctx.strokeStyle = `rgba(180,255,80,${0.3 + f * 0.5})`;
      ctx.lineWidth = 2; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tp.x-cx, tp.y-cy); ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.save(); ctx.translate(sx, sy);
    ctx.fillStyle='rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(1,2,16,8,0,0,Math.PI*2); ctx.fill();
    const hpFrac = this.hp/this.maxHp;
    const g2 = ctx.createLinearGradient(-10,-32,10,0);
    g2.addColorStop(0,'#203a10'); g2.addColorStop(0.5,'#142808'); g2.addColorStop(1,'#0c1c04');
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.moveTo(0,-35); ctx.lineTo(10,-15); ctx.lineTo(8,0); ctx.lineTo(-8,0); ctx.lineTo(-10,-15);
    ctx.closePath(); ctx.fill();
    // Speed streaks when dashing
    if (this.state === 'attack') {
      ctx.strokeStyle = 'rgba(150,255,80,0.5)'; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-this._dashDu*8 + (i-1)*4, -this._dashDv*8 - 10 + i*5);
        ctx.lineTo(-this._dashDu*18 + (i-1)*4, -this._dashDv*18 - 10 + i*5);
        ctx.stroke();
      }
    }
    ctx.fillStyle='#80ff40';
    ctx.beginPath(); ctx.arc(-3,-28,2.5,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( 3,-28,2.5,0,Math.PI*2); ctx.fill();
    const bw = 28;
    ctx.fillStyle='#081800'; ctx.fillRect(-bw/2,-42,bw,3);
    ctx.fillStyle=hpFrac>0.5?'#30b010':hpFrac>0.25?'#90a020':'#c04020';
    ctx.fillRect(-bw/2,-42,bw*hpFrac,3);
    ctx.fillStyle='rgba(100,220,40,0.7)'; ctx.font='8px VT323,monospace';
    ctx.textAlign='center'; ctx.fillText('★ HUNTER', 0, -46); ctx.textAlign='left';
    ctx.restore();
  }
}

// ══════════════════════════════════════════════════════════════
//  BOSS
// ══════════════════════════════════════════════════════════════
export class Boss extends BaseEnemy {
  constructor(u, v, routeLength = 10, floorNum = 1) {
    super(u, v);
    const baseHp = (500 + 30 * routeLength) * (1 + 0.10 * (floorNum - 1));
    this.maxHp = Math.round(baseHp);
    this.hp    = this.maxHp;
    this.speed = 44;
    this.radius = 34;
    this.contactDmg = 12;
    this.expDrop  = 50;
    this.coinDrop = 5;
    this.floorNum = floorNum;
    this.routeLength = routeLength;

    this.phase = 1;   // 1 = >66%, 2 = 33-66%, 3 = <33%
    this._attack_t = 0;
    this._attack_cd = 4.0;
    this._pattern = null;     // current pattern descriptor

    // Boss modifiers (added at Floor 3, 6, 9...)
    this.modifiers = this._buildModifiers(floorNum);
    this._echoTimer = 0;
    this._echoActive = false;
  }

  get isPhase2() { return this.hp / this.maxHp <= 0.66; }
  get isPhase3() { return this.hp / this.maxHp <= 0.33; }

  _buildModifiers(floorNum) {
    const mods = [];
    const allMods = ['echo','afterimage','wave','mark','doublesweep','ring'];
    const slots = Math.min(3, Math.floor((floorNum - 1) / 3));
    for (let i = 0; i < slots; i++) mods.push(allMods[i % allMods.length]);
    return mods;
  }

  update(dt, player, spawnCallback) {
    if (this.dead) return;
    this._updateJitter(dt);

    // Phase transitions
    const newPhase = this.isPhase3 ? 3 : this.isPhase2 ? 2 : 1;
    if (newPhase > this.phase) {
      this.phase = newPhase;
      if (newPhase === 2 && this.modifiers.includes('wave') && spawnCallback) {
        spawnCallback('fast', 2);
      }
    }

    // Slow approach
    this._moveToward(dt, player, this.speed * 0.6);
    this._attack_t += dt;

    const cd = this.phase === 3 ? 2.8 : 3.5;
    if (this._attack_t >= cd && this.state === 'chase') {
      this._attack_t = 0;
      this._startPattern(player);
    }

    if (this.state === 'windup') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.state = 'attack'; this.stateTimer = 0.3;
      }
    } else if (this.state === 'attack') {
      this.stateTimer -= dt;
      if (this._pattern?.type === 'dash') {
        this.u += this._pattern.du * 300 * dt;
        this.v += this._pattern.dv * 300 * dt;
      }
      if (this.stateTimer <= 0) {
        const rec = this.phase === 3 ? 0.75 : 1.0;
        this.state = 'recover'; this.stateTimer = rec;
        // Echo modifier
        if (this._pattern?.type === 'slam' && this.modifiers.includes('echo')) {
          this._echoActive = true;
          this._echoTimer  = 0.90;
          this._echoU = this._pattern.u;
          this._echoV = this._pattern.v;
        }
      }
    } else if (this.state === 'recover') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this._pattern = null;
        this.state = 'chase';
      }
    }

    // Echo timer
    if (this._echoActive) {
      this._echoTimer -= dt;
      if (this._echoTimer <= 0) this._echoActive = false;
    }
  }

  _startPattern(player) {
    const du = player.u - this.u, dv = player.v - this.v;
    const len = Math.sqrt(du*du+dv*dv)||1;
    if (this.phase === 1) {
      this._pattern = { type:'slam', u: player.u, v: player.v, r: 135, dmg: 16 };
      this.state = 'windup'; this.stateTimer = 0.90;
    } else if (this.phase === 2) {
      const which = Math.random() < 0.5 ? 'slam' : 'dash';
      if (which === 'slam') {
        this._pattern = { type:'slam', u: player.u, v: player.v, r: 135, dmg: 16 };
        this.state = 'windup'; this.stateTimer = 0.75;
      } else {
        this._pattern = { type:'dash', du: du/len, dv: dv/len, dmg: 18 };
        this.state = 'windup'; this.stateTimer = 0.75;
      }
    } else {
      // Phase 3: sequential triple slam
      this._pattern = { type:'triple', slams:[
        { u: player.u + (Math.random()-0.5)*3, v: player.v + (Math.random()-0.5)*3 },
        { u: player.u + (Math.random()-0.5)*4, v: player.v + (Math.random()-0.5)*4 },
        { u: player.u + (Math.random()-0.5)*3, v: player.v + (Math.random()-0.5)*3 },
      ], idx:0, r:100, dmg:14 };
      this.state = 'windup'; this.stateTimer = 0.70;
    }
  }

  /** Returns all active hazard zones for damage detection. */
  getHazardZones() {
    const zones = [];
    if (!this._pattern) return zones;
    if (this._pattern.type === 'slam' && this.state === 'attack') {
      zones.push({ u:this._pattern.u, v:this._pattern.v, r:this._pattern.r, dmg:this._pattern.dmg });
    }
    if (this._echoActive && this._echoTimer < 0.3) {
      zones.push({ u:this._echoU, v:this._echoV, r:75, dmg:8 });
    }
    return zones;
  }

  render(ctx, ox, oy, cx, cy) {
    if (this.dead) return;
    const p = isoProject(this.u, this.v, ox, oy);
    const sx = p.x - cx, sy = p.y - cy;

    // Draw telegraph patterns
    this._renderTelegraphs(ctx, ox, oy, cx, cy);

    ctx.save(); ctx.translate(sx, sy);
    ctx.fillStyle='rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(3,4,30,15,0,0,Math.PI*2); ctx.fill();

    const hpFrac = this.hp / this.maxHp;
    const phase = this.phase;

    // Body
    const bg = ctx.createRadialGradient(0,-30,5,0,-20,40);
    bg.addColorStop(0, phase===3?'#6a0000': phase===2?'#4a0020':'#2a0020');
    bg.addColorStop(1, '#080006');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(0,-60); ctx.lineTo(20,-30); ctx.lineTo(25,0);
    ctx.lineTo(-25,0); ctx.lineTo(-20,-30); ctx.closePath(); ctx.fill();

    // Horns
    ctx.fillStyle = phase===3?'#ff2020':'#401020';
    ctx.beginPath(); ctx.moveTo(-12,-55); ctx.lineTo(-22,-80); ctx.lineTo(-5,-50); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo( 12,-55); ctx.lineTo( 22,-80); ctx.lineTo( 5,-50); ctx.closePath(); ctx.fill();

    // Eyes — phase-based
    const eyeColor = phase===3?'#ffffff': phase===2?'#ff6000':'#ff2020';
    const eyeR = 4 + phase;
    ctx.fillStyle = eyeColor;
    ctx.beginPath(); ctx.arc(-8,-44,eyeR,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( 8,-44,eyeR,0,Math.PI*2); ctx.fill();
    if (phase === 3) {
      ctx.fillStyle='rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(-8,-44,1.5,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc( 8,-44,1.5,0,Math.PI*2); ctx.fill();
    }

    // HP bar
    const bw = 60, bh = 5;
    ctx.fillStyle='#200000'; ctx.fillRect(-bw/2,-80,bw,bh);
    ctx.fillStyle=hpFrac>0.66?'#c02020':hpFrac>0.33?'#c06020':'#c00000';
    ctx.fillRect(-bw/2,-80,bw*hpFrac,bh);
    ctx.strokeStyle='#600000'; ctx.lineWidth=0.8; ctx.strokeRect(-bw/2,-80,bw,bh);
    // Phase markers
    ctx.fillStyle='rgba(255,40,40,0.6)';
    ctx.fillRect(-bw/2 + bw*0.33 - 0.5, -82, 1, 9);
    ctx.fillRect(-bw/2 + bw*0.66 - 0.5, -82, 1, 9);
    // Name
    ctx.fillStyle=`rgba(220,40,40,${0.5 + phase*0.15})`; ctx.font='10px VT323,monospace';
    ctx.textAlign='center'; ctx.fillText(`◈ BOSS  PHASE ${phase}`, 0, -84); ctx.textAlign='left';
    ctx.restore();
  }

  _renderTelegraphs(ctx, ox, oy, cx, cy) {
    if (!this._pattern) return;
    if (this.state !== 'windup' && this.state !== 'attack') return;

    const progress = this.state === 'attack' ? 1 : 1 - this.stateTimer /
      (this.phase <= 1 ? 0.90 : 0.75);

    if (this._pattern.type === 'slam') {
      const sp = isoProject(this._pattern.u, this._pattern.v, ox, oy);
      const rx = this._pattern.r * ISO_H / 40, ry = rx * 0.5;
      const alpha = 0.2 + progress * 0.5;
      ctx.beginPath(); ctx.ellipse(sp.x-cx, sp.y-cy, rx, ry, 0, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,80,20,${alpha * 0.25})`; ctx.fill();
      ctx.strokeStyle = `rgba(255,80,20,${alpha})`; ctx.lineWidth = 1.5; ctx.stroke();
    }

    if (this._pattern.type === 'dash' && this.state === 'windup') {
      const dir = isoProject(this.u + this._pattern.du * 6, this.v + this._pattern.dv * 6, ox, oy);
      const sp = isoProject(this.u, this.v, ox, oy);
      ctx.strokeStyle = `rgba(255,140,20,${0.3 + progress * 0.5})`;
      ctx.lineWidth = 3; ctx.setLineDash([5,5]);
      ctx.beginPath(); ctx.moveTo(sp.x-cx, sp.y-cy); ctx.lineTo(dir.x-cx, dir.y-cy); ctx.stroke();
      ctx.setLineDash([]);
    }

    if (this._pattern.type === 'triple') {
      this._pattern.slams.forEach((s, i) => {
        const sp = isoProject(s.u, s.v, ox, oy);
        const rx = this._pattern.r * ISO_H / 40, ry = rx * 0.5;
        const a2 = i === this._pattern.idx ? 0.6 : 0.2;
        ctx.beginPath(); ctx.ellipse(sp.x-cx, sp.y-cy, rx, ry, 0, 0, Math.PI*2);
        ctx.fillStyle=`rgba(255,60,20,${a2*0.2})`; ctx.fill();
        ctx.strokeStyle=`rgba(255,60,20,${a2})`; ctx.lineWidth=1.2; ctx.stroke();
        ctx.fillStyle=`rgba(255,120,40,0.7)`; ctx.font='9px VT323,monospace'; ctx.textAlign='center';
        ctx.fillText(i+1, sp.x-cx, sp.y-cy-2); ctx.textAlign='left';
      });
    }

    // Echo ring
    if (this._echoActive) {
      const ep = isoProject(this._echoU, this._echoV, ox, oy);
      const rx2 = 75 * ISO_H / 40, ry2 = rx2 * 0.5;
      ctx.beginPath(); ctx.ellipse(ep.x-cx, ep.y-cy, rx2, ry2, 0, 0, Math.PI*2);
      ctx.strokeStyle=`rgba(255,200,20,${this._echoTimer < 0.3 ? 0.8 : 0.4})`; ctx.lineWidth=1; ctx.stroke();
    }
  }
}
