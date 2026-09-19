import * as Phaser from 'phaser';
import { type Affinity, type Move, getMove, typeMult } from 'game-core';
import { audio } from '../audio';
import { C, FONT, TYPE_COLOR, drawFrame, hex, notched, txt } from './ui';

export interface MenuItem { id: string; label: string; color: number; dark: number; text?: string }

function darken(c: number, f = 0.7): number {
  const r = ((c >> 16) & 255) * f, g = ((c >> 8) & 255) * f, b = (c & 255) * f;
  return (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b);
}

/** 2×2 grid of big buttons. Arrows/WASD + Z/Enter/Space, or tap/click. */
export class CommandMenu {
  private items: Phaser.GameObjects.GameObject[] = [];
  private cursorT?: Phaser.GameObjects.Text;
  private idx = 0;
  private cells: { x: number; y: number; w: number; h: number; g: Phaser.GameObjects.Graphics; t: Phaser.GameObjects.Text; item: MenuItem }[] = [];
  private live = false;
  private keys: Array<[string, (e: KeyboardEvent) => void]> = [];

  constructor(private scene: Phaser.Scene, private list: MenuItem[], private onPick: (id: string) => void) {}

  show(x = 500, y = 512) {
    this.hide();
    this.live = true;
    const w = 210, h = 50, gap = 12;
    this.list.forEach((item, i) => {
      const cx = x + (i % 2) * (w + gap), cy = y + Math.floor(i / 2) * (h + gap);
      const g = this.scene.add.graphics().setDepth(45);
      const t = txt(this.scene, cx + w / 2, cy + h / 2, item.label, 14, item.text ?? '#ffffff').setOrigin(0.5).setDepth(46);
      const zone = this.scene.add.zone(cx + w / 2, cy + h / 2, w, h).setDepth(47).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => this.move(i, false));
      zone.on('pointerdown', () => { this.move(i, false); this.pick(); });
      this.cells.push({ x: cx, y: cy, w, h, g, t, item });
      this.items.push(g, t, zone);
    });
    this.cursorT = txt(this.scene, 0, 0, '▶', 14, '#d8a830').setDepth(46).setOrigin(0.5);
    this.scene.tweens.add({ targets: this.cursorT, alpha: 0.3, duration: 380, yoyo: true, repeat: -1 });
    this.items.push(this.cursorT);
    this.idx = 0;
    this.redraw();

    const bind = (k: string, fn: (e: KeyboardEvent) => void) => { this.scene.input.keyboard?.on(`keydown-${k}`, fn); this.keys.push([k, fn]); };
    const step = (d: number) => (e: KeyboardEvent) => { if (!e.repeat) this.move(this.idx + d, true); };
    bind('LEFT', step(-1)); bind('RIGHT', step(1)); bind('UP', step(-2)); bind('DOWN', step(2));
    bind('A', step(-1)); bind('D', step(1)); bind('W', step(-2)); bind('S', step(2));
    for (const k of ['Z', 'ENTER', 'SPACE']) bind(k, (e) => { if (!e.repeat) this.pick(); });
  }

  private move(to: number, sound: boolean) {
    const n = Phaser.Math.Clamp(to, 0, this.cells.length - 1);
    if (n === this.idx) return;
    this.idx = n;
    if (sound) audio.sfx('menu_move');
    this.redraw();
  }

  private pick() {
    if (!this.live) return;
    audio.sfx('menu_select');
    this.onPick(this.cells[this.idx].item.id);
  }

  private redraw() {
    this.cells.forEach((c, i) => {
      const sel = i === this.idx;
      c.g.clear();
      drawFrame(c.g, c.x, c.y, c.w, c.h, { fill: sel ? c.item.color : darken(c.item.color, 0.82), border: sel ? C.white : c.item.dark, borderW: 3 });
      c.t.setAlpha(sel ? 1 : 0.85);
    });
    const s = this.cells[this.idx];
    this.cursorT?.setPosition(s.x - 14, s.y + s.h / 2);
  }

  hide() {
    this.live = false;
    for (const [k, fn] of this.keys) this.scene.input.keyboard?.off(`keydown-${k}`, fn);
    this.keys = [];
    this.items.forEach((o) => o.destroy());
    this.items = []; this.cells = [];
  }

  destroy() { this.hide(); }
}

export interface MoveItem { id: string; pp: number }

/** 2×2 move buttons + an info panel (type, power, accuracy, PP, matchup vs the foe). */
export class MoveMenu {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private info: Phaser.GameObjects.GameObject[] = [];
  private idx = 0;
  private cells: { x: number; y: number; w: number; h: number; g: Phaser.GameObjects.Graphics; move: Move; pp: number; maxPp: number; usable: boolean }[] = [];
  private cursorT?: Phaser.GameObjects.Text;
  private keys: Array<[string, (e: KeyboardEvent) => void]> = [];
  private live = false;

  constructor(private scene: Phaser.Scene, private foeAffinity: Affinity, private onPick: (moveId: string) => void, private onBack: () => void) {}

  show(moves: MoveItem[]) {
    this.hide();
    this.live = true;
    const w = 290, h = 50, gap = 10, x0 = 34, y0 = 514;
    moves.slice(0, 4).forEach((mi, i) => {
      const move = getMove(mi.id);
      const cx = x0 + (i % 2) * (w + gap), cy = y0 + Math.floor(i / 2) * (h + gap);
      const usable = mi.pp > 0;
      const g = this.scene.add.graphics().setDepth(45);
      const t = txt(this.scene, cx + 40, cy + 15, move.name.toUpperCase(), 12, usable ? '#181818' : '#7a7a86').setDepth(46);
      const ppT = txt(this.scene, cx + w - 14, cy + 32, `PP ${mi.pp}/${move.pp}`, 9, usable ? '#484878' : '#a04040').setOrigin(1, 0).setDepth(46);
      const dot = this.scene.add.circle(cx + 20, cy + h / 2, 9, TYPE_COLOR[move.type] ?? C.gray).setDepth(46).setStrokeStyle(2, C.ink);
      const zone = this.scene.add.zone(cx + w / 2, cy + h / 2, w, h).setDepth(47).setInteractive({ useHandCursor: usable });
      zone.on('pointerover', () => this.move(i, false));
      zone.on('pointerdown', () => { this.move(i, false); this.pick(); });
      this.cells.push({ x: cx, y: cy, w, h, g, move, pp: mi.pp, maxPp: move.pp, usable });
      this.objs.push(g, t, ppT, dot, zone);
    });

    const back = txt(this.scene, 940, 520, '◀ BACK', 10, '#f8d858').setOrigin(1, 0).setDepth(46).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => { audio.sfx('menu_back'); this.onBack(); });
    this.objs.push(back);

    this.cursorT = txt(this.scene, 0, 0, '▶', 14, '#d8a830').setDepth(46).setOrigin(0.5);
    this.scene.tweens.add({ targets: this.cursorT, alpha: 0.3, duration: 380, yoyo: true, repeat: -1 });
    this.objs.push(this.cursorT);

    this.idx = Math.max(0, this.cells.findIndex((c) => c.usable));
    this.redraw();

    const bind = (k: string, fn: (e: KeyboardEvent) => void) => { this.scene.input.keyboard?.on(`keydown-${k}`, fn); this.keys.push([k, fn]); };
    const step = (d: number) => (e: KeyboardEvent) => { if (!e.repeat) this.move(this.idx + d, true); };
    bind('LEFT', step(-1)); bind('RIGHT', step(1)); bind('UP', step(-2)); bind('DOWN', step(2));
    bind('A', step(-1)); bind('D', step(1)); bind('W', step(-2)); bind('S', step(2));
    for (const k of ['Z', 'ENTER', 'SPACE']) bind(k, (e) => { if (!e.repeat) this.pick(); });
    for (const k of ['X', 'ESC', 'BACKSPACE']) bind(k, () => { audio.sfx('menu_back'); this.onBack(); });
  }

  private move(to: number, sound: boolean) {
    const n = Phaser.Math.Clamp(to, 0, this.cells.length - 1);
    if (n === this.idx) return;
    this.idx = n;
    if (sound) audio.sfx('menu_move');
    this.redraw();
  }

  private pick() {
    const c = this.cells[this.idx];
    if (!this.live || !c) return;
    if (!c.usable) { audio.sfx('error'); return; }
    audio.sfx('menu_select');
    this.onPick(c.move.id);
  }

  private redraw() {
    this.cells.forEach((c, i) => {
      const sel = i === this.idx;
      c.g.clear();
      drawFrame(c.g, c.x, c.y, c.w, c.h, { fill: c.usable ? (sel ? C.cream : 0xe4e4bc) : 0xc4c4c8, border: sel ? C.gold : C.slate, borderW: sel ? 4 : 3 });
    });
    const s = this.cells[this.idx];
    this.cursorT?.setPosition(s.x - 16, s.y + s.h / 2);
    this.drawInfo(s);
  }

  private drawInfo(c: MoveMenu['cells'][number]) {
    this.info.forEach((o) => o.destroy());
    this.info = [];
    const x = 660, y = 546, m = c.move;
    const add = (o: Phaser.GameObjects.GameObject) => { this.info.push(o); return o; };
    const chip = this.scene.add.graphics().setDepth(46);
    chip.fillStyle(C.ink, 1); chip.fillRoundedRect(x, y - 30, 108, 20, 5);
    chip.fillStyle(TYPE_COLOR[m.type] ?? C.gray, 1); chip.fillRoundedRect(x + 1, y - 29, 106, 18, 4);
    add(chip);
    add(txt(this.scene, x + 54, y - 20, m.type.toUpperCase(), 9, '#181818').setOrigin(0.5).setDepth(47));
    add(txt(this.scene, x + 120, y - 26, m.category === 'status' ? 'STATUS' : m.category === 'physical' ? 'PHYS' : 'SPEC', 9, '#f8d858').setDepth(47));
    if (m.category === 'status') {
      const eff = (m.effects ?? []).map((e) => `${e.target === 'self' ? 'YOU' : 'FOE'} ${e.stat.toUpperCase()} ${e.stages > 0 ? '+' : ''}${e.stages}`).join('  ');
      add(txt(this.scene, x, y + 2, eff, 9, '#ffffff').setDepth(47));
      add(txt(this.scene, x, y + 26, `ACC ${m.accuracy}`, 9, '#ffffff').setDepth(47));
    } else {
      add(txt(this.scene, x, y + 2, `POWER ${m.power}`, 10, '#ffffff').setDepth(47));
      add(txt(this.scene, x + 150, y + 2, `ACC ${m.accuracy}`, 10, '#ffffff').setDepth(47));
      const mult = typeMult(m.type, this.foeAffinity);
      const label = mult > 1 ? 'SUPER EFFECTIVE x2' : mult < 1 ? 'NOT VERY EFFECTIVE x0.5' : 'NEUTRAL';
      const col = mult > 1 ? '#58d858' : mult < 1 ? '#f88858' : '#c8c8d8';
      add(txt(this.scene, x, y + 28, label, 9, col).setDepth(47));
    }
    if (m.priority > 0) add(txt(this.scene, x, y + 46, 'GOES FIRST', 8, '#f8d858').setDepth(47));
  }

  hide() {
    this.live = false;
    for (const [k, fn] of this.keys) this.scene.input.keyboard?.off(`keydown-${k}`, fn);
    this.keys = [];
    this.objs.forEach((o) => o.destroy()); this.info.forEach((o) => o.destroy());
    this.objs = []; this.info = []; this.cells = [];
  }

  destroy() { this.hide(); }
}
