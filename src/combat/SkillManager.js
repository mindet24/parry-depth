/**
 * SkillManager.js — Milestone Skill Progression (Phase 6).
 *
 * Replaces random EXP/level-ups with deterministic milestone choices
 * focused on Dagger, Parry, Dash, and Backstab per the project brief.
 */
import { gameStore } from '../state/gameStore.js';

export const SKILL_CATALOG = [
  {
    id: 'SHARPENED_BLADE',
    name: 'SHARPENED BLADE',
    icon: '🗡️',
    tag: 'DAGGER / BACKSTAB',
    desc: 'Backstabs deal +50% lethal critical damage from behind.',
  },
  {
    id: 'TEMPORAL_GUARD',
    name: 'TEMPORAL GUARD',
    icon: '⏳',
    tag: 'PARRY TIMING',
    desc: 'Parry timing window is widened by +40ms, making rhythmic deflections more forgiving.',
  },
  {
    id: 'FLEET_STEP',
    name: 'FLEET STEP',
    icon: '⚡',
    tag: 'DASH MOBILITY',
    desc: 'Increases Dash distance by +35% and expands maximum Dash capacity to 4 stacks.',
  },
  {
    id: 'RUPTURE_DASH',
    name: 'RUPTURE DASH',
    icon: '🩸',
    tag: 'DASH / VULNERABILITY',
    desc: 'Dashing near enemies ruptures their guard for 5s. Ruptured targets take +40% damage from all attacks.',
  },
  {
    id: 'AEGIS_BULWARK',
    name: 'AEGIS BULWARK',
    icon: '🛡️',
    tag: 'DEFENSIVE GUARD',
    desc: 'Successful parries grant 0.8s of absolute damage immunity to safely reposition.',
  },
  {
    id: 'CONCUSSIVE_CHAIN',
    name: 'CONCUSSIVE CHAIN',
    icon: '💥',
    tag: '3-PARRY CHAIN',
    desc: 'Completing a 3-Parry Chain emits a shockwave that staggers all nearby enemies for 1.2s.',
  },
];

export class SkillManager {
  /**
   * Returns up to 3 unacquired skills for the player to choose from.
   */
  static getAvailableChoices(count = 3) {
    const { skills } = gameStore.getState().run;
    const unacquired = SKILL_CATALOG.filter(s => !skills[s.id]);
    if (unacquired.length === 0) return [];

    // Shuffle and pick up to `count`
    const shuffled = [...unacquired].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  /**
   * Unlocks a chosen skill into the current run.
   */
  static selectSkill(skillId) {
    gameStore.getState().unlockSkill(skillId);
  }

  /**
   * Get skill metadata by ID.
   */
  static getSkill(skillId) {
    return SKILL_CATALOG.find(s => s.id === skillId) || null;
  }
}
