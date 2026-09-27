/**
 * HUD.js — Reactive HUD sync + damage number spawner + shake.
 * Works alongside UIManager for the in-game overlay.
 */
import gsap from 'gsap';

export class HUD {
  constructor() {
    this._fade = document.getElementById('fade');
    this._dmgNumbers = document.getElementById('damage-numbers');
    this._shakeEl = document.getElementById('hud');
  }
  getFadeEl() { return this._fade; }

  spawnDamageNumber(screenX, screenY, value, isPlayer = false) {
    if (!this._dmgNumbers) return;
    const el = document.createElement('div');
    el.className = 'damage-number';
    el.textContent = `-${Math.ceil(value)}`;
    el.style.left = `${screenX}px`;
    el.style.top  = `${screenY}px`;
    el.style.color = isPlayer ? '#ff4040' : '#ffdd40';
    this._dmgNumbers.appendChild(el);
    gsap.to(el, { y: -40, opacity: 0, duration: 0.9, ease:'power2.out',
      onComplete: () => el.remove() });
  }

  shake(intensity = 4, duration = 0.25) {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;
    gsap.to(canvas, {
      x: `+=${(Math.random()-0.5)*intensity*2}`,
      y: `+=${(Math.random()-0.5)*intensity}`,
      duration: duration / 4,
      repeat: 3, yoyo: true, ease:'rough({strength:2})',
      onComplete: () => gsap.set(canvas, { x:0, y:0 }),
    });
  }
}
