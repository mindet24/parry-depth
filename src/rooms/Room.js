/**
 * Room.js — Pre-renders a PS1-horror isometric room to an offscreen
 * canvas, then blits it with drawImage each frame.
 *
 * Each room type gets a distinct colour palette and set-dressing
 * while sharing the same 12×8 tile layout.
 *
 * Layers (bottom → top):
 *   1. Dark void bg
 *   2. Back / side walls with brick texture
 *   3. Floor tiles with noise + grout
 *   4. Floor details (cracks, stains, debris, grates)
 *   5. Wall trim shadows
 *   6. Torch halos (combat/elite/boss) or ambient detail
 *   7. Props (type-specific)
 *   8. Door visual (locked vs open)
 *   9. PS1 dithered vignette
 *
 * A "door" is a visible gap in the bottom wall at the centre (u=6, v=ROWS).
 */

import {
  TILE_W, TILE_H, ISO_H, ISO_V, ROOM_COLS, ROOM_ROWS, ROOM_TYPE,
} from '../core/constants.js';
import { isoProject } from '../core/iso.js';

const WALL_H = 68;

export function roomScreenSize() {
  const w = (ROOM_COLS + ROOM_ROWS) * ISO_H + TILE_W;
  const h = (ROOM_COLS + ROOM_ROWS) * ISO_V + WALL_H + TILE_H;
  return { w: Math.ceil(w), h: Math.ceil(h) };
}

// ── Per-type palette ──────────────────────────────────────────
const PALETTES = {
  [ROOM_TYPE.SAFE]:    { floor:[50,48,44], wall:'#1a1814', accent:'#3a5a3a' },
  [ROOM_TYPE.COMBAT]:  { floor:[42,38,34], wall:'#1e1814', accent:'#5a2020' },
  [ROOM_TYPE.ELITE]:   { floor:[38,34,42], wall:'#180e20', accent:'#5a205a' },
  [ROOM_TYPE.BOSS]:    { floor:[30,22,22], wall:'#120808', accent:'#8a1010' },
  [ROOM_TYPE.TREASURE]:{ floor:[48,46,36], wall:'#1e1c10', accent:'#8a7020' },
  [ROOM_TYPE.SHOP]:    { floor:[44,42,50], wall:'#14141e', accent:'#2040a0' },
  [ROOM_TYPE.REST]:    { floor:[44,48,44], wall:'#141a14', accent:'#406040' },
  [ROOM_TYPE.MYSTERY]: { floor:[36,34,44], wall:'#10101a', accent:'#604090' },
};

export class Room {
  constructor(type = ROOM_TYPE.COMBAT, seed = Math.random() * 999999 | 0) {
    this.type = type;
    this.seed = seed;
    this._rng = this._makeRng(seed);

    const { w, h } = roomScreenSize();
    this.screenW = w;
    this.screenH = h;
    this.originX = ROOM_ROWS * ISO_H;
    this.originY = WALL_H;

    // Door state (located at center of back wall v=0)
    this.doorOpen   = false;
    this.doorU      = ROOM_COLS / 2;
    this.doorV      = 0.5;

    // Player entry point (ground coords - near bottom edge)
    this.entryU = ROOM_COLS / 2;
    this.entryV = ROOM_ROWS - 1.5;

    this._bg = document.createElement('canvas');
    this._bg.width  = w;
    this._bg.height = h;
    this._generate(this._bg.getContext('2d'));
  }

  /** Bounds for player collision. */
  getBounds() {
    return {
      minU: 0.5,
      maxU: ROOM_COLS - 0.5,
      minV: this.doorOpen ? 0.2 : 0.5,
      maxV: ROOM_ROWS - 0.5,
    };
  }

  /** Get door position in screen coords (for collision detection). */
  getDoorScreenPos() {
    return this._iso(this.doorU, 0);
  }

  /** Open the exit door (called when room is cleared). */
  openDoor() {
    this.doorOpen = true;
    // Redraw with open door
    const ctx = this._bg.getContext('2d');
    this._drawDoor(ctx, true);
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} camX @param {number} camY
   */
  render(ctx, camX = 0, camY = 0) {
    ctx.drawImage(this._bg, -camX, -camY);
  }

  // ── Generation ───────────────────────────────────────────────
  _generate(ctx) {
    ctx.fillStyle = '#06040a';
    ctx.fillRect(0, 0, this.screenW, this.screenH);
    this._drawWalls(ctx);
    this._drawFloor(ctx);
    this._drawDetails(ctx);
    this._drawTrim(ctx);
    this._drawLights(ctx);
    this._drawProps(ctx);
    this._drawDoor(ctx, false);
    this._drawVignette(ctx);
  }

  _iso(u, v) { return isoProject(u, v, this.originX, this.originY); }

  // ── Walls ────────────────────────────────────────────────────
  _drawWalls(ctx) {
    const pal = PALETTES[this.type] || PALETTES[ROOM_TYPE.COMBAT];
    const C = ROOM_COLS, R = ROOM_ROWS;

    // Back wall (v=0 edge, u=0..C)
    for (let u = 0; u < C; u++) {
      const l = this._iso(u, 0), r2 = this._iso(u+1, 0);
      const noise = (this._rng() - 0.5) * 8;
      const wc = this._adjustColor(pal.wall, noise);
      ctx.beginPath();
      ctx.moveTo(l.x, l.y - WALL_H);
      ctx.lineTo(r2.x, r2.y - WALL_H);
      ctx.lineTo(r2.x, r2.y);
      ctx.lineTo(l.x, l.y);
      ctx.closePath();
      ctx.fillStyle = wc;
      ctx.fill();
      // Brick lines
      this._brickLines(ctx, l, r2, WALL_H);
    }

    // Left wall (u=0 edge, v=0..R)
    for (let v = 0; v < R; v++) {
      const t = this._iso(0, v), b = this._iso(0, v+1);
      const noise = (this._rng() - 0.5) * 6;
      const wc = this._adjustColor(pal.wall, noise - 6); // darker left wall
      ctx.beginPath();
      ctx.moveTo(t.x, t.y - WALL_H);
      ctx.lineTo(b.x, b.y - WALL_H);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(t.x, t.y);
      ctx.closePath();
      ctx.fillStyle = wc;
      ctx.fill();
      this._brickLines(ctx, t, b, WALL_H);
    }

    // Wall cap accent edge
    ctx.strokeStyle = pal.accent + '44';
    ctx.lineWidth = 1;
    const topL = this._iso(0, 0);
    const topR = this._iso(C, 0);
    const topB = this._iso(0, R);
    ctx.beginPath();
    ctx.moveTo(topL.x, topL.y - WALL_H);
    ctx.lineTo(topR.x, topR.y - WALL_H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(topL.x, topL.y - WALL_H);
    ctx.lineTo(topB.x, topB.y - WALL_H);
    ctx.stroke();
  }

  _brickLines(ctx, a, b, h) {
    const rows = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.5;
    for (let r = 1; r < rows; r++) {
      const frac = r / rows;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - h * (1 - frac));
      ctx.lineTo(b.x, b.y - h * (1 - frac));
      ctx.stroke();
    }
  }

  // ── Floor ────────────────────────────────────────────────────
  _drawFloor(ctx) {
    const pal = PALETTES[this.type] || PALETTES[ROOM_TYPE.COMBAT];
    for (let v = 0; v < ROOM_ROWS; v++) {
      for (let u = 0; u < ROOM_COLS; u++) {
        const tl = this._iso(u,   v);
        const tr = this._iso(u+1, v);
        const br = this._iso(u+1, v+1);
        const bl = this._iso(u,   v+1);
        const n  = (this._rng() - 0.5) * 16;
        const [r, g, b] = pal.floor;
        ctx.beginPath();
        ctx.moveTo(tl.x, tl.y);
        ctx.lineTo(tr.x, tr.y);
        ctx.lineTo(br.x, br.y);
        ctx.lineTo(bl.x, bl.y);
        ctx.closePath();
        ctx.fillStyle = `rgb(${(r+n)|0},${(g+n*0.8)|0},${(b+n*0.6)|0})`;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth   = 0.6;
        ctx.stroke();
      }
    }
  }

  // ── Floor details ─────────────────────────────────────────────
  _drawDetails(ctx) {
    const n = 5 + (this._rng() * 4 | 0);
    for (let i = 0; i < n; i++) {
      const u = 1 + this._rng() * (ROOM_COLS - 2);
      const v = 1 + this._rng() * (ROOM_ROWS - 2);
      const t = this._rng();
      if      (t < 0.35) this._crack(ctx, u, v);
      else if (t < 0.65) this._stain(ctx, u, v);
      else               this._debris(ctx, u, v);
    }
  }

  _crack(ctx, u, v) {
    const o = this._iso(u, v);
    ctx.strokeStyle = 'rgba(10,8,6,0.5)';
    ctx.lineWidth   = 0.6;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    let cx = o.x, cy = o.y;
    for (let s = 0; s < 4; s++) {
      cx += (this._rng() - 0.5) * 24;
      cy += (this._rng() - 0.5) * 12;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  _stain(ctx, u, v) {
    const p = this._iso(u, v);
    const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 20 + this._rng() * 14);
    const pal = PALETTES[this.type] || PALETTES[ROOM_TYPE.COMBAT];
    gr.addColorStop(0,   pal.accent + '30');
    gr.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _debris(ctx, u, v) {
    const p = this._iso(u, v);
    for (let i = 0; i < 4; i++) {
      const px = p.x + (this._rng() - 0.5) * 20;
      const py = p.y + (this._rng() - 0.5) * 9;
      ctx.fillStyle = `rgba(30,25,20,${0.3 + this._rng() * 0.3})`;
      ctx.beginPath();
      ctx.arc(px, py, 1 + this._rng() * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Wall trim ─────────────────────────────────────────────────
  _drawTrim(ctx) {
    for (let u = 0; u < ROOM_COLS; u++) {
      const f = this._iso(u, 0), t = this._iso(u+1, 0);
      const gr = ctx.createLinearGradient(f.x, f.y, f.x, f.y + 10);
      gr.addColorStop(0, 'rgba(0,0,0,0.4)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(f.x, f.y, t.x - f.x, 10);
    }
    for (let v = 0; v < ROOM_ROWS; v++) {
      const f = this._iso(0, v), b = this._iso(0, v+1);
      const gr = ctx.createLinearGradient(f.x, f.y, f.x + 10, f.y);
      gr.addColorStop(0, 'rgba(0,0,0,0.35)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(f.x, f.y - 2, 10, b.y - f.y + 4);
    }
  }

  // ── Lights ───────────────────────────────────────────────────
  _drawLights(ctx) {
    const pal = PALETTES[this.type] || PALETTES[ROOM_TYPE.COMBAT];
    const torchPositions = [
      this._iso(ROOM_COLS * 0.25, 0),
      this._iso(ROOM_COLS * 0.75, 0),
      this._iso(0, ROOM_ROWS * 0.35),
      this._iso(0, ROOM_ROWS * 0.65),
    ];
    const colors = {
      [ROOM_TYPE.SAFE]:    '#40ff40',
      [ROOM_TYPE.COMBAT]:  '#e07020',
      [ROOM_TYPE.ELITE]:   '#a020e0',
      [ROOM_TYPE.BOSS]:    '#ff2020',
      [ROOM_TYPE.TREASURE]:'#ffe040',
      [ROOM_TYPE.SHOP]:    '#4060ff',
      [ROOM_TYPE.REST]:    '#40c060',
      [ROOM_TYPE.MYSTERY]: '#8040c0',
    };
    const flameColor = colors[this.type] || '#e07020';

    torchPositions.forEach(({ x, y }) => {
      const ty = y - WALL_H * 0.5;
      const gr = ctx.createRadialGradient(x, ty, 0, x, ty, 60);
      gr.addColorStop(0,   flameColor + '25');
      gr.addColorStop(0.5, flameColor + '0c');
      gr.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(x, ty, 60, 0, Math.PI * 2); ctx.fill();
      // Sconce
      ctx.fillStyle = '#2a1e10';
      ctx.fillRect(x - 3, ty, 6, 12);
      // Flame
      ctx.fillStyle = flameColor + 'cc';
      ctx.beginPath(); ctx.arc(x, ty, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffffaa';
      ctx.beginPath(); ctx.arc(x, ty, 1.5, 0, Math.PI * 2); ctx.fill();
    });
  }

  // ── Props ─────────────────────────────────────────────────────
  _drawProps(ctx) {
    // Always: two corner barrels
    this._barrel(ctx, this._iso(1.2, 1.2));
    this._barrel(ctx, this._iso(ROOM_COLS - 1.2, 1.2));
    // Type-specific props
    if (this.type === ROOM_TYPE.SAFE || this.type === ROOM_TYPE.REST) {
      this._medCrate(ctx, this._iso(ROOM_COLS * 0.5, 1.0));
    }
    if (this.type === ROOM_TYPE.SHOP) {
      this._shopStand(ctx, this._iso(ROOM_COLS * 0.5, 1.5));
    }
    if (this.type === ROOM_TYPE.TREASURE) {
      this._chest(ctx, this._iso(ROOM_COLS * 0.5, 1.8));
    }
    if (this.type === ROOM_TYPE.BOSS) {
      this._pillar(ctx, this._iso(2, 2));
      this._pillar(ctx, this._iso(ROOM_COLS - 2, 2));
    }
    // Left-wall pipes
    this._pipes(ctx, this._iso(0.4, ROOM_ROWS * 0.45));
    // Floor grate
    this._grate(ctx, this._iso(ROOM_COLS * 0.5, ROOM_ROWS - 1.2));
  }

  _barrel(ctx, { x, y }) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(x+2, y+3, 12, 6, 0, 0, Math.PI*2); ctx.fill();
    const gr = ctx.createLinearGradient(x-10, y-22, x+10, y);
    gr.addColorStop(0, '#3e2e1e'); gr.addColorStop(0.5,'#2a1e10'); gr.addColorStop(1,'#1a1208');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.ellipse(x, y, 10, 5.5, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillRect(x-10, y-20, 20, 20);
    ctx.fillStyle = '#2a1e10';
    ctx.beginPath(); ctx.ellipse(x, y-20, 10, 5.5, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#3a2c1c'; ctx.lineWidth = 2;
    [y-6, y-13].forEach(by => { ctx.beginPath(); ctx.moveTo(x-9,by); ctx.lineTo(x+9,by); ctx.stroke(); });
  }

  _pipes(ctx, { x, y }) {
    const gr = ctx.createLinearGradient(x, y-28, x+8, y);
    gr.addColorStop(0,'#302020'); gr.addColorStop(1,'#181010');
    ctx.fillStyle = gr;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.roundRect(x + i*7, y-26, 5, 28, 2); ctx.fill();
      ctx.strokeStyle='rgba(60,40,40,0.35)'; ctx.lineWidth=0.5; ctx.stroke();
    }
    ctx.fillStyle='#242018'; ctx.fillRect(x-2, y-3, 22, 4);
  }

  _grate(ctx, { x, y }) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x-14, y-7, 28, 14);
    ctx.strokeStyle = '#201a18'; ctx.lineWidth = 1.2;
    for (let c = 0; c <= 4; c++) { const px = x-14+c*7; ctx.beginPath(); ctx.moveTo(px,y-7); ctx.lineTo(px,y+7); ctx.stroke(); }
    for (let r = 0; r <= 2; r++) { const py = y-7+r*7; ctx.beginPath(); ctx.moveTo(x-14,py); ctx.lineTo(x+14,py); ctx.stroke(); }
  }

  _chest(ctx, { x, y }) {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x+2, y+3, 18, 8, 0, 0, Math.PI*2); ctx.fill();
    // Body
    const gr = ctx.createLinearGradient(x-16, y-18, x+16, y);
    gr.addColorStop(0,'#8a6020'); gr.addColorStop(0.5,'#6a4010'); gr.addColorStop(1,'#3a2008');
    ctx.fillStyle=gr; ctx.fillRect(x-16, y-18, 32, 18);
    // Lid
    ctx.fillStyle='#9a7030'; ctx.fillRect(x-16, y-26, 32, 10);
    // Metal band
    ctx.fillStyle='#b08030'; ctx.fillRect(x-14,y-20,28,3);
    // Lock
    ctx.fillStyle='#c09040'; ctx.beginPath(); ctx.arc(x, y-16, 4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='#806020'; ctx.fillRect(x-2,y-16,4,5);
    // Gold glow
    const gg = ctx.createRadialGradient(x, y-18, 0, x, y-18, 30);
    gg.addColorStop(0,'rgba(200,160,40,0.15)'); gg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=gg; ctx.beginPath(); ctx.arc(x, y-18, 30, 0, Math.PI*2); ctx.fill();
  }

  _medCrate(ctx, { x, y }) {
    const gr = ctx.createLinearGradient(x-14, y-20, x+14, y);
    gr.addColorStop(0,'#204020'); gr.addColorStop(1,'#102010');
    ctx.fillStyle=gr; ctx.fillRect(x-14, y-20, 28, 20);
    ctx.strokeStyle='#305030'; ctx.lineWidth=1; ctx.strokeRect(x-14,y-20,28,20);
    ctx.fillStyle='rgba(40,180,40,0.6)';
    ctx.fillRect(x-2,y-16,4,12); ctx.fillRect(x-7,y-12,14,4);
  }

  _shopStand(ctx, { x, y }) {
    ctx.fillStyle='#181428'; ctx.fillRect(x-22,y-28,44,28);
    ctx.strokeStyle='#3040a0'; ctx.lineWidth=1; ctx.strokeRect(x-22,y-28,44,28);
    ctx.fillStyle='rgba(50,70,200,0.2)'; ctx.fillRect(x-20,y-26,40,24);
    ctx.fillStyle='#8090ff'; ctx.font='10px monospace'; ctx.textAlign='center';
    ctx.fillText('◈ SHOP', x, y-12);
  }

  _pillar(ctx, { x, y }) {
    const gr = ctx.createLinearGradient(x-8, y-50, x+8, y);
    gr.addColorStop(0,'#2a1c1c'); gr.addColorStop(0.5,'#1a1010'); gr.addColorStop(1,'#0e0808');
    ctx.fillStyle=gr;
    ctx.fillRect(x-8, y-50, 16, 50);
    ctx.fillStyle='#3a2020';
    ctx.fillRect(x-10, y-52, 20, 5);
    ctx.fillRect(x-10, y-3, 20, 5);
    // Glow crack
    ctx.strokeStyle='rgba(180,30,30,0.25)'; ctx.lineWidth=0.8;
    ctx.beginPath(); ctx.moveTo(x-2,y-40); ctx.lineTo(x+1,y-20); ctx.stroke();
  }

  // ── Door ──────────────────────────────────────────────────────
  _drawDoor(ctx, isOpen) {
    const du = this.doorU;
    const tl = this._iso(du - 1.0, 0);
    const tr = this._iso(du + 1.0, 0);
    const midX = (tl.x + tr.x) / 2;
    const midY = (tl.y + tr.y) / 2;
    const doorH = WALL_H * 0.75;

    // Clear door wall slot
    ctx.fillStyle = '#08060c';
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y - doorH);
    ctx.lineTo(tr.x, tr.y - doorH);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(tl.x, tl.y);
    ctx.closePath();
    ctx.fill();

    if (isOpen) {
      // Glow radiating from the doorway into the room
      const gr = ctx.createRadialGradient(midX, midY - doorH * 0.4, 4, midX, midY, 55);
      gr.addColorStop(0, 'rgba(46, 230, 90, 0.6)');
      gr.addColorStop(0.4, 'rgba(30, 160, 60, 0.3)');
      gr.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(midX, midY - doorH * 0.2, 55, 0, Math.PI * 2);
      ctx.fill();

      // Open void doorway
      ctx.fillStyle = '#020502';
      ctx.beginPath();
      ctx.moveTo(tl.x + 2, tl.y - doorH + 2);
      ctx.lineTo(tr.x - 2, tr.y - doorH + 2);
      ctx.lineTo(tr.x - 2, tr.y);
      ctx.lineTo(tl.x + 2, tl.y);
      ctx.closePath();
      ctx.fill();

      // Glowing green arch border
      ctx.strokeStyle = '#39ff14';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tl.x, tl.y - doorH);
      ctx.lineTo(tr.x, tr.y - doorH);
      ctx.lineTo(tr.x, tr.y);
      ctx.stroke();

      // EXIT text
      ctx.fillStyle = '#6ee7b7';
      ctx.font = 'bold 13px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('[ EXIT ]', midX, midY - doorH * 0.45);
    } else {
      // Closed heavy iron gate
      ctx.fillStyle = '#161214';
      ctx.beginPath();
      ctx.moveTo(tl.x + 2, tl.y - doorH + 2);
      ctx.lineTo(tr.x - 2, tr.y - doorH + 2);
      ctx.lineTo(tr.x - 2, tr.y);
      ctx.lineTo(tl.x + 2, tl.y);
      ctx.closePath();
      ctx.fill();

      // Iron frame & rivets
      ctx.strokeStyle = '#362a2c';
      ctx.lineWidth = 2;
      ctx.strokeRect(tl.x, tl.y - doorH, tr.x - tl.x, doorH);

      // Horizontal reinforcing bar
      ctx.strokeStyle = '#4a383b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(tl.x + 2, midY - doorH * 0.45);
      ctx.lineTo(tr.x - 2, tr.y - doorH * 0.45);
      ctx.stroke();

      // Red locked indicator
      ctx.fillStyle = '#e53e3e';
      ctx.beginPath();
      ctx.arc(midX, midY - doorH * 0.45, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f87171';
      ctx.font = '11px VT323, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('LOCKED', midX, midY - doorH * 0.65);
    }
    ctx.textAlign = 'left';
  }

  // ── Vignette ──────────────────────────────────────────────────
  _drawVignette(ctx) {
    const { w, h } = { w: this.screenW, h: this.screenH };
    const gr = ctx.createRadialGradient(w/2, h*0.6, h*0.15, w/2, h*0.6, h*0.85);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(4,2,6,0.6)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, h);
  }

  // ── Utils ─────────────────────────────────────────────────────
  _adjustColor(hex, n) {
    const c = parseInt(hex.replace('#',''), 16);
    const r = Math.min(255, Math.max(0, ((c>>16)&0xff) + n)) | 0;
    const g = Math.min(255, Math.max(0, ((c>>8)&0xff)  + n * 0.8)) | 0;
    const b = Math.min(255, Math.max(0, ((c)&0xff)     + n * 0.6)) | 0;
    return `rgb(${r},${g},${b})`;
  }

  _makeRng(seed) {
    let s = seed | 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 0xffffffff;
    };
  }
}
