import Phaser from 'phaser';

interface MenuOption {
  label: string;
  color: number;
  action: () => void;
}

export class CommandMenu {
  private scene: Phaser.Scene;
  private options: MenuOption[] = [];
  private cursor = 0;
  private cursorSprite!: Phaser.GameObjects.Text;
  private containers: Phaser.GameObjects.Container[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  show(options: MenuOption[]) {
    this.options = options;
    this.cursor = 0;
    this.containers = [];

    const baseX = 380;
    const baseY = 520;
    const bw = 200;
    const bh = 40;
    const gap = 10;

    const positions = [
      { x: baseX, y: baseY },
      { x: baseX + bw + gap, y: baseY },
      { x: baseX, y: baseY + bh + gap },
      { x: baseX + bw + gap, y: baseY + bh + gap },
    ];

    options.forEach((opt, i) => {
      const pos = positions[i];
      const bg = this.scene.add.graphics();
      bg.fillStyle(opt.color, 1);
      bg.fillRoundedRect(pos.x, pos.y, bw, bh, 6);

      const text = this.scene.add.text(pos.x + bw / 2, pos.y + bh / 2, opt.label, {
        fontFamily: '"Press Start 2P"',
        fontSize: '12px',
        color: '#ffffff',
      }).setOrigin(0.5);

      const hitArea = this.scene.add.rectangle(pos.x + bw / 2, pos.y + bh / 2, bw, bh)
        .setInteractive({ useHandCursor: true })
        .setAlpha(0.001);

      hitArea.on('pointerdown', () => {
        this.cursor = i;
        opt.action();
      });

      const container = this.scene.add.container(0, 0, [bg, text, hitArea]);
      this.containers.push(container);
    });

    // Blinking cursor
    this.cursorSprite = this.scene.add.text(
      positions[0].x - 20,
      positions[0].y + bh / 2,
      '▶',
      { fontFamily: '"Press Start 2P"', fontSize: '12px', color: '#d8a830' },
    ).setOrigin(0.5);

    this.scene.tweens.add({
      targets: this.cursorSprite,
      alpha: 0.3,
      duration: 400,
      yoyo: true,
      repeat: -1,
    });

    // Keyboard
    this.scene.input.keyboard?.on('keydown-UP', () => this.moveCursor(-2));
    this.scene.input.keyboard?.on('keydown-DOWN', () => this.moveCursor(2));
    this.scene.input.keyboard?.on('keydown-LEFT', () => this.moveCursor(-1));
    this.scene.input.keyboard?.on('keydown-RIGHT', () => this.moveCursor(1));
    this.scene.input.keyboard?.on('keydown-Z', () => this.select());
    this.scene.input.keyboard?.on('keydown-SPACE', () => this.select());
    this.scene.input.keyboard?.on('keydown-X', () => this.hide());
  }

  private moveCursor(delta: number) {
    this.cursor = Phaser.Math.Clamp(this.cursor + delta, 0, this.options.length - 1);
    const positions = this.getPositions();
    const pos = positions[this.cursor];
    const bh = 40;
    this.cursorSprite.setPosition(pos.x - 20, pos.y + bh / 2);
  }

  private select() {
    this.options[this.cursor]?.action();
  }

  private getPositions() {
    const baseX = 380;
    const baseY = 520;
    const bw = 200;
    const bh = 40;
    const gap = 10;
    return [
      { x: baseX, y: baseY },
      { x: baseX + bw + gap, y: baseY },
      { x: baseX, y: baseY + bh + gap },
      { x: baseX + bw + gap, y: baseY + bh + gap },
    ];
  }

  hide() {
    this.containers.forEach((c) => c.destroy());
    this.cursorSprite?.destroy();
    this.containers = [];
  }
}

export class MoveList {
  private scene: Phaser.Scene;
  private container!: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  show(moves: { id: string; name: string; pp: number; type: string }[], onSelect: (moveId: string) => void) {
    this.hide();
    const items: Phaser.GameObjects.GameObject[] = [];
    const baseX = 24;
    const baseY = 520;

    moves.forEach((m, i) => {
      const y = baseY + i * 32;
      const text = this.scene.add.text(baseX, y, `${m.name}  PP:${m.pp}`, {
        fontFamily: '"Press Start 2P"', fontSize: '10px', color: '#ffffff',
      });
      items.push(text);

      const hitArea = this.scene.add.rectangle(baseX + 250, y + 10, 500, 28)
        .setInteractive({ useHandCursor: true })
        .setAlpha(0.001);
      hitArea.on('pointerdown', () => onSelect(m.id));
      items.push(hitArea);
    });

    // Info panel (right side)
    const infoBg = this.scene.add.graphics();
    infoBg.fillStyle(0x183088, 0.9);
    infoBg.fillRoundedRect(620, 520, 320, 128, 6);
    items.push(infoBg);

    this.container = this.scene.add.container(0, 0, items);
  }

  hide() {
    this.container?.destroy();
  }
}
