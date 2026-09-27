/**
 * gameStore.js — Zustand vanilla store (Phase 1-3 Parry Roguelike).
 *
 * Removed: EXP crystals, Run Levels, weapons pool, passives pool, meta points/upgrades.
 * Added (Phase 1): dashStacks, parryChain, parrySpeedBuff, runSkills
 * Added (Phase 3): missionData — serialised MissionManager checkpoint state
 */
import { createStore } from 'zustand/vanilla';
import { PLAYER_HP, PLAYER_SPEED, SCREEN } from '../core/constants.js';

// ── Default run state ───────────────────────────────────────────
const defaultRun = () => ({
  active: false,
  floor: 1,
  roomIndex: 0,
  routeLength: 0,
  routeSeed: 0,
  roomsCleared: 0,

  // Player vitals
  hp: PLAYER_HP,
  maxHp: PLAYER_HP,
  baseSpeed: PLAYER_SPEED,
  damageBonus: 0,
  backstabBonus: 0,

  // Parry / Dash combat state
  dashStacks: 0,
  maxDashStacks: 3,
  parryChain: 0,         // consecutive successful parries (resets on hit/miss)
  parrySpeedBuff: 0,     // seconds remaining on speed burst after parry
  parryBuffMult: 1.8,    // speed multiplier while buff is active

  // Run skills (unlocked via boss victories / milestones — Phase 6)
  skills: {},

  // Shop / rooms
  shopOffers: null,

  // Phase 3: serialised MissionManager state (null until first run)
  missionData: null,
});

export const gameStore = createStore((set, get) => ({
  // ── Screen / state machine ────────────────────────────────────
  screen: SCREEN.MAIN_MENU,
  setScreen: (s) => set({ screen: s }),

  // ── Run ──────────────────────────────────────────────────────
  run: defaultRun(),

  startRun: () => {
    const r = defaultRun();
    r.active = true;
    set({ run: r });
  },

  endRun: () => set({ run: { ...defaultRun(), active: false } }),

  // ── Vitals ───────────────────────────────────────────────────
  takeDamage: (amount) => {
    const r = { ...get().run };
    r.hp = Math.max(0, r.hp - amount);
    // Taking a hit breaks parry chain (but NOT dash stacks)
    r.parryChain = 0;
    set({ run: r });
  },

  heal: (amount) => {
    const r = { ...get().run };
    r.hp = Math.min(r.maxHp, r.hp + amount);
    set({ run: r });
  },

  // ── Parry ────────────────────────────────────────────────────
  /** Called on a SUCCESSFUL parry. Returns new dashStacks count. */
  onSuccessfulParry: () => {
    const r = { ...get().run };
    r.parryChain += 1;
    // Every 3rd consecutive parry: bonus stack
    const bonusStack = r.parryChain > 0 && r.parryChain % 3 === 0;
    const stacksToAdd = bonusStack ? 2 : 1;
    r.dashStacks = Math.min(r.maxDashStacks, r.dashStacks + stacksToAdd);
    // Activate speed buff
    r.parrySpeedBuff = 0.5;
    set({ run: r });
    return { dashStacks: r.dashStacks, bonusStack, chain: r.parryChain };
  },

  /** Called on a MISSED parry. Breaks chain, no stack. */
  onMissedParry: () => {
    const r = { ...get().run };
    r.parryChain = 0;
    set({ run: r });
  },

  /** Tick the parry speed buff down each frame. */
  tickParryBuff: (dt) => {
    const r = get().run;
    if (r.parrySpeedBuff <= 0) return;
    set({ run: { ...r, parrySpeedBuff: Math.max(0, r.parrySpeedBuff - dt) } });
  },

  // ── Dash ─────────────────────────────────────────────────────
  /** Consume one dash stack. Returns true if successful. */
  consumeDash: () => {
    const r = { ...get().run };
    if (r.dashStacks <= 0) return false;
    r.dashStacks -= 1;
    set({ run: r });
    return true;
  },

  // ── Room progress ─────────────────────────────────────────────
  advanceRoom: () => {
    const r = { ...get().run };
    r.roomIndex += 1;
    set({ run: r });
  },
  setRoomIndex: (idx) => {
    const r = { ...get().run };
    r.roomIndex = idx;
    set({ run: r });
  },
  clearRoom: () => {
    const r = { ...get().run };
    r.roomsCleared += 1;
    set({ run: r });
  },
  nextFloor: () => {
    const r = { ...get().run };
    r.floor += 1;
    r.roomIndex = 0;
    r.roomsCleared = 0;
    r.shopOffers = null;
    set({ run: r });
  },
  setRouteInfo: (length, seed) => {
    const r = { ...get().run };
    r.routeLength = length;
    r.routeSeed   = seed;
    set({ run: r });
  },

  /** Persist serialised MissionManager data to the run (for checkpointing). */
  setMissionData: (data) => {
    const r = { ...get().run };
    r.missionData = data;
    set({ run: r });
  },
  applyRestHeal: () => {
    const r = { ...get().run };
    r.hp = Math.min(r.maxHp, r.hp + Math.ceil(r.maxHp * 0.30));
    set({ run: r });
  },
  applySharpenDamage: () => {
    const r = { ...get().run };
    r.damageBonus = (r.damageBonus || 0) + 0.15;
    set({ run: r });
  },
  modifyMaxHp: (delta) => {
    const r = { ...get().run };
    r.maxHp = Math.max(20, r.maxHp + delta);
    r.hp = Math.min(r.hp, r.maxHp);
    set({ run: r });
  },
  addDashStacks: (count) => {
    const r = { ...get().run };
    r.dashStacks = Math.min(r.maxDashStacks, r.dashStacks + count);
    set({ run: r });
  },
  modifySpeedBonus: (delta) => {
    const r = { ...get().run };
    r.baseSpeed = Math.round(r.baseSpeed * (1 + delta));
    set({ run: r });
  },
  modifyBackstabBonus: (delta) => {
    const r = { ...get().run };
    r.backstabBonus = (r.backstabBonus || 0) + delta;
    set({ run: r });
  },

  // ── Phase 6: Skill Progression ──────────────────────────────
  unlockSkill: (skillId) => {
    const r = { ...get().run };
    r.skills = { ...r.skills, [skillId]: true };
    if (skillId === 'FLEET_STEP') {
      r.maxDashStacks = 4;
      r.dashStacks = Math.min(4, r.dashStacks + 1);
    }
    set({ run: r });
  },
  hasSkill: (skillId) => {
    return !!get().run.skills[skillId];
  },

  // ── Phase 7: Mystery room actions ──────────────────────────────
  applyMysteryHeal: (pct) => {
    const r = { ...get().run };
    r.hp = Math.min(r.maxHp, r.hp + Math.ceil(r.maxHp * pct));
    set({ run: r });
  },
  applyMysteryBloodRite: (hpCost, dmgGain) => {
    const r = { ...get().run };
    r.hp = Math.max(1, r.hp - hpCost);
    r.damageBonus = (r.damageBonus || 0) + dmgGain;
    set({ run: r });
  },
  applyMysteryCurse: (hpPctLoss, backstabGain) => {
    const r = { ...get().run };
    const loss = Math.ceil(r.maxHp * hpPctLoss);
    r.maxHp = Math.max(20, r.maxHp - loss);
    r.hp = Math.min(r.hp, r.maxHp);
    r.backstabBonus = (r.backstabBonus || 0) + backstabGain;
    set({ run: r });
  },
  applyMysteryDashUp: () => {
    const r = { ...get().run };
    r.maxDashStacks += 1;
    r.dashStacks = Math.min(r.maxDashStacks, r.dashStacks + 1);
    set({ run: r });
  },
  applyMysteryCrystallize: (dmgGain) => {
    const r = { ...get().run };
    r.hp = Math.max(1, Math.floor(r.hp * 0.50));
    r.damageBonus = (r.damageBonus || 0) + dmgGain;
    set({ run: r });
  },
  applyMysteryMarrow: (hpCost, maxHpGain) => {
    const r = { ...get().run };
    r.hp = Math.max(1, r.hp - hpCost);
    r.maxHp += maxHpGain;
    set({ run: r });
  },
  applyMysteryParryEcho: () => {
    // Widen the parry window by 0.04s (applied as a flag; Player3D reads it)
    const r = { ...get().run };
    r.parryEcho = (r.parryEcho || 0) + 0.04;
    set({ run: r });
  },

  // ── Phase 7: Shop room actions ──────────────────────────────────
  applyShopHealFull: () => {
    const r = { ...get().run };
    const cost = Math.ceil(r.maxHp * 0.20);
    r.hp = Math.max(1, r.hp - cost);
    r.hp = Math.min(r.maxHp, r.hp + r.maxHp); // full restore after cost
    set({ run: r });
  },
  applyShopMaxHp: (gain) => {
    const r = { ...get().run };
    r.hp = Math.max(1, r.hp - 15);
    r.maxHp += gain;
    set({ run: r });
  },
  canAffordShop: (offer) => {
    const r = get().run;
    if (!offer?.cost) return true;
    if (offer.cost.hpFlat) return r.hp > offer.cost.hpFlat;
    if (offer.cost.hpPct)  return r.hp > Math.ceil(r.maxHp * offer.cost.hpPct);
    return true;
  },
}));
