import * as Phaser from 'phaser';
import { Direction } from 'grid-engine';
import type { GridEngine } from 'grid-engine';
import { ROUTE_TABLES, getMarket, rollEncounter, type EncounterSlot } from 'game-core';
import { audio } from '../audio';
import { EventBus } from '../net/events';
import { isMatchActive, runEncounter } from '../flow/encounterFlow';
import { bindDuelEvents } from '../flow/duelBridge';
import { CHAR_WALK_MAPPING, type CharKey } from '../art/characters';
import { hashStr } from '../art/pixel';
import { isRouteTheme, type RouteTheme } from '../art/themes';
import {
  EXCHANGE_KEY, buildExchangeInterior, buildRouteMap, collisionGrid, counterGrid, sightLine, tallGrassGrid,
} from '../overworld/maps';
import { DIR_VEC, LAYER, OPPOSITE, type BuiltMap, type Dir, type NpcSpec, type SignSpec, type SpawnSpec, type TrainerSpec, type WarpSpec } from '../overworld/mapTypes';
import { Controls } from '../overworld/controls';
import { DialogBox } from '../overworld/dialog';
import { Hud } from '../overworld/hud';
import { H, W, pagesFrom } from '../overworld/ui';

const TILE = 16;
const ZOOM_ROUTE = 3;
const ZOOM_INTERIOR = 4;
const WALK_SPEED = 4;
const RUN_SPEED = 7;
const GRACE_STEPS = 3;
const TRAINER_COOLDOWN_MS = 60_000;

type MapKind = 'route' | 'exchange';

interface NpcRec { id: string; spec: NpcSpec; sprite: Phaser.GameObjects.Sprite }
interface TrainerRec {
  id: string; spec: TrainerSpec; sprite: Phaser.GameObjects.Sprite;
  sight: Array<{ x: number; y: number }>; recoverUntil: number;
}

/** Everything that exists only while one map is loaded. */
interface MapRuntime {
  kind: MapKind;
  built: BuiltMap;
  w: number;
  h: number;
  tilemap: Phaser.Tilemaps.Tilemap;
  layers: Phaser.Tilemaps.TilemapLayer[];
  anim: [Phaser.Tilemaps.TilemapLayer | undefined, Phaser.Tilemaps.TilemapLayer | undefined];
  animFrame: 0 | 1;
  animTimer: Phaser.Time.TimerEvent;
  blocked: Uint8Array;
  tall: Uint8Array;
  counters: Uint8Array;
  warps: Map<number, WarpSpec>;
  signs: Map<number, SignSpec>;
  exits: Set<number>;
  npcs: Map<string, NpcRec>;
  trainers: Map<string, TrainerRec>;
  player: Phaser.GameObjects.Sprite;
  cover: Phaser.GameObjects.Sprite | null;
}

const dirEnum = (d: Dir): Direction => d as unknown as Direction;
const dirOf = (d: Direction | string): Dir => (d === 'up' || d === 'down' || d === 'left' || d === 'right' ? d : 'down');

export class OverworldScene extends Phaser.Scene {
  /** Injected by the grid-engine scene plugin (mapping: 'gridEngine'). */
  declare gridEngine: GridEngine;

  private alive = false;
  private ui!: Phaser.Cameras.Scene2D.Camera;
  private world!: Phaser.Cameras.Scene2D.Camera;
  private worldMode = false;
  private controls!: Controls;
  private dialog!: DialogBox;
  private hud!: Hud;

  private marketId = 'aapl';
  private speciesId = 'aapl';
  private theme: RouteTheme = 'bluechip';
  private routeName = 'Route';
  private playerKey: CharKey = 'player_a';

  private cur: MapRuntime | null = null;
  private maps: Partial<Record<MapKind, BuiltMap>> = {};
  private busy = false;
  private steps = 0;
  private px = 0;
  private py = 0;
  private curSpeed = WALK_SPEED;
  private lastBump = 0;
  private routeDoor = { x: 24, y: 8 };
  private subs: Array<{ unsubscribe(): void }> = [];
  private offToast: (() => void) | null = null;
  private offDuel: (() => void) | null = null;
  private tapDialog: ((p: Phaser.Input.Pointer, over: unknown[]) => void) | null = null;

  constructor() {
    super('Overworld');
  }

  /* ------------------------------------------------------------------ lifecycle ---- */

  create() {
    this.alive = true;
    this.steps = 0;
    this.busy = false;
    this.cur = null;
    this.maps = {};
    this.subs = [];

    const reg = this.registry;
    this.marketId = (reg.get('marketId') as string | undefined) ?? 'aapl';
    const market = getMarket(this.marketId);
    this.speciesId = (reg.get('speciesId') as string | undefined) ?? market?.speciesId ?? 'aapl';
    this.theme = isRouteTheme(market?.routeTheme) ? market!.routeTheme as RouteTheme : 'bluechip';
    this.routeName = market?.name ?? 'Route';
    const wallet = String(reg.get('wallet') ?? '');
    this.playerKey = wallet && hashStr(wallet) & 1 ? 'player_b' : 'player_a';

    // Two cameras: the world (zoom 3, drawn first) and the unzoomed main camera that carries the HUD,
    // dialogs, touch pad and anything other modules add to this scene (battle flow, cutscenes).
    this.ui = this.cameras.main;
    this.world = this.cameras.add(0, 0, W, H, false, 'world');
    const order = this.cameras.cameras;
    order.splice(order.indexOf(this.world), 1);
    order.unshift(this.world);
    this.world.setBackgroundColor('#181020');
    this.world.roundPixels = true;
    // Objects created while `worldMode` is set belong to the world camera only; everything else is UI.
    this.events.on('addedtoscene', this.onAdded, this);

    this.controls = new Controls(this);
    this.dialog = new DialogBox(this);
    this.hud = new Hud(this, this.speciesId, this.routeName, !this.controls.touch);
    // Toasts are rendered by the React HUD (one layer, works during battles too); nothing to subscribe to here.
    this.offDuel = bindDuelEvents(this, this.marketId);

    this.tapDialog = (_p, over) => { if (this.dialog.isOpen && over.length === 0) this.dialog.press(); };
    this.input.on('pointerdown', this.tapDialog);
    this.events.on('resume', this.onResume, this);
    this.events.once('shutdown', this.onShutdown, this);

    const route = this.getMap('route');
    this.enterMap('route', route.meta.spawn);
    audio.bgm('overworld');
    this.ui.fadeIn(320, 0, 0, 0);
  }

  private onAdded = (go: Phaser.GameObjects.GameObject) => {
    if (this.worldMode) this.ui.ignore(go);
    else this.world.ignore(go);
  };

  private inWorld<T>(fn: () => T): T {
    const prev = this.worldMode;
    this.worldMode = true;
    try { return fn(); } finally { this.worldMode = prev; }
  }

  private onResume = () => {
    if (!this.alive) return;
    this.controls.reset();
    this.steps = 0;
    this.curSpeed = -1;
  };

  private onShutdown() {
    this.alive = false;
    this.offToast?.(); this.offToast = null;
    this.offDuel?.(); this.offDuel = null;
    if (this.tapDialog) this.input.off('pointerdown', this.tapDialog);
    this.tapDialog = null;
    this.events.off('addedtoscene', this.onAdded, this);
    this.events.off('resume', this.onResume, this);
    this.subs.forEach((s) => s.unsubscribe());
    this.subs = [];
    // the display list may already have destroyed some of these on shutdown: never let cleanup throw
    for (const fn of [() => this.teardownMap(), () => this.controls?.destroy(), () => this.dialog?.destroy(), () => this.hud?.destroy()]) {
      try { fn(); } catch { /* already gone */ }
    }
  }

  /* ------------------------------------------------------------------ maps ---- */

  private getMap(kind: MapKind): BuiltMap {
    let m = this.maps[kind];
    if (m) return m;
    const stored = this.registry.get(`map:${kind}`) as BuiltMap | undefined;
    const fresh = stored && stored.meta.theme === this.theme && (kind === 'exchange' || stored.meta.key === `route_${this.marketId}`);
    m = (fresh ? stored : undefined) ?? (kind === 'route'
      ? buildRouteMap(this.theme, this.marketId, { routeName: this.routeName })
      : buildExchangeInterior(this.theme, this.routeName));
    this.maps[kind] = m;
    if (kind === 'route') {
      const door = m.meta.warps.find((w) => w.to === EXCHANGE_KEY);
      if (door) this.routeDoor = { x: door.x, y: door.y };
    }
    return m;
  }

  private teardownMap() {
    const rt = this.cur;
    if (!rt) return;
    this.cur = null;
    this.world.stopFollow();
    rt.animTimer.remove(false);
    try { this.gridEngine.removeAllCharacters(); } catch { /* engine not created yet */ }
    for (const l of rt.layers) l.destroy();
    rt.tilemap.destroy();
    rt.player.destroy();
    rt.cover?.destroy();
    rt.npcs.forEach((n) => n.sprite.destroy());
    rt.trainers.forEach((t) => t.sprite.destroy());
  }

  /** Build tilemap, characters and camera for a map and drop the player at `spawn`. */
  private enterMap(kind: MapKind, spawn: SpawnSpec) {
    this.teardownMap();
    this.subs.forEach((s) => s.unsubscribe());
    this.subs = [];

    const built = this.getMap(kind);
    const meta = built.meta;
    const w = meta.width, h = meta.height;
    if (!this.cache.tilemap.exists(built.key)) this.cache.tilemap.add(built.key, { format: Phaser.Tilemaps.Formats.TILED_JSON, data: built.json });

    const rt = this.inWorld((): MapRuntime => {
      const tilemap = this.make.tilemap({ key: built.key });
      const tileset = tilemap.addTilesetImage('tiles', `tiles_${meta.theme}`, TILE, TILE, 0, 0)!;
      const layers: Phaser.Tilemaps.TilemapLayer[] = [];
      const byName: Record<string, Phaser.Tilemaps.TilemapLayer | undefined> = {};
      for (const l of built.json.layers) {
        if (l.type !== 'tilelayer') continue;
        const layer = tilemap.createLayer(l.name, tileset, 0, 0);
        if (!layer) continue;
        layers.push(layer);
        byName[l.name] = layer;
      }
      byName[LAYER.collision]?.setVisible(false);
      byName[LAYER.anim1]?.setVisible(false);

      const mkSprite = (key: CharKey | string) => this.add.sprite(0, 0, `char_${key}`, 1).setOrigin(0, 0);
      const player = mkSprite(this.playerKey);
      const npcs = new Map<string, NpcRec>();
      for (const spec of meta.npcs) npcs.set(`npc:${spec.id}`, { id: `npc:${spec.id}`, spec, sprite: mkSprite(spec.sprite) });
      const blocked = collisionGrid(built);
      const trainers = new Map<string, TrainerRec>();
      for (const spec of meta.trainers) {
        const sight = sightLine((x, y) => x < 0 || y < 0 || x >= w || y >= h || blocked[y * w + x] === 1, spec, spec.facing, spec.range);
        trainers.set(`trainer:${spec.id}`, { id: `trainer:${spec.id}`, spec, sprite: mkSprite(spec.sprite), sight, recoverUntil: 0 });
      }
      const cover = kind === 'route' ? this.add.sprite(0, 0, `grass_cover_${meta.theme}`, 0).setOrigin(0, 0).setVisible(false) : null;

      const rt: MapRuntime = {
        kind, built, w, h, tilemap, layers,
        anim: [byName[LAYER.anim0], byName[LAYER.anim1]],
        animFrame: 0,
        animTimer: this.time.addEvent({ delay: 460, loop: true, callback: () => this.flipAnim() }),
        blocked, tall: tallGrassGrid(built), counters: counterGrid(built),
        warps: new Map(meta.warps.map((wp) => [wp.y * w + wp.x, wp])),
        signs: new Map(meta.signs.map((s) => [s.y * w + s.x, s])),
        exits: new Set(meta.exits.map((e) => e.y * w + e.x)),
        npcs, trainers, player, cover,
      };
      return rt;
    });
    this.cur = rt;

    const geChars: Array<Parameters<GridEngine['create']>[1]['characters'][number]> = [{
      id: 'player', sprite: rt.player, walkingAnimationMapping: CHAR_WALK_MAPPING as never,
      startPosition: { x: spawn.x, y: spawn.y }, facingDirection: dirEnum(spawn.facing), speed: WALK_SPEED,
    }];
    rt.npcs.forEach((n) => geChars.push({
      id: n.id, sprite: n.sprite, walkingAnimationMapping: CHAR_WALK_MAPPING as never,
      startPosition: { x: n.spec.x, y: n.spec.y }, facingDirection: dirEnum(n.spec.facing), speed: 2.5,
    }));
    rt.trainers.forEach((t) => geChars.push({
      id: t.id, sprite: t.sprite, walkingAnimationMapping: CHAR_WALK_MAPPING as never,
      startPosition: { x: t.spec.x, y: t.spec.y }, facingDirection: dirEnum(t.spec.facing), speed: 3.5,
    }));
    this.gridEngine.create(rt.tilemap, { characters: geChars, numberOfDirections: 4 });
    this.curSpeed = WALK_SPEED;
    this.px = spawn.x; this.py = spawn.y;
    rt.npcs.forEach((n) => { if (n.spec.wander > 0) this.startWander(n); });

    this.subs.push(
      this.gridEngine.positionChangeStarted().subscribe((e: { charId: string; enterTile: { x: number; y: number } }) => {
        if (e.charId === 'player' && this.cur?.cover) this.cur.cover.setVisible(this.cur.tall[e.enterTile.y * this.cur.w + e.enterTile.x] === 1);
      }),
      this.gridEngine.positionChangeFinished().subscribe((e: { charId: string; enterTile: { x: number; y: number } }) => {
        if (e.charId === 'player') this.onPlayerStep(e.enterTile.x, e.enterTile.y);
      }),
    );

    // camera
    const mapW = w * TILE, mapH = h * TILE;
    if (kind === 'route') {
      this.world.setZoom(ZOOM_ROUTE);
      this.world.setBounds(0, 0, mapW, mapH);
      this.world.centerOn(spawn.x * TILE + 8, spawn.y * TILE + 4);
      this.world.startFollow(rt.player, true, 1, 1, -8, -12);
    } else {
      this.world.setZoom(ZOOM_INTERIOR);
      const vw = W / ZOOM_INTERIOR, vh = H / ZOOM_INTERIOR;
      this.world.setBounds((mapW - vw) / 2, (mapH - vh) / 2, vw, vh);
      this.world.centerOn(mapW / 2, mapH / 2);
    }
    this.hud.setRoute(kind === 'route' ? this.routeName : 'The Exchange');
    this.steps = 0;
    this.syncCover();
  }

  private flipAnim() {
    const rt = this.cur;
    if (!rt || !rt.anim[0] || !rt.anim[1]) return;
    rt.animFrame = rt.animFrame === 0 ? 1 : 0;
    rt.anim[0].setVisible(rt.animFrame === 0);
    rt.anim[1].setVisible(rt.animFrame === 1);
    rt.cover?.setFrame(rt.animFrame);
  }

  private syncCover() {
    const rt = this.cur;
    if (!rt?.cover || !rt.cover.visible) return;
    const p = rt.player;
    rt.cover.setPosition(p.x, p.y + 17);
    rt.cover.setDepth(p.depth + 0.0000005);
  }

  /* ------------------------------------------------------------------ per frame ---- */

  update(_time: number, delta: number) {
    const rt = this.cur;
    if (!this.alive || !rt) return;
    const st = this.controls.poll();
    this.syncCover();

    if (this.dialog.isOpen) {
      this.controls.setTouchVisible(false, true);
      this.dialog.update(delta);
      if (st.confirm) this.dialog.press();
      else if (this.dialog.isChoosing) {
        if (st.navUp) this.dialog.nav(-1);
        else if (st.navDown) this.dialog.nav(1);
      }
      return;
    }
    this.controls.setTouchVisible(!this.busy, !this.busy);
    if (this.busy) return;

    if (st.menu) { void this.guarded(() => this.askExit()); return; }
    if (st.confirm && !this.gridEngine.isMoving('player')) { void this.guarded(() => this.interact()); return; }
    if (st.dir) this.tryMove(st.dir, st.run);
  }

  private tryMove(dir: Dir, run: boolean) {
    const rt = this.cur!;
    const speed = run ? RUN_SPEED : WALK_SPEED;
    if (speed !== this.curSpeed) { this.gridEngine.setSpeed('player', speed); this.curSpeed = speed; }
    if (!this.gridEngine.isMoving('player')) {
      const v = DIR_VEC[dir];
      const tx = this.px + v.x, ty = this.py + v.y;
      if (tx < 0 || ty < 0 || tx >= rt.w || ty >= rt.h || rt.blocked[ty * rt.w + tx] === 1) {
        const now = this.time.now;
        if (now - this.lastBump > 420) { this.lastBump = now; audio.sfx('bump'); }
      }
    }
    this.gridEngine.move('player', dirEnum(dir));
  }

  /* ------------------------------------------------------------------ steps ---- */

  private onPlayerStep(x: number, y: number) {
    const rt = this.cur;
    if (!rt || !this.alive) return;
    this.px = x; this.py = y;
    this.steps++;
    const idx = y * rt.w + x;

    const warp = rt.warps.get(idx);
    if (warp) { void this.guarded(() => this.warp(warp)); return; }
    if (rt.exits.has(idx)) { void this.guarded(() => this.askExit(true)); return; }
    if (this.busy) return;

    if (rt.kind === 'route' && !isMatchActive()) {
      const now = Date.now();
      for (const t of rt.trainers.values()) {
        if (t.recoverUntil > now) continue;
        for (let i = 0; i < t.sight.length; i++) {
          if (t.sight[i].x === x && t.sight[i].y === y) { void this.guarded(() => this.trainerChallenge(t, true)); return; }
        }
      }
    }
    if (rt.tall[idx] === 1) {
      audio.sfx('step_grass');
      this.rustle(x, y, 3);
      if (this.steps > GRACE_STEPS && rt.kind === 'route' && !isMatchActive()) {
        const slot = rollEncounter(ROUTE_TABLES[this.theme], Math.random);
        if (slot) void this.guarded(() => this.wildEncounter(slot));
      }
    }
  }

  /** Little burst of grass tips/puffs at a tile. */
  private rustle(tx: number, ty: number, n: number) {
    const rt = this.cur;
    if (!rt || !this.textures.exists('puff')) return;
    this.inWorld(() => {
      for (let i = 0; i < n; i++) {
        const dx = (i - (n - 1) / 2) * 4;
        const p = this.add.image(tx * TILE + 8 + dx, ty * TILE + 12, 'puff').setDepth(9000).setScale(0.6).setTint(0x8fe07a).setAlpha(0.9);
        this.tweens.add({
          targets: p, x: p.x + dx * 1.6, y: p.y - 7 - (i & 1) * 3, alpha: 0, scale: 0.15, duration: 320 + i * 40,
          ease: 'Cubic.easeOut', onComplete: () => p.destroy(),
        });
      }
    });
  }

  /** Run an async flow; an exception must never leave the player locked out of the game. */
  private async guarded(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      console.error('[overworld] flow failed', err);
      if (this.alive) { this.dialogAbort(); this.unlock(); }
    }
  }

  private dialogAbort() {
    // nothing to do today: dialogs close themselves; kept as the single place to hook cleanup
  }

  /** Stop the player and wait for the tile they are crossing to finish, then re-read their tile. */
  private async settlePlayer() {
    const ge = this.gridEngine;
    ge.stopMovement('player');
    for (let i = 0; i < 20 && ge.isMoving('player'); i++) await this.delay(16);
    const p = ge.getPosition('player');
    this.px = p.x; this.py = p.y;
  }

  private lock() { this.busy = true; }
  private unlock() {
    this.busy = false;
    this.controls.reset();
  }
  private delay(ms: number): Promise<void> {
    return new Promise((res) => { this.time.delayedCall(ms, () => res()); });
  }

  /* ------------------------------------------------------------------ encounters ---- */

  /** The encounter sting; stamped so the cutscene does not layer a second one on top. */
  private encounterSfx() {
    this.registry.set('encounterSfxAt', Date.now());
    audio.sfx('encounter');
  }

  private async wildEncounter(slot: EncounterSlot) {
    if (this.busy || isMatchActive()) return;
    this.lock();
    await this.settlePlayer();
    if (!this.alive) return;
    this.rustle(this.px, this.py, 6);
    this.encounterSfx();
    await this.delay(330);
    if (!this.alive) return;
    await this.runBattle({ kind: 'wild', foeHintSpeciesId: slot.speciesId });
  }

  private async runBattle(opts: { kind: 'wild' | 'trainer'; foeHintSpeciesId?: string; trainerName?: string }) {
    if (opts.kind === 'trainer') this.encounterSfx();
    try {
      await runEncounter(this, { marketId: this.marketId, ...opts });
    } catch (err) {
      console.error('[overworld] encounter failed', err);
    }
    if (!this.alive) return;
    this.steps = 0;
    this.unlock();
  }

  private async trainerChallenge(t: TrainerRec, walk: boolean) {
    if (this.busy || isMatchActive()) return;
    this.lock();
    const ge = this.gridEngine;
    ge.stopMovement(t.id);
    await this.settlePlayer();
    if (!this.alive) return;
    // "!" pops over the trainer
    if (this.textures.exists('bubble_excl')) {
      const b = this.inWorld(() => this.add.image(t.sprite.x + 9, t.sprite.y - 6, 'bubble_excl').setDepth(9999).setScale(0).setOrigin(0.5, 1));
      this.tweens.add({ targets: b, scale: 1, duration: 140, ease: 'Back.easeOut' });
      audio.sfx('menu_select');
      await this.delay(640);
      b.destroy();
    }
    if (!this.alive) return;
    // both look at each other, then the trainer walks up
    const toPlayer: Dir = walk
      ? t.spec.facing
      : (Math.abs(this.px - t.spec.x) > Math.abs(this.py - t.spec.y) ? (this.px > t.spec.x ? 'right' : 'left') : (this.py > t.spec.y ? 'down' : 'up'));
    ge.turnTowards(t.id, dirEnum(toPlayer));
    ge.turnTowards('player', dirEnum(OPPOSITE[toPlayer]));
    if (walk) {
      const v = DIR_VEC[toPlayer];
      const dist = Math.abs(this.px - t.spec.x) + Math.abs(this.py - t.spec.y);
      for (let i = 0; i < dist - 1; i++) {
        await this.stepChar(t.id, toPlayer);
        if (!this.alive) return;
      }
      void v;
    }
    EventBus.emit('toast', { text: `${t.spec.name} challenges you!`, tone: 'bad' });
    await this.dialog.open(pagesFrom(t.spec.intro), t.spec.name);
    if (!this.alive) return;
    await this.runBattle({ kind: 'trainer', trainerName: t.spec.name });
    if (!this.alive) return;
    t.recoverUntil = Date.now() + TRAINER_COOLDOWN_MS;
    // head back to the post
    ge.moveTo(t.id, { x: t.spec.x, y: t.spec.y });
    this.time.delayedCall(1400, () => { if (this.alive) this.gridEngine.turnTowards(t.id, dirEnum(t.spec.facing)); });
  }

  /** Move a character one tile and resolve when it has arrived (or after a safety timeout). */
  private stepChar(id: string, dir: Dir): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; sub.unsubscribe(); resolve(); };
      const sub = this.gridEngine.positionChangeFinished().subscribe((e: { charId: string }) => { if (e.charId === id) finish(); });
      this.gridEngine.move(id, dirEnum(dir));
      this.time.delayedCall(900, finish);
    });
  }

  /* ------------------------------------------------------------------ interaction ---- */

  private startWander(n: NpcRec) {
    this.gridEngine.moveRandomly(n.id, 1000 + Math.floor(Math.random() * 1600), n.spec.wander);
  }

  private async freezeChar(id: string) {
    this.gridEngine.stopMovement(id);
    for (let i = 0; i < 14 && this.gridEngine.isMoving(id); i++) await this.delay(40);
  }

  private charAt(x: number, y: number): string | null {
    const rt = this.cur;
    if (!rt) return null;
    for (const id of this.gridEngine.getCharactersAt({ x, y })) if (id !== 'player') return id;
    return null;
  }

  private async interact() {
    const rt = this.cur;
    if (!rt || this.busy) return;
    const ge = this.gridEngine;
    const face = dirOf(ge.getFacingDirection('player'));
    const v = DIR_VEC[face];
    const fx = this.px + v.x, fy = this.py + v.y;
    if (fx < 0 || fy < 0 || fx >= rt.w || fy >= rt.h) return;

    let target = this.charAt(fx, fy);
    if (!target && rt.counters[fy * rt.w + fx] === 1) {
      // talking across a counter: the clerk behind it, or the one a step to either side
      const bx = fx + v.x, by = fy + v.y;
      target = this.charAt(bx, by) ?? (v.x === 0 ? (this.charAt(bx - 1, by) ?? this.charAt(bx + 1, by)) : (this.charAt(bx, by - 1) ?? this.charAt(bx, by + 1)));
    }
    if (target) {
      this.lock();
      const npc = rt.npcs.get(target);
      const trainer = rt.trainers.get(target);
      await this.freezeChar(target);
      if (!this.alive) return;
      ge.turnTowards(target, dirEnum(OPPOSITE[face]));
      if (npc) {
        audio.sfx('menu_select');
        if (npc.spec.role === 'teller') await this.tellerFlow(npc);
        else await this.dialog.open(pagesFrom(npc.spec.dialog), npc.spec.name);
        if (!this.alive) return;
        if (npc.spec.wander > 0) this.startWander(npc);
        this.unlock();
      } else if (trainer) {
        this.unlock();
        if (trainer.recoverUntil > Date.now()) {
          this.lock();
          await this.dialog.open(pagesFrom(trainer.spec.after), trainer.spec.name);
          if (this.alive) this.unlock();
        } else {
          await this.trainerChallenge(trainer, false);
        }
      } else this.unlock();
      return;
    }
    const sign = rt.signs.get(fy * rt.w + fx);
    if (sign) {
      this.lock();
      audio.sfx('menu_select');
      await this.dialog.open(pagesFrom(sign.text));
      if (this.alive) this.unlock();
    }
  }

  private async tellerFlow(n: NpcRec) {
    const pick = await this.dialog.ask(pagesFrom(n.spec.dialog), ['HEAL', 'NOT NOW'], n.spec.name);
    if (!this.alive) return;
    if (pick === 0) {
      audio.sfx('heal');
      this.ui.flash(520, 255, 255, 255);
      EventBus.emit('toast', { text: 'Positions settled — fully healed!', tone: 'good' });
      await this.delay(420);
      if (!this.alive) return;
      await this.dialog.open(['Positions settled.', 'Your BrokerMon is fully healed!'], n.spec.name);
    } else {
      await this.dialog.open(['Come back any time.'], n.spec.name);
    }
  }

  /* ------------------------------------------------------------------ warps & exit ---- */

  private fade(out: boolean, ms: number): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; resolve(); };
      if (out) this.ui.fadeOut(ms, 0, 0, 0); else this.ui.fadeIn(ms, 0, 0, 0);
      this.time.delayedCall(ms + 40, finish);
    });
  }

  private async warp(w: WarpSpec) {
    if (this.busy) return;
    this.lock();
    audio.sfx('door');
    this.gridEngine.stopMovement('player');
    await this.fade(true, 200);
    if (!this.alive) return;
    if (w.to === EXCHANGE_KEY) this.enterMap('exchange', w.spawn);
    else this.enterMap('route', { x: this.routeDoor.x, y: this.routeDoor.y + 1, facing: 'down' });
    await this.fade(false, 200);
    if (!this.alive) return;
    this.unlock();
  }

  private async askExit(fromTile = false) {
    if (this.busy) return;
    this.lock();
    audio.sfx('menu_select');
    const pick = await this.dialog.ask(['Leave route?'], ['YES', 'NO']);
    if (!this.alive) return;
    if (pick === 0) {
      await this.fade(true, 260);
      const onExit = this.registry.get('onExit') as (() => void) | undefined;
      if (onExit) onExit(); else EventBus.emit('game:exit');
      return;
    }
    this.unlock();
    if (fromTile) this.gridEngine.move('player', dirEnum('up'));
  }
}
