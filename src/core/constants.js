/**
 * constants.js — Parry Roguelike (Phase 1).
 *
 * Locked numerical values for v1. Tuning after browser playtests only.
 */

// ── Player base stats ──────────────────────────────────────────
export const PLAYER_HP       = 100;
export const PLAYER_SPEED    = 180;   // world units/second

// ── Parry, Block & Dash ─────────────────────────────────────────
export const PARRY_WINDOW         = 0.18;  // strict 180ms parry active window on quick tap
export const PARRY_TAP_THRESHOLD   = 0.20;  // hold duration beyond which parry becomes block
export const PARRY_COOLDOWN       = 0.35;  // whiff recovery penalty if mistimed/spammed
export const BLOCK_DMG_REDUCTION   = 0.80;  // 80% damage blocked when holding guard
export const PARRY_SPEED_MULT     = 1.8;   // 80% speed boost
export const PARRY_SPEED_DURATION = 0.5;   // seconds the speed boost lasts
export const DASH_DISTANCE        = 1.85;  // world units traveled on a dash (tightened per player feedback)
export const DASH_DURATION        = 0.20;  // seconds the dash movement takes
export const DASH_MAX_STACKS      = 3;
export const BACKSTAB_ANGLE_DEG   = 120;   // degrees from enemy back that counts as backstab
export const BACKSTAB_MULT        = 3.5;   // damage multiplier for backstab
export const JABS_BASE_DMG        = 6;     // weak front-jab base damage
export const BACKSTAB_BASE_DMG    = 21;    // backstab base (JABS_BASE_DMG × BACKSTAB_MULT)

// ── Enemy Stats & Constants ────────────────────────────────────
export const BOSS_BASE_HP       = 120;
export const BOSS_HP_PER_ROUTE  = 10;
export const BOSS_FLOOR_SCALE   = 0.20;

export const ENEMY = {
  basic: {
    hp: 25,
    speed: 45,
    radius: 10,
    dmg: 8,
    lunge_cd: 2.5,
    lunge_warn: 0.55,
    lunge_dur: 0.3,
    lunge_rec: 0.4,
  },
  fast: {
    hp: 18,
    speed: 110,
    radius: 8,
    dmg: 6,
    dash_cd: 2.0,
    dash_warn: 0.4,
    dash_dur: 0.25,
    dash_rec: 0.35,
  },
  warden: {
    hp: 90,
    speed: 36,
    radius: 16,
    dmg: 15,
    slam_warn: 0.8,
    slam_rec: 0.6,
    slam_r: 45,
    slam_dmg: 22,
  },
  hunter: {
    hp: 60,
    speed: 48,
    radius: 12,
    dmg: 12,
    dash_cd: 3.5,
    dash_warn: 0.6,
    dash_dur: 0.35,
    dash_speed: 120,
    dash_rec: 0.5,
  },
};

export const ISO_H = 16;
export const ISO_V = 8;
export const WORLD_SCALE = 20;

// ── Route generation ───────────────────────────────────────────
export const ROUTE_MIN = 8;
export const ROUTE_MAX = 12;

// ── Room types ─────────────────────────────────────────────────
export const ROOM_TYPE = {
  SAFE:     'safe',
  COMBAT:   'combat',
  ELITE:    'elite',
  TREASURE: 'treasure',
  SHOP:     'shop',
  REST:     'rest',
  MYSTERY:  'mystery',
  BOSS:     'boss',
};

// ── Enemy spawn counts ─────────────────────────────────────────
export function spawnCount(depth, routeLen, floorNum) {
  const frac = depth / routeLen;
  let basic = 3, fast = 0;
  if      (frac < 0.25) { basic = 3; fast = 0; }
  else if (frac < 0.50) { basic = 4; fast = 1; }
  else if (frac < 0.75) { basic = 5; fast = 2; }
  else                   { basic = 6; fast = 3; }
  const extra = Math.min(6, Math.floor((floorNum - 1) / 2));
  basic = Math.min(basic + extra, basic + 6);
  return { basic, fast };
}

// ── Room weighting for graph ───────────────────────────────────
export const WEIGHTS_EARLY = {
  [ROOM_TYPE.COMBAT]:   50,
  [ROOM_TYPE.TREASURE]: 15,
  [ROOM_TYPE.SHOP]:     10,
  [ROOM_TYPE.REST]:     10,
  [ROOM_TYPE.MYSTERY]:  15,
};
export const WEIGHTS_LATE = {
  [ROOM_TYPE.COMBAT]:   40,
  [ROOM_TYPE.TREASURE]: 10,
  [ROOM_TYPE.SHOP]:     8,
  [ROOM_TYPE.REST]:     10,
  [ROOM_TYPE.MYSTERY]:  12,
  [ROOM_TYPE.ELITE]:    20,
};

// ── Screen names ───────────────────────────────────────────────
export const SCREEN = {
  MAIN_MENU: 'MAIN_MENU',
  RUNNING:   'RUNNING',
  PAUSE:     'PAUSE',
  GAME_OVER: 'GAME_OVER',
};

// ── Mystery events — horror risk/reward, no coin economy ──────────
export const MYSTERY_POOL = [
  {
    id: 'strange_warmth',
    icon: '♥',
    tag: 'ANOMALOUS',
    title: 'Strange Warmth',
    desc: 'A humming apparatus floods you with bioluminescent fluid. Restore 40% Max HP.',
    apply: (store) => { store.applyMysteryHeal(0.40); },
  },
  {
    id: 'blood_rite',
    icon: '⚡',
    tag: 'RISK',
    title: 'Blood Rite',
    desc: 'Carve a sigil into your palm. Lose 20 HP — gain +20% damage for this Run.',
    apply: (store) => { store.applyMysteryBloodRite(20, 0.20); },
  },
  {
    id: 'curse_amplify',
    icon: '☠',
    tag: 'CURSE',
    title: 'Resonance Curse',
    desc: 'A crackling field tears into you. Lose 30% Max HP — gain +35% backstab bonus.',
    apply: (store) => { store.applyMysteryCurse(0.30, 0.35); },
  },
  {
    id: 'shatter_limiter',
    icon: '◈',
    tag: 'AUGMENT',
    title: 'Shattered Limiter',
    desc: 'Splice a corroded chip into your arm. Gain +1 max Dash Stack.',
    apply: (store) => { store.applyMysteryDashUp(); },
  },
  {
    id: 'refraction',
    icon: '⬡',
    tag: 'ANOMALOUS',
    title: 'Refraction Lens',
    desc: 'Stare into the lens. Gain 2 Dash Stacks immediately.',
    apply: (store) => { store.addDashStacks(2); },
  },
  {
    id: 'crystallize',
    icon: '✦',
    tag: 'RISK',
    title: 'Crystallization',
    desc: 'Immerse your weapon in glowing sludge. Reduce current HP to 50% — gain +40% damage.',
    apply: (store) => { store.applyMysteryCrystallize(0.40); },
  },
  {
    id: 'marrow_drain',
    icon: '🩸',
    tag: 'CURSE',
    title: 'Marrow Drain',
    desc: 'Something pulls from inside. Lose 25 HP — raise Max HP by 30.',
    apply: (store) => { store.applyMysteryMarrow(25, 30); },
  },
  {
    id: 'parry_echo',
    icon: '↺',
    tag: 'AUGMENT',
    title: 'Parry Echo',
    desc: 'Crystalline nodes fuse into your wrist. Parry timing window slightly widened.',
    apply: (store) => { store.applyMysteryParryEcho(); },
  },
];

// ── Shop offers — HP sacrifice trades ──────────────────────────
export const SHOP_POOL = [
  {
    id: 'shop_heal_full',
    icon: '♥',
    tag: 'RESTORE',
    title: 'Emergency Suture',
    desc: 'Restore full HP. Uses 20% of your Max HP as fuel.',
    cost: { hpPct: 0.20 },
    apply: (store) => { store.applyShopHealFull(); },
  },
  {
    id: 'shop_max_hp',
    icon: '⬟',
    tag: 'UPGRADE',
    title: 'Marrow Graft',
    desc: 'Sacrifice 15 HP to permanently raise Max HP by 40.',
    cost: { hpFlat: 15 },
    apply: (store) => { store.applyShopMaxHp(40); },
  },
  {
    id: 'shop_damage',
    icon: '⚡',
    tag: 'UPGRADE',
    title: 'Nerve Splice',
    desc: 'Sacrifice 18 HP to gain +15% damage this Run.',
    cost: { hpFlat: 18 },
    apply: (store) => { store.applySharpenDamage(); },
  },
  {
    id: 'shop_backstab',
    icon: '◆',
    tag: 'UPGRADE',
    title: 'Ocular Patch',
    desc: 'Sacrifice 20 HP to gain +20% backstab bonus.',
    cost: { hpFlat: 20 },
    apply: (store) => { store.modifyBackstabBonus(0.20); },
  },
  {
    id: 'shop_dash',
    icon: '◈',
    tag: 'UPGRADE',
    title: 'Kinetic Coil',
    desc: 'Sacrifice 12 HP to gain +1 Dash Stack.',
    cost: { hpFlat: 12 },
    apply: (store) => { store.addDashStacks(1); },
  },
];
