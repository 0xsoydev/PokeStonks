import {
  PixelGrid, hex, mix, lighten, darken, hash2, rgba, withAlpha,
  type Color, type Ramp, makeRamp,
} from './pixel';
import { Painter } from './paint';
import type { ThemePal } from './themes';

const T = 16;
const SHADOW = rgba(10, 6, 24, 70);
const INK = hex('#1a1226');

export function softShadow(g: PixelGrid, cx: number, cy: number, rx: number, ry: number, a = 70) {
  const c = rgba(10, 6, 24, a);
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
      if (u * u + v * v <= 1 && g.get(x, y) === 0) g.set(x, y, c);
    }
}

/* ------------------------------------------------------------------ ground ---- */

export function paintGrass(g: PixelGrid, th: ThemePal, seed: number, tufts: number) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const n = hash2(x, y, seed);
    g.set(x, y, n < 0.06 ? th.grass.lo : n < 0.1 ? th.grass.hi : th.grass.base);
  }
  const spots: Array<[number, number]> = [[4, 5], [11, 9], [6, 13], [12, 3]];
  for (let i = 0; i < tufts; i++) {
    const [sx, sy] = spots[(i + seed) % spots.length];
    g.set(sx, sy, th.grass.tuft); g.set(sx - 1, sy - 1, th.grass.tuft); g.set(sx + 1, sy - 1, th.grass.tuft);
    g.set(sx, sy - 1, th.grass.hi);
  }
}

export function paintFlowers(g: PixelGrid, th: ThemePal, which: 0 | 1 | 2) {
  paintGrass(g, th, 21 + which, 1);
  const col = th.flowers[which];
  const spots: Array<[number, number]> = [[4, 4], [11, 6], [7, 11], [13, 13], [3, 12]];
  spots.forEach(([x, y], i) => {
    const c = i % 2 === 0 ? col : th.flowers[(which + 1) % 3];
    g.set(x, y - 1, c); g.set(x - 1, y, c); g.set(x + 1, y, c); g.set(x, y + 1, c);
    g.set(x, y, i % 2 === 0 ? hex('#fff6c8') : hex('#ffb84a'));
  });
}

export function paintTall(g: PixelGrid, th: ThemePal, variant: number, frame: number) {
  const t = th.tall;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) g.set(x, y, hash2(x, y, 50 + variant) < 0.16 ? t.lo : t.base);
  // staggered rows of blades; tips sway one pixel between frames
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const x = (1 + c * 4 + (((r + variant) & 1) * 2)) & 15;
      const y = 3 + r * 4;
      const dir = ((c + r) & 1) === 0 ? 1 : -1;
      const sway = frame === 0 ? dir : -dir;
      g.set(x, y, t.lo);
      g.set(x, y - 1, t.mid); g.set(x, y - 2, t.mid);
      g.set((x + sway) & 15, y - 3, t.tip);
      g.set((x + 1) & 15, y - 1, t.lo);
      g.set((x - 1) & 15, y - 1, t.mid);
      g.set((x - 1) & 15, y - 2, t.tip);
    }
  }
}

export function paintSand(g: PixelGrid, th: ThemePal, seed: number) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const n = hash2(x, y, 90 + seed);
    g.set(x, y, n < 0.07 ? th.sand.lo : n < 0.13 ? th.sand.hi : th.sand.base);
  }
}

/* ------------------------------------------------------------------ props ---- */

export function paintRock(g: PixelGrid) {
  const p = new Painter(g);
  const rock = makeRamp('#8d90a2');
  softShadow(g, 8, 13.4, 7, 2.2);
  p.blob(8.4, 9.6, 6.6, 5.2, rock);
  p.blob(3.8, 12.2, 3.2, 2.5, rock);
  g.set(6, 6, rock.hi); g.set(7, 6, rock.hi); g.set(5, 7, rock.hi);
  g.outline(rock.line);
}

export function paintBush(g: PixelGrid, th: ThemePal) {
  const p = new Painter(g);
  softShadow(g, 8, 13.6, 7, 2);
  p.blob(8, 9.2, 7, 5.6, th.leaf);
  p.blob(5, 8, 3.4, 3, th.leafAlt);
  g.set(10, 7, th.flowers[0]); g.set(6, 11, th.flowers[1]); g.set(12, 10, th.flowers[0]);
  g.outline(th.leaf.line);
}

export function paintSign(g: PixelGrid, th: ThemePal) {
  const wood = th.trunk;
  softShadow(g, 8, 14.2, 5, 1.6);
  g.rect(7, 8, 2, 7, wood.mid); g.vline(7, 8, 7, wood.hi); g.vline(8, 9, 6, wood.sh);
  g.rect(2, 2, 12, 7, wood.hi);
  g.rect(3, 3, 10, 5, wood.mid);
  g.hline(2, 8, 12, wood.sh);
  for (const x of [4, 5, 7, 8, 9, 11]) g.set(x, 4, wood.deep);
  for (const x of [4, 5, 6, 8, 10, 11]) g.set(x, 6, wood.deep);
  g.outline(wood.line);
}

export function paintStump(g: PixelGrid, th: ThemePal) {
  const w = th.trunk;
  const p = new Painter(g);
  softShadow(g, 8, 13.6, 6.5, 2);
  p.blob(8, 10.4, 5.4, 3.8, w);
  g.rect(3, 6, 10, 5, w.mid);
  p.blob(8, 6.6, 5.4, 2.6, makeRamp(lighten(w.mid, 0.35)), { edge: 'deep' });
  g.hline(6, 6, 4, w.sh); g.set(8, 7, w.sh);
  g.outline(w.line);
}

export function paintCrate(g: PixelGrid, th: ThemePal) {
  const w = th.trunk;
  softShadow(g, 8, 14, 7, 2);
  g.rect(2, 3, 12, 11, w.mid);
  g.rect(2, 3, 12, 1, w.hi); g.rect(2, 3, 1, 11, w.hi);
  g.rect(2, 13, 12, 1, w.deep); g.rect(13, 3, 1, 11, w.deep);
  g.rect(4, 5, 8, 7, w.sh);
  g.rect(5, 6, 6, 5, w.mid);
  g.line(5, 6, 10, 10, w.deep); g.line(10, 6, 5, 10, w.deep);
  g.outline(w.line);
}

export function paintDrum(g: PixelGrid, th: ThemePal) {
  const p = new Painter(g);
  const body = makeRamp(th.id === 'energy' ? '#c0483a' : '#5a6a88');
  softShadow(g, 8, 14, 6, 2);
  p.blob(8, 8.5, 5.4, 6.4, body, { pow: 3 });
  g.hline(3, 5, 10, body.deep); g.hline(3, 11, 10, body.deep);
  g.hline(3, 4, 10, body.hi); g.hline(3, 10, 10, body.hi);
  p.blob(8, 3, 5, 1.6, makeRamp(lighten(body.mid, 0.3)), { edge: 'deep' });
  g.outline(body.line);
}

/** 16x32 lamp post; caller slices the two tiles. */
export function paintLamp(th: ThemePal): PixelGrid {
  const g = new PixelGrid(T, 32);
  const iron = makeRamp('#3c4056');
  softShadow(g, 8, 30, 5, 1.6);
  // glow halo
  for (let y = 0; y < 14; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x - 7.5, y - 6);
    if (d < 7 && d > 3) g.set(x, y, withAlpha(th.glow, Math.round((1 - d / 7) * 60)));
  }
  g.rect(7, 12, 2, 18, iron.mid); g.vline(7, 12, 18, iron.hi);
  g.rect(5, 28, 6, 2, iron.mid); g.hline(5, 28, 6, iron.hi);
  g.rect(4, 3, 8, 8, iron.mid);
  g.rect(5, 4, 6, 6, th.glow);
  g.rect(6, 5, 2, 3, lighten(th.glow, 0.6));
  g.hline(3, 2, 10, iron.hi); g.hline(4, 1, 8, iron.mid); g.hline(6, 0, 4, iron.mid);
  g.outline(iron.line);
  return g;
}

/** 16x32 server rack (tech). */
export function paintRack(th: ThemePal): PixelGrid {
  const g = new PixelGrid(T, 32);
  const body = makeRamp('#3a4058');
  softShadow(g, 8, 30, 7, 1.8);
  g.rect(2, 2, 12, 28, body.mid);
  g.rect(2, 2, 12, 1, body.hi); g.rect(2, 2, 1, 28, body.hi);
  g.rect(13, 2, 1, 28, body.deep); g.rect(2, 29, 12, 1, body.deep);
  for (let i = 0; i < 6; i++) {
    const y = 4 + i * 4;
    g.rect(4, y, 8, 3, body.deep);
    g.rect(4, y, 8, 1, body.sh);
    const on = [th.accent.mid, hex('#7cff7c'), hex('#ffb84a')][(i + 1) % 3];
    g.set(5, y + 1, on); g.set(7, y + 1, i % 2 ? on : body.hi); g.set(10, y + 1, hex('#7cff7c'));
    g.hline(8, y + 2, 3, body.hi);
  }
  g.outline(body.line);
  return g;
}

/** 32x32 pump-jack (energy). */
export function paintPumpJack(th: ThemePal): PixelGrid {
  const g = new PixelGrid(32, 32);
  const p = new Painter(g);
  const steel = makeRamp('#59627a');
  const rust = makeRamp(th.id === 'energy' ? '#c95a2c' : '#c95a2c');
  softShadow(g, 16, 30, 14, 2);
  g.rect(3, 27, 26, 3, steel.mid); g.hline(3, 27, 26, steel.hi);
  // A-frame
  p.facet([[12, 27], [16, 9], [20, 27]], steel, 0.55);
  g.line(14, 27, 16, 13, steel.line); g.line(18, 27, 16, 13, steel.line);
  // walking beam with horse head on the left
  p.limb(6, 8.5, 26, 6, 2, 2, rust);
  p.facet([[2, 4], [8, 5], [8, 13], [4, 14], [2, 9]], rust, 0.5);
  // counterweight + crank
  p.blob(26, 12, 3.8, 3.8, steel);
  g.line(26, 12, 25, 22, steel.line);
  p.blob(24.4, 23, 3.2, 3.2, rust);
  // wellhead pipe
  g.vline(5, 14, 13, steel.hi); g.vline(6, 14, 13, steel.mid);
  g.rect(3, 26, 5, 2, rust.deep);
  g.outline(steel.line);
  return g;
}

export function paintNeon(g: PixelGrid, th: ThemePal) {
  const pole = makeRamp('#3c4056');
  softShadow(g, 8, 14.4, 4, 1.4);
  g.rect(7, 9, 2, 6, pole.mid);
  g.rect(1, 1, 14, 9, hex('#1c1236'));
  g.rect(1, 1, 14, 1, th.accent.mid); g.rect(1, 9, 14, 1, th.accent.mid);
  g.vline(1, 1, 9, th.accent.mid); g.vline(14, 1, 9, th.accent.mid);
  // little rocket-star glyph
  const c = th.accent.hi;
  g.set(8, 3, c); g.set(7, 4, c); g.set(8, 4, c); g.set(9, 4, c); g.set(5, 5, c); g.set(6, 5, c); g.set(7, 5, c); g.set(8, 5, c); g.set(9, 5, c); g.set(10, 5, c); g.set(11, 5, c);
  g.set(7, 6, c); g.set(8, 6, c); g.set(9, 6, c); g.set(6, 7, c); g.set(10, 7, c);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) if (g.get(x, y) === 0) {
    const d = Math.hypot(x - 7.5, y - 5);
    if (d < 9) g.set(x, y, withAlpha(th.accent.mid, Math.round(Math.max(0, 1 - d / 9) * 46)));
  }
  g.outline(pole.line);
}

/** 16x32 rocket statue (meme). */
export function paintRocket(th: ThemePal): PixelGrid {
  const g = new PixelGrid(T, 32);
  const p = new Painter(g);
  const white = makeRamp('#f4f4ff');
  const red = makeRamp('#e0344a');
  const stone = makeRamp('#7a7e94');
  softShadow(g, 8, 30, 7, 1.8);
  p.blob(8, 27, 7, 3, stone, { pow: 3 });
  g.rect(3, 24, 10, 4, stone.mid); g.hline(3, 24, 10, stone.hi);
  // flame
  p.poly([[6, 23], [8, 27], [10, 23]], makeRamp('#ffb84a'), { edge: false });
  p.blob(8, 13, 3.8, 10, white);
  p.poly([[4.2, 8], [8, 0.5], [11.8, 8]], red, { edge: 'auto' });
  p.poly([[4.4, 17], [1, 24], [5, 22]], red);
  p.poly([[11.6, 17], [15, 24], [11, 22]], red);
  p.disc(8, 12, 2, 2, th.glass.mid, hex('#3c4056'));
  g.set(7, 11, th.glass.hi);
  g.outline(stone.line);
  return g;
}

/** 16x32 obelisk (crypto). */
export function paintObelisk(th: ThemePal): PixelGrid {
  const g = new PixelGrid(T, 32);
  const p = new Painter(g);
  const stone = makeRamp('#54468c');
  softShadow(g, 8, 30.4, 7, 1.8);
  g.rect(2, 27, 12, 4, stone.mid); g.hline(2, 27, 12, stone.hi); g.hline(2, 30, 12, stone.deep);
  p.facet([[4.6, 27], [5.6, 6], [8, 1], [10.4, 6], [11.4, 27]], stone, 0.5);
  // glyph bars + glowing tip
  for (let i = 0; i < 5; i++) { const y = 9 + i * 3.4; g.hline(7, Math.round(y), 2 + (i & 1), th.accent.mid); }
  g.set(8, 3, th.accent.hi); g.set(8, 4, th.accent.mid);
  for (let y = 0; y < 8; y++) for (let x = 3; x < 14; x++) if (g.get(x, y) === 0) {
    const d = Math.hypot(x - 8, y - 3.5);
    if (d < 5) g.set(x, y, withAlpha(th.accent.mid, Math.round((1 - d / 5) * 60)));
  }
  g.outline(stone.line);
  return g;
}

/** 32x32 tree; the caller cuts it into four tiles. */
export function paintTree(th: ThemePal, variant = 0): PixelGrid {
  const g = new PixelGrid(32, 32);
  const p = new Painter(g);
  const leaf = variant ? th.leafAlt : th.leaf;
  const leaf2 = variant ? th.leaf : th.leafAlt;
  const trunk = th.trunk;
  softShadow(g, 16, 30, 12, 2.4, 80);
  // trunk
  p.limb(16, 20, 16, 30, 3.4, 4, trunk);
  g.set(12, 30, trunk.deep); g.set(20, 30, trunk.deep);
  // canopy clusters
  p.blob(16, 13.5, 13.4, 10.6, leaf);
  p.blob(8.6, 15.5, 7.4, 6.6, leaf);
  p.blob(23.4, 15.5, 7.4, 6.6, leaf);
  p.blob(16, 7.8, 8.6, 6.4, leaf2, { edge: 'soft' });
  p.blob(11, 10.5, 4.6, 3.8, leaf2, { edge: false });
  // leaf clumps (dark stipples give texture)
  for (let i = 0; i < 26; i++) {
    const x = 4 + Math.floor(hash2(i, 1, 5) * 24), y = 3 + Math.floor(hash2(i, 2, 5) * 20);
    if (g.get(x, y) === leaf.mid || g.get(x, y) === leaf2.mid) { g.set(x, y, leaf.sh); g.set(x + 1, y, leaf.sh); }
  }
  for (let i = 0; i < 10; i++) {
    const x = 6 + Math.floor(hash2(i, 3, 6) * 20), y = 4 + Math.floor(hash2(i, 4, 6) * 12);
    if (g.get(x, y) === leaf.mid || g.get(x, y) === leaf2.mid) g.set(x, y, leaf.hi);
  }
  // blossom/fruit accents
  if (th.id === 'meme' || th.id === 'crypto' || th.id === 'consumer')
    for (let i = 0; i < 6; i++) g.set(6 + Math.floor(hash2(i, 7, 8) * 20), 8 + Math.floor(hash2(i, 8, 8) * 14), th.flowers[i % 3]);
  g.outline(leaf.line);
  return g;
}

export function paintFence(g: PixelGrid, th: ThemePal, kind: 'h' | 'l' | 'r' | 'v') {
  const w = th.trunk;
  softShadow(g, 8, 14, 8, 1.6, 50);
  const post = (x: number) => {
    g.rect(x, 4, 3, 10, w.mid); g.vline(x, 4, 10, w.hi); g.vline(x + 2, 4, 10, w.sh);
    g.hline(x, 3, 3, w.hi);
  };
  const rails = (x0: number, x1: number) => {
    for (const y of [6, 10]) { g.rect(x0, y, x1 - x0, 2, w.mid); g.hline(x0, y, x1 - x0, w.hi); g.hline(x0, y + 1, x1 - x0, w.sh); }
  };
  if (kind === 'h') { rails(0, 16); post(0); post(13); }
  if (kind === 'l') { rails(1, 16); post(1); post(13); }
  if (kind === 'r') { rails(0, 15); post(0); post(12); }
  if (kind === 'v') { post(6); rails(3, 13); post(6); }
  g.outline(w.line);
}

/* --------------------------------------------------------------- buildings ---- */

function roofPixel(th: ThemePal, x: number, y: number, row: 'ridge' | 'eave'): Color {
  const R = th.roof;
  const yy = row === 'ridge' ? y : y + 16; // continue the pattern down the eave row
  switch (R.style) {
    case 'shingle': {
      const course = yy >> 2;
      const off = (course & 1) * 4;
      if ((yy & 3) === 3) return R.ramp.deep;
      if (((x + off) & 7) === 7) return R.ramp.sh;
      if ((yy & 3) === 0) return R.ramp.hi;
      return hash2((x + off) >> 3, course, 4) < 0.35 ? R.ramp.sh : R.ramp.mid;
    }
    case 'metal': {
      if ((x & 3) === 3) return R.ramp.deep;
      if ((x & 3) === 0) return R.ramp.hi;
      return (yy & 7) === 7 ? R.ramp.sh : R.ramp.mid;
    }
    case 'corrugated': {
      const m = x & 3;
      return m === 0 ? R.ramp.hi : m === 3 ? R.ramp.deep : m === 1 ? R.ramp.mid : R.ramp.sh;
    }
    case 'stripe':
    default:
      return ((x >> 2) & 1) === 0 ? R.ramp.mid : R.alt.mid;
  }
}

export function paintRoof(g: PixelGrid, th: ThemePal, part: 'l' | 'm' | 'r', row: 'ridge' | 'eave') {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    if (row === 'ridge') {
      // gable slope silhouette on the end tiles
      if (part === 'l' && y < 15 - x * 0.9 - 0) { /* above the slope */ if (x + y < 13) continue; }
      if (part === 'r' && y < 15 - (15 - x) * 0.9) { if ((15 - x) + y < 13) continue; }
    }
    g.set(x, y, roofPixel(th, x, y, row));
  }
  if (row === 'ridge') {
    // ridge cap
    for (let x = 0; x < T; x++) {
      const on = part === 'm' || (part === 'l' ? x > 3 : x < 12);
      if (on) { g.set(x, 0, th.roof.ramp.hi); g.set(x, 1, th.roof.ramp.mid); }
    }
  } else {
    // eave edge + shadow onto the wall
    for (let x = 0; x < T; x++) { g.set(x, 13, th.roof.ramp.sh); g.set(x, 14, th.roof.ramp.deep); g.set(x, 15, rgba(10, 6, 24, 120)); }
  }
  if (th.roof.style === 'stripe') for (let x = 0; x < T; x++) if (((x >> 2) & 1) === 1) g.set(x, row === 'ridge' ? 0 : 13, th.roof.alt.hi);
  // outer outline on the slanted tiles
  if (row === 'ridge') {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      if (g.get(x, y) === 0) continue;
      const edge = (part === 'l' && (g.get(x - 1, y) === 0 || g.get(x, y - 1) === 0))
        || (part === 'r' && (g.get(x + 1, y) === 0 || g.get(x, y - 1) === 0))
        || (part === 'm' && y === 0);
      if (edge) g.set(x, y, th.roof.ramp.line);
    }
  }
  if (part === 'l') g.vline(0, row === 'eave' ? 0 : 6, row === 'eave' ? 16 : 10, th.roof.ramp.line);
  if (part === 'r') g.vline(15, row === 'eave' ? 0 : 6, row === 'eave' ? 16 : 10, th.roof.ramp.line);
}

function wallPixel(th: ThemePal, x: number, y: number): Color {
  const W = th.wall;
  switch (W.style) {
    case 'brick': {
      const course = y >> 2, off = (course & 1) * 4;
      if ((y & 3) === 3) return W.ramp.sh;
      if (((x + off) & 7) === 7) return W.ramp.sh;
      return hash2((x + off) >> 3, course, 12) < 0.3 ? W.ramp.mid : mix(W.ramp.mid, W.ramp.hi, 0.5);
    }
    case 'panel': {
      if ((x & 7) === 7 || (y & 7) === 7) return W.ramp.sh;
      if ((x & 7) === 0 || (y & 7) === 0) return W.ramp.hi;
      return W.ramp.mid;
    }
    case 'plank': {
      if ((x & 3) === 3) return W.ramp.sh;
      return hash2(x >> 2, y >> 3, 3) < 0.25 ? W.ramp.sh : W.ramp.mid;
    }
    case 'marble': {
      if ((x & 7) === 7 || (y & 7) === 7) return W.ramp.sh;
      const v = hash2(x + y, y >> 1, 6);
      return v < 0.08 ? W.ramp.sh : v < 0.16 ? W.ramp.hi : W.ramp.mid;
    }
    case 'stucco':
    default: {
      const v = hash2(x, y, 17);
      return v < 0.08 ? W.ramp.sh : v < 0.13 ? W.ramp.hi : W.ramp.mid;
    }
  }
}

export function paintWall(g: PixelGrid, th: ThemePal) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) g.set(x, y, wallPixel(th, x, y));
  g.hline(0, 15, T, th.wall.trim.mid); g.hline(0, 14, T, th.wall.trim.hi);
}

export function paintWindow(g: PixelGrid, th: ThemePal) {
  paintWall(g, th);
  const f = th.wall.trim;
  g.rect(3, 3, 10, 9, f.deep);
  g.rect(4, 4, 8, 7, th.glass.mid);
  for (let y = 4; y < 11; y++) for (let x = 4; x < 12; x++) if ((x + y) % 5 === 0) g.set(x, y, th.glass.hi);
  g.rect(4, 4, 8, 1, th.glass.hi);
  g.vline(7, 4, 7, f.deep); g.vline(8, 4, 7, f.mid); g.hline(4, 7, 8, f.deep);
  g.rect(2, 12, 12, 2, f.hi); g.hline(2, 13, 12, f.sh);
  g.set(5, 5, W_HI); g.set(5, 6, W_HI);
}
const W_HI = hex('#ffffff');

export function paintDoor(g: PixelGrid, th: ThemePal) {
  paintWall(g, th);
  const f = th.wall.trim;
  const wood = th.trunk;
  g.rect(3, 1, 10, 15, f.deep);
  g.rect(4, 2, 8, 14, wood.mid);
  g.rect(4, 2, 8, 1, wood.hi);
  g.vline(4, 2, 14, wood.hi); g.vline(11, 2, 14, wood.sh);
  g.vline(7, 3, 13, wood.sh); g.vline(8, 3, 13, wood.sh);
  g.set(10, 9, th.accent.mid); g.set(10, 10, th.accent.hi);
  // step
  g.rect(2, 14, 12, 2, mix(f.mid, hex('#ffffff'), 0.2)); g.hline(2, 15, 12, f.sh);
}

export function paintExchSign(g: PixelGrid, th: ThemePal) {
  paintWall(g, th);
  g.rect(1, 3, 14, 10, hex('#182878'));
  g.rect(1, 3, 14, 1, hex('#d8a830')); g.rect(1, 12, 14, 1, hex('#d8a830'));
  g.vline(1, 3, 10, hex('#d8a830')); g.vline(14, 3, 10, hex('#d8a830'));
  g.rect(2, 4, 12, 8, hex('#183088'));
  // "$" glyph + tiny candle chart
  const gold = hex('#ffd84a');
  for (const [x, y] of [[8, 5], [7, 6], [8, 6], [9, 6], [7, 7], [8, 8], [9, 9], [7, 10], [8, 10], [9, 10], [8, 5], [8, 11]] as const) g.set(x, y, gold);
  g.set(9, 6, gold); g.set(6, 6, gold);
  g.vline(3, 8, 3, th.accent.mid); g.vline(5, 6, 4, hex('#e0344a')); g.vline(11, 7, 3, th.accent.mid); g.vline(13, 5, 5, hex('#e0344a'));
}

export function paintAwning(g: PixelGrid, th: ThemePal, part: 'l' | 'm' | 'r') {
  paintWall(g, th);
  const a = makeRamp('#e24c3c'), b = makeRamp('#fff4e8');
  for (let y = 0; y < 9; y++) for (let x = 0; x < T; x++) {
    const stripe = ((x >> 2) & 1) === 0;
    const r = stripe ? a : b;
    g.set(x, y, y === 0 ? r.hi : y > 6 ? r.sh : r.mid);
  }
  for (let x = 0; x < T; x += 4) { g.set(x + 1, 9, ((x >> 2) & 1) === 0 ? a.mid : b.sh); g.set(x + 2, 9, ((x >> 2) & 1) === 0 ? a.mid : b.sh); }
  g.hline(0, 10, T, rgba(10, 6, 24, 80));
  if (part === 'l') g.vline(0, 0, 10, a.line);
  if (part === 'r') g.vline(15, 0, 10, a.line);
  g.hline(0, 0, T, a.line);
}

/* --------------------------------------------------------------- interiors ---- */

export function paintFloor(g: PixelGrid, th: ThemePal, alt: boolean) {
  const F = th.floor;
  const r = alt ? F.b : F.a;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    let c = r.mid;
    switch (F.style) {
      case 'wood':
        if ((y & 3) === 3) c = r.sh;
        else if (((x + (y >> 2) * 5) & 15) === 0) c = r.sh;
        else if ((y & 3) === 0) c = r.hi;
        break;
      case 'plate':
        if ((x & 7) === 7 || (y & 7) === 7) c = r.sh;
        else if ((x & 7) === 0 || (y & 7) === 0) c = r.hi;
        break;
      case 'checker':
        c = (((x >> 3) + (y >> 3)) & 1) === (alt ? 1 : 0) ? F.a.mid : F.b.mid;
        if ((x & 7) === 0 || (y & 7) === 0) c = ((((x >> 3) + (y >> 3)) & 1) === (alt ? 1 : 0)) ? F.a.hi : F.b.hi;
        break;
      case 'marble': {
        if ((x & 7) === 7 || (y & 7) === 7) c = r.sh;
        else { const v = hash2(x + y * 3, y, 33); if (v < 0.07) c = r.sh; else if (v < 0.13) c = r.hi; }
        break;
      }
    }
    g.set(x, y, c);
  }
}

export function paintIWall(g: PixelGrid, th: ThemePal, part: 'top' | 'mid') {
  const w = th.iwall, t = th.iwallTrim;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    let c = hash2(x, y, 41) < 0.06 ? w.sh : w.mid;
    if (part === 'top') {
      if (y < 2) c = t.deep;
      else if (y === 2) c = t.mid;
      else if (y === 3) c = w.hi;
      // wallpaper stripes
      else if ((x & 7) === 3 && y > 4) c = w.sh;
    } else {
      // wainscot panel
      if (y < 2) c = w.sh;
      else if (y === 2) c = t.mid;
      else if (y === 3) c = t.hi;
      else if (y >= 4 && y < 14) c = ((x & 7) === 0 || (x & 7) === 7) ? w.sh : mix(w.mid, t.mid, 0.28);
      if (y >= 14) c = t.deep;
      if (y === 13) c = t.sh;
    }
    g.set(x, y, c);
  }
}

export function paintIWindow(g: PixelGrid, th: ThemePal) {
  paintIWall(g, th, 'top');
  const f = th.iwallTrim;
  g.rect(3, 4, 10, 11, f.deep);
  g.rect(4, 5, 8, 9, th.glass.hi);
  for (let y = 5; y < 14; y++) for (let x = 4; x < 12; x++) if (y > 8) g.set(x, y, th.glass.mid);
  g.vline(7, 5, 9, f.mid); g.vline(8, 5, 9, f.sh); g.hline(4, 9, 8, f.mid);
  g.set(5, 6, hex('#ffffff'));
}

export function paintCounter(g: PixelGrid, th: ThemePal, part: 'l' | 'm' | 'r') {
  const c = th.counter;
  paintFloor(g, th, false);
  g.rect(0, 2, T, 14, c.mid);
  g.rect(0, 2, T, 5, lighten(c.hi, 0.15));
  g.hline(0, 2, T, hex('#ffffff'));
  g.hline(0, 7, T, c.hi);
  g.hline(0, 8, T, c.deep);
  for (let x = 1; x < 15; x += 4) g.rect(x, 10, 3, 4, c.sh);
  g.hline(0, 15, T, c.deep);
  if (part === 'l') { g.vline(0, 2, 14, c.deep); g.vline(1, 2, 5, c.hi); }
  if (part === 'r') { g.vline(15, 2, 14, c.deep); g.vline(14, 8, 8, c.sh); }
}

export function paintCarpet(g: PixelGrid, th: ThemePal, part: 'm' | 'l' | 'r') {
  paintFloor(g, th, false);
  const c = th.carpet;
  const x0 = part === 'l' ? 2 : 0, x1 = part === 'r' ? 14 : 16;
  for (let y = 0; y < T; y++) for (let x = x0; x < x1; x++) {
    const col = ((x + y) & 1) === 0 && hash2(x, y, 2) < 0.2 ? c.sh : c.mid;
    g.set(x, y, col);
  }
  if (part === 'l') { g.vline(2, 0, 16, c.hi); g.vline(3, 0, 16, c.deep); }
  if (part === 'r') { g.vline(13, 0, 16, c.deep); g.vline(12, 0, 16, c.hi); }
  if (part === 'm') { g.vline(0, 0, 16, c.deep); }
}

export function paintPlant(g: PixelGrid, th: ThemePal) {
  paintFloor(g, th, false);
  const p = new Painter(g);
  const pot = makeRamp('#b8623c');
  softShadow(g, 8, 14.4, 5.4, 1.6, 60);
  g.rect(4, 10, 8, 5, pot.mid); g.hline(3, 10, 10, pot.hi); g.hline(4, 14, 8, pot.deep); g.vline(11, 11, 4, pot.sh);
  p.blob(8, 6.4, 5.6, 4.6, th.leaf);
  p.blob(5, 5, 2.8, 2.6, th.leafAlt, { edge: false });
  g.set(10, 4, th.flowers[0]); g.set(6, 7, th.flowers[1]);
  g.outline(th.leaf.line);
}

export function paintShelf(g: PixelGrid, th: ThemePal) {
  paintIWall(g, th, 'mid');
  const wood = th.trunk;
  g.rect(1, 1, 14, 14, wood.deep);
  g.rect(2, 2, 12, 12, wood.sh);
  for (const y of [2, 8]) {
    g.hline(2, y + 5, 12, wood.mid);
    for (let x = 3; x < 13; x += 2) {
      const c = [th.accent.mid, th.flowers[0], th.flowers[2], th.glass.mid, th.flowers[1]][((x >> 1) + y) % 5];
      const h = 3 + (hash2(x, y, 9) < 0.4 ? 1 : 0) + (hash2(x, y, 19) < 0.3 ? 1 : 0);
      g.rect(x, y + 5 - h, 1, h, c); g.set(x, y + 5 - h, lighten(c, 0.35));
    }
  }
}

export function paintHealPad(g: PixelGrid, th: ThemePal) {
  paintFloor(g, th, false);
  const rim = makeRamp('#dfe3f0');
  g.rect(2, 2, 12, 12, rim.mid);
  g.rect(2, 2, 12, 1, rim.hi); g.rect(2, 13, 12, 1, rim.deep);
  g.rect(3, 3, 10, 10, hex('#183088'));
  // glowing coin emblem
  const c = th.glow;
  for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d < 3.6) g.set(x, y, d < 2.2 ? lighten(c, 0.5) : c);
  }
  g.set(7, 6, hex('#ffffff'));
  g.hline(3, 3, 10, lighten(hex('#183088'), 0.25));
}

export function paintExitMat(g: PixelGrid, th: ThemePal) {
  paintFloor(g, th, false);
  const c = th.carpet;
  g.rect(1, 3, 14, 10, c.mid);
  g.rect(1, 3, 14, 1, c.hi); g.rect(1, 12, 14, 1, c.deep);
  g.rect(2, 5, 12, 6, c.sh);
  for (let x = 3; x < 13; x += 2) g.set(x, 8, c.hi);
}

export function paintCollide(g: PixelGrid) {
  g.rect(0, 0, T, T, rgba(255, 0, 90, 90));
  g.rect(0, 0, T, 1, rgba(255, 0, 90, 200));
}
void darken; void SHADOW; void INK; void (null as unknown as Ramp);
