import * as Phaser from 'phaser';
import { getMarket, getMove, getSpecies, type ClaimStatus, type SeatKey, type TapCategory } from 'game-core';
import { BattleSession, type PlayerView, type Snapshot } from '../net/session';
import { EventBus } from '../net/events';
import { claimWithWallet } from '../../web3/claimTx';
import { audio } from '../audio';
import { CommandMenu, MoveMenu } from '../battle/menu';
import { TapTimingBar } from '../battle/tapbar';
import { DialogBox } from '../battle/dialog';
import { MonPlate } from '../battle/plates';
import { EndOverlay } from '../battle/end';
import { playTurn, resetStages } from '../battle/turns';
import type { Combatant } from '../battle/types';
import { C, H, W, delay, drawFrame, isTouch, tweenP, txt } from '../battle/ui';

export interface BattleInit {
  session: BattleSession;
  marketId: string;
  kind: 'wild' | 'trainer' | 'duel';
  trainerName?: string;
}

type Mode = 'boot' | 'intro' | 'idle' | 'command' | 'moves' | 'tap' | 'locked' | 'playing' | 'ended';

const other = (k: SeatKey): SeatKey => (k === 'A' ? 'B' : 'A');
const POS = {
  foe: { x: 704, y: 168, size: 176, plateX: 24, plateY: 28, plateW: 392, plateH: 96, platY: 246 },
  ally: { x: 250, y: 372, size: 232, plateX: 548, plateY: 366, plateW: 392, plateH: 112, platY: 462 },
} as const;

/**
 * Live 1v1 battle. This scene never decides an outcome: it sends inputs (a move + tap bucket), and
 * renders what the server resolves. It is a small state machine driven by synced room state.
 */
export class BattleScene extends Phaser.Scene {
  private s!: BattleSession;
  private init0!: BattleInit;
  private mySeat: SeatKey = 'A';
  private foeSeat: SeatKey = 'B';
  private mode: Mode = 'boot';
  private cmb!: Record<SeatKey, Combatant>;
  private dialog!: DialogBox;
  private command?: CommandMenu;
  private moveMenu?: MoveMenu;
  private tapbar!: TapTimingBar;
  private overlay?: EndOverlay;
  private info: Phaser.GameObjects.GameObject[] = [];
  private timerG!: Phaser.GameObjects.Graphics;
  private timerLabel!: Phaser.GameObjects.Text;
  private foeStatus!: Phaser.GameObjects.Text;
  private connBanner?: Phaser.GameObjects.Text;
  private idle: Partial<Record<SeatKey, Phaser.Tweens.Tween>> = {};
  private deadline = 0;
  private cmdTurn = -1;
  private lastPlayed = -1;
  private playing = false;
  private endShown = false;
  private moodShown = false;
  private unsub: Array<() => void> = [];
  private claiming = false;

  constructor() { super('Battle'); }

  init(data: BattleInit) {
    this.init0 = data;
    this.s = data.session;
    this.mode = 'boot';
    this.command = undefined; this.moveMenu = undefined; this.overlay = undefined;
    this.info = []; this.idle = {}; this.unsub = [];
    this.deadline = 0; this.cmdTurn = -1; this.lastPlayed = -1;
    this.playing = false; this.endShown = false; this.moodShown = false; this.claiming = false;
  }

  // ─────────────────────────────── build ───────────────────────────────────

  create() {
    audio.bgm('battle');
    this.cameras.main.fadeIn(380, 0, 0, 0);
    const snap = this.s.snapshot();
    if (!snap || !snap.players.A || !snap.players.B) { this.bail('The match is no longer available.'); return; }
    this.mySeat = this.s.mySeat() ?? 'A';
    this.foeSeat = other(this.mySeat);

    this.buildBackdrop();
    this.cmb = {
      [this.mySeat]: this.buildCombatant(this.mySeat, true, snap),
      [this.foeSeat]: this.buildCombatant(this.foeSeat, false, snap),
    } as Record<SeatKey, Combatant>;

    this.dialog = new DialogBox(this);
    this.tapbar = new TapTimingBar(this);
    this.buildTimer();
    this.buildCommandMenu();

    this.unsub.push(
      this.s.onTurn(() => { /* picked up by poll() */ }),
      this.s.onEnd(() => { /* picked up by poll() */ }),
      // Server refusals arrive here; wallet progress arrives from claimWithWallet. Both feed one status.
      this.s.onClaim((st) => { if (!this.claiming) this.pushClaim(st); }),
      this.s.onConn((c) => this.onConn(c)),
      this.s.onRejected((r) => this.onRejected(r)),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    this.s.ready(); // the server starts its intro clock once both clients report ready
    void this.runIntro();
  }

  private buildBackdrop() {
    const theme = getMarket(this.init0.marketId)?.routeTheme ?? 'tech';
    const key = `bg_battle_${theme}`;
    if (this.textures.exists(key)) {
      this.add.image(W / 2, H / 2, key).setDisplaySize(W, H).setDepth(0);
    } else {
      const g = this.add.graphics().setDepth(0);
      g.fillGradientStyle(0x7ec8f4, 0x7ec8f4, 0xd8f0ff, 0xd8f0ff, 1).fillRect(0, 0, W, 300);
      g.fillStyle(0x8fd77a, 1).fillRect(0, 300, W, 340);
      g.fillStyle(0x7cc76a, 1).fillRect(0, 300, W, 10);
    }
    // Slow clouds for depth.
    for (let i = 0; i < 4; i++) {
      const c = this.add.ellipse(Phaser.Math.Between(60, 900), Phaser.Math.Between(30, 200), Phaser.Math.Between(90, 170), Phaser.Math.Between(22, 40), 0xffffff, 0.55).setDepth(1);
      this.tweens.add({ targets: c, x: c.x + 60, duration: 9000 + i * 2500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    for (const [k, p] of [['foe', POS.foe], ['ally', POS.ally]] as const) {
      const tex = [`platform_${k}_${theme}`, `platform_${k}`].find((t) => this.textures.exists(t));
      if (tex) this.add.image(p.x, p.platY, tex).setDepth(2);
      else this.add.ellipse(p.x, p.platY, k === 'foe' ? 260 : 330, k === 'foe' ? 64 : 84, 0x5aa050, 1).setStrokeStyle(4, 0x3f7a3a).setDepth(2);
    }
  }

  private monTexture(speciesId: string, facing: 'front' | 'back'): string {
    const key = `mon_${speciesId}_${facing}`;
    if (this.textures.exists(key)) return key;
    const fb = `fallback_${speciesId}_${facing}`;
    if (!this.textures.exists(fb)) {
      const sp = getSpecies(speciesId);
      const cv = this.textures.createCanvas(fb, 128, 128)!;
      const ctx = cv.getContext();
      ctx.fillStyle = sp.colors[0]; ctx.strokeStyle = '#181818'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.ellipse(64, 74, 46, 42, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = sp.colors[1];
      ctx.beginPath(); ctx.ellipse(64, 92, 30, 20, 0, 0, Math.PI * 2); ctx.fill();
      if (facing === 'front') { ctx.fillStyle = '#181818'; ctx.fillRect(46, 60, 10, 14); ctx.fillRect(72, 60, 10, 14); }
      cv.refresh();
      this.textures.get(fb).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    return fb;
  }

  private buildCombatant(seat: SeatKey, ally: boolean, snap: Snapshot): Combatant {
    const p = snap.players[seat]!;
    const pos = ally ? POS.ally : POS.foe;
    const tex = this.monTexture(p.mon.speciesId, ally ? 'back' : 'front');
    const sprite = this.add.image(pos.x, pos.y, tex).setDepth(10).setOrigin(0.5);
    const baseScale = pos.size / sprite.width;
    sprite.setScale(baseScale);
    const shadow = this.add.ellipse(pos.x, pos.platY - 10, pos.size * 0.8, pos.size * 0.16, 0x000000, 0.22).setDepth(3);
    const plate = new MonPlate(this, pos.plateX, pos.plateY, pos.plateW, pos.plateH, ally);
    plate.setMon(p.mon, p.ticker);
    const c: Combatant = {
      seat, ally, speciesId: p.mon.speciesId, name: p.mon.name, affinity: p.mon.affinity as Combatant['affinity'],
      sprite, shadow, plate, baseX: pos.x, baseY: pos.y, baseScale,
    };
    resetStages(c, p.mon.stages);
    // Start off-screen for the entrance.
    sprite.setX(pos.x + (ally ? -520 : 520)); shadow.setAlpha(0);
    plate.container.setX(pos.plateX + (ally ? 520 : -520));
    return c;
  }

  private buildTimer() {
    this.timerG = this.add.graphics().setDepth(42);
    this.timerLabel = txt(this, 640, 20, 'TIME', 9, '#ffffff', { stroke: '#181818', strokeThickness: 4 }).setDepth(43).setVisible(false);
    this.foeStatus = txt(this, 936, 46, '', 8, '#ffffff', { stroke: '#181818', strokeThickness: 4 }).setOrigin(1, 0).setDepth(43);
  }

  private buildCommandMenu() {
    this.command = new CommandMenu(this, [
      { id: 'fight', label: 'FIGHT', color: C.red, dark: C.redDark },
      { id: 'stats', label: 'STATS', color: 0xf0c040, dark: 0xa08020, text: '#181818' },
      { id: 'market', label: 'MARKET', color: 0x40b850, dark: C.greenDark },
      { id: 'run', label: 'RUN', color: 0x9a9aa8, dark: C.grayDark },
    ], (id) => this.onCommand(id));
  }

  // ───────────────────────────── intro / entrance ──────────────────────────

  private async runIntro() {
    this.mode = 'intro';
    const me = this.cmb[this.mySeat], foe = this.cmb[this.foeSeat];
    this.tweens.add({ targets: [foe.plate.container], x: POS.foe.plateX, duration: 520, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: [me.plate.container], x: POS.ally.plateX, duration: 520, delay: 160, ease: 'Cubic.easeOut' });
    await Promise.all([
      tweenP(this, { targets: foe.sprite, x: foe.baseX, duration: 620, ease: 'Cubic.easeOut' }),
      tweenP(this, { targets: me.sprite, x: me.baseX, duration: 620, delay: 160, ease: 'Cubic.easeOut' }),
    ]);
    this.tweens.add({ targets: [foe.shadow, me.shadow], alpha: 0.22, duration: 240 });
    this.startIdle(foe); this.startIdle(me);

    const { kind, trainerName } = this.init0;
    const foeName = foe.name.toUpperCase();
    const snap = this.s.snapshot();
    const foeP = snap?.players[this.foeSeat];
    if (kind === 'duel') {
      await this.dialog.say(`${foeName} steps up for a duel!`, { holdMs: 750 });
    } else if (kind === 'trainer') {
      await this.dialog.say(`${(trainerName ?? 'A rival BROKER').toUpperCase()} wants to battle!`, { holdMs: 750 });
      await this.dialog.say(`They sent out ${foeName}!`, { holdMs: 650 });
    } else {
      await this.dialog.say(foeP?.isBot ? `A wild ${foeName} appeared!` : `A rival's ${foeName} appeared!`, { holdMs: 750 });
    }
    await this.dialog.say(`Go! ${me.name.toUpperCase()}!`, { holdMs: 650 });
    for (const line of this.moodLines(snap)) await this.dialog.say(line, { holdMs: 900 });
    this.dialog.clear();
    this.mode = 'idle';
  }

  private moodLines(snap: Snapshot | null): string[] {
    if (!snap) return [];
    const out: string[] = [];
    for (const seat of [this.mySeat, this.foeSeat]) {
      const p = snap.players[seat];
      const buff = seat === 'A' ? snap.moodA : snap.moodB;
      if (!p) continue;
      if (buff > 1) out.push(`${p.ticker} is trending up. ${p.mon.name.toUpperCase()} hits 10% harder!`);
      else if (buff < 1) out.push(`${p.ticker} is sliding. ${p.mon.name.toUpperCase()} hits 10% softer.`);
    }
    return out;
  }

  private startIdle(c: Combatant) {
    this.idle[c.seat]?.stop();
    c.sprite.setPosition(c.baseX, c.baseY);
    this.idle[c.seat] = this.tweens.add({ targets: c.sprite, y: c.baseY - 6, duration: 1100 + (c.ally ? 0 : 160), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private stopIdle() {
    for (const k of ['A', 'B'] as const) {
      this.idle[k]?.stop();
      this.idle[k] = undefined;
      const c = this.cmb[k];
      if (c && c.sprite.visible) c.sprite.setPosition(c.baseX, c.baseY);
    }
  }

  // ───────────────────────────── main loop ─────────────────────────────────

  update() {
    if (this.mode === 'boot' || !this.cmb) return;
    this.poll();
    this.drawTimer();
  }

  private me(snap: Snapshot): PlayerView | undefined { return snap.players[this.mySeat]; }
  private foe(snap: Snapshot): PlayerView | undefined { return snap.players[this.foeSeat]; }

  private poll() {
    const snap = this.s.snapshot();
    if (!snap) return;

    if (!this.moodShown && (snap.moodA !== 1 || snap.moodB !== 1 || this.s.mood.A !== 1 || this.s.mood.B !== 1)) {
      this.moodShown = true;
      for (const seat of ['A', 'B'] as const) {
        this.cmb[seat].plate.setMood(seat === 'A' ? snap.moodA : snap.moodB, seat === 'A' ? this.s.mood.pctA : this.s.mood.pctB);
      }
    }

    if (this.mode === 'intro' || this.mode === 'ended') return;

    // 1) Play anything the server has resolved, strictly in order.
    if (this.s.hasPendingTurns() && !this.playing) { void this.playPending(); return; }
    if (this.playing) return;

    // 2) The match ended without a final turn (forfeit / flee / disconnect).
    if (this.s.battleEnd && !this.s.hasPendingTurns()) { void this.finish(); return; }

    // 3) Foe presence indicator while we choose.
    const foe = this.foe(snap);
    if (this.mode === 'command' || this.mode === 'moves' || this.mode === 'tap' || this.mode === 'locked') {
      this.foeStatus.setText(!foe ? '' : !foe.connected ? 'OPPONENT RECONNECTING...' : foe.locked ? 'OPPONENT READY' : 'OPPONENT THINKING...')
        .setColor(foe && foe.locked ? '#58d858' : '#ffffff');
    } else this.foeStatus.setText('');

    // 4) Reconnect / late-join resync: the server is ahead of what we've played.
    if (this.mode === 'idle' && snap.phase === 'COMMAND' && snap.turnNo > this.lastPlayed + 1 && !this.s.hasPendingTurns()) {
      this.lastPlayed = snap.turnNo - 1;
      this.syncFromSnapshot(snap);
    }

    // 5) Open our command window.
    const me = this.me(snap);
    if (this.mode === 'idle' && snap.phase === 'COMMAND' && me && !me.locked && snap.turnNo === this.lastPlayed + 1) {
      this.openCommand(snap);
      return;
    }

    // 6) The server closed our window (timeout / turn resolved elsewhere).
    if ((this.mode === 'command' || this.mode === 'moves' || this.mode === 'tap') && (snap.phase !== 'COMMAND' || snap.turnNo !== this.cmdTurn)) {
      this.abortInput('');
    }
    if (this.mode === 'locked' && snap.phase === 'COMMAND' && me && !me.locked && snap.turnNo === this.cmdTurn) {
      this.mode = 'idle'; // our lock was rejected; reopen
    }
  }

  private syncFromSnapshot(snap: Snapshot) {
    for (const seat of ['A', 'B'] as const) {
      const p = snap.players[seat];
      if (!p) continue;
      const c = this.cmb[seat];
      void c.plate.setHp(p.mon.hp, false);
      c.plate.setStages(p.mon.stages);
      resetStages(c, p.mon.stages);
      if (p.mon.hp <= 0) c.sprite.setVisible(false);
    }
  }

  // ───────────────────────────── command flow ──────────────────────────────

  private openCommand(snap: Snapshot) {
    const me = this.me(snap)!;
    this.cmdTurn = snap.turnNo;
    this.deadline = this.time.now + snap.turnMs;
    const noPp = me.mon.moves.every((id) => (me.mon.pp[id] ?? 0) <= 0);
    if (noPp) {
      this.mode = 'locked';
      this.dialog.prompt(`${me.mon.name.toUpperCase()} has no moves left!`);
      this.time.delayedCall(700, () => { if (this.mode === 'locked') this.s.lock(this.cmdTurn, 'STRUGGLE', 'good'); });
      return;
    }
    this.mode = 'command';
    this.dialog.prompt(`What will\n${me.mon.name.toUpperCase()} do?`);
    this.command!.show();
  }

  private onCommand(id: string) {
    const snap = this.s.snapshot();
    if (!snap || this.mode !== 'command') return;
    const me = this.me(snap)!, foe = this.foe(snap)!;
    if (id === 'fight') {
      this.command!.hide();
      this.dialog.clear();
      this.mode = 'moves';
      this.moveMenu?.destroy();
      this.moveMenu = new MoveMenu(this, foe.mon.affinity as Combatant['affinity'], (mv) => void this.onPickMove(mv), () => this.backToCommand());
      this.moveMenu.show(me.mon.moves.map((m) => ({ id: m, pp: me.mon.pp[m] ?? 0 })));
    } else if (id === 'stats') this.showStats(snap);
    else if (id === 'market') this.showMarket(snap);
    else if (id === 'run') this.confirmRun();
  }

  private backToCommand() {
    if (this.mode !== 'moves') return;
    this.moveMenu?.hide();
    this.mode = 'command';
    const snap = this.s.snapshot();
    const me = snap && this.me(snap);
    this.dialog.prompt(`What will\n${(me?.mon.name ?? '').toUpperCase()} do?`);
    this.command!.show();
  }

  private async onPickMove(moveId: string) {
    if (this.mode !== 'moves') return;
    const turn = this.cmdTurn;
    this.moveMenu?.hide();
    const move = getMove(moveId);
    let tap: TapCategory = 'good';
    if (move.category !== 'status') {
      this.mode = 'tap';
      this.dialog.prompt(`${move.name.toUpperCase()}!`);
      const r = await this.tapbar.show(`${move.name.toUpperCase()}!`);
      if (r === null || this.mode !== 'tap') return; // clock ran out or window closed
      tap = r;
    }
    this.mode = 'locked';
    this.s.lock(turn, moveId, tap);
    this.dialog.prompt('Waiting for the opponent...');
  }

  private confirmRun() {
    this.command!.hide();
    this.dialog.prompt('Run away and forfeit\nthe match?');
    const yn = new CommandMenu(this, [
      { id: 'yes', label: 'YES', color: C.red, dark: C.redDark },
      { id: 'no', label: 'NO', color: 0x9a9aa8, dark: C.grayDark },
    ], (id) => {
      yn.destroy();
      if (id === 'yes') { this.mode = 'locked'; this.dialog.prompt('You ran away...'); this.s.flee(); }
      else { this.mode = 'command'; const snap = this.s.snapshot(); const me = snap && this.me(snap); this.dialog.prompt(`What will\n${(me?.mon.name ?? '').toUpperCase()} do?`); this.command!.show(); }
    });
    yn.show();
  }

  private abortInput(msg: string) {
    this.command?.hide();
    this.moveMenu?.hide();
    this.tapbar.cancel();
    this.closeInfo();
    this.mode = 'locked';
    if (msg) { this.dialog.prompt(msg); audio.sfx('error'); } else this.dialog.prompt('...');
  }

  // ───────────────────────── info panels (STATS / MARKET) ──────────────────

  private closeInfo() { this.info.forEach((o) => o.destroy()); this.info = []; }

  private panel(title: string, rows: string[], colors: string[] = []) {
    this.closeInfo();
    const g = this.add.graphics().setDepth(70);
    drawFrame(g, 150, 110, 660, 330, { fill: C.navyDark, border: C.gold, borderW: 4, inner: C.white });
    const t = txt(this, 480, 138, title, 16, '#f8d858').setOrigin(0.5).setDepth(71);
    const body = rows.map((r, i) => txt(this, 190, 184 + i * 30, r, 11, colors[i] ?? '#ffffff').setDepth(71));
    const hint = txt(this, 480, 412, isTouch() ? 'TAP TO CLOSE' : 'PRESS ANY KEY OR CLICK TO CLOSE', 9, '#a8b8f8').setOrigin(0.5).setDepth(71);
    const zone = this.add.zone(480, 320, W, H).setDepth(72).setInteractive();
    const close = () => { this.closeInfo(); this.input.keyboard?.off('keydown', close); };
    zone.once('pointerdown', close);
    this.time.delayedCall(120, () => this.input.keyboard?.once('keydown', close));
    this.info.push(g, t, ...body, hint, zone);
  }

  private showStats(snap: Snapshot) {
    const rows: string[] = [];
    for (const seat of [this.mySeat, this.foeSeat]) {
      const p = snap.players[seat]!;
      const s = p.mon.stages;
      const f = (v: number, st: number) => `${v}${st ? (st > 0 ? `▲${st}` : `▼${-st}`) : ''}`;
      rows.push(`${seat === this.mySeat ? 'YOU' : 'FOE'}  ${p.mon.name.toUpperCase()}  Lv${p.mon.level}  HP ${p.mon.hp}/${p.mon.maxHp}`);
      rows.push(`  ATK ${f(p.mon.atk, s.atk)}  DEF ${f(p.mon.def, s.def)}  SPA ${f(p.mon.spa, s.spa)}  SPD ${f(p.mon.spd, s.spd)}  SPE ${f(p.mon.spe, s.spe)}`);
    }
    this.panel('BATTLE STATS', rows, ['#f8d858', '#ffffff', '#f88858', '#ffffff']);
  }

  private showMarket(snap: Snapshot) {
    const rows: string[] = [];
    const cols: string[] = [];
    for (const seat of [this.mySeat, this.foeSeat]) {
      const p = snap.players[seat]!;
      const buff = seat === 'A' ? snap.moodA : snap.moodB;
      const pct = seat === 'A' ? this.s.mood.pctA : this.s.mood.pctB;
      rows.push(`${p.ticker}: ${buff > 1 ? 'BULL' : buff < 1 ? 'BEAR' : 'FLAT'}  (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% vs EMA)`);
      cols.push(buff > 1 ? '#58d858' : buff < 1 ? '#f85858' : '#ffffff');
      rows.push(`  ${p.mon.name.toUpperCase()} deals ${buff > 1 ? '+10%' : buff < 1 ? '-10%' : 'normal'} damage`);
      cols.push('#c8c8d8');
    }
    rows.push('');
    rows.push('Live Pyth prices set the mood: a stock more than 2%');
    rows.push('above its average buffs its BrokerMon, below it drags.');
    this.panel('MARKET MOOD (PYTH)', rows, cols);
  }

  // ───────────────────────────── timer ─────────────────────────────────────

  private drawTimer() {
    const g = this.timerG;
    g.clear();
    if (this.mode !== 'command' && this.mode !== 'moves' && this.mode !== 'tap') { this.timerLabel.setVisible(false); return; }
    const remainMs = Math.max(0, this.deadline - this.time.now);
    const secs = remainMs / 1000;
    const total = Math.max(1, (this.s.snapshot()?.turnMs ?? 30000) / 1000);
    const w = 240, x = 696, y = 22;
    const col = secs > 15 ? 0x58d858 : secs > 5 ? 0xf8d858 : 0xf85858;
    const pulse = secs < 3 ? 0.55 + 0.45 * Math.abs(Math.sin(this.time.now / 110)) : 1;
    g.fillStyle(C.ink, 1).fillRoundedRect(x - 3, y - 3, w + 6, 18, 5);
    g.fillStyle(0x3a3f66, 1).fillRoundedRect(x - 1, y - 1, w + 2, 14, 4);
    g.fillStyle(col, pulse).fillRect(x, y, Math.max(0, Math.round(w * (secs / total))), 12);
    this.timerLabel.setVisible(true).setText(`${Math.ceil(secs)}s`).setPosition(x - 44, y);
    if (remainMs <= 0) this.abortInput('Time is up!');
  }

  // ───────────────────────────── turn playback ─────────────────────────────

  private async playPending() {
    if (this.playing) return;
    this.playing = true;
    this.abortMenusOnly();
    this.mode = 'playing';
    this.foeStatus.setText('');
    this.dialog.clear();
    try {
      while (this.s.hasPendingTurns()) {
        for (const t of this.s.drainTurns()) {
          this.stopIdle();
          await playTurn({ scene: this, combatants: this.cmb, dialog: this.dialog }, t.events);
          this.lastPlayed = t.turnNo;
          this.s.ack(t.turnNo);
          for (const seat of ['A', 'B'] as const) if (this.cmb[seat].sprite.visible) this.startIdle(this.cmb[seat]);
        }
      }
    } finally {
      this.playing = false;
    }
    if (this.s.battleEnd) { await this.finish(); return; }
    this.dialog.clear();
    this.mode = 'idle';
  }

  private abortMenusOnly() {
    this.command?.hide(); this.moveMenu?.hide(); this.tapbar.cancel(); this.closeInfo();
  }

  // ───────────────────────────── ending ────────────────────────────────────

  private async finish() {
    if (this.endShown) return;
    this.endShown = true;
    this.mode = 'ended';
    this.abortMenusOnly();
    this.foeStatus.setText('');
    const end = this.s.battleEnd!;
    const won = end.winner === this.mySeat;
    EventBus.emit('battle:end', { ...end, won });
    // Forfeits have no faint events; make the loser visibly go down.
    if (end.reason !== 'faint') {
      const loser = this.cmb[other(end.winner)];
      if (loser.sprite.visible) {
        const msg = won ? 'The opponent gave up!' : 'You gave up...';
        await this.dialog.say(msg, { holdMs: 800 });
      }
    }
    await delay(this, 250);
    this.overlay = new EndOverlay(this, {
      won, end,
      onClaim: () => void this.claim(),
      onContinue: () => void this.close(),
    });
  }

  private pushClaim(st: ClaimStatus) {
    EventBus.emit('claim:status', st);
    this.overlay?.setClaim(st);
  }

  /** The winner's own wallet submits the signed voucher; the player sees their wallet pop up. */
  private async claim() {
    if (this.claiming) return;
    this.claiming = true;
    EventBus.emit('claim:request');
    // Keys typed into the wallet dialog must not drive the game while it is open.
    const kb = this.input.keyboard;
    if (kb) kb.enabled = false;
    try {
      await claimWithWallet(this.s, (st) => this.pushClaim(st));
    } finally {
      if (kb) kb.enabled = true;
      this.claiming = false;
    }
  }

  private async close() {
    audio.lowHp(false);
    await this.s.leave();
    this.cameras.main.fadeOut(260, 0, 0, 0);
    await delay(this, 280);
    this.scene.stop('Battle');
    EventBus.emit('battle:closed');
  }

  // ───────────────────────────── connection ────────────────────────────────

  private onConn(c: 'online' | 'reconnecting' | 'closed') {
    if (!this.connBanner) {
      this.connBanner = txt(this, W / 2, 84, '', 13, '#ffffff', { backgroundColor: '#a82424', padding: { x: 14, y: 10 } }).setOrigin(0.5).setDepth(300).setVisible(false);
    }
    if (c === 'reconnecting') { this.connBanner.setText('CONNECTION LOST - RECONNECTING...').setVisible(true); }
    else if (c === 'online') { this.connBanner.setVisible(false); }
    else if (c === 'closed' && !this.endShown) {
      this.connBanner.setText('DISCONNECTED FROM THE MATCH').setVisible(true);
      this.time.delayedCall(1800, () => { if (!this.endShown) void this.close(); });
    }
  }

  private onRejected(reason: string) {
    if (this.mode === 'locked' || this.mode === 'tap') {
      this.dialog.prompt(reason);
      audio.sfx('error');
    }
  }

  private bail(msg: string) {
    EventBus.emit('toast', { text: msg, tone: 'bad' });
    void this.close();
  }

  private cleanup() {
    this.unsub.forEach((f) => f());
    this.unsub = [];
    this.command?.destroy(); this.moveMenu?.destroy(); this.tapbar?.cancel(); this.overlay?.destroy(); this.closeInfo();
    this.dialog?.destroy();
    for (const k of ['A', 'B'] as const) { this.idle[k]?.stop(); this.cmb?.[k]?.plate.destroy(); }
    audio.lowHp(false);
  }
}
