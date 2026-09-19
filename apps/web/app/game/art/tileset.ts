import { PixelGrid, hash2, mix, type Color } from './pixel';
import { getTheme, type RouteTheme, type ThemePal } from './themes';
import * as P from './tileProps';

export const TILE_SIZE = 16;
export const ATLAS_COLS = 16;

/**
 * Stable tile ids (0-based frame index in every `tiles_<theme>` atlas). Tiled/Phaser layer data
 * stores `id + 1`; use `gid()` below. The order of this list IS the atlas layout: only ever append.
 */
const SINGLES = [
  // ground & scenery
  'GRASS_A', 'GRASS_B', 'GRASS_C', 'FLOWER_A', 'FLOWER_B', 'FLOWER_C',
  'TALL_A0', 'TALL_A1', 'TALL_B0', 'TALL_B1',
  'SAND', 'SAND_B', 'ROCK', 'BUSH', 'SIGN', 'COLLIDE',
  'TREE_TL', 'TREE_TR', 'TREE_BL', 'TREE_BR',
  'TREE2_TL', 'TREE2_TR', 'TREE2_BL', 'TREE2_BR',
  'FENCE_H', 'FENCE_L', 'FENCE_R', 'FENCE_V',
  'STUMP', 'LAMP_T', 'LAMP_B', 'CRATE', 'DRUM',
  // buildings
  'ROOF_TL', 'ROOF_TM', 'ROOF_TR', 'ROOF_BL', 'ROOF_BM', 'ROOF_BR',
  'WALL', 'WALL_WIN', 'DOOR', 'EXCH_SIGN', 'AWNING_L', 'AWNING_M', 'AWNING_R',
  // interiors
  'FLOOR_A', 'FLOOR_B', 'IWALL_TOP', 'IWALL_MID', 'IWINDOW',
  'COUNTER_L', 'COUNTER_M', 'COUNTER_R', 'CARPET_M', 'CARPET_L', 'CARPET_R',
  'PLANT', 'HEAL_PAD', 'SHELF', 'EXIT_MAT',
  // theme props
  'RACK_T', 'RACK_B', 'PUMP_TL', 'PUMP_TR', 'PUMP_BL', 'PUMP_BR',
  'NEON', 'ROCKET_T', 'ROCKET_B', 'OBELISK_T', 'OBELISK_B',
] as const;

export type TileName = (typeof SINGLES)[number];
export const TILE = Object.fromEntries(SINGLES.map((n, i) => [n, i])) as { readonly [K in TileName]: number };

/* ---- blob (47-tile) autotiling for paths and water ---- */
export const N = 1, E = 2, S = 4, W = 8, NE = 16, SE = 32, SW = 64, NW = 128;

/** Diagonals only matter when both neighbouring sides are connected. */
export function canonMask(m: number): number {
  let r = m & (N | E | S | W);
  if ((m & NE) && (m & N) && (m & E)) r |= NE;
  if ((m & SE) && (m & S) && (m & E)) r |= SE;
  if ((m & SW) && (m & S) && (m & W)) r |= SW;
  if ((m & NW) && (m & N) && (m & W)) r |= NW;
  return r;
}

export const BLOB_KEYS: readonly number[] = (() => {
  const set = new Set<number>();
  for (let m = 0; m < 256; m++) set.add(canonMask(m));
  return [...set].sort((a, b) => a - b);
})();
const BLOB_INDEX = new Map<number, number>(BLOB_KEYS.map((k, i) => [k, i]));

export type BlobKind = 'path' | 'water0' | 'water1';
const BLOB_KINDS: readonly BlobKind[] = ['path', 'water0', 'water1'];
const BLOB_BASE: Record<BlobKind, number> = {
  path: SINGLES.length,
  water0: SINGLES.length + BLOB_KEYS.length,
  water1: SINGLES.length + BLOB_KEYS.length * 2,
};
export const TILE_COUNT = SINGLES.length + BLOB_KEYS.length * BLOB_KINDS.length;
export const ATLAS_ROWS = Math.ceil(TILE_COUNT / ATLAS_COLS);

/** Tile id for a blob terrain given its 8-neighbour connectivity mask. */
export function blobTile(kind: BlobKind, mask8: number): number {
  return BLOB_BASE[kind] + (BLOB_INDEX.get(canonMask(mask8)) ?? BLOB_INDEX.get(N | E | S | W | NE | SE | SW | NW)!);
}
/** Tiled data value (gid) for a tile id. 0 means "no tile". */
export const gid = (id: number) => id + 1;

export const isTallGrass = (id: number) => id >= TILE.TALL_A0 && id <= TILE.TALL_B1;
export const isWaterTile = (id: number) => id >= BLOB_BASE.water0 && id < BLOB_BASE.water0 + BLOB_KEYS.length * 2;

/* ---- terrain painter ---- */

function softMin(ds: number[]): number {
  const p = 3;
  let sum = 0;
  for (const d of ds) sum += Math.pow(Math.max(d, 0.05), -p);
  return sum > 0 ? Math.pow(sum, -1 / p) : 99;
}

function pathPixel(th: ThemePal, x: number, y: number): Color {
  const pa = th.path;
  switch (pa.style) {
    case 'cobble': {
      const row = y >> 2, off = (row & 1) * 2;
      const cx = (x + off) & 15;
      if ((cx & 3) === 3 || (y & 3) === 3) return pa.mortar;
      if ((cx & 3) === 0 && (y & 3) === 0) return pa.hi;
      const n = hash2(cx >> 2, row & 3, 7);
      return n < 0.34 ? pa.base : n < 0.67 ? mix(pa.base, pa.hi, 0.45) : mix(pa.base, pa.lo, 0.45);
    }
    case 'plate': {
      if ((x & 7) === 7 || (y & 7) === 7) return pa.mortar;
      if ((x & 7) === 0 || (y & 7) === 0) return pa.hi;
      if ((x & 7) === 2 && (y & 7) === 2) return pa.lo;
      if ((x & 7) === 5 && (y & 7) === 5) return pa.lo;
      return hash2(x, y, 4) < 0.08 ? pa.lo : pa.base;
    }
    case 'dirt': {
      const n = hash2(x, y, 9);
      if (n < 0.07) return pa.lo;
      if (n < 0.12) return pa.hi;
      if (hash2(x >> 1, y >> 1, 21) < 0.05) return pa.mortar;
      return pa.base;
    }
    case 'pave':
    default: {
      if ((x & 7) === 7 || (y & 7) === 7) return pa.mortar;
      const alt = (((x >> 3) + (y >> 3)) & 1) === 1;
      if ((x & 7) === 0 || (y & 7) === 0) return pa.hi;
      return alt ? mix(pa.base, pa.lo, 0.3) : pa.base;
    }
  }
}

function waterPixel(th: ThemePal, x: number, y: number, frame: number): Color {
  const w = th.water;
  let c = w.base;
  if (hash2(x & 7, y & 7, 3) < 0.13) c = w.lo;
  const wy = (y + frame * 2) & 7;
  const phase = (x + ((y >> 3) & 1) * 5 + frame * 3) & 15;
  if (wy === 2 && phase < 5) c = w.hi;
  else if (wy === 3 && phase > 0 && phase < 4) c = mix(w.hi, w.foam, 0.5);
  else if (wy === 6 && phase >= 8 && phase < 11) c = w.lo;
  return c;
}

export function paintTerrainTile(kind: BlobKind, mask8: number, th: ThemePal): PixelGrid {
  const g = new PixelGrid(16, 16);
  const has = (b: number) => (mask8 & b) !== 0;
  const isPath = kind === 'path';
  const frame = kind === 'water1' ? 1 : 0;
  const inset = isPath ? 1.1 : 0.7;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const px = x + 0.5, py = y + 0.5;
      const ds: number[] = [];
      if (!has(N)) ds.push(py);
      if (!has(S)) ds.push(16 - py);
      if (!has(W)) ds.push(px);
      if (!has(E)) ds.push(16 - px);
      if (has(N) && has(W) && !has(NW)) ds.push(Math.hypot(px, py));
      if (has(N) && has(E) && !has(NE)) ds.push(Math.hypot(16 - px, py));
      if (has(S) && has(W) && !has(SW)) ds.push(Math.hypot(px, 16 - py));
      if (has(S) && has(E) && !has(SE)) ds.push(Math.hypot(16 - px, 16 - py));
      const d = softMin(ds) - inset;
      if (d < 0) continue;
      if (isPath) {
        if (d < 1) { g.set(x, y, th.path.edge); continue; }
        if (d < 2) {
          const lit = (!has(N) && py < 4) || (!has(W) && px < 4);
          g.set(x, y, lit ? th.path.hi : mix(pathPixel(th, x, y), th.path.lo, 0.5));
          continue;
        }
        g.set(x, y, pathPixel(th, x, y));
      } else {
        if (d < 1) { g.set(x, y, th.water.edge); continue; }
        if (d < 2.1) { g.set(x, y, frame === 1 && ((x + y) & 1) === 0 ? th.water.hi : th.water.foam); continue; }
        g.set(x, y, waterPixel(th, x, y, frame));
      }
    }
  }
  return g;
}

/* ---- atlas ---- */

function cut(dst: PixelGrid, src: PixelGrid, sx: number, sy: number, id: number) {
  dst.blit(src, (id % ATLAS_COLS) * 16, Math.floor(id / ATLAS_COLS) * 16, { sx, sy, sw: 16, sh: 16 });
}

const cache = new Map<RouteTheme, PixelGrid>();

/** Whole 16-column tile atlas for a route theme, painted procedurally (memoised). */
export function drawTilesetGrid(theme: RouteTheme = 'bluechip'): PixelGrid {
  const hit = cache.get(theme);
  if (hit) return hit;
  const th = getTheme(theme);
  const atlas = new PixelGrid(ATLAS_COLS * 16, ATLAS_ROWS * 16);
  const put = (name: TileName, paint: (g: PixelGrid) => void) => {
    const g = new PixelGrid(16, 16);
    paint(g);
    cut(atlas, g, 0, 0, TILE[name]);
  };
  put('GRASS_A', (g) => P.paintGrass(g, th, 1, 0));
  put('GRASS_B', (g) => P.paintGrass(g, th, 2, 2));
  put('GRASS_C', (g) => P.paintGrass(g, th, 3, 3));
  put('FLOWER_A', (g) => P.paintFlowers(g, th, 0));
  put('FLOWER_B', (g) => P.paintFlowers(g, th, 1));
  put('FLOWER_C', (g) => P.paintFlowers(g, th, 2));
  put('TALL_A0', (g) => P.paintTall(g, th, 0, 0));
  put('TALL_A1', (g) => P.paintTall(g, th, 0, 1));
  put('TALL_B0', (g) => P.paintTall(g, th, 1, 0));
  put('TALL_B1', (g) => P.paintTall(g, th, 1, 1));
  put('SAND', (g) => P.paintSand(g, th, 0));
  put('SAND_B', (g) => P.paintSand(g, th, 1));
  put('ROCK', P.paintRock);
  put('BUSH', (g) => P.paintBush(g, th));
  put('SIGN', (g) => P.paintSign(g, th));
  put('COLLIDE', P.paintCollide);
  for (const [v, names] of [[0, ['TREE_TL', 'TREE_TR', 'TREE_BL', 'TREE_BR']], [1, ['TREE2_TL', 'TREE2_TR', 'TREE2_BL', 'TREE2_BR']]] as const) {
    const tree = P.paintTree(th, v);
    cut(atlas, tree, 0, 0, TILE[names[0]]); cut(atlas, tree, 16, 0, TILE[names[1]]);
    cut(atlas, tree, 0, 16, TILE[names[2]]); cut(atlas, tree, 16, 16, TILE[names[3]]);
  }
  put('FENCE_H', (g) => P.paintFence(g, th, 'h'));
  put('FENCE_L', (g) => P.paintFence(g, th, 'l'));
  put('FENCE_R', (g) => P.paintFence(g, th, 'r'));
  put('FENCE_V', (g) => P.paintFence(g, th, 'v'));
  put('STUMP', (g) => P.paintStump(g, th));
  const lamp = P.paintLamp(th);
  cut(atlas, lamp, 0, 0, TILE.LAMP_T); cut(atlas, lamp, 0, 16, TILE.LAMP_B);
  put('CRATE', (g) => P.paintCrate(g, th));
  put('DRUM', (g) => P.paintDrum(g, th));

  put('ROOF_TL', (g) => P.paintRoof(g, th, 'l', 'ridge'));
  put('ROOF_TM', (g) => P.paintRoof(g, th, 'm', 'ridge'));
  put('ROOF_TR', (g) => P.paintRoof(g, th, 'r', 'ridge'));
  put('ROOF_BL', (g) => P.paintRoof(g, th, 'l', 'eave'));
  put('ROOF_BM', (g) => P.paintRoof(g, th, 'm', 'eave'));
  put('ROOF_BR', (g) => P.paintRoof(g, th, 'r', 'eave'));
  put('WALL', (g) => P.paintWall(g, th));
  put('WALL_WIN', (g) => P.paintWindow(g, th));
  put('DOOR', (g) => P.paintDoor(g, th));
  put('EXCH_SIGN', (g) => P.paintExchSign(g, th));
  put('AWNING_L', (g) => P.paintAwning(g, th, 'l'));
  put('AWNING_M', (g) => P.paintAwning(g, th, 'm'));
  put('AWNING_R', (g) => P.paintAwning(g, th, 'r'));

  put('FLOOR_A', (g) => P.paintFloor(g, th, false));
  put('FLOOR_B', (g) => P.paintFloor(g, th, true));
  put('IWALL_TOP', (g) => P.paintIWall(g, th, 'top'));
  put('IWALL_MID', (g) => P.paintIWall(g, th, 'mid'));
  put('IWINDOW', (g) => P.paintIWindow(g, th));
  put('COUNTER_L', (g) => P.paintCounter(g, th, 'l'));
  put('COUNTER_M', (g) => P.paintCounter(g, th, 'm'));
  put('COUNTER_R', (g) => P.paintCounter(g, th, 'r'));
  put('CARPET_M', (g) => P.paintCarpet(g, th, 'm'));
  put('CARPET_L', (g) => P.paintCarpet(g, th, 'l'));
  put('CARPET_R', (g) => P.paintCarpet(g, th, 'r'));
  put('PLANT', (g) => P.paintPlant(g, th));
  put('HEAL_PAD', (g) => P.paintHealPad(g, th));
  put('SHELF', (g) => P.paintShelf(g, th));
  put('EXIT_MAT', (g) => P.paintExitMat(g, th));

  const rack = P.paintRack(th);
  cut(atlas, rack, 0, 0, TILE.RACK_T); cut(atlas, rack, 0, 16, TILE.RACK_B);
  const pump = P.paintPumpJack(th);
  cut(atlas, pump, 0, 0, TILE.PUMP_TL); cut(atlas, pump, 16, 0, TILE.PUMP_TR);
  cut(atlas, pump, 0, 16, TILE.PUMP_BL); cut(atlas, pump, 16, 16, TILE.PUMP_BR);
  put('NEON', (g) => P.paintNeon(g, th));
  const rocket = P.paintRocket(th);
  cut(atlas, rocket, 0, 0, TILE.ROCKET_T); cut(atlas, rocket, 0, 16, TILE.ROCKET_B);
  const ob = P.paintObelisk(th);
  cut(atlas, ob, 0, 0, TILE.OBELISK_T); cut(atlas, ob, 0, 16, TILE.OBELISK_B);

  for (const kind of BLOB_KINDS) {
    BLOB_KEYS.forEach((key, i) => cut(atlas, paintTerrainTile(kind, key, th), 0, 0, BLOB_BASE[kind] + i));
  }
  cache.set(theme, atlas);
  return atlas;
}

/** 16x16-tile atlas as a canvas (`theme` re-tints ground, props, buildings and interiors). */
export function drawTileset(theme: RouteTheme = 'bluechip'): HTMLCanvasElement {
  return drawTilesetGrid(theme).toCanvas(1);
}
