/**
 * Room3D.js — Multi-exit Industrial Horror Rooms (Phase 5).
 *
 * Changes from Phase 1:
 *   - Rooms are larger: 18×13 world units (up from 12×8)
 *   - Supports up to 3 exits on N / E / W walls
 *   - Each exit is a numbered blast door (door0, door1, door2)
 *   - openDoor(exitIndex) unseals a specific exit
 *   - getDoorPos(exitIndex) returns the Vector3 threshold for crossing detection
 *   - Entry wall is always the south wall; player starts near the south
 */
import * as THREE from 'three';
import gsap from 'gsap';
import { ROOM_TYPE } from '../core/constants.js';

export const ROOM_PALETTES = {
  safe:     { wall: 0x222a35, floor: 0x181e26, pipe: 0x4a6572, accent: 0x64b5f6, lamp: 0xffe082 },
  combat:   { wall: 0x2b1e1e, floor: 0x1d1414, pipe: 0x63332b, accent: 0xe53935, lamp: 0xff7043 },
  elite:    { wall: 0x1a291e, floor: 0x111c14, pipe: 0x2e5c38, accent: 0x00e676, lamp: 0x69f0ae },
  boss:     { wall: 0x24122e, floor: 0x150b1c, pipe: 0x5c2275, accent: 0xd500f9, lamp: 0xe040fb },
  treasure: { wall: 0x2e2714, floor: 0x1e190d, pipe: 0x735c24, accent: 0xffd600, lamp: 0xffea00 },
  shop:     { wall: 0x142b2e, floor: 0x0d1c1e, pipe: 0x246573, accent: 0x00e5ff, lamp: 0x18ffff },
  rest:     { wall: 0x162923, floor: 0x0e1b17, pipe: 0x235e4e, accent: 0x1de9b6, lamp: 0x64ffda },
  mystery:  { wall: 0x221a30, floor: 0x150f20, pipe: 0x513a7a, accent: 0xb388ff, lamp: 0x7c4dff },
};

// Exit direction → wall position + door orientation config
//   cx, cz: door center world position
//   axis: which axis the door slides along when opening
function exitConfig(dir, cols, rows) {
  switch (dir) {
    case 'north': return { cx: cols / 2, cz: 0.15, rotY: 0,           slideAxis: 'x' };
    case 'east':  return { cx: cols - 0.15, cz: rows / 2, rotY: Math.PI / 2, slideAxis: 'z' };
    case 'west':  return { cx: 0.15, cz: rows / 2, rotY: -Math.PI / 2, slideAxis: 'z' };
    default:      return { cx: cols / 2, cz: 0.15, rotY: 0,           slideAxis: 'x' };
  }
}

// Player spawn position when entering from a given direction
export function entrySpawnPos(entryDir, cols, rows) {
  switch (entryDir) {
    case 'north': return { x: cols / 2, z: rows - 1.5 }; // entered from north → start near south
    case 'south': return { x: cols / 2, z: rows - 1.5 }; // entered from south entry wall
    case 'east':  return { x: 1.5, z: rows / 2 };        // entered from east → start near west
    case 'west':  return { x: cols - 1.5, z: rows / 2 }; // entered from west → start near east
    default:      return { x: cols / 2, z: rows - 1.5 };
  }
}

export class Room3D {
  /**
   * @param {THREE.Scene} scene
   * @param {string} type — ROOM_TYPE
   * @param {number} seed
   * @param {string[]} exitDirs — e.g. ['north','east'] — which walls get exit doors
   * @param {string} entryDir  — which wall the player enters from (for open entry hole)
   */
  constructor(scene, type = ROOM_TYPE.COMBAT, seed = 1, exitDirs = ['north'], entryDir = 'south') {
    this.scene    = scene;
    this.type     = type;
    this.seed     = seed;
    this._rng     = this._makeRng(seed);
    this.exitDirs = exitDirs;
    this.entryDir = entryDir;

    this.cols  = 18;   // X: 0 → 18  (larger than old 12)
    this.rows  = 13;   // Z: 0 → 13  (larger than old 8)
    this.wallH = 4.5;

    this.group   = new THREE.Group();
    this._doors  = [];   // one entry per exit door: { dir, open, doorLeft, doorRight, doorSign, doorPortal, pos }

    // Legacy compat: single-door helpers point to first exit
    this.doorOpen = false;

    this.props = [];
    this._buildRoom();
    this.scene.add(this.group);
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Entry spawn position for the player. */
  get entryPos() {
    const sp = entrySpawnPos(this.entryDir, this.cols, this.rows);
    return new THREE.Vector3(sp.x, 0, sp.z);
  }

  /** Legacy: first exit door position (for old single-door code). */
  get doorPos() {
    return this.getDoorPos(0);
  }

  /** World position of exit door i (for crossing detection). */
  getDoorPos(exitIdx) {
    const d = this._doors[exitIdx];
    if (!d) return new THREE.Vector3(this.cols / 2, 0, 0.5);
    return new THREE.Vector3(d.cx, 0, d.cz);
  }

  /** True if exit i is open. */
  isDoorOpen(exitIdx) {
    return this._doors[exitIdx]?.open ?? false;
  }

  /** Open one specific exit by index. */
  openDoor(exitIdx = 0) {
    const d = this._doors[exitIdx];
    if (!d || d.open) return;
    d.open = true;
    this.doorOpen = true; // legacy compat

    if (d.doorLeft && d.doorRight) {
      const axis = d.slideAxis;
      gsap.to(d.doorLeft.position,  { [axis]: -1.25, duration: 0.7, ease: 'power2.out' });
      gsap.to(d.doorRight.position, { [axis]:  1.25, duration: 0.7, ease: 'power2.out' });
    }
    if (d.doorSign) {
      d.doorSign.material.color.setHex(0x39ff14);
      d.doorSign.material.emissive?.setHex?.(0x1b5e20);
    }
    if (d.doorPortal) {
      d.doorPortal.visible = true;
      d.doorPortal.material.opacity = 0;
      gsap.to(d.doorPortal.material, { opacity: 0.85, duration: 0.5, ease: 'power1.out' });
    }
  }

  /** Open all exit doors at once (used for non-combat rooms). */
  openAllDoors() {
    for (let i = 0; i < this._doors.length; i++) this.openDoor(i);
  }

  getBounds() {
    return {
      minX: 0.8,
      maxX: this.cols - 0.8,
      minZ: 0.8,
      maxZ: this.rows - 0.8,
    };
  }

  destroy() { this.scene.remove(this.group); }

  // ── Build ────────────────────────────────────────────────────────

  _buildRoom() {
    const pal = ROOM_PALETTES[this.type] || ROOM_PALETTES.combat;
    this._buildFloor(pal);
    this._buildWalls(pal);
    this._buildExitDoors(pal);
    this._buildLighting(pal);
    this._buildProps(pal);
  }

  _buildFloor(pal) {
    // Base slab
    const floorMat = new THREE.MeshStandardMaterial({
      color: pal.floor, roughness: 0.85, metalness: 0.2, flatShading: true,
    });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(this.cols, 0.4, this.rows), floorMat);
    floor.position.set(this.cols / 2, -0.2, this.rows / 2);
    floor.receiveShadow = true;
    this.group.add(floor);

    // Tiled floor plates (slightly varied shade / grate)
    const plateGeo = new THREE.BoxGeometry(0.92, 0.04, 0.92);
    for (let x = 0; x < this.cols; x++) {
      for (let z = 0; z < this.rows; z++) {
        const shade  = (this._rng() - 0.5) * 0.08;
        const col    = new THREE.Color(pal.floor).offsetHSL(0, 0, shade);
        const isGrate = this._rng() < 0.10;
        const tileMat = new THREE.MeshStandardMaterial({
          color: isGrate ? 0x111115 : col,
          roughness: isGrate ? 0.5 : 0.8,
          metalness: isGrate ? 0.8 : 0.3,
          flatShading: true,
        });
        const tile = new THREE.Mesh(plateGeo, tileMat);
        tile.position.set(x + 0.5, 0.01, z + 0.5);
        tile.receiveShadow = true;
        this.group.add(tile);
      }
    }
  }

  _buildWalls(pal) {
    const wallMat = new THREE.MeshStandardMaterial({
      color: pal.wall, roughness: 0.9, metalness: 0.25, flatShading: true,
    });
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x12141a, roughness: 0.7, metalness: 0.6, flatShading: true,
    });
    const pipeMat = new THREE.MeshStandardMaterial({
      color: pal.pipe, roughness: 0.5, metalness: 0.7, flatShading: true,
    });

    const W = this.cols, H = this.wallH, R = this.rows;
    const t = 0.6; // wall thickness
    const doorW = 2.4; // door opening width for exit holes in walls

    // Helper: add a solid wall segment
    const seg = (w, h, d, px, py, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    };

    // ── South wall (entry) — always has a fixed open entry arch ──────
    // Left of arch
    seg(W / 2 - doorW / 2, H, t, (W / 2 - doorW / 2) / 2, H / 2, R + t / 2);
    // Right of arch
    seg(W / 2 - doorW / 2, H, t, W - (W / 2 - doorW / 2) / 2, H / 2, R + t / 2);
    // Header above arch
    seg(doorW, H - 2.8, t, W / 2, 2.8 + (H - 2.8) / 2, R + t / 2);

    // ── North wall — segments around possible door opening ───────────
    const hasNorthDoor = this.exitDirs.includes('north');
    if (hasNorthDoor) {
      seg(W / 2 - doorW / 2, H, t, (W / 2 - doorW / 2) / 2, H / 2, -t / 2);
      seg(W / 2 - doorW / 2, H, t, W - (W / 2 - doorW / 2) / 2, H / 2, -t / 2);
      seg(doorW, H - 2.8, t, W / 2, 2.8 + (H - 2.8) / 2, -t / 2);
    } else {
      seg(W, H, t, W / 2, H / 2, -t / 2);
    }

    // ── East wall (X = cols) — segments around possible door opening ─
    const hasEastDoor = this.exitDirs.includes('east');
    if (hasEastDoor) {
      seg(t, H, R / 2 - doorW / 2, W + t / 2, H / 2, (R / 2 - doorW / 2) / 2);
      seg(t, H, R / 2 - doorW / 2, W + t / 2, H / 2, R - (R / 2 - doorW / 2) / 2);
      seg(t, H - 2.8, doorW, W + t / 2, 2.8 + (H - 2.8) / 2, R / 2);
    } else {
      seg(t, H, R, W + t / 2, H / 2, R / 2);
    }

    // ── West wall (X = 0) — segments around possible door opening ────
    const hasWestDoor = this.exitDirs.includes('west');
    if (hasWestDoor) {
      seg(t, H, R / 2 - doorW / 2, -t / 2, H / 2, (R / 2 - doorW / 2) / 2);
      seg(t, H, R / 2 - doorW / 2, -t / 2, H / 2, R - (R / 2 - doorW / 2) / 2);
      seg(t, H - 2.8, doorW, -t / 2, 2.8 + (H - 2.8) / 2, R / 2);
    } else {
      seg(t, H, R, -t / 2, H / 2, R / 2);
    }

    // ── Corner pillars ───────────────────────────────────────────────
    [
      [0, 0], [W, 0], [0, R], [W, R],
    ].forEach(([px, pz]) => {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, H, 0.5), pillarMat);
      col.position.set(px, H / 2, pz); col.castShadow = true;
      this.group.add(col);
    });

    // Structural pillars along north wall
    for (let x = 3; x < W; x += 3) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, H, 0.4), pillarMat);
      p.position.set(x, H / 2, -0.1); p.castShadow = true;
      this.group.add(p);
    }

    // Ceiling pipes along north and west walls
    const nPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, W, 8), pipeMat);
    nPipe.rotation.z = Math.PI / 2;
    nPipe.position.set(W / 2, H - 0.5, -0.15);
    this.group.add(nPipe);

    const wPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, R, 8), pipeMat);
    wPipe.rotation.x = Math.PI / 2;
    wPipe.position.set(-0.15, H - 0.5, R / 2);
    this.group.add(wPipe);
  }

  _buildExitDoors(pal) {
    this.exitDirs.forEach((dir, i) => {
      const cfg = exitConfig(dir, this.cols, this.rows);
      const dg = new THREE.Group();
      dg.position.set(cfg.cx, 0, cfg.cz);
      dg.rotation.y = cfg.rotY;

      // Frame
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0x1b1c24, metalness: 0.8, roughness: 0.4, flatShading: true,
      });
      const frameTop = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.35, 0.7), frameMat);
      frameTop.position.set(0, 2.7, 0);
      dg.add(frameTop);

      const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.7, 0.7), frameMat);
      frameLeft.position.set(-1.15, 1.35, 0);
      dg.add(frameLeft);

      const frameRight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.7, 0.7), frameMat);
      frameRight.position.set(1.15, 1.35, 0);
      dg.add(frameRight);

      // Sliding door panels
      const doorMat = new THREE.MeshStandardMaterial({
        color: 0x362828, metalness: 0.7, roughness: 0.5, flatShading: true,
      });
      const slabGeo  = new THREE.BoxGeometry(1.05, 2.6, 0.25);
      const doorLeft = new THREE.Mesh(slabGeo, doorMat);
      doorLeft.position.set(-0.52, 1.3, 0);
      doorLeft.castShadow = true;
      dg.add(doorLeft);

      const doorRight = new THREE.Mesh(slabGeo, doorMat);
      doorRight.position.set(0.52, 1.3, 0);
      doorRight.castShadow = true;
      dg.add(doorRight);

      // Status sign (red = locked, green = exit)
      const signMat = new THREE.MeshStandardMaterial({
        color: 0xff1744, emissive: new THREE.Color(0x8a0e0e), roughness: 0.2,
      });
      const doorSign = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.1), signMat);
      doorSign.position.set(0, 2.45, 0.35);
      dg.add(doorSign);

      // Directional label above sign (N/E/W indicator)
      const labelMat = new THREE.MeshBasicMaterial({ color: 0x446 });
      const labelGeo = new THREE.BoxGeometry(0.4, 0.12, 0.05);
      const label = new THREE.Mesh(labelGeo, labelMat);
      label.position.set(0, 2.85, 0.38);
      dg.add(label);

      // Portal glow when open
      const portal = new THREE.Mesh(
        new THREE.PlaneGeometry(2.0, 2.6),
        new THREE.MeshBasicMaterial({
          color: pal.accent, transparent: true, opacity: 0, side: THREE.DoubleSide,
        })
      );
      portal.position.set(0, 1.3, 0.1);
      portal.visible = false;
      dg.add(portal);

      this.group.add(dg);

      this._doors.push({
        dir,
        cx: cfg.cx,
        cz: cfg.cz,
        slideAxis: cfg.slideAxis,
        open: false,
        doorLeft,
        doorRight,
        doorSign,
        doorPortal: portal,
      });
    });
  }

  _buildLighting(pal) {
    // Overhead industrial lamps
    const lampMat = new THREE.MeshStandardMaterial({
      color: pal.lamp,
      emissive: new THREE.Color(pal.lamp),
      emissiveIntensity: 1.2,
      flatShading: true,
    });

    const positions = [
      [this.cols * 0.25, this.cols * 0.25],
      [this.cols * 0.75, this.cols * 0.25],
      [this.cols * 0.25, this.rows * 0.75],
      [this.cols * 0.75, this.rows * 0.75],
      [this.cols * 0.50, this.rows * 0.50],
    ];

    positions.forEach(([lx, lz]) => {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5), lampMat);
      housing.position.set(lx, this.wallH - 0.12, lz);
      this.group.add(housing);
    });
  }

  _buildProps(pal) {
    const crateMat = new THREE.MeshStandardMaterial({
      color: 0x3b3328, roughness: 0.9, metalness: 0.1, flatShading: true,
    });
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0x4a2e2e, roughness: 0.6, metalness: 0.5, flatShading: true,
    });

    // Larger room → more props, still wall-hugging
    const W = this.cols, R = this.rows;
    const propLocations = [
      { x: 1.2, z: 1.2,     type: 'crate'       },
      { x: 2.0, z: 1.2,     type: 'crate_small' },
      { x: W - 1.2, z: 1.2, type: 'barrel'      },
      { x: W - 2.0, z: 1.5, type: 'barrel'      },
      { x: 1.2, z: R - 1.5, type: 'crate'       },
      { x: W - 1.2, z: R - 1.5, type: 'generator' },
      { x: W / 2, z: 1.5,   type: 'crate'       },   // mid-north cover
      { x: 1.5, z: R / 2,   type: 'barrel'      },   // mid-west cover
      { x: W - 1.5, z: R / 2, type: 'barrel'    },   // mid-east cover
    ];

    propLocations.forEach(p => {
      // Skip props that would block doors
      const nearDoor = this._doors.some(d => Math.hypot(p.x - d.cx, p.z - d.cz) < 2.5);
      if (nearDoor) return;

      if (p.type === 'crate') {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), crateMat);
        c.position.set(p.x, 0.4, p.z);
        c.rotation.y = (this._rng() - 0.5) * 0.4;
        c.castShadow = true; c.receiveShadow = true;
        this.group.add(c);
        this.props.push({ x: p.x, z: p.z, r: 0.6 });
      } else if (p.type === 'crate_small') {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), crateMat);
        c.position.set(p.x, 0.3, p.z); c.castShadow = true;
        this.group.add(c);
        this.props.push({ x: p.x, z: p.z, r: 0.45 });
      } else if (p.type === 'barrel') {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 8), barrelMat);
        b.position.set(p.x, 0.45, p.z); b.castShadow = true;
        this.group.add(b);
        this.props.push({ x: p.x, z: p.z, r: 0.45 });
      } else if (p.type === 'generator') {
        const g = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.2, 0.7), new THREE.MeshStandardMaterial({
          color: 0x1b2838, metalness: 0.7, roughness: 0.5, flatShading: true,
        }));
        g.position.set(p.x, 0.6, p.z); g.castShadow = true;
        this.group.add(g);
        this.props.push({ x: p.x, z: p.z, r: 0.7 });
      }
    });
  }

  _makeRng(seed) {
    let s = (seed || 1) | 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 0xffffffff;
    };
  }
}
