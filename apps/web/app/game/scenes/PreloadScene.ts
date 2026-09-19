import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  create() {
    // Textures are generated in BootScene, just pass through
    this.scene.start('Overworld', {
      map: 'route_tech',
      spawn: { x: 5, y: 8, facing: 'down' as const },
    });
  }
}
