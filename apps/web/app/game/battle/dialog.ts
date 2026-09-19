import Phaser from 'phaser';

export function typewriterText(
  scene: Phaser.Scene,
  textObj: Phaser.GameObjects.Text,
  msg: string,
  msPerChar = 18,
): Promise<void> {
  return new Promise((resolve) => {
    textObj.setText('');
    let i = 0;
    const timer = scene.time.addEvent({
      delay: msPerChar,
      repeat: msg.length - 1,
      callback: () => {
        textObj.text += msg[i];
        i++;
        if (i >= msg.length) {
          timer.destroy();
          resolve();
        }
      },
    });
  });
}
