import Phaser from 'phaser';

export function lunge(scene: Phaser.Scene, target: Phaser.GameObjects.Image): Promise<void> {
  return new Promise((resolve) => {
    const startX = target.x;
    scene.tweens.add({
      targets: target,
      x: startX + 12,
      duration: 75,
      yoyo: true,
      ease: 'Power2',
      onComplete: () => { target.x = startX; resolve(); },
    });
  });
}

export function hitFlash(scene: Phaser.Scene, target: Phaser.GameObjects.Image): Promise<void> {
  return new Promise((resolve) => {
    target.setTintFill(0xffffff);
    scene.time.delayedCall(60, () => { target.clearTint(); resolve(); });
  });
}

export function hitStop(scene: Phaser.Scene, frames = 4): Promise<void> {
  return new Promise((resolve) => {
    scene.time.delayedCall(frames * 16.67, resolve);
  });
}

export function squashStretch(scene: Phaser.Scene, target: Phaser.GameObjects.Image) {
  scene.tweens.add({
    targets: target,
    scaleX: 1.2,
    scaleY: 0.8,
    duration: 80,
    yoyo: true,
    ease: 'Back.easeOut',
  });
}

export function screenShake(scene: Phaser.Scene, crit = false, superEff = false) {
  const intensity = crit || superEff ? 0.008 : 0.004;
  scene.cameras.main.shake(120, intensity);
}

export function critBurst(scene: Phaser.Scene, x: number, y: number) {
  for (let i = 0; i < 8; i++) {
    const star = scene.add.circle(x, y, 3, 0xffd700);
    const angle = (i / 8) * Math.PI * 2;
    scene.tweens.add({
      targets: star,
      x: x + Math.cos(angle) * 40,
      y: y + Math.sin(angle) * 40,
      alpha: 0,
      duration: 400,
      ease: 'Cubic.easeOut',
      onComplete: () => star.destroy(),
    });
  }
}

export function superEffectiveFlash(scene: Phaser.Scene) {
  scene.cameras.main.flash(200, 255, 255, 255);
}

export function faintAnimation(scene: Phaser.Scene, target: Phaser.GameObjects.Image): Promise<void> {
  return new Promise((resolve) => {
    scene.tweens.add({
      targets: target,
      y: target.y + 50,
      alpha: 0,
      duration: 500,
      ease: 'Sine.easeIn',
      onComplete: () => resolve(),
    });
  });
}

export function hpTween(
  scene: Phaser.Scene,
  bar: Phaser.GameObjects.Graphics,
  x: number, y: number,
  fromPct: number, toPct: number,
): Promise<void> {
  return new Promise((resolve) => {
    const color = toPct > 0.5 ? 0x58d858 : toPct > 0.2 ? 0xf8d858 : 0xf85858;
    scene.tweens.addCounter({
      from: fromPct * 120,
      to: toPct * 120,
      duration: 600,
      ease: 'Sine.easeOut',
      onUpdate: (tween) => {
        bar.clear();
        bar.fillStyle(0x333333, 1);
        bar.fillRect(x, y, 120, 12);
        bar.fillStyle(color, 1);
        bar.fillRect(x, y, tween.getValue(), 12);
      },
      onComplete: () => resolve(),
    });
  });
}

export function lowHpBeep(scene: Phaser.Scene) {
  // Pulse red tint on HP bar — triggered when HP < 20%
  scene.time.addEvent({
    delay: 800,
    repeat: -1,
    callback: () => {
      scene.cameras.main.flash(100, 255, 0, 0);
    },
  });
}
