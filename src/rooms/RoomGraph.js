/**
 * RoomGraph.js — Branching multi-route floor graph (Phase 5).
 *
 * Generates a proper branching graph instead of a linear list:
 *   - Node 0:   Safe/Entry room  → 2 exits  (north → main path, east → branch)
 *   - Main path: 3-4 combat/special rooms → reconnect node
 *   - Branch path: 2-3 combat/special rooms → same reconnect node
 *   - Reconnect → 1-2 more rooms → Boss
 *
 * Node structure:
 *   { type, index, exits: [{ dir, toIdx }], entryDir }
 *
 * dir is one of: 'north'|'south'|'east'|'west'
 * entryDir is the direction the player comes from (wall behind them when entering).
 *
 * Room contents are hidden — exits just say "EXIT" until crossed.
 */
import { WEIGHTS_EARLY, WEIGHTS_LATE, ROOM_TYPE } from '../core/constants.js';

/** Seeded mulberry32 RNG */
function makeRng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0xffffffff;
  };
}

function weightedPick(rng, weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (const [key, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return key;
  }
  return Object.keys(weights)[0];
}

/** Opposite direction helper */
function opposite(dir) {
  return { north: 'south', south: 'north', east: 'west', west: 'east' }[dir];
}

export class RoomGraph {
  /**
   * @param {number} seed
   * @param {number} floorNum
   */
  constructor(seed, floorNum = 1) {
    this.seed     = seed;
    this.floorNum = floorNum;
    this.rng      = makeRng(seed);

    this.nodes = [];   // array of node objects indexed by their id
    this._generate();
    this.length = this.nodes.length; // compat: total room count
  }

  /** Returns the room node at index (id). */
  getRoom(idx) { return this.nodes[idx] || null; }

  /**
   * Graph layout (indices):
   *   0 (Safe/Entry)  ──north──► 1 (main path start)
   *                   ──east───► 2 (branch path start)
   *
   *   Main:   1 → 3 → 4 → RECONVERGE (5)
   *   Branch: 2 → 6 → RECONVERGE (5)
   *
   *   5 → 7 → Boss (8)
   *
   * Main-path rooms are slightly harder; branch rooms have more specials.
   * Exact room count varies by rng within sensible bounds.
   */
  _generate() {
    const nodes = [];

    const addNode = (type, entryDir) => {
      const id = nodes.length;
      nodes.push({ type, index: id, exits: [], entryDir });
      return id;
    };

    const addExit = (fromId, dir, toId) => {
      nodes[fromId].exits.push({ dir, toIdx: toId });
    };

    // ── Entry room (always Safe) ──────────────────────────────────
    const entry = addNode(ROOM_TYPE.SAFE, 'south');

    // ── Main path: 3 rooms ────────────────────────────────────────
    const mainLen = 2 + Math.floor(this.rng() * 2); // 2 or 3
    const mainPath = [];
    for (let i = 0; i < mainLen; i++) {
      const weights = i < 1 ? WEIGHTS_EARLY : WEIGHTS_LATE;
      mainPath.push(addNode(weightedPick(this.rng, weights), 'south'));
    }

    // ── Branch path: 2 rooms ──────────────────────────────────────
    const branchLen = 1 + Math.floor(this.rng() * 2); // 1 or 2
    const branchPath = [];
    for (let i = 0; i < branchLen; i++) {
      // Branch favors specials (treasure, rest, mystery) and fewer combats
      const branchWeights = i === branchLen - 1
        ? { [ROOM_TYPE.TREASURE]: 30, [ROOM_TYPE.REST]: 25, [ROOM_TYPE.MYSTERY]: 25, [ROOM_TYPE.COMBAT]: 20 }
        : { [ROOM_TYPE.COMBAT]: 40, [ROOM_TYPE.MYSTERY]: 30, [ROOM_TYPE.TREASURE]: 30 };
      branchPath.push(addNode(weightedPick(this.rng, branchWeights), 'west'));
    }

    // ── Reconnect room ────────────────────────────────────────────
    const reconnect = addNode(ROOM_TYPE.COMBAT, 'south');

    // ── Post-reconnect: 1 room before boss ───────────────────────
    const preBosskWeights = WEIGHTS_LATE;
    const preBoss = addNode(weightedPick(this.rng, preBosskWeights), 'south');

    // ── Boss ──────────────────────────────────────────────────────
    const boss = addNode(ROOM_TYPE.BOSS, 'south');

    // ── Wire exits ───────────────────────────────────────────────
    // Entry → main[0] (north) and branch[0] (east)
    addExit(entry, 'north', mainPath[0]);
    addExit(entry, 'east', branchPath[0]);

    // Main path chain → reconnect
    for (let i = 0; i < mainPath.length - 1; i++) {
      addExit(mainPath[i], 'north', mainPath[i + 1]);
    }
    addExit(mainPath[mainPath.length - 1], 'north', reconnect);

    // Branch path chain → reconnect
    for (let i = 0; i < branchPath.length - 1; i++) {
      addExit(branchPath[i], 'north', branchPath[i + 1]);
    }
    addExit(branchPath[branchPath.length - 1], 'east', reconnect);

    // Reconnect → preBoss → Boss
    addExit(reconnect, 'north', preBoss);
    addExit(preBoss, 'north', boss);

    // Boss → Next Floor (North descent blast door)
    addExit(boss, 'north', -1);

    this.nodes = nodes;
  }

  /** Total number of rooms in the graph */
  get totalRooms() { return this.nodes.length; }

  /** Serialise for checkpoint saving. */
  serialise() {
    return { seed: this.seed, floorNum: this.floorNum };
  }

  /** Restore from checkpoint. */
  static restore(data) {
    return new RoomGraph(data.seed, data.floorNum);
  }
}
