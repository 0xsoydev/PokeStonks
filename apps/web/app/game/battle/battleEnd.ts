import Phaser from 'phaser';

export function showBattleEnd(scene: Phaser.Scene, won: boolean, onClaim?: () => void) {
  const { width, height } = scene.cameras.main;

  // Overlay
  const overlay = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
  overlay.setDepth(100);

  // Result text
  const resultText = scene.add.text(width / 2, height / 2 - 60, won ? 'YOU WIN!' : 'YOU LOSE', {
    fontFamily: '"Press Start 2P"',
    fontSize: '32px',
    color: won ? '#ffd700' : '#ff4444',
    stroke: '#000000',
    strokeThickness: 4,
  }).setOrigin(0.5).setDepth(101);

  // Gold flash on win
  if (won) {
    scene.tweens.add({
      targets: resultText,
      scaleX: 1.1,
      scaleY: 1.1,
      duration: 300,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
    });
  }

  // Claim button (winner only)
  if (won && onClaim) {
    const btnBg = scene.add.graphics();
    btnBg.fillStyle(0x58d858, 1);
    btnBg.fillRoundedRect(width / 2 - 100, height / 2 + 20, 200, 50, 8);
    btnBg.setDepth(101);

    const btnText = scene.add.text(width / 2, height / 2 + 45, 'CLAIM sSTOCK', {
      fontFamily: '"Press Start 2P"',
      fontSize: '12px',
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(102);

    const hitArea = scene.add.rectangle(width / 2, height / 2 + 45, 200, 50)
      .setInteractive({ useHandCursor: true })
      .setAlpha(0.001)
      .setDepth(103);

    hitArea.on('pointerdown', onClaim);
  }

  // Return button (back to overworld)
  const returnBg = scene.add.graphics();
  returnBg.fillStyle(0x555588, 1);
  returnBg.fillRoundedRect(width / 2 - 80, height / 2 + 90, 160, 40, 6);
  returnBg.setDepth(101);

  const returnText = scene.add.text(width / 2, height / 2 + 110, 'RETURN', {
    fontFamily: '"Press Start 2P"',
    fontSize: '12px',
    color: '#ffffff',
  }).setOrigin(0.5).setDepth(102);

  const returnHit = scene.add.rectangle(width / 2, height / 2 + 110, 160, 40)
    .setInteractive({ useHandCursor: true })
    .setAlpha(0.001)
    .setDepth(103);

  returnHit.on('pointerdown', () => {
    scene.scene.stop('Battle');
    scene.scene.stop('UI');
    scene.scene.resume('Overworld');
  });
}
