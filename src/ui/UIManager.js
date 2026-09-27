/**
 * UIManager.js — Parry Roguelike UI (Phase 1 minimal).
 *
 * Removed: upgrade screen, shop, mystery, treasure, meta grid.
 * Kept:    fade, main menu, rest screen, pause, game-over.
 */
import gsap from 'gsap';
import { gameStore } from '../state/gameStore.js';
import { SaveManager } from '../core/SaveManager.js';

export class UIManager {
  constructor(callbacks = {}) {
    this._cb = callbacks;

    this._fade     = document.getElementById('fade');
    this._hud      = document.getElementById('hud');
    this._mainMenu = document.getElementById('main-menu');
    this._rest     = document.getElementById('rest-screen');
    this._pause    = document.getElementById('pause-menu');
    this._gameOver = document.getElementById('game-over-screen');
    this._skillScreen = document.getElementById('skill-screen');
    this._mystery  = document.getElementById('mystery-screen');
    this._shop     = document.getElementById('shop-screen');

    this._setupMainMenu();
    this._setupPause();
    this._setupRest();
    this._setupGameOver();
  }

  // ── Fade ─────────────────────────────────────────────────────
  fadeIn(cb) {
    gsap.fromTo(this._fade, { opacity: 0 }, {
      opacity: 1, duration: 0.5, ease: 'power2.in', onComplete: cb,
    });
  }

  fadeOut(cb) {
    gsap.to(this._fade, {
      opacity: 0, duration: 0.8, ease: 'power2.out',
      onComplete: () => {
        this._fade.style.pointerEvents = 'none';
        if (cb) cb();
      },
    });
  }

  // ── HUD ──────────────────────────────────────────────────────
  showHUD()  { this._hud?.classList.remove('hidden'); }
  hideHUD()  { this._hud?.classList.add('hidden'); }

  // ── Main Menu ─────────────────────────────────────────────────
  _setupMainMenu() {
    document.getElementById('btn-start-run')?.addEventListener('click', () => {
      if (this._cb.onStartRun) this._cb.onStartRun();
    });
    document.getElementById('btn-continue-run')?.addEventListener('click', () => {
      if (this._cb.onContinueRun) this._cb.onContinueRun();
    });
    document.getElementById('btn-abandon-run')?.addEventListener('click', () => {
      this._showConfirm('ABANDON SAVED RUN?', 'Your checkpoint will be deleted.', () => {
        SaveManager.clearRun();
        this._refreshMainMenu();
      });
    });

    this._refreshMainMenu();

    // Show main menu with fade
    gsap.fromTo(this._mainMenu, { opacity: 0 }, { opacity: 1, duration: 0.8 });
  }

  showMainMenu() {
    this.hideAll();
    this.hideHUD();
    this._mainMenu.classList.remove('hidden');
    gsap.fromTo(this._mainMenu, { opacity: 0 }, { opacity: 1, duration: 0.6 });
    this._refreshMainMenu();
  }

  hideMainMenu() {
    gsap.to(this._mainMenu, {
      opacity: 0, duration: 0.4, onComplete: () => {
        this._mainMenu.classList.add('hidden');
      },
    });
  }

  _refreshMainMenu() {
    const hasSave = SaveManager.hasRun();
    document.getElementById('btn-continue-run')?.classList.toggle('hidden', !hasSave);
    document.getElementById('btn-abandon-run')?.classList.toggle('hidden', !hasSave);
  }

  // ── Pause ─────────────────────────────────────────────────────
  _setupPause() {
    document.getElementById('btn-resume')?.addEventListener('click', () => {
      this.hideAll();
      if (this._cb.onResume) this._cb.onResume();
    });
    document.getElementById('btn-save-exit')?.addEventListener('click', () => {
      this.hideAll();
      if (this._cb.onSaveExit) this._cb.onSaveExit();
    });
    document.getElementById('btn-abandon')?.addEventListener('click', () => {
      this._showConfirm('ABANDON RUN?', 'Progress on this run will be lost.', () => {
        this.hideAll();
        if (this._cb.onAbandon) this._cb.onAbandon();
      });
    });
  }

  showPause() { this._showOverlay(this._pause); }

  // ── Rest ──────────────────────────────────────────────────────
  _setupRest() {
    document.getElementById('rest-heal')?.addEventListener('click', () => {
      gameStore.getState().applyRestHeal();
      this.hideAll();
      if (this._restCb) this._restCb();
    });
    document.getElementById('rest-damage')?.addEventListener('click', () => {
      gameStore.getState().applySharpenDamage();
      this.hideAll();
      if (this._restCb) this._restCb();
    });
  }

  showRest(callback) {
    this._restCb = callback;
    this._showOverlay(this._rest);
  }

  // ── Game Over ─────────────────────────────────────────────────
  _setupGameOver() {
    document.getElementById('btn-go-menu')?.addEventListener('click', () => {
      this.hideAll();
      this.hideHUD();
      this._mainMenu.classList.remove('hidden');
      gsap.fromTo(this._mainMenu, { opacity: 0 }, { opacity: 1, duration: 0.6 });
      this._refreshMainMenu();
    });
  }

  showGameOver(abandoned = false) {
    const title = document.getElementById('go-title');
    if (title) title.textContent = abandoned ? 'RUN ABANDONED' : 'YOU DIED';

    const stats = document.getElementById('go-stats');
    const { run } = gameStore.getState();
    if (stats) {
      stats.innerHTML = `
        <p>Floor ${run.floor} &mdash; Room ${run.roomIndex + 1}</p>
        <p>${run.roomsCleared} rooms cleared</p>
      `;
    }
    this._showOverlay(this._gameOver);
  }

  // ── Confirm dialog ────────────────────────────────────────────
  _showConfirm(title, msg, onYes) {
    const dlg = document.getElementById('confirm-dialog');
    if (!dlg) { onYes(); return; }
    document.getElementById('confirm-title').textContent  = title;
    document.getElementById('confirm-message').textContent = msg;
    document.getElementById('btn-confirm-yes').onclick = () => {
      dlg.classList.add('hidden');
      onYes();
    };
    document.getElementById('btn-confirm-no').onclick = () => {
      dlg.classList.add('hidden');
    };
    dlg.classList.remove('hidden');
    gsap.fromTo(dlg, { opacity: 0 }, { opacity: 1, duration: 0.25 });
  }

  showSkillSelection(choices, onSelect) {
    if (!this._skillScreen || !choices || choices.length === 0) {
      if (onSelect) onSelect(null);
      return;
    }
    const container = document.getElementById('skill-cards');
    if (!container) {
      if (onSelect) onSelect(null);
      return;
    }

    container.innerHTML = '';
    for (const skill of choices) {
      const card = document.createElement('div');
      card.className = 'choice-card choice-card-skill';
      card.innerHTML = `
        <div class="card-icon">${skill.icon}</div>
        <div class="card-tag">${skill.tag}</div>
        <div class="card-name">${skill.name}</div>
        <div class="card-desc">${skill.desc}</div>
      `;
      card.onclick = () => {
        this.hideAll();
        if (onSelect) onSelect(skill.id);
      };
      container.appendChild(card);
    }

    this._showOverlay(this._skillScreen);
  }

  showShop(offers, onSelect) {
    if (!this._shop || !offers || offers.length === 0) {
      if (onSelect) onSelect(null);
      return;
    }
    const container = document.getElementById('shop-offers');
    const leaveBtn  = document.getElementById('btn-shop-leave');
    if (!container) {
      if (onSelect) onSelect(null);
      return;
    }

    const state = gameStore.getState();
    container.innerHTML = '';
    for (const offer of offers) {
      const canAfford = state.canAffordShop(offer);
      const costLabel = offer.cost
        ? (offer.cost.hpFlat ? `Cost: ${offer.cost.hpFlat} HP` : `Cost: ${Math.round((offer.cost.hpPct || 0) * 100)}% Max HP`)
        : 'Free';
      const card = document.createElement('div');
      card.className = 'choice-card choice-card-skill' + (canAfford ? '' : ' card-disabled');
      card.innerHTML = `
        <div class="card-icon">${offer.icon}</div>
        <div class="card-tag" style="color:#ffd54f;background:rgba(255,193,7,0.15)">${offer.tag}</div>
        <div class="card-name">${offer.title}</div>
        <div class="card-desc">${offer.desc}</div>
        <div class="card-cost">${canAfford ? costLabel : '✗ ' + costLabel + ' (too costly)'}</div>
      `;
      if (canAfford) {
        card.onclick = () => {
          this.hideAll();
          if (onSelect) onSelect(offer);
        };
      }
      container.appendChild(card);
    }

    // Update coins label (repurposed as HP display)
    const coinsEl = document.getElementById('shop-coins');
    if (coinsEl) {
      const { run } = gameStore.getState();
      coinsEl.textContent = `${Math.ceil(run.hp)} HP`;
    }

    if (leaveBtn) {
      leaveBtn.onclick = () => {
        this.hideAll();
        if (onSelect) onSelect(null);
      };
    }

    this._showOverlay(this._shop);
  }


  showMystery(options, onSelect) {
    if (!this._mystery || !options || options.length === 0) {
      if (onSelect) onSelect(null);
      return;
    }
    const container = document.getElementById('mystery-choices');
    const skipBtn = document.getElementById('btn-mystery-skip');
    if (!container) {
      if (onSelect) onSelect(null);
      return;
    }

    container.innerHTML = '';
    for (const opt of options) {
      const card = document.createElement('div');
      card.className = 'choice-card choice-card-skill';
      card.innerHTML = `
        <div class="card-icon">${opt.icon}</div>
        <div class="card-tag" style="color:#ff80ab;background:rgba(255,64,129,0.15)">${opt.tag}</div>
        <div class="card-name">${opt.title}</div>
        <div class="card-desc">${opt.desc}</div>
      `;
      card.onclick = () => {
        this.hideAll();
        if (onSelect) onSelect(opt);
      };
      container.appendChild(card);
    }

    if (skipBtn) {
      skipBtn.onclick = () => {
        this.hideAll();
        if (onSelect) onSelect(null);
      };
    }

    this._showOverlay(this._mystery);
  }

  hideAll() {
    [this._rest, this._pause, this._gameOver, this._skillScreen, this._mystery, this._shop].forEach(el => {
      if (el) el.classList.add('hidden');
    });
  }

  // ── Internal helper ───────────────────────────────────────────
  _showOverlay(el) {
    if (!el) return;
    el.classList.remove('hidden');
    gsap.fromTo(el, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
  }
}
