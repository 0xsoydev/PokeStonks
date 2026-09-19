import Phaser from 'phaser';
import { EventBus } from '../net/events';
import { BattleFSM } from '../battle/fsm';
import { AnimationQueue } from '../battle/queue';

interface BattleInit {
  room: unknown;
  roomId: string;
  me: { name: string; affinity: string; level: number; hp: number; maxHp: number; moves: string[] };
  foe: { name: string; affinity: string; level: number; hp: number; maxHp: number; moves: string[] };
}

export class BattleScene extends Phaser.Scene {
  private fsm!: BattleFSM;
  private queue!: AnimationQueue;
  private allySprite!: Phaser.GameObjects.Image;
  private foeSprite!: Phaser.GameObjects.Image;
  private allyHpBar!: Phaser.GameObjects.Graphics;
  private foeHpBar!: Phaser.GameObjects.Graphics;
  private dialogText!: Phaser.GameObjects.Text;
  private timerBar!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Battle');
  }

  init(_data: BattleInit) {
    this.fsm = new BattleFSM(this);
    this.queue = new AnimationQueue(this);
  }

  create() {
    const { width, height } = this.cameras.main;

    // Battlefield backdrop
    this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);

    // Parallax clouds (placeholder ellipses)
    for (let i = 0; i < 3; i++) {
      const cloud = this.add.ellipse(
        Phaser.Math.Between(100, 860),
        Phaser.Math.Between(20, 80),
        Phaser.Math.Between(60, 120),
        Phaser.Math.Between(20, 40),
        0x444466,
        0.3,
      );
      this.tweens.add({
        targets: cloud,
        x: cloud.x + 30,
        duration: 8000 + i * 2000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Enemy platform (top-right)
    const foePlatform = this.add.ellipse(700, 180, 200, 60, 0x333355, 0.6);
    foePlatform.setStrokeStyle(2, 0x555588);

    // Ally platform (bottom-left)
    const allyPlatform = this.add.ellipse(260, 420, 200, 60, 0x333355, 0.6);
    allyPlatform.setStrokeStyle(2, 0x555588);

    // Enemy BrokerMon sprite (front)
    this.foeSprite = this.add.image(700, 130, 'npc').setDisplaySize(128, 128).setOrigin(0.5);
    this.tweens.add({
      targets: this.foeSprite,
      y: 140,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Ally BrokerMon sprite (back)
    this.allySprite = this.add.image(260, 370, 'player').setDisplaySize(128, 128).setOrigin(0.5);
    this.tweens.add({
      targets: this.allySprite,
      y: 375,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Enemy plate (top-left)
    this.createPlate(16, 16, 320, 90, 'FOE', 'Lv5', 45, 52, 0xf8f8d0, 0x484878);

    // Ally plate (bottom-right)
    this.createPlate(600, 490, 340, 110, 'ALLY', 'Lv5', 52, 52, 0xf8f8d0, 0x484878);

    // Dialog box (bottom)
    this.createDialogBox();

    // Turn timer (top-center)
    this.timerBar = this.add.graphics();
    this.updateTimer(30);

    // Start FSM
    this.fsm.start();
  }

  private createPlate(
    x: number, y: number, w: number, h: number,
    name: string, lv: string,
    hp: number, maxHp: number,
    bgColor: number, borderColor: number,
  ) {
    const plate = this.add.graphics();
    plate.fillStyle(bgColor, 1);
    plate.fillRoundedRect(x, y, w, h, 8);
    plate.lineStyle(2, borderColor, 1);
    plate.strokeRoundedRect(x, y, w, h, 8);

    this.add.text(x + 12, y + 10, name, {
      fontFamily: '"Press Start 2P"', fontSize: '14px', color: '#181818',
    });
    this.add.text(x + 100, y + 10, lv, {
      fontFamily: '"Press Start 2P"', fontSize: '10px', color: '#686868',
    });

    // HP bar
    const barX = x + 12;
    const barY = y + 40;
    const hpBar = this.add.graphics();
    const hpColor = hp / maxHp > 0.5 ? 0x58d858 : hp / maxHp > 0.2 ? 0xf8d858 : 0xf85858;
    hpBar.fillStyle(0x333333, 1);
    hpBar.fillRect(barX, barY, 120, 12);
    hpBar.fillStyle(hpColor, 1);
    hpBar.fillRect(barX, barY, 120 * (hp / maxHp), 12);

    if (name === 'FOE') this.foeHpBar = hpBar;
    else this.allyHpBar = hpBar;

    this.add.text(barX + 125, barY - 2, `${hp}/${maxHp}`, {
      fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#181818',
    });

    // EXP bar (ally only)
    if (name === 'ALLY') {
      const expBar = this.add.graphics();
      expBar.fillStyle(0x333333, 1);
      expBar.fillRect(barX, barY + 20, 120, 6);
      expBar.fillStyle(0x5898f8, 1);
      expBar.fillRect(barX, barY + 20, 0, 6);
    }
  }

  private createDialogBox() {
    const box = this.add.graphics();
    box.fillStyle(0x183088, 1);
    box.fillRect(0, 500, 960, 140);
    box.lineStyle(3, 0xd8a830, 1);
    box.strokeRect(2, 502, 956, 136);
    box.lineStyle(2, 0xffffff, 1);
    box.strokeRect(5, 505, 950, 130);

    this.dialogText = this.add.text(24, 520, '', {
      fontFamily: '"Press Start 2P"', fontSize: '12px', color: '#ffffff',
      wordWrap: { width: 912 },
    });

    // Continue arrow
    const arrow = this.add.text(920, 610, '▼', {
      fontFamily: '"Press Start 2P"', fontSize: '12px', color: '#d8a830',
    });
    this.tweens.add({
      targets: arrow,
      alpha: 0.3,
      duration: 400,
      yoyo: true,
      repeat: -1,
    });
  }

  updateTimer(seconds: number) {
    this.timerBar.clear();
    const w = 300;
    const h = 12;
    const x = 480 - w / 2;
    const y = 16;
    const color = seconds > 15 ? 0x58d858 : seconds > 5 ? 0xf8d858 : 0xf85858;
    this.timerBar.fillStyle(0x333333, 1);
    this.timerBar.fillRect(x, y, w, h);
    this.timerBar.fillStyle(color, 1);
    this.timerBar.fillRect(x, y, w * (seconds / 30), h);
  }

  showDialog(msg: string): Promise<void> {
    return new Promise((resolve) => {
      this.dialogText.setText('');
      let i = 0;
      const timer = this.time.addEvent({
        delay: 18,
        repeat: msg.length - 1,
        callback: () => {
          this.dialogText.text += msg[i];
          i++;
          if (i >= msg.length) {
            timer.destroy();
            resolve();
          }
        },
      });
    });
  }

  hideDialog() {
    this.dialogText.setText('');
  }

  getQueue(): AnimationQueue {
    return this.queue;
  }

  getFSM(): BattleFSM {
    return this.fsm;
  }
}
