// Generates maps/data/pins.json — 5 stock-pin tiles for the meadowbrook map.
// Picks walkable, spawn-reachable, mutually distant tiles via seeded BFS scan.
// Re-run with `node maps/scripts/generate-pins.mjs` after editing meadowbrook.tmj.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const TS = 16;
const tmj = JSON.parse(readFileSync(path.join(process.cwd(), 'maps', 'data', 'meadowbrook.tmj'), 'utf8'));

const layer = (n) => tmj.layers.find((l) => l.name === n);
const W = tmj.width;
const H = tmj.height;
const tset = tmj.tilesets[0];
const props = {};
for (const t of tset.tiles || []) {
  const p = {};
  for (const q of t.properties || []) p[q.name] = q.value;
  props[t.id] = p;
}
const ground = layer('ground').data;
const objs = layer('objects').data;
const above = layer('above').data;
const solidAt = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return true;
  for (const L of [ground, objs, above]) {
    const g = L[y * W + x];
    if (g && props[g - 1] && props[g - 1].solid) return true;
  }
  return false;
};
const toObjs = (n) =>
  layer(n).objects.map((o) => {
    const p = {};
    for (const q of o.properties || []) p[q.name] = q.value;
    return { name: o.name, type: o.type, tx: o.x / TS, ty: o.y / TS, p };
  });
const spawn = toObjs('interactions').find((o) => o.type === 'spawn');

// BFS from spawn
const start = { x: spawn.tx, y: spawn.ty };
const seen = new Set([start.y * W + start.x]);
const q = [start];
while (q.length) {
  const { x, y } = q.shift();
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const nx = x + dx;
    const ny = y + dy;
    const k = ny * W + nx;
    if (solidAt(nx, ny) || seen.has(k)) continue;
    seen.add(k);
    q.push({ x: nx, y: ny });
  }
}

// candidate scoring: prefer road/plaza-ish open tiles far from map edges, spread apart
const STOCKS = [
  { symbol: 'AAPL', drop: '0.025' },
  { symbol: 'TSLA', drop: '0.03' },
  { symbol: 'NVDA', drop: '1' },
  { symbol: 'GME', drop: '0.25' },
  { symbol: 'AMZN', drop: '0.02' },
];
const MIN_DIST = 9; // chebyshev, in tiles
const chosen = [];
const candidates = [...seen]
  .map((k) => ({ x: k % W, y: Math.floor(k / W) }))
  .filter(
    (t) =>
      t.x >= 3 && t.y >= 3 && t.x < W - 3 && t.y < H - 4 && // clear of borders/shore
      (t.x !== start.x || t.y !== start.y),
  )
  .sort((a, b) => {
    const da = Math.hypot(a.x - start.x, a.y - start.y);
    const db = Math.hypot(b.x - start.x, b.y - start.y);
    return db - da; // farthest first for coverage
  });

for (const c of candidates) {
  if (chosen.length === STOCKS.length) break;
  if (chosen.every((p) => Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)) >= MIN_DIST)) chosen.push(c);
}
if (chosen.length < STOCKS.length) {
  console.error(`only found ${chosen.length}/${STOCKS.length} spread tiles — lower MIN_DIST`);
  process.exit(1);
}

const pins = STOCKS.map((s, i) => ({ ...s, x: chosen[i].x, y: chosen[i].y }));
const outDir = path.join(process.cwd(), 'maps', 'data');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'pins.json'), JSON.stringify({ tile: TS, pins }, null, 2) + '\n');
console.log(
  'pins:', pins.map((p) => `${p.symbol}@(${p.x},${p.y})`).join(' '),
  `| reachable tiles: ${seen.size}`,
);
