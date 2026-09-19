import Phaser from 'phaser';
import type { TapScore } from 'game-core';

export class TapTimingBar {
  private scene: Phaser.Scene;
  private needle!: Phaser.GameObjects.Rectangle;
  private bg!: Phaser.GameObjects.Graphics;
  private resolve?: (score: TapScore) => void;
  private needlePos = 0; // 0–1
  private speed = 1 / 1.2; // full cycle in 1.2s
  private running = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  show(): Promise<TapScore> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.running = true;
      this.needlePos = 0;

      const cx = 480;
      const cy = 300;
      const w = 600;
      const h = 40;

      // Background: Red(40%) | Green(20%) | Red(40%)
      this.bg = this.scene.add.graphics();
      this.bg.fillStyle(0xe84040, 1);
      this.bg.fillRect(cx - w / 2, cy - h / 2, w * 0.4, h);
      this.bg.fillStyle(0x58d858, 1);
      this.bg.fillRect(cx - w / 2 + w * 0.4, cy - h / 2, w * 0.2, h);
      this.bg.fillStyle(0xe84040, 1);
      this.bg.fillRect(cx - w / 2 + w * 0.6, cy - h / 2, w * 0.4, h);
      this.bg.lineStyle(2, 0xffffff, 1);
      this.bg.strokeRect(cx - w / 2, cy - h / 2, w, h);

      // Needle
      this.needle = this.scene.add.rectangle(cx - w / 2, cy, 4, h + 8, 0xffffff);
      this.needle.setOrigin(0.5, 0.5);

      // Tap input
      const onTap = () => {
        if (!this.running) return;
        this.running = false;
        input.off('pointerdown', onTap);
        this.scene.input.keyboard?.off('keydown-SPACE', onTap);
        this.scene.input.keyboard?.off('keydown-Z', onTap);
        this.resolve?.(this.categorize());
        this.destroy();
      };

      const input = this.scene.input;
      input.on('pointerdown', onTap);
      this.scene.input.keyboard?.on('keydown-SPACE', onTap);
      this.scene.input.keyboard?.on('keydown-Z', onTap);

      // Needle movement
      this.scene.events.on('update', this.updateNeedle, this);
    });
  }

  private updateNeedle(_time: number, delta: number) {
    if (!this.running) return;
    const w = 600;
    const cx = 480;
    const halfW = w / 2;

    this.needlePos += (delta / 1000) * this.speed;
    if (this.needlePos > 1) this.needlePos -= 1;

    const x = cx - halfW + this.needlePos * w;
    this.needle.x = x;
  }

  private categorize(): TapScore {
    // 0.4–0.6 = perfect (green zone), else good, edge = miss
    const pos = this.needlePos;
    if (pos >= 0.4 && pos <= 0.6) {
      return { tapScore: 1.1, category: 'perfect' };
    }
    if (pos < 0.05 || pos > 0.95) {
      return { tapScore: 0.85, category: 'miss' };
    }
    return { tapScore: 1.0, category: 'good' };
  }

  private destroy() {
    this.scene.events.off('update', this.updateNeedle, this);
    this.bg?.destroy();
    this.needle?.destroy();
  }
}
