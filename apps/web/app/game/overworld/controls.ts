import type Phaser from 'phaser';
import { C, H, W, isCoarsePointer, notched } from './ui';
import type { Dir } from './mapTypes';

const DPAD = { x: 132, y: H - 132, arm: 100, dead: 26 };
const BTN_A = { x: W - 118, y: H - 150, r: 50 };
const BTN_B = { x: W - 232, y: H - 96, r: 40 };

/** Per-frame input snapshot. One object, mutated in place: reading it never allocates. */
export interface InputState {
  dir: Dir | null;
  run: boolean;
  confirm: boolean;      // edge: pressed this frame
  cancel: boolean;       // edge
  menu: boolean;         // edge: Esc
  navUp: boolean;        // edge (menu navigation)
  navDown: boolean;      // edge
}

type Key = Phaser.Input.Keyboard.Key;

/** Keyboard + on-screen touch controls merged into one polled input state. */
export class Controls {
  readonly state: InputState = { dir: null, run: false, confirm: false, cancel: false, menu: false, navUp: false, navDown: false };
  readonly touch: boolean;
  private keys: { up: Key; down: Key; left: Key; right: Key; w: Key; a: Key; s: Key; d: Key; shift: Key; z: Key; x: Key; space: Key; enter: Key; esc: Key } | null = null;
  private dirKeys: Array<[Key, Dir]> = [];
  private prev = { confirm: false, cancel: false, menu: false, up: false, down: false };
  private dpadBase: Phaser.GameObjects.Graphics | null = null;
  private btnBase: Phaser.GameObjects.Graphics | null = null;
  private labels: Phaser.GameObjects.Text[] = [];
  private dpadShown = true;
  private btnShown = true;
  private pressedGfx: { up: Phaser.GameObjects.Graphics; down: Phaser.GameObjects.Graphics; left: Phaser.GameObjects.Graphics; right: Phaser.GameObjects.Graphics; a: Phaser.GameObjects.Graphics; b: Phaser.GameObjects.Graphics } | null = null;
  private tapAnywhere: ((p: Phaser.Input.Pointer) => void) | null = null;
  /** Set by the scene: pointer taps elsewhere act like confirm on non-touch devices. */
  tapConfirm = false;

  constructor(private scene: Phaser.Scene) {
    this.touch = isCoarsePointer();
    const kb = scene.input.keyboard;
    if (kb) {
      const k = (n: string) => kb.addKey(n, true);
      this.keys = {
        up: k('UP'), down: k('DOWN'), left: k('LEFT'), right: k('RIGHT'), w: k('W'), a: k('A'), s: k('S'), d: k('D'),
        shift: k('SHIFT'), z: k('Z'), x: k('X'), space: k('SPACE'), enter: k('ENTER'), esc: k('ESC'),
      };
      this.dirKeys = [
        [this.keys.up, 'up'], [this.keys.w, 'up'], [this.keys.down, 'down'], [this.keys.s, 'down'],
        [this.keys.left, 'left'], [this.keys.a, 'left'], [this.keys.right, 'right'], [this.keys.d, 'right'],
      ];
    }
    if (this.touch) {
      scene.input.addPointer(3);
      this.buildTouch();
    } else {
      this.tapAnywhere = () => { this.tapConfirm = true; };
      scene.input.on('pointerdown', this.tapAnywhere);
    }
  }

  private buildTouch() {
    const s = this.scene;
    const depth = 6000;
    const base = s.add.graphics().setDepth(depth).setScrollFactor(0);
    const btnBase = s.add.graphics().setDepth(depth).setScrollFactor(0);
    const mk = () => s.add.graphics().setDepth(depth + 1).setScrollFactor(0).setVisible(false);
    // D-pad cross
    const arm = (x: number, y: number, w: number, h: number) => { notched(base, x, y, w, h, C.navy, 0.62, 6); base.lineStyle(3, C.gold, 0.9); base.strokeRect(x + 1, y + 1, w - 2, h - 2); };
    const { x, y } = DPAD;
    arm(x - 34, y - 102, 68, 68); arm(x - 34, y + 34, 68, 68); arm(x - 102, y - 34, 68, 68); arm(x + 34, y - 34, 68, 68);
    notched(base, x - 34, y - 34, 68, 68, C.navyDark, 0.62, 6);
    base.fillStyle(C.cream, 0.9);
    base.fillTriangle(x, y - 90, x - 14, y - 62, x + 14, y - 62);
    base.fillTriangle(x, y + 90, x - 14, y + 62, x + 14, y + 62);
    base.fillTriangle(x - 90, y, x - 62, y - 14, x - 62, y + 14);
    base.fillTriangle(x + 90, y, x + 62, y - 14, x + 62, y + 14);
    // A / B
    for (const [b, label] of [[BTN_A, 'A'], [BTN_B, 'B']] as const) {
      btnBase.fillStyle(C.navy, 0.68); btnBase.fillCircle(b.x, b.y, b.r);
      btnBase.lineStyle(4, C.gold, 0.95); btnBase.strokeCircle(b.x, b.y, b.r);
      const t = s.add.text(b.x, b.y + 2, label, { fontFamily: '"Press Start 2P", monospace', fontSize: `${b.r * 0.62}px`, color: '#f8f8d0' }).setOrigin(0.5).setDepth(depth + 2).setScrollFactor(0).setResolution(2);
      this.labels.push(t);
    }
    const up = mk(), down = mk(), left = mk(), right = mk(), a = mk(), b = mk();
    const hl = (g: Phaser.GameObjects.Graphics, rx: number, ry: number, w: number, h: number) => { g.fillStyle(0xffffff, 0.35); g.fillRect(rx, ry, w, h); };
    hl(up, x - 34, y - 102, 68, 68); hl(down, x - 34, y + 34, 68, 68); hl(left, x - 102, y - 34, 68, 68); hl(right, x + 34, y - 34, 68, 68);
    a.fillStyle(0xffffff, 0.35); a.fillCircle(BTN_A.x, BTN_A.y, BTN_A.r);
    b.fillStyle(0xffffff, 0.35); b.fillCircle(BTN_B.x, BTN_B.y, BTN_B.r);
    this.pressedGfx = { up, down, left, right, a, b };
    this.dpadBase = base; this.btnBase = btnBase;
  }

  /** Show/hide the on-screen pad parts (the D-pad hides while a dialog owns the screen; A stays). */
  setTouchVisible(dpad: boolean, buttons: boolean) {
    if (!this.touch || (dpad === this.dpadShown && buttons === this.btnShown)) return;
    this.dpadShown = dpad; this.btnShown = buttons;
    this.dpadBase?.setVisible(dpad);
    this.btnBase?.setVisible(buttons);
    for (const t of this.labels) t.setVisible(buttons);
    const pg = this.pressedGfx;
    if (pg) {
      if (!dpad) { pg.up.setVisible(false); pg.down.setVisible(false); pg.left.setVisible(false); pg.right.setVisible(false); }
      if (!buttons) { pg.a.setVisible(false); pg.b.setVisible(false); }
    }
  }

  /** Clear edge/held state (after a pause, dialog, or scene resume) so nothing fires from stale keys. */
  reset() {
    this.scene.input.keyboard?.resetKeys();
    const p = this.prev;
    p.confirm = p.cancel = p.menu = p.up = p.down = true; // require a release before the next edge
    this.tapConfirm = false;
  }

  /** Read hardware once per frame into `state`. No allocation. */
  poll(): InputState {
    const st = this.state;
    const k = this.keys;
    let dir: Dir | null = null;
    let run = false, confirmDown = false, cancelDown = false, menuDown = false, upDown = false, downDown = false;
    if (k) {
      // most recently pressed direction key wins
      let best = -1;
      for (let i = 0; i < this.dirKeys.length; i++) {
        const key = this.dirKeys[i][0];
        if (key.isDown && key.timeDown >= best) { best = key.timeDown; dir = this.dirKeys[i][1]; }
      }
      run = k.shift.isDown;
      confirmDown = k.z.isDown || k.space.isDown || k.enter.isDown;
      cancelDown = k.x.isDown;
      menuDown = k.esc.isDown;
      upDown = k.up.isDown || k.w.isDown;
      downDown = k.down.isDown || k.s.isDown;
    }
    if (this.touch && (this.dpadShown || this.btnShown)) {
      const pg = this.pressedGfx!;
      let td: Dir | null = null, ta = false, tb = false;
      const ptrs = this.scene.input.manager.pointers;
      for (let i = 0; i < ptrs.length; i++) {
        const p = ptrs[i];
        if (!p || !p.isDown) continue;
        const dx = p.x - DPAD.x, dy = p.y - DPAD.y;
        if (this.dpadShown && Math.abs(dx) <= DPAD.arm + 24 && Math.abs(dy) <= DPAD.arm + 24 && Math.abs(dx) + Math.abs(dy) > DPAD.dead) {
          td = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
          continue;
        }
        if (!this.btnShown) continue;
        if ((p.x - BTN_A.x) ** 2 + (p.y - BTN_A.y) ** 2 <= (BTN_A.r + 14) ** 2) { ta = true; continue; }
        if ((p.x - BTN_B.x) ** 2 + (p.y - BTN_B.y) ** 2 <= (BTN_B.r + 14) ** 2) { tb = true; }
      }
      if (td && !dir) dir = td;
      if (ta) confirmDown = true;
      if (tb) run = true;
      pg.up.setVisible(td === 'up'); pg.down.setVisible(td === 'down'); pg.left.setVisible(td === 'left'); pg.right.setVisible(td === 'right');
      pg.a.setVisible(ta); pg.b.setVisible(tb);
      if (td === 'up') upDown = true;
      if (td === 'down') downDown = true;
    }
    if (this.tapConfirm) { confirmDown = true; }

    const p = this.prev;
    st.dir = dir;
    st.run = run;
    st.confirm = confirmDown && !p.confirm;
    st.cancel = cancelDown && !p.cancel;
    st.menu = menuDown && !p.menu;
    st.navUp = upDown && !p.up;
    st.navDown = downDown && !p.down;
    p.confirm = confirmDown; p.cancel = cancelDown; p.menu = menuDown; p.up = upDown; p.down = downDown;
    this.tapConfirm = false;
    return st;
  }

  destroy() {
    if (this.tapAnywhere) this.scene.input.off('pointerdown', this.tapAnywhere);
    this.dpadBase?.destroy(); this.btnBase?.destroy();
    for (const t of this.labels) t.destroy();
    if (this.pressedGfx) for (const g of Object.values(this.pressedGfx)) g.destroy();
    this.dpadBase = this.btnBase = null; this.labels = [];
    this.pressedGfx = null;
    const kb = this.scene.input.keyboard;
    if (kb && this.keys) for (const key of Object.values(this.keys)) kb.removeKey(key, true);
  }
}
