// Generates maps/data/village-map.json — the single playable PokeStonks village map.
// Deterministic (seeded RNG). Re-run with `node maps/scripts/generate-map.mjs` after edits.
// Schema: tile grid + y-sorted objects (feet-anchored) + stock pins + spawn.
// World units are pixels. TILE = 32 (CraftPix tiles are 32x32).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const TILE = 32;
const COLS = 40;
const ROWS = 30;
const WORLD_W = COLS * TILE; // 1280
const WORLD_H = ROWS * TILE; // 960

// mulberry32 — deterministic pseudo-random
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(1337);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// Ground palette (relative to /maps/village). Classified by dominant hue.
const GRASS = ['01', '05', '07', '10', '23', '27', '35', '36', '53', '55', '56'].map(
  (n) => `tiles/FieldsTile_${n}.png`,
);
const DIRT = ['04', '17', '18', '29', '31', '51', '61'].map(
  (n) => `tiles/FieldsTile_${n}.png`,
);
const SAND = ['09', '19', '34', '49'].map((n) => `tiles/FieldsTile_${n}.png`);
const groundTiles = [...new Set([...GRASS, ...DIRT, ...SAND])];
const GRASS_SET = new Set(GRASS);
const gi = (img) => groundTiles.indexOf(img);

// Measured sprite sizes (w x h, px). Anchor for every object is feet-center (x, y).
const SIZE = {
  'objects/7 House/1.png': [116, 112],
  'objects/7 House/2.png': [156, 135],
  'objects/7 House/3.png': [147, 157],
  'objects/7 House/4.png': [154, 149],
  'objects/6 Tent/1.png': [73, 65],
  'objects/6 Tent/2.png': [64, 61],
  'objects/6 Tent/3.png': [65, 62],
  'objects/6 Tent/4.png': [64, 71],
  'objects/PlaceForTower1.png': [62, 61],
  'objects/PlaceForTower2.png': [63, 64],
  'objects/4 Box/1.png': [20, 22],
  'objects/4 Box/2.png': [20, 22],
  'objects/4 Box/3.png': [16, 21],
  'objects/4 Box/4.png': [16, 22],
  'objects/4 Box/5.png': [18, 25],
  'objects/2 Stone/1.png': [10, 9],
  'objects/2 Stone/2.png': [9, 7],
  'objects/2 Stone/3.png': [6, 5],
  'objects/2 Stone/4.png': [4, 3],
  'objects/2 Stone/5.png': [9, 8],
  'objects/2 Stone/6.png': [11, 9],
  'objects/5 Grass/1.png': [5, 6],
  'objects/5 Grass/2.png': [9, 6],
  'objects/5 Grass/3.png': [5, 7],
  'objects/5 Grass/4.png': [8, 5],
  'objects/5 Grass/5.png': [6, 10],
  'objects/5 Grass/6.png': [5, 8],
  'objects/3 Decor/1.png': [48, 26],
  'objects/3 Decor/2.png': [41, 38],
  'objects/3 Decor/8.png': [28, 42],
  'objects/3 Decor/13.png': [43, 54],
  'tiles2/Tile2_09.png': [32, 32],
  'tiles2/Tile2_33.png': [32, 32],
};

/** Build an object entry. (x, y) = feet-center in world px. */
function obj(img, x, y, opts = {}) {
  const [w, h] = SIZE[img];
  const entry = { img, x: Math.round(x), y: Math.round(y), w, h };
  if (opts.solid !== false) {
    const fw = opts.footW ?? 0.64; // solid width as fraction of sprite w
    const fh = opts.footH ?? 0.32; // solid height as fraction of sprite h
    entry.solid = {
      x: Math.round(x - (w * fw) / 2),
      y: Math.round(y - h * fh),
      w: Math.round(w * fw),
      h: Math.round(h * fh),
    };
  }
  return entry;
}

// ---- ground layer ----
const ground = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
for (let y = 0; y < ROWS; y++)
  for (let x = 0; x < COLS; x++) ground[y][x] = gi(pick(GRASS));

const paintRect = (x0, y0, x1, y1, pool) => {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (x >= 0 && y >= 0 && x < COLS && y < ROWS) ground[y][x] = gi(pick(pool));
};

// village plaza + cross roads (dirt)
paintRect(14, 10, 25, 19, DIRT); // plaza
paintRect(1, 13, 38, 15, DIRT); // horizontal road
paintRect(19, 1, 21, 28, DIRT); // vertical road

// sandy patches
for (const [cx, cy, r] of [[7, 22, 2], [32, 23, 3], [31, 7, 2]]) {
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + 1 && x > 0 && y > 0 && x < COLS - 1 && y < ROWS - 1)
        ground[y][x] = gi(pick(SAND));
}

// ---- objects ----
const objects = [];

// palisade fence ring (solid boundary) + distinct corner posts
for (let x = 0; x < COLS; x++) {
  objects.push(obj('tiles2/Tile2_09.png', x * TILE + 16, 32, { footW: 1, footH: 1 }));
  objects.push(obj('tiles2/Tile2_09.png', x * TILE + 16, WORLD_H, { footW: 1, footH: 1 }));
}
for (let y = 1; y < ROWS - 1; y++) {
  objects.push(obj('tiles2/Tile2_09.png', 16, y * TILE + 32, { footW: 1, footH: 1 }));
  objects.push(obj('tiles2/Tile2_09.png', WORLD_W - 16, y * TILE + 32, { footW: 1, footH: 1 }));
}
for (const [cx, cy] of [[16, 32], [WORLD_W - 16, 32], [16, WORLD_H], [WORLD_W - 16, WORLD_H]]) {
  objects.push(obj('tiles2/Tile2_33.png', cx, cy, { footW: 1, footH: 1 }));
}

// houses (solid, big footprints)
objects.push(obj('objects/7 House/2.png', 240, 250, { footW: 0.8, footH: 0.42 }));
objects.push(obj('objects/7 House/3.png', 1040, 250, { footW: 0.8, footH: 0.42 }));
objects.push(obj('objects/7 House/1.png', 230, 720, { footW: 0.8, footH: 0.42 }));
objects.push(obj('objects/7 House/4.png', 1030, 720, { footW: 0.8, footH: 0.42 }));

// tents
objects.push(obj('objects/6 Tent/1.png', 420, 700));
objects.push(obj('objects/6 Tent/2.png', 880, 700));
objects.push(obj('objects/6 Tent/3.png', 420, 250));
objects.push(obj('objects/6 Tent/4.png', 870, 250));

// crates + barrels near houses
objects.push(obj('objects/4 Box/1.png', 350, 300));
objects.push(obj('objects/4 Box/3.png', 372, 306));
objects.push(obj('objects/3 Decor/2.png', 910, 310));
objects.push(obj('objects/4 Box/5.png', 330, 670));
objects.push(obj('objects/3 Decor/8.png', 920, 660));
objects.push(obj('objects/4 Box/2.png', 945, 668));
objects.push(obj('objects/3 Decor/13.png', 500, 200));
objects.push(obj('objects/3 Decor/1.png', 790, 830));

// scattered stones along the inner walls (solid)
for (let i = 0; i < 12; i++) {
  const edge = Math.floor(rand() * 4);
  const n = 1 + Math.floor(rand() * 6);
  let sx = 80;
  let sy = 80;
  if (edge === 0) { sx = 60 + rand() * (WORLD_W - 120); sy = 56; }
  if (edge === 1) { sx = 60 + rand() * (WORLD_W - 120); sy = WORLD_H - 56; }
  if (edge === 2) { sx = 56; sy = 60 + rand() * (WORLD_H - 120); }
  if (edge === 3) { sx = WORLD_W - 56; sy = 60 + rand() * (WORLD_H - 120); }
  objects.push(obj(`objects/2 Stone/${n}.png`, sx, sy));
}

// grass tufts (walk-through, no collision) — clustered on grass ground only
let placed = 0;
let guard = 0;
while (placed < 130 && guard++ < 5000) {
  const n = 1 + Math.floor(rand() * 6);
  const cx = 70 + rand() * (WORLD_W - 140);
  const cy = 70 + rand() * (WORLD_H - 140);
  const at = (px, py) => {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    return (
      tx > 0 && ty > 0 && tx < COLS - 1 && ty < ROWS - 1 &&
      GRASS_SET.has(groundTiles[ground[ty][tx]])
    );
  };
  if (!at(cx, cy)) continue;
  const cluster = 2 + Math.floor(rand() * 4);
  for (let c = 0; c < cluster && placed < 130; c++) {
    const px = cx + (rand() - 0.5) * 60;
    const py = cy + (rand() - 0.5) * 60;
    if (!at(px, py)) continue;
    objects.push(obj(`objects/5 Grass/${n}.png`, px, py, { solid: false }));
    placed++;
  }
}

// ---- stock pins (tower pads, walkable — catch by clicking) ----
const pins = [
  { symbol: 'AAPL', drop: '0.025', x: 140, y: 140, pad: 'objects/PlaceForTower1.png' },
  { symbol: 'TSLA', drop: '0.03', x: 1140, y: 140, pad: 'objects/PlaceForTower2.png' },
  { symbol: 'NVDA', drop: '1', x: 640, y: 700, pad: 'objects/PlaceForTower1.png' },
  { symbol: 'GME', drop: '0.25', x: 140, y: 820, pad: 'objects/PlaceForTower2.png' },
  { symbol: 'AMZN', drop: '0.02', x: 1140, y: 820, pad: 'objects/PlaceForTower1.png' },
];

const map = {
  tile: TILE,
  cols: COLS,
  rows: ROWS,
  worldW: WORLD_W,
  worldH: WORLD_H,
  tileBase: '/maps/village',
  groundTiles,
  ground,
  objects,
  pins,
  spawn: { x: 640, y: 470 },
};

const outDir = path.join(process.cwd(), 'maps', 'data');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'village-map.json'), JSON.stringify(map, null, 2) + '\n');
console.log(
  `village map written: ${COLS}x${ROWS}, ${objects.length} objects, ${pins.length} pins`,
);
