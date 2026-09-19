import Phaser from 'phaser';
import { BattleScene } from '../scenes/BattleScene';
import type { TurnEvent } from 'game-core';

interface QueuedEvent extends TurnEvent {
  _processed?: boolean;
}

export class AnimationQueue {
  private scene: BattleScene;
  private events: QueuedEvent[] = [];
  private isProcessing = false;
  private lastPlayedTurn = -1;

  constructor(scene: BattleScene) {
    this.scene = scene;
  }

  enqueue(turnNo: number, events: TurnEvent[]) {
    // Idempotency: ignore if turn already processed
    if (turnNo <= this.lastPlayedTurn) return;
    this.lastPlayedTurn = turnNo;
    this.events.push(...events.map((e) => ({ ...e })));
  }

  processNext(onComplete?: () => void) {
    if (this.isProcessing || this.events.length === 0) {
      onComplete?.();
      return;
    }

    this.isProcessing = true;
    const event = this.events.shift()!;
    this.playEvent(event).then(() => {
      this.isProcessing = false;
      if (this.events.length > 0) {
        this.processNext(onComplete);
      } else {
        onComplete?.();
      }
    });
  }

  private async playEvent(event: QueuedEvent) {
    const battleScene = this.scene;
    const foeSprite = (battleScene as unknown as Record<string, Phaser.GameObjects.Image>).foeSprite;
    const allySprite = (battleScene as unknown as Record<string, Phaser.GameObjects.Image>).allySprite;
    const target = event.by === 'me' ? foeSprite : allySprite;

    // Lunge
    await this.lunge(target);

    // Hit flash
    await this.hitFlash(target);

    // Hit-stop (3 frame freeze)
    await this.hitStop();

    // Screen shake (bigger on crit/super-effective)
    const intensity = event.crit || event.typeMult > 1 ? 0.008 : 0.004;
    this.scene.cameras.main.shake(120, intensity);

    // Show damage message
    const msg = event.crit ? `${event.msg} CRITICAL!` : event.msg;
    await battleScene.showDialog(msg);
  }

  private lunge(target: Phaser.GameObjects.Image): Promise<void> {
    return new Promise((resolve) => {
      const startX = target.x;
      this.scene.tweens.add({
        targets: target,
        x: startX + 12,
        duration: 75,
        yoyo: true,
        ease: 'Power2',
        onComplete: () => {
          target.x = startX;
          resolve();
        },
      });
    });
  }

  private hitFlash(target: Phaser.GameObjects.Image): Promise<void> {
    return new Promise((resolve) => {
      target.setTintFill(0xffffff);
      this.scene.time.delayedCall(60, () => {
        target.clearTint();
        resolve();
      });
    });
  }

  private hitStop(): Promise<void> {
    return new Promise((resolve) => {
      this.scene.time.delayedCall(50, resolve);
    });
  }

  clear() {
    this.events = [];
    this.isProcessing = false;
    this.lastPlayedTurn = -1;
  }
}
