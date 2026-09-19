import Phaser from 'phaser';

export async function playCutscene(scene: Phaser.Scene, foeName: string): Promise<void> {
  const cam = scene.cameras.main;
  scene.input.enabled = false;

  // 3x white flash (80ms each)
  for (let i = 0; i < 3; i++) {
    cam.flash(80, 255, 255, 255);
    await waitForEvent(cam, 'cameraflashcomplete');
  }

  // diagonal wipe via alpha tween on a fullscreen rectangle
  const w = cam.width;
  const h = cam.height;
  const wipe = scene.add.graphics();
  wipe.setDepth(100);
  wipe.fillStyle(0x000000, 1);
  wipe.fillRect(0, 0, w, h);
  wipe.setAlpha(0);
  await tweenPromise(scene, { targets: wipe, alpha: 1, duration: 300, ease: 'Sine.easeIn' });

  // VS screen text
  const vsText = scene.add.text(w / 2, h / 2 - 40, 'VS', {
    fontFamily: '"Press Start 2P"', fontSize: '48px', color: '#FFD700',
  }).setOrigin(0.5).setDepth(101).setAlpha(0);

  const foeLabel = scene.add.text(w / 2, h / 2 + 30, foeName, {
    fontFamily: '"Press Start 2P"', fontSize: '18px', color: '#FFFFFF',
  }).setOrigin(0.5).setDepth(101).setAlpha(0);

  await tweenPromise(scene, { targets: [vsText, foeLabel], alpha: 1, duration: 200, ease: 'Sine.easeOut' });
  await delay(scene, 600);

  // fade out
  await tweenPromise(scene, { targets: [vsText, foeLabel, wipe], alpha: 0, duration: 200, ease: 'Sine.easeIn' });
  wipe.destroy();
  vsText.destroy();
  foeLabel.destroy();
}

function waitForEvent(emitter: Phaser.Events.EventEmitter, event: string): Promise<void> {
  return new Promise(resolve => emitter.once(event, resolve));
}

function tweenPromise(scene: Phaser.Scene, config: Record<string, any>): Promise<void> {
  return new Promise(resolve => {
    const tween = scene.tweens.add(config as any);
    tween.once('complete', () => resolve());
  });
}

function delay(scene: Phaser.Scene, ms: number): Promise<void> {
  return new Promise(resolve => scene.time.delayedCall(ms, resolve));
}
