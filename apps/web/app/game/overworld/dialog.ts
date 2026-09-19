import type Phaser from 'phaser';
import { audio } from '../audio';
import { C, FONT, H, W, drawFrame, txt } from './ui';

const BOX_X = 24, BOX_W = W - 48, BOX_H = 158, BOX_Y = H - BOX_H - 22;
const CHARS_PER_SEC = 48;

/**
 * Typewriter dialog + yes/no prompt in the battle UI's visual language: navy body, gold and white
 * double border, cream text. All objects are created once and shown/hidden.
 */
export class DialogBox {
  private frame: Phaser.GameObjects.Graphics;
  private body: Phaser.GameObjects.Text;
  private tag: Phaser.GameObjects.Container;
  private tagText: Phaser.GameObjects.Text;
  private arrow: Phaser.GameObjects.Graphics;
  private arrowTween: Phaser.Tweens.Tween;
  private choiceFrame: Phaser.GameObjects.Graphics;
  private choiceTexts: Phaser.GameObjects.Text[] = [];
  private cursor: Phaser.GameObjects.Text;

  private pages: string[] = [];
  private page = 0;
  private wrapped = '';
  private shown = 0;
  private acc = 0;
  private lastBlip = 0;
  private typing = false;
  private done: (() => void) | null = null;

  private options: string[] = [];
  private sel = 0;
  private choose: ((i: number) => void) | null = null;

  constructor(private scene: Phaser.Scene) {
    const depth = 5000;
    this.frame = scene.add.graphics().setDepth(depth).setVisible(false);
    drawFrame(this.frame, BOX_X, BOX_Y, BOX_W, BOX_H, { fill: C.navy, border: C.gold, borderW: 6, inner: C.white });
    this.body = txt(scene, BOX_X + 34, BOX_Y + 30, '', 17, '#f8f8d0', {
      wordWrap: { width: BOX_W - 96 }, lineSpacing: 14, shadow: { offsetX: 2, offsetY: 2, color: '#181818', fill: true },
    }).setDepth(depth + 1).setVisible(false);

    const tagBg = scene.add.graphics();
    drawFrame(tagBg, 0, 0, 220, 38, { fill: C.slate, border: C.gold, borderW: 3 });
    this.tagText = txt(scene, 110, 19, '', 11, '#f8f8d0').setOrigin(0.5);
    this.tag = scene.add.container(BOX_X + 26, BOX_Y - 26, [tagBg, this.tagText]).setDepth(depth + 1).setVisible(false);

    this.arrow = scene.add.graphics().setDepth(depth + 2).setVisible(false);
    this.arrow.fillStyle(C.cream, 1);
    this.arrow.fillTriangle(0, 0, 18, 0, 9, 12);
    this.arrow.setPosition(BOX_X + BOX_W - 56, BOX_Y + BOX_H - 44);
    this.arrowTween = scene.tweens.add({ targets: this.arrow, y: this.arrow.y + 6, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.choiceFrame = scene.add.graphics().setDepth(depth + 3).setVisible(false);
    this.cursor = txt(scene, 0, 0, '▶', 16, '#f8d858').setDepth(depth + 5).setVisible(false);
  }

  get isOpen() { return this.pages.length > 0 || this.options.length > 0; }
  get isChoosing() { return this.options.length > 0; }

  /** Show pages one by one; resolves when the last page is dismissed. */
  open(pages: readonly string[], speaker?: string): Promise<void> {
    this.pages = [...pages];
    this.page = 0;
    this.frame.setVisible(true);
    this.body.setVisible(true);
    this.tag.setVisible(!!speaker);
    if (speaker) this.tagText.setText(speaker.toUpperCase());
    this.startPage();
    return new Promise((res) => { this.done = res; });
  }

  /** Dialog followed by a choice list. Resolves with the picked index. */
  async ask(pages: readonly string[], options: readonly string[], speaker?: string): Promise<number> {
    const shown = this.open(pages, speaker);
    // keep the box up and add the choice list once the last page has finished typing
    this.pendingChoice = [...options];
    await shown;
    return this.lastChoice;
  }
  private pendingChoice: string[] | null = null;
  private lastChoice = 0;

  private startPage() {
    const raw = this.pages[this.page] ?? '';
    this.wrapped = this.body.runWordWrap(raw);
    this.shown = 0; this.acc = 0; this.typing = true; this.lastBlip = 0;
    this.body.setText('');
    this.arrow.setVisible(false);
  }

  /** Confirm pressed (A / Z / Space / Enter / tap). */
  press() {
    if (this.choose) { this.pick(this.sel); return; }
    if (this.typing) { this.finishTyping(); return; }
    if (this.pendingChoice && this.page >= this.pages.length - 1) { this.showChoices(); return; }
    if (this.page < this.pages.length - 1) { this.page++; audio.sfx('menu_select'); this.startPage(); return; }
    this.close();
  }

  /** Move the yes/no cursor (-1 up, +1 down). */
  nav(dy: -1 | 1) {
    if (!this.choose) return;
    const next = (this.sel + dy + this.options.length) % this.options.length;
    if (next !== this.sel) { this.sel = next; audio.sfx('menu_move'); this.layoutChoices(); }
  }

  /** Per-frame typewriter advance. Allocation-free while typing. */
  update(delta: number) {
    if (!this.typing) return;
    this.acc += (delta / 1000) * CHARS_PER_SEC;
    const n = Math.min(this.wrapped.length, Math.floor(this.acc));
    if (n !== this.shown) {
      this.shown = n;
      this.body.setText(this.wrapped.slice(0, n));
      if (n - this.lastBlip >= 3 && this.wrapped[n - 1] !== ' ' && this.wrapped[n - 1] !== '\n') { this.lastBlip = n; audio.sfx('dialog_blip'); }
    }
    if (n >= this.wrapped.length) this.finishTyping();
  }

  private finishTyping() {
    this.typing = false;
    this.shown = this.wrapped.length;
    this.body.setText(this.wrapped);
    if (this.pendingChoice && this.page >= this.pages.length - 1) this.showChoices();
    else this.arrow.setVisible(true);
  }

  private showChoices() {
    const opts = this.pendingChoice!;
    this.pendingChoice = null;
    this.options = opts;
    this.sel = 0;
    this.arrow.setVisible(false);
    const bw = 250, bh = 34 + opts.length * 46;
    const x = BOX_X + BOX_W - bw - 6, y = BOX_Y - bh - 8;
    this.choiceFrame.clear();
    drawFrame(this.choiceFrame, x, y, bw, bh, { fill: C.navy, border: C.gold, borderW: 5, inner: C.white });
    this.choiceFrame.setVisible(true);
    opts.forEach((label, i) => {
      const t = txt(this.scene, x + 64, y + 26 + i * 46, label, 17, '#f8f8d0').setDepth(5010).setInteractive({ useHandCursor: true });
      t.on('pointerover', () => { if (this.sel !== i) { this.sel = i; this.layoutChoices(); } });
      t.on('pointerdown', () => this.pick(i));
      this.choiceTexts.push(t);
    });
    this.choiceX = x; this.choiceY = y;
    this.layoutChoices();
    this.choose = (i) => { this.lastChoice = i; this.hideChoices(); this.close(); };
  }
  private choiceX = 0;
  private choiceY = 0;

  private layoutChoices() {
    this.cursor.setPosition(this.choiceX + 26, this.choiceY + 24 + this.sel * 46).setVisible(true);
  }

  private pick(i: number) {
    if (!this.choose) return;
    audio.sfx(i === 0 ? 'menu_select' : 'menu_back');
    const cb = this.choose;
    this.choose = null;
    cb(i);
  }

  private hideChoices() {
    this.choiceFrame.setVisible(false);
    this.cursor.setVisible(false);
    this.choiceTexts.forEach((t) => t.destroy());
    this.choiceTexts = [];
    this.options = [];
  }

  private close() {
    this.pages = [];
    this.typing = false;
    this.frame.setVisible(false);
    this.body.setVisible(false).setText('');
    this.tag.setVisible(false);
    this.arrow.setVisible(false);
    const cb = this.done;
    this.done = null;
    cb?.();
  }

  /** Abort without resolving choices (scene teardown). */
  destroy() {
    this.arrowTween.stop();
    this.choiceTexts.forEach((t) => t.destroy());
    [this.frame, this.body, this.tag, this.arrow, this.choiceFrame, this.cursor].forEach((o) => o.destroy());
    this.done = null;
    this.choose = null;
  }
}
void FONT;
