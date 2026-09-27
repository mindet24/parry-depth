/**
 * SaveManager.js — localStorage persistence.
 *
 * Two save slots:
 *   HOLLOW_DEPTH_META    — permanent profile (meta level, points, upgrades)
 *   HOLLOW_DEPTH_RUN     — current run checkpoint (versioned, cleared on death/abandon)
 *
 * All saves are JSON. On corrupt/missing data we return null and
 * let the caller use defaults.
 */

const KEY_META = 'HOLLOW_DEPTH_META_v1';
const KEY_RUN  = 'HOLLOW_DEPTH_RUN_v1';

export const SaveManager = {
  // ── Meta ─────────────────────────────────────────────────────
  saveMeta(data) {
    try { localStorage.setItem(KEY_META, JSON.stringify(data)); } catch(e) {}
  },
  loadMeta() {
    try {
      const raw = localStorage.getItem(KEY_META);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  // ── Run checkpoint ───────────────────────────────────────────
  saveRun(data) {
    try { localStorage.setItem(KEY_RUN, JSON.stringify({ ...data, savedAt: Date.now() })); } catch(e) {}
  },
  loadRun() {
    try {
      const raw = localStorage.getItem(KEY_RUN);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  clearRun() {
    try { localStorage.removeItem(KEY_RUN); } catch(e) {}
  },
  hasRun() {
    try { return !!localStorage.getItem(KEY_RUN); } catch { return false; }
  },

  // ── Best run ─────────────────────────────────────────────────
  saveBest(data) {
    const cur = this.loadMeta();
    if (!cur) return;
    const best = cur.bestRun;
    if (!best ||
        data.floor > best.floor ||
        (data.floor === best.floor && data.rooms > best.rooms)) {
      cur.bestRun = data;
      this.saveMeta(cur);
    }
  },
};
