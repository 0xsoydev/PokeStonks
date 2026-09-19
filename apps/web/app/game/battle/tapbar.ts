import Phaser from 'phaser';
import type { TapCategory } from 'game-core';
import { audio } from '../audio';
import { C, H, W, drawFrame, hex, txt } from './ui';

/** Zone boundaries as fractions of the bar (left→right). */
const ZONES: { from: number; to: number; color: number; label: string }[] = [
  { from: 0.0, to: 0.05, color: 0x8a1f1f, label: '' },
  { from: 0.05, to: 0.4, color: 0xe8a030, label: 'GOOD' },
  { from: 0.4, to: 0.6, color: 0x58d858, label: 'PERFECT' },
  { from: 0.6, to: 0.95, color: 0xe8a030, label: 'GOOD' },
  { from: 0.95, to: 1.0, color: 0x8a1f1f, label: '' },
];
const PERIOD_MS = 1200;

export function categorize(pos: number): TapCategory {
  if (pos >= 0.4 && pos <= 0.6) return 'perfect';
  if (pos < 0.05 || pos > 0.95) return 'miss';
  return 'good';
}

/** Needle sweeps a triangle wave; the player's tap freezes it and picks the bucket the server will use. */
export class TapTimingBar {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private needle?: Phaser.GameObjects.Graphics;
  private running = false;
  private startedAt = 0;
  private resolve?: (c: TapCategory | null) => void;
  private lastZone = -1;
  private cleanups: Array<() => void> = [];

  constructor(private scene: Phaser.Scene) {}

  private pos(now: number): number {
    const ph = ((now - this.startedAt) % PERIOD_MS) / PERIOD_MS;
    return ph < 0.5 ? ph * 2 : 2 - ph * 2;
  }

  show(title: string): Promise<TapCategory | null> {
    this.cancel();
    return new Promise((resolve) => {
      this.resolve = resolve;
      const cx = W / 2, cy = 300, bw = 620, bh = 38, bx = cx - bw / 2, by = cy - bh / 2;
      const dim = this.scene.add.rectangle(cx, H / 2, W, H, 0x000000, 0.5).setDepth(60);
      const panel = this.scene.add.graphics().setDepth(61);
      drawFrame(panel, cx - 340, cy - 88, 680, 176, { fill: C.navy, border: C.gold, borderW: 4, inner: C.white });
      const t1 = txt(this.scene, cx, cy - 60, title, 14, '#ffffff').setOrigin(0.5).setDepth(62);
      const t2 = txt(this.scene, cx, cy + 62, 'TAP / SPACE IN THE GREEN FOR A CRITICAL HIT', 9, '#f8d858').setOrigin(0.5).setDepth(62);

      const bar = this.scene.add.graphics().setDepth(62);
      bar.fillStyle(C.ink, 1); bar.fillRoundedRect(bx - 6, by - 6, bw + 12, bh + 12, 6);
      for (const z of ZONES) {
        bar.fillStyle(z.color, 1);
        bar.fillRect(bx + z.from * bw, by, Math.ceil((z.to - z.from) * bw), bh);
        bar.fillStyle(0xffffff, 0.25); bar.fillRect(bx + z.from * bw, by, Math.ceil((z.to - z.from) * bw), 5);
      }
      const lbl = txt(this.scene, cx, by + bh + 12, 'PERFECT', 8, '#58d858').setOrigin(0.5, 0).setDepth(62);
      this.objs.push(dim, panel, t1, t2, bar, lbl);

      this.needle = this.scene.add.graphics().setDepth(63);
      this.objs.push(this.needle);

      this.startedAt = this.scene.time.now;
      this.running = true;
      this.lastZone = -1;
      const armedAt = this.scene.time.now + 260; // ignore the press that opened this bar / key auto-repeat

      const tap = (ev?: KeyboardEvent) => {
        if (!this.running || this.scene.time.now < armedAt || ev?.repeat) return;
        this.finish(this.pos(this.scene.time.now), bx, bw, by, bh);
      };
      this.scene.input.on('pointerdown', tap);
      for (const k of ['SPACE', 'Z', 'ENTER']) this.scene.input.keyboard?.on(`keydown-${k}`, tap);
      this.cleanups.push(() => {
        this.scene.input.off('pointerdown', tap);
        for (const k of ['SPACE', 'Z', 'ENTER']) this.scene.input.keyboard?.off(`keydown-${k}`, tap);
      });

      const upd = () => {
        if (!this.running || !this.needle) return;
        const p = this.pos(this.scene.time.now);
        this.drawNeedle(bx + p * bw, by, bh);
        const z = ZONES.findIndex((zz) => p >= zz.from && p < zz.to);
        if (z !== this.lastZone) { this.lastZone = z; audio.sfx('tap_tick'); }
      };
      this.scene.events.on('update', upd);
      this.cleanups.push(() => this.scene.events.off('update', upd));
    });
  }

  private drawNeedle(x: number, by: number, bh: number) {
    const g = this.needle!;
    g.clear();
    g.fillStyle(C.ink, 1); g.fillRect(x - 5, by - 14, 10, bh + 28);
    g.fillStyle(0xffffff, 1); g.fillRect(x - 3, by - 12, 6, bh + 24);
    g.fillStyle(0xffffff, 1); g.fillTriangle(x - 9, by - 24, x + 9, by - 24, x, by - 10);
  }

  private finish(pos: number, bx: number, bw: number, by: number, bh: number) {
    this.running = false;
    this.drawNeedle(bx + pos * bw, by, bh);
    const cat = categorize(pos);
    const label = cat === 'perfect' ? 'PERFECT!' : cat === 'good' ? 'GOOD' : 'MISS...';
    const color = cat === 'perfect' ? '#f8d858' : cat === 'good' ? '#ffffff' : '#f85858';
    audio.sfx(cat === 'perfect' ? 'tap_perfect' : cat === 'good' ? 'tap_good' : 'tap_miss');
    const res = txt(this.scene, W / 2, 300 - 110, label, cat === 'perfect' ? 30 : 22, color, { stroke: '#181818', strokeThickness: 6 }).setOrigin(0.5).setDepth(64);
    this.objs.push(res);
    this.scene.tweens.add({ targets: res, scale: { from: 0.4, to: 1.15 }, duration: 160, ease: 'Back.easeOut' });
    if (cat === 'perfect') this.scene.cameras.main.flash(120, 255, 240, 160);
    this.scene.time.delayedCall(520, () => { const r = this.resolve; this.resolve = undefined; this.teardown(); r?.(cat); });
  }

  /** Abort without a result (e.g. the turn clock ran out). */
  cancel() {
    const r = this.resolve; this.resolve = undefined;
    this.running = false;
    this.teardown();
    r?.(null);
  }

  private teardown() {
    this.cleanups.forEach((f) => f()); this.cleanups = [];
    this.objs.forEach((o) => o.destroy()); this.objs = [];
    this.needle = undefined;
  }

  get active() { return this.running; }
}
