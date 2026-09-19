import Phaser from 'phaser';
import type { StatKey } from 'game-core';
import { audio } from '../audio';
import { C, FONT, TYPE_COLOR, drawFrame, hex, hpColor, txt } from './ui';
import type { MonView } from '../net/session';

const STAT_SHORT: Record<StatKey, string> = { atk: 'ATK', def: 'DEF', spa: 'SPA', spd: 'SPD', spe: 'SPE' };

/** The classic name/level/HP plate. One per combatant; the ally plate is larger and shows HP numbers. */
export class MonPlate {
  readonly container: Phaser.GameObjects.Container;
  private bar: Phaser.GameObjects.Graphics;
  private nameT: Phaser.GameObjects.Text;
  private lvT: Phaser.GameObjects.Text;
  private hpNum?: Phaser.GameObjects.Text;
  private typeChip: Phaser.GameObjects.Graphics;
  private typeT: Phaser.GameObjects.Text;
  private tickerChip: Phaser.GameObjects.Graphics;
  private tickerT: Phaser.GameObjects.Text;
  private moodT: Phaser.GameObjects.Text;
  private stageT: Phaser.GameObjects.Text;
  private shown = 0;
  private maxHp = 1;
  private tw?: Phaser.Tweens.Tween;
  private readonly barX: number;
  private readonly barY: number;
  private readonly barW: number;

  constructor(private scene: Phaser.Scene, readonly x: number, readonly y: number, readonly w: number, readonly h: number, private ally: boolean) {
    const frame = scene.add.graphics();
    drawFrame(frame, 0, 0, w, h, { fill: C.cream, border: C.slate, borderW: 4 });
    // soft inner highlight so the plate reads as raised
    frame.lineStyle(2, 0xffffff, 0.55);
    frame.strokeRect(7, 7, w - 14, h - 14);

    this.nameT = txt(scene, 18, 14, '', 14, hex(C.ink));
    this.lvT = txt(scene, w - 18, 16, '', 11, hex(C.slate)).setOrigin(1, 0);
    this.typeChip = scene.add.graphics();
    this.typeT = txt(scene, 0, 0, '', 8, '#181818').setOrigin(0.5);
    this.tickerChip = scene.add.graphics();
    this.tickerT = txt(scene, 0, 0, '', 8, '#ffffff').setOrigin(0.5);
    this.moodT = txt(scene, w - 18, h - 16, '', 8, '#2f8a34').setOrigin(1, 1);
    this.stageT = txt(scene, w - 18, 40, '', 8, '#484878').setOrigin(1, 0);

    const hpLabel = txt(scene, 18, ally ? 60 : 56, 'HP', 10, '#c8502c');
    this.barX = 50;
    this.barY = ally ? 60 : 56;
    this.barW = w - 50 - 20;
    this.bar = scene.add.graphics();
    if (ally) this.hpNum = txt(scene, w - 20, 80, '', 11, hex(C.ink)).setOrigin(1, 0);

    this.container = scene.add.container(x, y, [
      frame, this.nameT, this.lvT, this.typeChip, this.typeT, this.tickerChip, this.tickerT,
      hpLabel, this.bar, this.moodT, this.stageT, ...(this.hpNum ? [this.hpNum] : []),
    ]).setDepth(20);
  }

  setMon(mon: MonView, ticker: string) {
    this.nameT.setText(mon.name.toUpperCase());
    this.lvT.setText(`Lv${mon.level}`);
    this.maxHp = Math.max(1, mon.maxHp);
    this.shown = mon.hp;
    this.drawBar(mon.hp);
    this.hpNum?.setText(`${Math.ceil(mon.hp)}/${mon.maxHp}`);

    const chipY = this.ally ? 38 : 36;
    const tw = Math.max(64, mon.affinity.length * 9 + 14);
    this.typeChip.clear();
    this.typeChip.fillStyle(C.ink, 1); this.typeChip.fillRoundedRect(18, chipY, tw + 2, 18, 4);
    this.typeChip.fillStyle(TYPE_COLOR[mon.affinity] ?? C.gray, 1); this.typeChip.fillRoundedRect(19, chipY + 1, tw, 16, 3);
    this.typeT.setText(mon.affinity.toUpperCase()).setPosition(19 + tw / 2, chipY + 9);
    const tkw = ticker.length * 9 + 14;
    this.tickerChip.clear();
    this.tickerChip.fillStyle(C.navy, 1); this.tickerChip.fillRoundedRect(24 + tw, chipY, tkw, 18, 4);
    this.tickerT.setText(ticker).setPosition(24 + tw + tkw / 2, chipY + 9);
    this.setStages(mon.stages);
  }

  private drawBar(v: number) {
    const ratio = Math.max(0, Math.min(1, v / this.maxHp));
    const { barX: x, barY: y, barW: w } = this;
    const g = this.bar;
    g.clear();
    g.fillStyle(C.ink, 1); g.fillRoundedRect(x - 3, y - 3, w + 6, 18, 5);
    g.fillStyle(0x3a3f66, 1); g.fillRoundedRect(x - 1, y - 1, w + 2, 14, 4);
    const fw = Math.round(w * ratio);
    if (fw > 0) {
      const col = hpColor(ratio);
      g.fillStyle(col, 1); g.fillRect(x, y, fw, 12);
      g.fillStyle(0xffffff, 0.35); g.fillRect(x, y, fw, 3);
    }
  }

  /** Animate HP to `hp`. Resolves when the bar has finished draining. */
  setHp(hp: number, animate = true): Promise<void> {
    this.tw?.stop();
    const from = this.shown;
    const to = Math.max(0, Math.min(this.maxHp, hp));
    if (!animate || from === to) {
      this.shown = to; this.drawBar(to); this.hpNum?.setText(`${Math.ceil(to)}/${this.maxHp}`);
      if (this.ally) this.lowHp(to);
      return Promise.resolve();
    }
    const dur = Phaser.Math.Clamp((Math.abs(from - to) / this.maxHp) * 1600, 350, 1300);
    return new Promise((res) => {
      this.tw = this.scene.tweens.addCounter({
        from, to, duration: dur, ease: 'Sine.easeOut',
        onUpdate: (t) => {
          const v = t.getValue() ?? to;
          this.shown = v; this.drawBar(v); this.hpNum?.setText(`${Math.ceil(v)}/${this.maxHp}`);
        },
        onComplete: () => { this.shown = to; this.drawBar(to); this.hpNum?.setText(`${Math.ceil(to)}/${this.maxHp}`); if (this.ally) this.lowHp(to); res(); },
      });
    });
  }

  private lowHp(hp: number) {
    audio.lowHp(hp > 0 && hp / this.maxHp <= 0.2);
  }

  setStages(st: Record<StatKey, number>) {
    const parts = (Object.keys(st) as StatKey[]).filter((k) => st[k] !== 0).map((k) => `${STAT_SHORT[k]}${st[k] > 0 ? '▲' : '▼'}${Math.abs(st[k])}`);
    this.stageT.setText(parts.slice(0, 3).join(' '));
  }

  setMood(buff: number, pct: number) {
    if (buff > 1) this.moodT.setText(`BULL +10% (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`).setColor('#2f8a34');
    else if (buff < 1) this.moodT.setText(`BEAR -10% (${pct.toFixed(1)}%)`).setColor('#a82424');
    else this.moodT.setText('');
  }

  pulse() {
    this.scene.tweens.add({ targets: this.container, scale: { from: 1, to: 1.04 }, duration: 90, yoyo: true, ease: 'Sine.easeOut' });
  }

  destroy() { this.tw?.stop(); this.container.destroy(); audio.lowHp(false); }
}
