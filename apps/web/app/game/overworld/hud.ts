import type Phaser from 'phaser';
import { getSpecies } from 'game-core';
import { C, H, TYPE_COLOR, W, drawFrame, notched, txt } from './ui';

export type ToastTone = 'info' | 'good' | 'bad';
const TONE_BORDER: Record<ToastTone, number> = { info: C.gold, good: C.green, bad: C.red };

/**
 * Persistent overworld HUD, drawn in screen space by the scene's unzoomed camera:
 * species card (top-left), route plate (top-centre), key hints and transient toasts.
 */
export class Hud {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private hint: Phaser.GameObjects.Container | null = null;
  private toasts: Phaser.GameObjects.Container[] = [];
  private routePlate: Phaser.GameObjects.Container;
  private routeText: Phaser.GameObjects.Text;

  constructor(private scene: Phaser.Scene, speciesId: string, routeName: string, showHint: boolean) {
    const sp = getSpecies(speciesId);
    const depth = 4000;

    // species card
    const card = scene.add.graphics().setDepth(depth);
    drawFrame(card, 14, 14, 312, 104, { fill: C.navy, border: C.gold, borderW: 4, inner: C.white });
    const well = scene.add.graphics().setDepth(depth + 1);
    notched(well, 28, 28, 76, 76, C.navyDark, 1, 3);
    well.lineStyle(2, C.slate, 1); well.strokeRect(30, 30, 72, 72);
    const key = `mon_${sp.id}_front`;
    const portrait = scene.textures.exists(key) ? scene.add.image(66, 68, key).setDisplaySize(72, 72).setDepth(depth + 2) : null;
    const name = txt(scene, 118, 30, sp.name.toUpperCase(), 14, '#f8f8d0').setDepth(depth + 2);
    const tick = txt(scene, 118, 56, `$${sp.ticker}`, 12, '#f8d858').setDepth(depth + 2);
    const chip = scene.add.graphics().setDepth(depth + 2);
    const chipW = 12 * sp.affinity.length + 20;
    notched(chip, 118, 78, chipW, 24, C.ink, 1, 3);
    notched(chip, 120, 80, chipW - 4, 20, TYPE_COLOR[sp.affinity] ?? C.slate, 1, 2);
    const chipText = txt(scene, 118 + chipW / 2, 91, sp.affinity.toUpperCase(), 9, '#181818').setOrigin(0.5).setDepth(depth + 3);
    this.objs.push(card, well, name, tick, chip, chipText);
    if (portrait) this.objs.push(portrait);

    // route plate
    const plateBg = scene.add.graphics();
    const pw = Math.max(240, routeName.length * 15 + 50);
    drawFrame(plateBg, -pw / 2, 0, pw, 42, { fill: C.navy, border: C.gold, borderW: 4 });
    this.routeText = txt(scene, 0, 21, routeName.toUpperCase(), 13, '#f8f8d0').setOrigin(0.5);
    this.routePlate = scene.add.container(W / 2, 14, [plateBg, this.routeText]).setDepth(depth);
    this.objs.push(this.routePlate);

    if (showHint) this.buildHint(depth);
  }

  private buildHint(depth: number) {
    const s = 'ARROWS/WASD MOVE   Z TALK   SHIFT RUN   ESC EXIT';
    const t = txt(this.scene, 0, 0, s, 9, '#c8c8f0').setOrigin(0.5);
    const bg = this.scene.add.graphics();
    const w = t.width + 32;
    notched(bg, -w / 2, -14, w, 28, C.ink, 0.62, 3);
    this.hint = this.scene.add.container(W / 2, H - 24, [bg, t]).setDepth(depth);
    this.objs.push(this.hint);
    // fade the hint after a few seconds; it has done its job
    this.scene.tweens.add({ targets: this.hint, alpha: 0, delay: 9000, duration: 900 });
  }

  toast(text: string, tone: ToastTone = 'info') {
    const scene = this.scene;
    const t = txt(scene, 0, 0, text, 11, '#f8f8d0').setOrigin(0.5);
    const w = Math.min(W - 60, t.width + 56), h = 42;
    const bg = scene.add.graphics();
    drawFrame(bg, -w / 2, -h / 2, w, h, { fill: C.navy, border: TONE_BORDER[tone], borderW: 4 });
    const c = scene.add.container(W / 2, -40, [bg, t]).setDepth(4100);
    const slot = this.toasts.length;
    this.toasts.push(c);
    const y = 92 + slot * 50;
    scene.tweens.add({ targets: c, y, duration: 240, ease: 'Back.easeOut' });
    scene.tweens.add({
      targets: c, alpha: 0, delay: 2600, duration: 380,
      onComplete: () => {
        this.toasts = this.toasts.filter((q) => q !== c);
        c.destroy();
        this.toasts.forEach((q, i) => scene.tweens.add({ targets: q, y: 92 + i * 50, duration: 160 }));
      },
    });
  }

  setRoute(name: string) { this.routeText.setText(name.toUpperCase()); }

  destroy() {
    this.toasts.forEach((c) => c.destroy());
    this.toasts = [];
    this.objs.forEach((o) => o.destroy());
    this.objs = [];
  }
}
