import Phaser from 'phaser';

export class OverworldScene extends Phaser.Scene {
  constructor() {
    super('Overworld');
  }

  init(_data: { map: string; spawn: { x: number; y: number; facing: string } }) {
    // GridEngine setup will be wired by Module A (ponytail)
  }

  create() {
    const { width, height } = this.cameras.main;
    this.add.rectangle(width / 2, height / 2, width, height, 0x2d5a27);
    this.add.text(width / 2, height / 2, 'OVERWORLD', {
      fontFamily: '"Press Start 2P"', fontSize: '24px', color: '#ffffff',
    }).setOrigin(0.5);
  }
}
