import { hash2, hashStr, rng } from '../art/pixel';
import { ATLAS_COLS, ATLAS_ROWS, TILE, TILE_COUNT, blobTile, gid, isTallGrass, N, E, S, W, NE, SE, SW, NW } from '../art/tileset';
import type { RouteTheme } from '../art/themes';
import {
  DIR_VEC, LAYER,
  type BuiltMap, type Dir, type MapMeta, type NpcSpec, type NpcSprite, type SignSpec, type SpawnSpec,
  type TiledMapJson, type TiledObject, type TiledObjectLayer, type TiledProperty, type TiledTileLayer, type TrainerSpec, type WarpSpec,
} from './mapTypes';

export const MAP_W = 48;
export const MAP_H = 36;
export const EXCHANGE_KEY = 'exchange';

/* ------------------------------------------------------------------ flavour ---- */

interface Flavour {
  trainers: Array<{ name: string; intro: string[]; after: string[] }>;
  folk: Array<{ name: string; lines: string[] }>;
  exchange: string;
}

const FLAVOUR: Record<RouteTheme, Flavour> = {
  bluechip: {
    trainers: [
      { name: 'Analyst Ash', intro: ['My model says you are undervalued!', 'Let us mark you to market!'], after: ['Rebalancing my portfolio...', 'Come back after earnings.'] },
      { name: 'Banker Bo', intro: ['Steady hands win. Yours are shaking!'], after: ['A dividend of defeat. Noted.'] },
      { name: 'Retiree Ray', intro: ['Forty years of index funds!', 'Let me show you patience.'], after: ['Time in the market beats you.'] },
    ],
    folk: [
      { name: 'Clerk', lines: ['Blue-chips never sleep.', 'Slow and steady wins the route.'] },
      { name: 'Gardener', lines: ['The tall grass is thick today.', 'Something is rustling in there...'] },
      { name: 'Passerby', lines: ['Heal at the Exchange if your', 'BrokerMon looks tired.'] },
    ],
    exchange: 'Welcome to The Exchange! Settle your positions?',
  },
  tech: {
    trainers: [
      { name: 'Dev Dana', intro: ['Shipping to prod on a Friday!', 'Try to catch my bugs!'], after: ['Rolling back... give me a minute.'] },
      { name: 'Miner Mox', intro: ['My rig is hot and so am I!'], after: ['Out of memory. Out of luck.'] },
      { name: 'Sysadmin Sol', intro: ['Have you tried turning it off?', 'Let me reboot your run!'], after: ['Uptime: zero. Come back later.'] },
    ],
    folk: [
      { name: 'Engineer', lines: ['The racks hum all night here.', 'Latency is a state of mind.'] },
      { name: 'Intern', lines: ['I only came for the free lunch.', 'And now there are wild monsters.'] },
      { name: 'Designer', lines: ['Everything here is pixel perfect.', 'Well. Sixteen pixels perfect.'] },
    ],
    exchange: 'Exchange terminal online. Sync your positions?',
  },
  energy: {
    trainers: [
      { name: 'Roughneck Rex', intro: ['Struck a gusher and a fight!', 'Ready to get dirty?'], after: ['My rig needs maintenance.'] },
      { name: 'Driller Dee', intro: ['I drill deep. So do my attacks!'], after: ['Dry well. Dry spirit.'] },
      { name: 'Pumper Pat', intro: ['Barrels do not fill themselves!'], after: ['Pressure is low. Come back.'] },
    ],
    folk: [
      { name: 'Foreman', lines: ['Mind the pumpjacks, kid.', 'Oil and grass grow deep here.'] },
      { name: 'Roughneck', lines: ['Dust in the wind, and monsters in the brush.'] },
      { name: 'Driver', lines: ['Prices swing like the beam of a pumpjack.'] },
    ],
    exchange: 'Step in from the dust. Settle up at the Exchange?',
  },
  meme: {
    trainers: [
      { name: 'Apeman Al', intro: ['DIAMOND HANDS! Never selling!', 'Fight me, smooth brain!'], after: ['Still holding. Still bruised.'] },
      { name: 'Diamond Di', intro: ['To the moon or to the dirt!'], after: ['Buying the dip on my pride.'] },
      { name: 'WSB Wes', intro: ['YOLO! All in on this battle!'], after: ['Position closed. Loss porn incoming.'] },
    ],
    folk: [
      { name: 'Ape', lines: ['I like the stock.', 'The stock likes me back.'] },
      { name: 'Trader', lines: ['Squeeze season never ends.', 'Watch out for the neon signs.'] },
      { name: 'Lurker', lines: ['I just read the comments.', 'The grass is very rocket-shaped.'] },
    ],
    exchange: 'Welcome to the Exchange. Tendies for your team?',
  },
  consumer: {
    trainers: [
      { name: 'Shopper Sue', intro: ['Sale on battles today!', 'Buy one, get one beaten!'], after: ['Returning this loss for store credit.'] },
      { name: 'Courier Cal', intro: ['Next-day delivery of a beating!'], after: ['Package undelivered. Try again.'] },
      { name: 'Stylist Sam', intro: ['Fresh kicks demand a fresh fight!'], after: ['Scuffed shoes. Scuffed pride.'] },
    ],
    folk: [
      { name: 'Vendor', lines: ['Fresh crates just arrived!', 'Do not lean on the boxes.'] },
      { name: 'Sailor', lines: ['The harbor smells like sale season.'] },
      { name: 'Shopper', lines: ['Everything here ships in two days.', 'Or was it one?'] },
    ],
    exchange: 'Welcome to the Exchange shop! Heal up inside?',
  },
  crypto: {
    trainers: [
      { name: 'Validator Val', intro: ['I secure this route. And your loss!'], after: ['Awaiting finality...'] },
      { name: 'Whale Wil', intro: ['My bags are heavy. So is my swing!'], after: ['Liquidity is thin today.'] },
      { name: 'Miner Mia', intro: ['Hash after hash, punch after punch!'], after: ['Block rejected. Try again.'] },
    ],
    folk: [
      { name: 'Scribe', lines: ['Every step here is written to the ledger.', 'Immutable, like my fear.'] },
      { name: 'Hodler', lines: ['I lost my keys years ago.', 'Still not selling.'] },
      { name: 'Sage', lines: ['The obelisks hum when blocks confirm.'] },
    ],
    exchange: 'Welcome to the Exchange. Settle your positions on-chain?',
  },
};

/* ------------------------------------------------------------------ builder ---- */

const FREE = 0, PATH = 1, BLOCK = 2, TALL = 3, KEEP = 4;

class Builder {
  readonly ground: number[];
  readonly paths: number[];
  readonly anim0: number[];
  readonly anim1: number[];
  readonly decor: number[];
  readonly overhead: number[];
  readonly collide: Uint8Array;
  readonly occ: Uint8Array;
  readonly path: Uint8Array;
  readonly water: Uint8Array;
  readonly tall: Uint8Array;

  constructor(readonly w: number, readonly h: number) {
    const n = w * h;
    this.ground = new Array(n).fill(0);
    this.paths = new Array(n).fill(0);
    this.anim0 = new Array(n).fill(0);
    this.anim1 = new Array(n).fill(0);
    this.decor = new Array(n).fill(0);
    this.overhead = new Array(n).fill(0);
    this.collide = new Uint8Array(n);
    this.occ = new Uint8Array(n);
    this.path = new Uint8Array(n);
    this.water = new Uint8Array(n);
    this.tall = new Uint8Array(n);
  }
  i(x: number, y: number) { return y * this.w + x; }
  inb(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  isFree(x: number, y: number) { return this.inb(x, y) && this.occ[this.i(x, y)] === FREE; }

  setDecor(x: number, y: number, tile: number, block = true) {
    if (!this.inb(x, y)) return;
    this.decor[this.i(x, y)] = gid(tile);
    if (block) { this.collide[this.i(x, y)] = 1; }
    this.occ[this.i(x, y)] = BLOCK;
  }
  setOver(x: number, y: number, tile: number) {
    if (this.inb(x, y)) this.overhead[this.i(x, y)] = gid(tile);
  }
  /** 2 wide x 2 tall (or any footprint) free check with a clearance ring. */
  areaFree(x: number, y: number, w: number, h: number, pad = 0) {
    for (let j = y - pad; j < y + h + pad; j++) for (let k = x - pad; k < x + w + pad; k++) {
      if (!this.inb(k, j)) return false;
      if (this.occ[this.i(k, j)] !== FREE) return false;
    }
    return true;
  }
  plantTree(x: number, y: number, variant: number) {
    const [tl, tr, bl, br] = variant ? [TILE.TREE2_TL, TILE.TREE2_TR, TILE.TREE2_BL, TILE.TREE2_BR] : [TILE.TREE_TL, TILE.TREE_TR, TILE.TREE_BL, TILE.TREE_BR];
    this.setOver(x, y, tl); this.setOver(x + 1, y, tr);
    this.setDecor(x, y + 1, bl); this.setDecor(x + 1, y + 1, br);
    this.collide[this.i(x, y)] = 1; this.collide[this.i(x + 1, y)] = 1;
    this.occ[this.i(x, y)] = BLOCK; this.occ[this.i(x + 1, y)] = BLOCK;
  }
}

/* ------------------------------------------------------------------ helpers ---- */

function ellipse(cx: number, cy: number, rx: number, ry: number, seed: number, wobble = 0.3) {
  return (x: number, y: number) => {
    const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
    return u * u + v * v <= 1 + (hash2(x, y, seed) - 0.5) * wobble;
  };
}

function maskAt(arr: Uint8Array, w: number, h: number, x: number, y: number, oob = 1) {
  return x < 0 || y < 0 || x >= w || y >= h ? oob : arr[y * w + x];
}
function neighbourMask(arr: Uint8Array, w: number, h: number, x: number, y: number, oob = 1) {
  let m = 0;
  if (maskAt(arr, w, h, x, y - 1, oob)) m |= N;
  if (maskAt(arr, w, h, x + 1, y, oob)) m |= E;
  if (maskAt(arr, w, h, x, y + 1, oob)) m |= S;
  if (maskAt(arr, w, h, x - 1, y, oob)) m |= W;
  if (maskAt(arr, w, h, x + 1, y - 1, oob)) m |= NE;
  if (maskAt(arr, w, h, x + 1, y + 1, oob)) m |= SE;
  if (maskAt(arr, w, h, x - 1, y + 1, oob)) m |= SW;
  if (maskAt(arr, w, h, x - 1, y - 1, oob)) m |= NW;
  return m;
}

const prop = (name: string, value: boolean | string | number): TiledProperty => ({
  name, type: typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? 'int' : 'string', value,
});

function tilesetFor(theme: RouteTheme) {
  return {
    firstgid: 1, name: 'tiles', image: `tiles_${theme}.png`,
    imagewidth: ATLAS_COLS * 16, imageheight: ATLAS_ROWS * 16, tilewidth: 16, tileheight: 16,
    tilecount: ATLAS_COLS * ATLAS_ROWS, columns: ATLAS_COLS, margin: 0, spacing: 0,
    tiles: [{ id: TILE.COLLIDE, properties: [prop('ge_collide', true)] }],
  };
}

function toTiled(b: Builder, meta: MapMeta): TiledMapJson {
  let nextLayer = 1;
  const layer = (name: string, data: number[], props: TiledProperty[] = [], visible = true): TiledTileLayer => ({
    id: nextLayer++, name, type: 'tilelayer', x: 0, y: 0, width: b.w, height: b.h, visible, opacity: 1, data, properties: props,
  });
  const collisionData = Array.from(b.collide, (v) => (v ? gid(TILE.COLLIDE) : 0));

  let oid = 1;
  const objs: TiledObject[] = [];
  const add = (name: string, type: string, x: number, y: number, props: TiledProperty[]) =>
    objs.push({ id: oid++, name, type, x: x * 16, y: y * 16, width: 0, height: 0, rotation: 0, visible: true, point: true, properties: [prop('tx', x), prop('ty', y), ...props] });
  add('spawn', 'spawn', meta.spawn.x, meta.spawn.y, [prop('facing', meta.spawn.facing)]);
  for (const w of meta.warps) add(w.id, 'warp', w.x, w.y, [prop('to', w.to), prop('spawnX', w.spawn.x), prop('spawnY', w.spawn.y), prop('facing', w.spawn.facing)]);
  for (const s of meta.signs) add(s.id, 'sign', s.x, s.y, [prop('text', s.text.join('|'))]);
  for (const n of meta.npcs) add(n.id, n.role === 'teller' ? 'teller' : 'npc', n.x, n.y, [prop('name', n.name), prop('sprite', n.sprite), prop('facing', n.facing), prop('wander', n.wander), prop('dialog', n.dialog.join('|'))]);
  for (const t of meta.trainers) add(t.id, 'trainer', t.x, t.y, [prop('name', t.name), prop('sprite', t.sprite), prop('facing', t.facing), prop('range', t.range), prop('intro', t.intro.join('|')), prop('after', t.after.join('|'))]);
  for (const [i, e] of meta.exits.entries()) add(`exit_${i}`, 'exit', e.x, e.y, []);
  const objectLayer: TiledObjectLayer = { id: nextLayer++, name: LAYER.objects, type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, visible: true, opacity: 1, objects: objs };

  return {
    compressionlevel: -1, width: b.w, height: b.h, tilewidth: 16, tileheight: 16, infinite: false,
    orientation: 'orthogonal', renderorder: 'right-down', type: 'map', version: '1.10', tiledversion: '1.10.2',
    nextlayerid: nextLayer + 1, nextobjectid: oid + 1,
    layers: [
      layer(LAYER.ground, b.ground),
      layer(LAYER.paths, b.paths),
      layer(LAYER.anim0, b.anim0),
      layer(LAYER.anim1, b.anim1),
      layer(LAYER.decor, b.decor),
      layer(LAYER.collision, collisionData, [], false),
      layer(LAYER.overhead, b.overhead, [prop('ge_alwaysTop', true)]),
      objectLayer,
    ],
    tilesets: [tilesetFor(meta.theme)],
    properties: [prop('theme', meta.theme), prop('kind', meta.kind), prop('title', meta.title)],
  };
}

/* ------------------------------------------------------------------ route map ---- */

export interface RouteMapOptions { routeName?: string }

/**
 * Procedural 48x36 route: a town hub with The Exchange, ponds, tall-grass patches, trainers and
 * wanderers. Fully deterministic in (theme, seed).
 */
export function buildRouteMap(theme: RouteTheme, seed: number | string, opts: RouteMapOptions = {}): BuiltMap {
  const w = MAP_W, h = MAP_H;
  const b = new Builder(w, h);
  const rand = rng(hashStr(`${seed}:${theme}`));
  const jit = (n: number) => Math.round((rand() * 2 - 1) * n);
  const flavour = FLAVOUR[theme];
  const routeName = opts.routeName ?? 'Route';

  // --- base ground
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = hash2(x, y, 5);
    b.ground[b.i(x, y)] = gid(n < 0.66 ? TILE.GRASS_A : n < 0.9 ? TILE.GRASS_B : TILE.GRASS_C);
  }

  // --- roads (walkable). x0..x1 / y0..y1 inclusive.
  const road = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (b.inb(x, y)) { b.path[b.i(x, y)] = 1; b.occ[b.i(x, y)] = PATH; }
  };
  const keep = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (b.inb(x, y) && b.occ[b.i(x, y)] === FREE) b.occ[b.i(x, y)] = KEEP;
  };
  const CX = 24;
  road(CX - 1, 9, CX + 1, h - 1);          // main road, south to the exit gate
  road(19, 10, 29, 12);                    // plaza in front of The Exchange
  road(4, 13, 43, 14);                     // east-west road
  road(10, 6, 10, 12);                     // west house walkway
  road(37, 6, 37, 12);                     // east house walkway
  road(6, 24, CX - 2, 24);                 // trail to the west tall grass
  road(CX + 2, 21, 40, 21);                // trail to the east tall grass
  road(CX + 2, 25, 36, 25);                // trail to the south-east tall grass

  // --- ponds (walkable-blocking), kept off paths
  const ponds = [
    { cx: 7.6 + jit(1) * 0.5, cy: 20.4 + jit(1) * 0.5, rx: 4.1, ry: 2.9 },
    { cx: 41.2, cy: 26.6 + jit(1) * 0.5, rx: 3.5, ry: 2.6 },
  ];
  ponds.forEach((p, k) => {
    const m = ellipse(p.cx, p.cy, p.rx, p.ry, 30 + k, 0.22);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const idx = b.i(x, y);
      if (m(x, y) && !b.path[idx] && x > 3 && x < w - 4 && y > 3 && y < h - 4) { b.water[idx] = 1; b.occ[idx] = BLOCK; b.collide[idx] = 1; }
    }
  });
  // sand shore
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const idx = b.i(x, y);
    if (b.water[idx] || b.path[idx]) continue;
    let near = false;
    for (let j = -1; j <= 1 && !near; j++) for (let k = -1; k <= 1; k++) if (maskAt(b.water, w, h, x + k, y + j, 0)) { near = true; break; }
    if (near) b.ground[idx] = gid(hash2(x, y, 8) < 0.5 ? TILE.SAND : TILE.SAND_B);
  }

  // --- tall-grass patches (large, organic)
  const patches = [
    { cx: 10.5, cy: 29.6, rx: 6.6, ry: 3.8 },
    { cx: 35.5, cy: 17.4, rx: 6.2, ry: 2.9 },
    { cx: 33.2, cy: 29.6, rx: 5.6, ry: 3.2 },
    { cx: 15.6, cy: 18.6, rx: 3.6, ry: 2.4 },
  ];
  patches.forEach((p, k) => {
    const m = ellipse(p.cx + jit(1) * 0.4, p.cy, p.rx, p.ry, 60 + k, 0.55);
    for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) {
      const idx = b.i(x, y);
      if (m(x, y) && b.occ[idx] === FREE) { b.tall[idx] = 1; b.occ[idx] = TALL; }
    }
  });

  // --- The Exchange + two houses
  const bx = CX - 2, by = 5;
  const place = (x: number, y: number, t: number, layer: 'decor' | 'over', block = true) => {
    if (layer === 'over') { b.setOver(x, y, t); b.collide[b.i(x, y)] = 1; b.occ[b.i(x, y)] = BLOCK; }
    else b.setDecor(x, y, t, block);
  };
  const roofRow = (x0: number, wdt: number, y: number, row: 'ridge' | 'eave') => {
    for (let k = 0; k < wdt; k++) {
      const part = k === 0 ? 'L' : k === wdt - 1 ? 'R' : 'M';
      const t = row === 'ridge' ? (part === 'L' ? TILE.ROOF_TL : part === 'R' ? TILE.ROOF_TR : TILE.ROOF_TM) : (part === 'L' ? TILE.ROOF_BL : part === 'R' ? TILE.ROOF_BR : TILE.ROOF_BM);
      place(x0 + k, y, t, 'over');
    }
  };
  roofRow(bx, 5, by, 'ridge'); roofRow(bx, 5, by + 1, 'eave');
  [TILE.WALL_WIN, TILE.WALL, TILE.EXCH_SIGN, TILE.WALL, TILE.WALL_WIN].forEach((t, k) => place(bx + k, by + 2, t, 'decor'));
  [TILE.WALL, TILE.WALL_WIN, TILE.DOOR, TILE.WALL_WIN, TILE.WALL].forEach((t, k) => place(bx + k, by + 3, t, 'decor', k !== 2));
  const doorX = CX, doorY = by + 3;
  b.occ[b.i(doorX, doorY)] = PATH;
  keep(bx - 1, by - 1, bx + 5, by + 4);

  const house = (x0: number, y0: number, doorTx: number) => {
    roofRow(x0, 3, y0, 'ridge'); roofRow(x0, 3, y0 + 1, 'eave');
    [TILE.WALL_WIN, TILE.DOOR, TILE.WALL_WIN].forEach((t, k) => place(x0 + k, y0 + 2, t, 'decor'));
    keep(x0 - 1, y0 - 1, x0 + 3, y0 + 3);
    return { doorTx, doorTy: y0 + 2 };
  };
  const hw = house(9, 3, 10), he = house(36, 3, 37);

  // fences in front of the houses, leaving the walkway open
  const fenceRow = (x0: number, x1: number, y: number, gapX: number) => {
    for (let x = x0; x <= x1; x++) {
      if (x === gapX) continue;
      const t = x === x0 || x === gapX + 1 ? TILE.FENCE_L : x === x1 || x === gapX - 1 ? TILE.FENCE_R : TILE.FENCE_H;
      if (b.isFree(x, y) || b.occ[b.i(x, y)] === KEEP) b.setDecor(x, y, t);
    }
  };
  fenceRow(7, 13, 8, 10);
  fenceRow(34, 40, 8, 37);

  // --- theme props & signs (placed before scatter so they get priority)
  const single = (x: number, y: number, t: number, over?: number) => {
    if (over !== undefined) b.setOver(x, y - 1, over);
    b.setDecor(x, y, t);
  };
  const tryTall = (x: number, y: number, top: number, bottom: number) => {
    if (b.inb(x, y - 1) && b.isFree(x, y) && (b.isFree(x, y - 1) || b.occ[b.i(x, y - 1)] === KEEP)) {
      b.setOver(x, y - 1, top); b.collide[b.i(x, y - 1)] = 1; b.occ[b.i(x, y - 1)] = BLOCK; b.setDecor(x, y, bottom);
      return true;
    }
    return false;
  };
  const scatter = (count: number, fn: (x: number, y: number) => boolean, tries = 400, margin = 4) => {
    let placed = 0;
    for (let t = 0; t < tries && placed < count; t++) {
      const x = margin + Math.floor(rand() * (w - margin * 2)), y = margin + Math.floor(rand() * (h - margin * 2));
      if (fn(x, y)) placed++;
    }
  };
  const clearOf = (x: number, y: number, ww: number, hh: number) => b.areaFree(x, y, ww, hh, 1);

  if (theme === 'bluechip') {
    for (const [x, y] of [[CX - 3, 15], [CX + 3, 15], [CX - 3, 20], [CX + 3, 20], [CX - 3, 31], [CX + 3, 31], [18, 9], [30, 9]] as const)
      if (b.isFree(x, y) || b.occ[b.i(x, y)] === KEEP) { b.occ[b.i(x, y)] = FREE; tryTall(x, y, TILE.LAMP_T, TILE.LAMP_B); }
  }
  if (theme === 'tech') {
    for (const [x, y] of [[bx - 2, by + 3], [bx + 6, by + 3], [17, 9], [31, 9]] as const)
      { b.occ[b.i(x, y)] = FREE; tryTall(x, y, TILE.RACK_T, TILE.RACK_B); }
    scatter(6, (x, y) => (clearOf(x, y - 1, 1, 2) ? tryTall(x, y, TILE.RACK_T, TILE.RACK_B) : false));
  }
  if (theme === 'meme') {
    for (const [x, y] of [[bx - 2, by + 3], [bx + 6, by + 3]] as const) { b.occ[b.i(x, y)] = FREE; tryTall(x, y, TILE.ROCKET_T, TILE.ROCKET_B); }
    scatter(5, (x, y) => (clearOf(x, y, 1, 1) ? (b.setDecor(x, y, TILE.NEON), true) : false));
  }
  if (theme === 'crypto') {
    for (const [x, y] of [[19, 10], [29, 10], [19, 12], [29, 12]] as const) {
      const idx = b.i(x, y); b.path[idx] = 0; b.paths[idx] = 0; b.occ[idx] = FREE; tryTall(x, y, TILE.OBELISK_T, TILE.OBELISK_B);
    }
    scatter(4, (x, y) => (clearOf(x, y - 1, 1, 2) ? tryTall(x, y, TILE.OBELISK_T, TILE.OBELISK_B) : false));
  }
  if (theme === 'energy') {
    scatter(3, (x, y) => {
      if (!clearOf(x, y, 2, 2)) return false;
      b.setOver(x, y, TILE.PUMP_TL); b.setOver(x + 1, y, TILE.PUMP_TR);
      b.collide[b.i(x, y)] = 1; b.collide[b.i(x + 1, y)] = 1; b.occ[b.i(x, y)] = BLOCK; b.occ[b.i(x + 1, y)] = BLOCK;
      b.setDecor(x, y + 1, TILE.PUMP_BL); b.setDecor(x + 1, y + 1, TILE.PUMP_BR);
      return true;
    }, 600, 5);
    scatter(6, (x, y) => (clearOf(x, y, 1, 1) ? (b.setDecor(x, y, TILE.DRUM), true) : false));
  }
  if (theme === 'consumer') {
    scatter(8, (x, y) => (clearOf(x, y, 1, 1) ? (b.setDecor(x, y, TILE.CRATE), true) : false));
  }

  // --- signs
  const signs: SignSpec[] = [];
  const addSign = (id: string, x: number, y: number, text: string[]) => {
    b.occ[b.i(x, y)] = FREE; b.setDecor(x, y, TILE.SIGN); signs.push({ id, x, y, text });
  };
  addSign('sign_exchange', CX - 2, by + 4, ['THE EXCHANGE', 'Settle your positions and heal your BrokerMon.']);
  addSign('sign_route', CX + 2, by + 4, [routeName.toUpperCase(), 'Wild BrokerMon lurk in the tall grass!', 'Trainers watch the trails.']);
  addSign('sign_exit', CX + 2, h - 4, ['EXIT ROUTE', 'The gate to the south leads back to the globe.']);
  addSign('sign_trail_w', CX - 3, 23, ['WEST TRAIL', 'Tall grass ahead. Mind the trainers.']);
  // (locked) house doors are blocked tiles: the sign lives on the door tile and is read from the walkway in front
  signs.push({ id: 'sign_house_w', x: hw.doorTx, y: hw.doorTy, text: ['LOCKED', 'A trader is on a very long call.'] });
  signs.push({ id: 'sign_house_e', x: he.doorTx, y: he.doorTy, text: ['LOCKED', 'Not accepting visitors. Markets are open.'] });

  // --- exit gate: two pillars and the trigger row
  const exits = [{ x: CX - 1, y: h - 1 }, { x: CX, y: h - 1 }, { x: CX + 1, y: h - 1 }];

  // --- border trees (2x2 units => a solid double-thick wall), gate left open
  for (let x = 0; x < w; x += 2) {
    b.plantTree(x, 0, (x >> 1) & 1);
    if (x < CX - 2 || x > CX + 1) b.plantTree(x, h - 2, ((x >> 1) + 1) & 1);
  }
  for (let y = 2; y < h - 2; y += 2) { b.plantTree(0, y, (y >> 1) & 1); b.plantTree(w - 2, y, ((y >> 1) + 1) & 1); }
  // gate posts
  for (const x of [CX - 2, CX + 2]) if (b.isFree(x, h - 2) || true) { b.occ[b.i(x, h - 2)] = FREE; }

  // --- scattered trees (ragged inner border + groves), never touching paths/patches
  scatter(70, (x, y) => {
    if (!b.areaFree(x, y, 2, 2, 1)) return false;
    b.plantTree(x, y, hash2(x, y, 3) < 0.5 ? 0 : 1);
    return true;
  }, 900, 2);

  // --- denser groves hugging the border so the route feels enclosed rather than fenced
  scatter(90, (x, y) => {
    const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (edge > 6 || !b.areaFree(x, y, 2, 2, 0)) return false;
    b.plantTree(x, y, hash2(x, y, 4) < 0.5 ? 0 : 1);
    return true;
  }, 1400, 2);

  // --- small decor
  scatter(26, (x, y) => (b.isFree(x, y) ? (b.ground[b.i(x, y)] = gid(TILE.FLOWER_A + Math.floor(rand() * 3)), true) : false), 500, 3);
  scatter(9, (x, y) => (clearOf(x, y, 1, 1) ? (b.setDecor(x, y, TILE.ROCK), true) : false), 300, 3);
  scatter(9, (x, y) => (clearOf(x, y, 1, 1) ? (b.setDecor(x, y, TILE.BUSH), true) : false), 300, 3);
  scatter(4, (x, y) => (clearOf(x, y, 1, 1) ? (b.setDecor(x, y, TILE.STUMP), true) : false), 300, 3);

  // --- characters
  const npcs: NpcSpec[] = [];
  const folkSprites: NpcSprite[] = ['npc_1', 'npc_2', 'npc_3'];
  const folkSpots: Array<[number, number, number]> = [[20, 11, 3], [28, 11, 3], [14, 14, 3], [39, 12, 2]];
  folkSpots.slice(0, 3).forEach(([x, y, r], k) => {
    const f = flavour.folk[k % flavour.folk.length];
    npcs.push({ id: `npc_${k}`, name: f.name, sprite: folkSprites[k % 3], x, y, facing: 'down', dialog: f.lines, wander: r, role: 'townsfolk' });
  });
  const trainers: TrainerSpec[] = [];
  const trainerSpots: Array<[number, number, Dir]> = [[16, 23, 'down'], [32, 22, 'up'], [30, 24, 'down']];
  trainerSpots.forEach(([x, y, facing], k) => {
    const f = flavour.trainers[k % flavour.trainers.length];
    trainers.push({ id: `trainer_${k}`, name: f.name, sprite: folkSprites[(k + 1) % 3], x, y, facing, range: 5, intro: f.intro, after: f.after });
  });
  // keep NPC/trainer tiles walkable
  for (const c of [...npcs, ...trainers]) { b.collide[b.i(c.x, c.y)] = 0; b.decor[b.i(c.x, c.y)] = 0; b.overhead[b.i(c.x, c.y)] = 0; b.occ[b.i(c.x, c.y)] = FREE; b.tall[b.i(c.x, c.y)] = 0; }

  const spawn: SpawnSpec = { x: CX, y: 11, facing: 'down' };

  // --- terrain tiles (autotiled)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const idx = b.i(x, y);
    if (b.path[idx]) b.paths[idx] = gid(blobTile('path', neighbourMask(b.path, w, h, x, y, 1)));
    if (b.water[idx]) {
      const m = neighbourMask(b.water, w, h, x, y, 1);
      b.anim0[idx] = gid(blobTile('water0', m));
      b.anim1[idx] = gid(blobTile('water1', m));
    }
    if (b.tall[idx] && !b.collide[idx] && !b.path[idx]) {
      const v = hash2(x, y, 44) < 0.5;
      b.anim0[idx] = gid(v ? TILE.TALL_A0 : TILE.TALL_B0);
      b.anim1[idx] = gid(v ? TILE.TALL_A1 : TILE.TALL_B1);
    } else if (b.tall[idx]) b.tall[idx] = 0;
  }

  // --- pocket fill: any walkable cell the player can never reach becomes a bush
  const reach = floodFrom(b.collide, w, h, spawn.x, spawn.y);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const idx = b.i(x, y);
    if (!b.collide[idx] && !reach[idx]) {
      b.decor[idx] = gid(TILE.BUSH); b.collide[idx] = 1; b.tall[idx] = 0; b.anim0[idx] = 0; b.anim1[idx] = 0;
    }
  }

  // --- warps
  const warps: WarpSpec[] = [{ id: 'warp_exchange', x: doorX, y: doorY, to: EXCHANGE_KEY, spawn: { x: 6, y: 7, facing: 'up' } }];

  const meta: MapMeta = {
    key: `route_${seed}`, theme, kind: 'route', title: routeName, width: w, height: h,
    spawn, warps, signs, npcs, trainers, exits,
  };
  return { key: meta.key, json: toTiled(b, meta), meta };
}

/* ------------------------------------------------------------------ exchange interior ---- */

export const INTERIOR_W = 12;
export const INTERIOR_H = 9;

export function buildExchangeInterior(theme: RouteTheme, routeName = 'Route'): BuiltMap {
  const w = INTERIOR_W, h = INTERIOR_H;
  const b = new Builder(w, h);
  const flavour = FLAVOUR[theme];

  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b.ground[b.i(x, y)] = gid(((x + y) & 1) === 0 ? TILE.FLOOR_A : TILE.FLOOR_B);
  // walls
  for (let x = 0; x < w; x++) {
    const win = x === 2 || x === 9;
    b.setDecor(x, 0, win ? TILE.IWINDOW : TILE.IWALL_TOP);
    b.setDecor(x, 1, x === 4 || x === 7 ? TILE.SHELF : TILE.IWALL_MID);
  }
  for (let y = 2; y < h; y++) { b.setDecor(0, y, TILE.IWALL_MID); b.setDecor(w - 1, y, TILE.IWALL_MID); }
  for (let x = 1; x < w - 1; x++) if (x !== 5 && x !== 6) b.setDecor(x, h - 1, TILE.IWALL_MID);
  // counter across the middle-top
  b.setDecor(3, 3, TILE.COUNTER_L); for (let x = 4; x <= 7; x++) b.setDecor(x, 3, TILE.COUNTER_M); b.setDecor(8, 3, TILE.COUNTER_R);
  // carpet runner from the door up to the counter
  for (let y = 4; y <= 8; y++) { b.ground[b.i(5, y)] = gid(TILE.CARPET_L); b.ground[b.i(6, y)] = gid(TILE.CARPET_R); }
  b.ground[b.i(5, 8)] = gid(TILE.EXIT_MAT); b.ground[b.i(6, 8)] = gid(TILE.EXIT_MAT);
  // heal pad behind the counter
  b.ground[b.i(8, 2)] = gid(TILE.HEAL_PAD);
  b.setDecor(1, 6, TILE.PLANT); b.setDecor(10, 6, TILE.PLANT); b.setDecor(1, 2, TILE.PLANT); b.setDecor(10, 2, TILE.PLANT);

  const exitSpawn: SpawnSpec = { x: 24, y: 10, facing: 'down' }; // patched by the scene to the door of the route map
  const meta: MapMeta = {
    key: `${EXCHANGE_KEY}_${theme}`, theme, kind: 'interior', title: 'The Exchange', width: w, height: h,
    spawn: { x: 6, y: 7, facing: 'up' },
    warps: [
      { id: 'warp_out_a', x: 5, y: 8, to: 'route', spawn: exitSpawn },
      { id: 'warp_out_b', x: 6, y: 8, to: 'route', spawn: exitSpawn },
    ],
    signs: [{ id: 'sign_shelf', x: 4, y: 1, text: ['A ledger of everything ever traded on ' + routeName + '.'] }],
    npcs: [
      { id: 'teller', name: 'Teller', sprite: 'npc_3', x: 5, y: 2, facing: 'down', dialog: [flavour.exchange], wander: 0, role: 'teller' },
      { id: 'analyst', name: 'Analyst', sprite: 'npc_1', x: 2, y: 5, facing: 'right', dialog: ['Tip: hit the tap bar on PERFECT for', 'bonus damage in battle.'], wander: 0, role: 'townsfolk' },
      { id: 'trader', name: 'Trader', sprite: 'npc_2', x: 9, y: 5, facing: 'left', dialog: ['They say the tall grass hides rare', 'BrokerMon. I just watch the ticker.'], wander: 1, role: 'townsfolk' },
    ],
    trainers: [],
    exits: [],
  };
  // shelf sign sits on a blocked tile; clear so the interaction target works from the floor in front
  for (const c of meta.npcs) { b.collide[b.i(c.x, c.y)] = 0; b.decor[b.i(c.x, c.y)] = 0; }
  return { key: meta.key, json: toTiled(b, meta), meta };
}

/* ------------------------------------------------------------------ analysis ---- */

/** 4-connected flood fill over non-blocked cells. */
export function floodFrom(blocked: ArrayLike<number>, w: number, h: number, sx: number, sy: number): Uint8Array {
  const seen = new Uint8Array(w * h);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h || blocked[sy * w + sx]) return seen;
  const stack = [sy * w + sx];
  seen[sy * w + sx] = 1;
  while (stack.length) {
    const c = stack.pop()!;
    const x = c % w, y = (c / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (seen[n] || blocked[n]) continue;
      seen[n] = 1; stack.push(n);
    }
  }
  return seen;
}

export function layerData(map: BuiltMap, name: string): number[] {
  const l = map.json.layers.find((q) => q.name === name);
  if (!l || l.type !== 'tilelayer') throw new Error(`missing tile layer ${name}`);
  return l.data;
}

/** 1 where the collision layer blocks. */
export function collisionGrid(map: BuiltMap): Uint8Array {
  const d = layerData(map, LAYER.collision);
  return Uint8Array.from(d, (v) => (v ? 1 : 0));
}

/** 1 where the tile in the (frame-0) animated layer is tall grass. */
export function tallGrassGrid(map: BuiltMap): Uint8Array {
  const d = layerData(map, LAYER.anim0);
  return Uint8Array.from(d, (v) => (v && isTallGrass(v - 1) ? 1 : 0));
}

/** 1 where the decor layer holds a counter (you can talk across it). */
export function counterGrid(map: BuiltMap): Uint8Array {
  const d = layerData(map, LAYER.decor);
  return Uint8Array.from(d, (v) => (v - 1 >= TILE.COUNTER_L && v - 1 <= TILE.COUNTER_R ? 1 : 0));
}

/** Tiles a trainer can see: straight along `dir` until something solid, up to `range`. */
export function sightLine(
  blocked: (x: number, y: number) => boolean, from: { x: number; y: number }, dir: Dir, range: number,
): Array<{ x: number; y: number }> {
  const v = DIR_VEC[dir];
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 1; i <= range; i++) {
    const x = from.x + v.x * i, y = from.y + v.y * i;
    if (blocked(x, y)) break;
    out.push({ x, y });
  }
  return out;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  stats: {
    key: string; size: string; walkable: number; reachable: number; unreachable: number;
    tallGrassTiles: number; tallPatches: number[]; trainers: number; wanderers: number; signs: number; warps: number; doorReachable: boolean;
  };
}

/** Flood-fill reachability + sanity checks over a built map. */
export function validateMap(map: BuiltMap): ValidationResult {
  const errors: string[] = [];
  const { meta, json } = map;
  const w = json.width, h = json.height;
  const err = (m: string) => errors.push(m);

  for (const l of json.layers) if (l.type === 'tilelayer' && l.data.length !== w * h) err(`layer ${l.name} has ${l.data.length} cells, expected ${w * h}`);
  if (json.tilewidth !== 16 || json.tileheight !== 16) err('tile size must be 16');
  const over = json.layers.find((l) => l.name === LAYER.overhead);
  if (!(over?.type === 'tilelayer' && over.properties?.some((q) => q.name === 'ge_alwaysTop' && q.value === true))) err('overhead layer must carry ge_alwaysTop');
  if (json.tilesets[0].tiles.every((t) => !t.properties.some((p) => p.name === 'ge_collide'))) err('collision tile lacks ge_collide property');
  const maxGid = TILE_COUNT;
  for (const l of json.layers) if (l.type === 'tilelayer') for (const v of l.data) if (v < 0 || v > maxGid) { err(`layer ${l.name} has gid ${v} out of range`); break; }

  const blocked = collisionGrid(map);
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  const cell = (x: number, y: number) => y * w + x;
  const s = meta.spawn;
  if (!inb(s.x, s.y) || blocked[cell(s.x, s.y)]) err(`spawn (${s.x},${s.y}) is blocked or out of bounds`);
  const reach = floodFrom(blocked, w, h, s.x, s.y);

  let walkable = 0, reachable = 0;
  const lost: string[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (blocked[cell(x, y)]) continue;
    walkable++;
    if (reach[cell(x, y)]) reachable++; else if (lost.length < 8) lost.push(`(${x},${y})`);
  }
  if (walkable !== reachable) err(`${walkable - reachable} walkable tiles unreachable, e.g. ${lost.join(' ')}`);

  const okTile = (x: number, y: number) => inb(x, y) && !blocked[cell(x, y)] && !!reach[cell(x, y)];
  const touchable = (x: number, y: number) => [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => okTile(x + dx, y + dy));

  for (const wp of meta.warps) if (!okTile(wp.x, wp.y)) err(`warp ${wp.id} at (${wp.x},${wp.y}) unreachable`);
  for (const sg of meta.signs) if (!touchable(sg.x, sg.y)) err(`sign ${sg.id} at (${sg.x},${sg.y}) has no reachable neighbour`);
  for (const e of meta.exits) if (!okTile(e.x, e.y)) err(`exit at (${e.x},${e.y}) unreachable`);
  const counters = counterGrid(map);
  for (const n of [...meta.npcs, ...meta.trainers]) {
    if (!okTile(n.x, n.y)) { err(`${n.id} at (${n.x},${n.y}) unreachable`); continue; }
    const around = [[0, 1], [0, -1], [1, 0], [-1, 0]].filter(([dx, dy]) => okTile(n.x + dx, n.y + dy)).length;
    if (around === 0) err(`${n.id} is walled in`);
    if ('role' in n && n.role === 'teller') {
      const facing = [[0, 1], [1, 0], [-1, 0]].some(([dx, dy]) => okTile(n.x + dx, n.y + dy) || (counters[cell(n.x + dx, n.y + dy)] && okTile(n.x + dx, n.y + dy + 1)));
      if (!facing) err('teller cannot be reached across the counter');
    }
  }
  for (const t of meta.trainers) {
    const line = sightLine((x, y) => !inb(x, y) || !!blocked[cell(x, y)], t, t.facing, t.range);
    if (line.length === 0) err(`trainer ${t.id} sees nothing`);
    if (line.some((p) => p.x === s.x && p.y === s.y)) err(`trainer ${t.id} sees the spawn point`);
  }

  // tall grass patches (connected components)
  const tall = tallGrassGrid(map);
  const comp = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!tall[cell(x, y)] || comp[cell(x, y)] >= 0) continue;
    const id = sizes.length; let size = 0;
    const st = [cell(x, y)]; comp[cell(x, y)] = id;
    while (st.length) {
      const c = st.pop()!; size++;
      const cx = c % w, cy = (c / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + dx, ny = cy + dy;
        if (!inb(nx, ny) || !tall[cell(nx, ny)] || comp[cell(nx, ny)] >= 0) continue;
        comp[cell(nx, ny)] = id; st.push(cell(nx, ny));
      }
    }
    sizes.push(size);
  }
  let tallCount = 0;
  for (let i = 0; i < tall.length; i++) if (tall[i]) { tallCount++; if (!reach[i]) err(`tall grass at index ${i} unreachable`); }
  if (meta.kind === 'route') {
    const large = sizes.filter((n) => n >= 24).length;
    if (large < 3) err(`only ${large} large tall-grass patches (need >= 3): sizes ${sizes.join(',')}`);
    if (meta.trainers.length < 2) err('need at least 2 trainers');
    if (meta.npcs.filter((n) => n.wander > 0).length < 2) err('need at least 2 wandering NPCs');
    if (meta.exits.length === 0) err('route has no exit');
    if (!meta.warps.some((wp) => wp.to === EXCHANGE_KEY)) err('route has no Exchange warp');
  } else if (!meta.npcs.some((n) => n.role === 'teller')) err('interior has no teller');

  const door = meta.warps[0];
  return {
    ok: errors.length === 0,
    errors,
    stats: {
      key: meta.key, size: `${w}x${h}`, walkable, reachable, unreachable: walkable - reachable,
      tallGrassTiles: tallCount, tallPatches: sizes, trainers: meta.trainers.length, wanderers: meta.npcs.filter((n) => n.wander > 0).length,
      signs: meta.signs.length, warps: meta.warps.length, doorReachable: door ? okTile(door.x, door.y) : false,
    },
  };
}
