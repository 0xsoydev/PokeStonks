import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  init(data: { marketId: string; onExit?: () => void }) {
    this.registry.set('marketId', data.marketId);
    this.registry.set('onExit', data.onExit);
  }

  create() {
    // Generate placeholder textures at runtime (no real assets needed yet)
    const g = this.make.graphics({ x: 0, y: 0 });

    // Player placeholder: 16x16 purple square
    g.clear();
    g.fillStyle(0xa855f7, 1);
    g.fillRect(0, 0, 16, 16);
    g.fillStyle(0xffffff, 1);
    g.fillRect(4, 4, 3, 3);
    g.fillRect(9, 4, 3, 3);
    g.generateTexture('player', 16, 16);

    // NPC placeholder: 16x16 orange square
    g.clear();
    g.fillStyle(0xf97316, 1);
    g.fillRect(0, 0, 16, 16);
    g.fillStyle(0xffffff, 1);
    g.fillRect(4, 4, 3, 3);
    g.fillRect(9, 4, 3, 3);
    g.generateTexture('npc', 16, 16);

    g.destroy();

    this.scene.start('Overworld', { map: 'route_tech', spawn: { x: 5, y: 8, facing: 'down' as const } });
  }
}
