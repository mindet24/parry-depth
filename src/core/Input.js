/**
 * Input.js — Keyboard state with normalised movement vector.
 * Remaps WASD/arrow screen-space to isometric ground plane in Player.
 *
 * Phase 1 additions:
 *   F        → Parry (consumed as one-shot press)
 *   Space    → Dash  (consumed as one-shot press)
 */
export class Input {
  constructor() {
    this.keys = {};
    this._justPressed = {};

    window.addEventListener('keydown', e => {
      if (!this.keys[e.code]) {
        this._justPressed[e.code] = true;
      }
      this.keys[e.code] = true;
      if (this._block(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('mousedown', e => {
      if (e.button === 0) {
        if (!this.keys['Mouse0']) this._justPressed['Mouse0'] = true;
        this.keys['Mouse0'] = true;
      } else if (e.button === 2) {
        if (!this.keys['Mouse2']) this._justPressed['Mouse2'] = true;
        this.keys['Mouse2'] = true;
      }
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.keys['Mouse0'] = false;
      if (e.button === 2) this.keys['Mouse2'] = false;
    });
    window.addEventListener('contextmenu', e => {
      e.preventDefault();
    });
    window.addEventListener('blur',  () => { this.keys = {}; this._justPressed = {}; });
  }

  isDown(c)   { return !!this.keys[c]; }

  /** Returns true once per key press (cleared after reading). */
  consumePress(c) {
    if (this._justPressed[c]) {
      delete this._justPressed[c];
      return true;
    }
    return false;
  }

  /** Trigger for Parry/Block initiation: Right Click (Mouse2) or F key */
  consumeParryPress() {
    return this.consumePress('Mouse2') || this.consumePress('KeyF');
  }

  /** Is the Parry/Block button currently held down? */
  isParryHeld() {
    return this.isDown('Mouse2') || this.isDown('KeyF');
  }

  /** Check for attack trigger: Left Click (Mouse0), J, E, or K */
  consumeAttack() {
    return this.consumePress('Mouse0') || this.consumePress('KeyJ') || this.consumePress('KeyE') || this.consumePress('KeyK');
  }

  getRaw() {
    let x = 0, y = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp'))    y -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown'))  y += 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft'))  x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    return { x, y };
  }

  _block(c) {
    return ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
            'KeyW','KeyA','KeyS','KeyD','Space','Escape','KeyF'].includes(c);
  }
}
