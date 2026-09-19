import * as Phaser from 'phaser';
import { C, H, W, drawFrame, txt } from './ui';
import { audio } from '../audio';

type St = 'idle' | 'typing' | 'holding' | 'waiting';

/**
 * Bottom dialog box with a typewriter. Input (tap / Z / Space / Enter) skips typing, then advances.
 * `say()` auto-advances after `holdMs` so a turn's pacing never depends on a player pressing a key —
 * that keeps both machines in lock-step.
 */
export class DialogBox {
  readonly y = 500;
  private g: Phaser.GameObjects.Graphics;
  private text: Phaser.GameObjects.Text;
  private arrow: Phaser.GameObjects.Text;
  private state: St = 'idle';
  private full = '';
  private timer?: Phaser.Time.TimerEvent;
  private hold?: Phaser.Time.TimerEvent;
  private resolve?: () => void;
  private blipEvery = 0;
  private opts: { wait?: boolean; holdMs?: number } = {};

  constructor(private scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(40);
    drawFrame(this.g, 0, this.y, W, H - this.y, { fill: C.navy, border: C.gold, borderW: 4, inner: C.white });
    this.text = txt(scene, 34, this.y + 26, '', 14, '#ffffff', { wordWrap: { width: W - 90 }, lineSpacing: 12 }).setDepth(41);
    this.arrow = txt(scene, W - 52, H - 44, '▼', 14, '#d8a830').setDepth(41).setVisible(false);
    scene.tweens.add({ targets: this.arrow, alpha: 0.25, duration: 420, yoyo: true, repeat: -1 });

    scene.input.on('pointerdown', this.onInput, this);
    const kb = scene.input.keyboard;
    kb?.on('keydown-Z', this.onKey, this);
    kb?.on('keydown-SPACE', this.onKey, this);
    kb?.on('keydown-ENTER', this.onKey, this);
  }

  private onKey(ev?: KeyboardEvent) { if (ev?.repeat) return; this.onInput(); }

  private onInput() {
    if (this.state === 'typing') this.finishTyping();
    else if (this.state === 'holding' || this.state === 'waiting') this.advance();
  }

  /** Type `text`. `wait:true` blocks on input; otherwise auto-advances after `holdMs`. */
  say(text: string, opts: { wait?: boolean; holdMs?: number } = {}): Promise<void> {
    this.cancel();
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.full = text;
      this.text.setText('');
      this.arrow.setVisible(false);
      this.state = 'typing';
      this.opts = opts;
      let i = 0;
      const perTick = 1;
      this.timer = this.scene.time.addEvent({
        delay: 16, loop: true,
        callback: () => {
          i += perTick;
          this.text.setText(this.full.slice(0, i));
          if (++this.blipEvery % 3 === 0 && this.full[i - 1] !== ' ') audio.sfx('dialog_blip');
          if (i >= this.full.length) this.finishTyping(opts);
        },
      });
    });
  }

  private finishTyping(opts: { wait?: boolean; holdMs?: number } = this.opts) {
    this.timer?.remove(); this.timer = undefined;
    this.text.setText(this.full);
    if (opts.wait) {
      this.state = 'waiting';
      this.arrow.setVisible(true);
    } else {
      this.state = 'holding';
      this.hold = this.scene.time.delayedCall(opts.holdMs ?? 650, () => this.advance());
    }
  }

  private advance() {
    this.hold?.remove(); this.hold = undefined;
    this.arrow.setVisible(false);
    this.state = 'idle';
    const r = this.resolve; this.resolve = undefined;
    r?.();
  }

  /** Persistent prompt text (no waiting), e.g. "What will TESLAQ do?". */
  prompt(text: string) {
    this.cancel();
    this.state = 'idle';
    this.text.setText(text);
    this.arrow.setVisible(false);
  }

  clear() { this.prompt(''); }

  private cancel() {
    this.timer?.remove(); this.timer = undefined;
    this.hold?.remove(); this.hold = undefined;
    const r = this.resolve; this.resolve = undefined;
    r?.();
  }

  destroy() {
    this.cancel();
    this.scene.input.off('pointerdown', this.onInput, this);
    const kb = this.scene.input.keyboard;
    kb?.off('keydown-Z', this.onKey, this);
    kb?.off('keydown-SPACE', this.onKey, this);
    kb?.off('keydown-ENTER', this.onKey, this);
    this.g.destroy(); this.text.destroy(); this.arrow.destroy();
  }
}
