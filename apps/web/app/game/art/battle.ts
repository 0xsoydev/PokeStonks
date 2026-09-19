import { PixelGrid, hex, mix, lighten, darken, hash2, rgba, withAlpha, type Color } from './pixel';
import { getTheme, type RouteTheme } from './themes';

/** Logical battle-backdrop resolution; upscaled x4 to the 960x640 game canvas. */
export const BG_W = 240;
export const BG_H = 160;
export const BG_SCALE = 4;
const HORIZON = 62;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16);

interface BgSpec {
  sky: [Color, Color, Color]; // top, middle, horizon
  far: Color; farHi: Color; near: Color; nearHi: Color;
  fog: Color;
  groundA: Color; groundB: Color; line: Color; glow: Color;
  stars?: boolean;
}

const c = hex;
const SPECS: Record<RouteTheme, BgSpec> = {
  bluechip: {
    sky: [c('#3f86dc'), c('#84c4f0'), c('#e0f4fa')], far: c('#6ea486'), farHi: c('#88bc98'), near: c('#4c9058'), nearHi: c('#62a66a'),
    fog: c('#dff2f0'), groundA: c('#5cb44c'), groundB: c('#52a844'), line: c('#3f8f3e'), glow: c('#fff6c8'),
  },
  tech: {
    sky: [c('#080f2a'), c('#1a3868'), c('#3c7ab8')], far: c('#1a2c50'), farHi: c('#2a4478'), near: c('#121e3a'), nearHi: c('#1e3060'),
    fog: c('#3c7ab8'), groundA: c('#26365a'), groundB: c('#1f2d4c'), line: c('#4de1ff'), glow: c('#4de1ff'), stars: true,
  },
  energy: {
    sky: [c('#e2963c'), c('#f0c678'), c('#fbe6b4')], far: c('#b8703e'), farHi: c('#d08a52'), near: c('#94502c'), nearHi: c('#b06a3c'),
    fog: c('#f8dca4'), groundA: c('#cc9e60'), groundB: c('#c09256'), line: c('#8a5a2c'), glow: c('#fff0c0'),
  },
  meme: {
    sky: [c('#170634'), c('#5e1878'), c('#ff5ab4')], far: c('#3a1058'), farHi: c('#5a2080'), near: c('#240a40'), nearHi: c('#3c1666'),
    fog: c('#ff5ab4'), groundA: c('#1e0a3c'), groundB: c('#170830'), line: c('#ff4fc8'), glow: c('#ffe25a'), stars: true,
  },
  consumer: {
    sky: [c('#4eb0ee'), c('#9adef6'), c('#fbf2da')], far: c('#7aa8c8'), farHi: c('#98c0d8'), near: c('#5a8aa8'), nearHi: c('#78a4c0'),
    fog: c('#eef4f0'), groundA: c('#e8e0ca'), groundB: c('#dcd2b8'), line: c('#b4aa90'), glow: c('#ffffff'),
  },
  crypto: {
    sky: [c('#080418'), c('#281656'), c('#6a3cac')], far: c('#2a1a5a'), farHi: c('#3c2878'), near: c('#1a1040'), nearHi: c('#2c1c66'),
    fog: c('#6a3cac'), groundA: c('#34246e'), groundB: c('#2b1e60'), line: c('#e0b84a'), glow: c('#f0c040'), stars: true,
  },
};

function skyColor(spec: BgSpec, x: number, y: number): Color {
  const t = Math.min(1, y / HORIZON);
  const levels = 10;
  const v = t * (levels - 1);
  const base = Math.floor(v), frac = v - base;
  const step = frac > BAYER[(y & 3) * 4 + (x & 3)] ? base + 1 : base;
  const tt = Math.min(1, step / (levels - 1));
  return tt < 0.55 ? mix(spec.sky[0], spec.sky[1], tt / 0.55) : mix(spec.sky[1], spec.sky[2], (tt - 0.55) / 0.45);
}

/** Filled silhouette column heights along the horizon (x -> top y). */
function ridge(g: PixelGrid, fn: (x: number) => number, fill: Color, hi: Color) {
  for (let x = 0; x < BG_W; x++) {
    const top = Math.round(fn(x));
    for (let y = top; y <= HORIZON; y++) g.set(x, y, y === top ? hi : fill);
  }
}

function themeFar(theme: RouteTheme, g: PixelGrid, spec: BgSpec) {
  const rnd = (i: number, s: number) => hash2(i, s, 77);
  switch (theme) {
    case 'bluechip': {
      ridge(g, (x) => HORIZON - 13 - Math.sin(x / 19) * 5 - Math.sin(x / 7 + 1) * 2, spec.far, spec.farHi);
      ridge(g, (x) => HORIZON - 6 - Math.sin(x / 13 + 2) * 3, spec.near, spec.nearHi);
      // tiny town with red roofs on the ridge
      for (let i = 0; i < 9; i++) {
        const x = 20 + i * 24 + Math.floor(rnd(i, 1) * 8), y = HORIZON - 10 - Math.round(Math.sin(x / 13 + 2) * 2);
        g.rect(x, y + 3, 6, 5, c('#efe2c4')); g.rect(x - 1, y + 1, 8, 2, c('#c2483f')); g.rect(x + 1, y, 4, 1, c('#c2483f'));
      }
      break;
    }
    case 'tech': {
      for (let i = 0; i < 22; i++) {
        const x = i * 11 + Math.floor(rnd(i, 2) * 4), w = 6 + Math.floor(rnd(i, 3) * 6), hgt = 14 + Math.floor(rnd(i, 4) * 26);
        g.rect(x, HORIZON - hgt, w, hgt + 1, i % 2 ? spec.far : spec.farHi);
        g.hline(x, HORIZON - hgt, w, lighten(spec.farHi, 0.2));
        for (let wy = HORIZON - hgt + 3; wy < HORIZON - 1; wy += 4) for (let wx = x + 1; wx < x + w - 1; wx += 2) if (rnd(wx, wy) < 0.45) g.set(wx, wy, rnd(wx, wy + 9) < 0.5 ? c('#4de1ff') : c('#ffe58a'));
      }
      ridge(g, () => HORIZON - 3, spec.near, spec.nearHi);
      break;
    }
    case 'energy': {
      for (let i = 0; i < 6; i++) {
        const x = i * 46 - 10 + Math.floor(rnd(i, 5) * 14), w = 30 + Math.floor(rnd(i, 6) * 20), hgt = 12 + Math.floor(rnd(i, 7) * 12);
        for (let yy = 0; yy < hgt; yy++) { const inset = Math.floor(yy < 3 ? 3 - yy : 0) + Math.floor((yy / hgt) * 0); g.hline(x + inset, HORIZON - hgt + yy, w - inset * 2, yy < 2 ? spec.farHi : spec.far); }
      }
      ridge(g, (x) => HORIZON - 5 - Math.sin(x / 11) * 2, spec.near, spec.nearHi);
      // derricks
      for (const x of [34, 96, 176, 214]) {
        const y = HORIZON - 5;
        g.line(x, y, x + 4, y - 22, c('#5a3220')); g.line(x + 8, y, x + 4, y - 22, c('#5a3220'));
        g.line(x + 1, y - 8, x + 7, y - 8, c('#5a3220')); g.line(x + 2, y - 15, x + 6, y - 15, c('#5a3220'));
        g.rect(x + 3, y - 24, 3, 2, c('#5a3220'));
      }
      break;
    }
    case 'meme': {
      // sunset sun with scanline cutouts
      const cx = 120, cy = HORIZON - 4, r = 30;
      for (let y = cy - r; y <= HORIZON; y++) for (let x = cx - r; x <= cx + r; x++) {
        if (Math.hypot(x - cx, y - cy) > r) continue;
        const t = (y - (cy - r)) / (r + 4);
        if (y > cy - 12 && ((y - cy) % 5 + 5) % 5 < Math.floor((y - (cy - 12)) / 5)) continue;
        g.set(x, y, mix(c('#ffe25a'), c('#ff3fa0'), t));
      }
      ridge(g, (x) => HORIZON - 12 - Math.abs(((x + 30) % 70) - 35) * 0.5, spec.far, spec.farHi);
      ridge(g, (x) => HORIZON - 5 - Math.abs(((x + 12) % 44) - 22) * 0.28, spec.near, spec.nearHi);
      break;
    }
    case 'consumer': {
      // sea band + harbour cranes
      for (let y = HORIZON - 9; y <= HORIZON; y++) for (let x = 0; x < BG_W; x++) {
        const w = hash2(x >> 1, y, 5) < 0.07;
        g.set(x, y, w ? c('#e6f8ff') : y === HORIZON - 9 ? c('#8ad0ee') : mix(c('#3fa8e0'), c('#2a88c8'), (y - HORIZON + 9) / 9));
      }
      for (const [x, hgt] of [[26, 30], [128, 24], [200, 34]] as const) {
        const col = c('#5a6c84');
        g.line(x, HORIZON - 9, x, HORIZON - 9 - hgt, col); g.line(x + 1, HORIZON - 9, x + 1, HORIZON - 9 - hgt, col);
        g.line(x, HORIZON - 9 - hgt, x + 18, HORIZON - 9 - hgt, col); g.line(x + 16, HORIZON - 9 - hgt, x + 16, HORIZON - 9 - hgt + 8, col);
        g.line(x, HORIZON - 9 - hgt, x - 8, HORIZON - 9 - hgt + 3, col);
      }
      for (const x of [60, 168]) { g.rect(x, HORIZON - 14, 22, 5, c('#e24c3c')); g.rect(x + 4, HORIZON - 18, 8, 4, c('#fff4e8')); g.rect(x + 6, HORIZON - 20, 3, 2, c('#5a6c84')); }
      break;
    }
    case 'crypto': {
      ridge(g, (x) => HORIZON - 16 - Math.abs(((x + 8) % 84) - 42) * 0.4, spec.far, spec.farHi);
      ridge(g, (x) => HORIZON - 6 - Math.abs(((x + 40) % 52) - 26) * 0.2, spec.near, spec.nearHi);
      // floating crystals
      for (const [x, y, s] of [[34, 22, 5], [86, 12, 4], [150, 26, 6], [206, 14, 4]] as const) {
        for (let dy = -s * 2; dy <= s * 2; dy++) { const wdt = Math.round((1 - Math.abs(dy) / (s * 2)) * s); g.hline(x - wdt, y + dy, wdt * 2 + 1, dy < 0 ? c('#8a6ae0') : c('#5a3cb4')); }
        g.set(x - 1, y - s, c('#d8c8ff')); g.set(x - 1, y - s + 1, c('#d8c8ff'));
      }
      break;
    }
  }
}

function groundColor(theme: RouteTheme, spec: BgSpec, x: number, y: number): Color {
  const t = (y - HORIZON) / (BG_H - HORIZON);
  const d = 1 / (t + 0.07);
  const u = (x - BG_W / 2) * d * 0.045;
  const v = d * 1.1;
  const fu = Math.floor(u), fv = Math.floor(v);
  const cell = (fu + fv) & 1;
  const fracU = u - fu, fracV = v - fv;
  let col: Color = cell ? spec.groundA : spec.groundB;
  // lines alias into noise near the horizon: fade them out over the first few rows
  const lineFade = Math.max(0, Math.min(1, (t - 0.05) * 7));
  switch (theme) {
    case 'bluechip': {
      col = (fv & 1) ? spec.groundA : spec.groundB;                 // mowing stripes
      if (hash2(x, y, 3) < 0.05) col = spec.line;
      else if (hash2(x >> 1, y, 4) < 0.03) col = lighten(spec.groundA, 0.25);
      break;
    }
    case 'tech': {
      const lineU = fracU < 0.06 || fracU > 0.94, lineV = fracV < 0.06 || fracV > 0.94;
      if (lineU || lineV) col = mix(spec.groundA, spec.line, (0.85 - t * 0.35) * lineFade);
      else if (lineFade > 0.5 && hash2(fu, fv, 8) < 0.12) col = lighten(col, 0.1);
      break;
    }
    case 'energy': {
      const n = hash2(Math.floor(u * 3), Math.floor(v * 3), 11);
      col = n < 0.5 ? spec.groundA : spec.groundB;
      const crack = Math.abs(fracU - (hash2(fu, fv, 6) * 0.6 + 0.2)) < 0.035 && hash2(fu, fv, 7) < 0.6;
      if (crack || hash2(x, y, 9) < 0.03) col = spec.line;
      break;
    }
    case 'meme': {
      const lineU = fracU < 0.07 || fracU > 0.93, lineV = fracV < 0.07 || fracV > 0.93;
      col = spec.groundA;
      if (lineV) col = mix(spec.groundA, spec.line, 0.9 * lineFade);
      else if (lineU) col = mix(spec.groundA, c('#4de1ff'), 0.7 * lineFade);
      break;
    }
    case 'consumer': {
      col = cell ? spec.groundA : spec.groundB;
      if ((fracU < 0.05 || fracV < 0.05) && lineFade > 0.3) col = mix(col, spec.line, lineFade);
      break;
    }
    case 'crypto': {
      col = cell ? spec.groundA : spec.groundB;
      const edge = fracU < 0.05 || fracV < 0.05;
      if (edge) col = mix(spec.groundA, spec.line, (0.8 - t * 0.3) * lineFade);
      else if (lineFade > 0.5 && hash2(fu, fv, 5) < 0.08 && fracU > 0.3 && fracU < 0.7) col = mix(col, spec.line, 0.5);
      break;
    }
  }
  // distance fog toward the horizon + vignette toward the bottom corners
  const fog = Math.pow(Math.max(0, 1 - t * 2.4), 2) * 0.55;
  col = mix(col, spec.fog, fog);
  const vig = Math.max(0, (Math.abs(x - BG_W / 2) / (BG_W / 2)) - 0.55) * 0.3 + Math.max(0, t - 0.7) * 0.25;
  return darken(col, vig);
}

const bgCache = new Map<RouteTheme, PixelGrid>();

/** 240x160 logical backdrop for a route theme. The sky is deliberately clean: clouds are added by the scene. */
export function drawBattleBgGrid(theme: RouteTheme): PixelGrid {
  const hit = bgCache.get(theme);
  if (hit) return hit;
  const spec = SPECS[theme];
  const g = new PixelGrid(BG_W, BG_H);
  for (let y = 0; y <= HORIZON; y++) for (let x = 0; x < BG_W; x++) g.set(x, y, skyColor(spec, x, y));
  if (spec.stars) {
    for (let i = 0; i < 46; i++) {
      const x = Math.floor(hash2(i, 1, 40) * BG_W), y = Math.floor(hash2(i, 2, 40) * (HORIZON - 22));
      g.set(x, y, hash2(i, 3, 40) < 0.2 ? c('#ffffff') : mix(spec.sky[1], c('#ffffff'), 0.55));
    }
  }
  themeFar(theme, g, spec);
  // horizon glow line
  for (let x = 0; x < BG_W; x++) g.set(x, HORIZON, mix(g.get(x, HORIZON), spec.glow, 0.35));
  for (let y = HORIZON + 1; y < BG_H; y++) for (let x = 0; x < BG_W; x++) g.set(x, y, groundColor(theme, spec, x, y));
  bgCache.set(theme, g);
  return g;
}

/** 960x640 backdrop canvas. */
export function drawBattleBg(theme: RouteTheme): HTMLCanvasElement {
  return drawBattleBgGrid(theme).toCanvas(BG_SCALE);
}

/* ---------------------------------------------------------------- platforms ---- */

export type PlatformKind = 'foe' | 'ally';
const PLATFORM_LOGICAL: Record<PlatformKind, [number, number]> = { foe: [65, 22], ally: [80, 27] };

export function drawPlatformGrid(kind: PlatformKind, theme: RouteTheme = 'bluechip'): PixelGrid {
  const [w, h] = PLATFORM_LOGICAL[kind];
  const g = new PixelGrid(w, h);
  const spec = SPECS[theme];
  const th = getTheme(theme);
  const TOPS: Record<RouteTheme, string> = {
    bluechip: '#62bc52', tech: '#5c7cae', energy: '#d8ae70', meme: '#8452c0', consumer: '#f0e8d2', crypto: '#8a6cd8',
  };
  const top = c(TOPS[theme]);
  const topHi = lighten(top, 0.22);
  const rim = darken(mix(top, th.path.lo, 0.5), 0.25);
  const rimDeep = darken(rim, 0.35);
  const cx = w / 2, cy = h * 0.42;
  const rx = w / 2 - 2, ry = h * 0.3;
  // soft cast shadow
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5 - cx) / (rx + 1), v = (y + 0.5 - (cy + 5)) / (ry + 4);
    const d = u * u + v * v;
    if (d <= 1) g.set(x, y, rgba(8, 4, 20, d < 0.6 ? 72 : 44));
  }
  // rim (thickness) then top face
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5 - cx) / rx;
    const inThick = (() => { const v = (y + 0.5 - (cy + 4)) / ry; return u * u + v * v <= 1; })();
    const inTop = (() => { const v = (y + 0.5 - cy) / ry; return u * u + v * v <= 1; })();
    if (inThick && !inTop) g.set(x, y, y > cy + 6 ? rimDeep : rim);
    if (inTop) {
      const v = (y + 0.5 - cy) / ry;
      const dd = u * u + v * v;
      let col = top;
      if (dd < 0.28) col = topHi;
      else if (dd < 0.42 && ((x + y) & 1) === 0) col = topHi;
      else if (dd > 0.82) col = darken(top, 0.14);
      else if (dd > 0.7 && ((x + y) & 1) === 0) col = darken(top, 0.14);
      if (hash2(x, y, 12) < 0.05) col = darken(col, 0.1);
      g.set(x, y, col);
    }
  }
  // crisp outline on the top face edge
  const snap = g.clone();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = (y + 0.5 - cy) / ry, u = (x + 0.5 - cx) / rx;
    if (u * u + v * v > 0.86 && u * u + v * v <= 1 && snap.get(x, y) !== 0) g.set(x, y, darken(top, 0.32));
  }
  return g;
}

export function drawPlatform(kind: PlatformKind, theme: RouteTheme = 'bluechip'): HTMLCanvasElement {
  return drawPlatformGrid(kind, theme).toCanvas(4);
}

/** Small soft blob shadow (48x14). */
export function drawShadowBlobGrid(): PixelGrid {
  const g = new PixelGrid(48, 14);
  for (let y = 0; y < 14; y++) for (let x = 0; x < 48; x++) {
    const u = (x + 0.5 - 24) / 23.5, v = (y + 0.5 - 7) / 6.5;
    const d = u * u + v * v;
    if (d <= 1) g.set(x, y, rgba(10, 6, 24, d < 0.35 ? 110 : d < 0.7 ? 78 : 44));
  }
  return g;
}

/** 8x8 white four-point sparkle. */
export function drawSparkGrid(): PixelGrid {
  const g = new PixelGrid(8, 8);
  const rows = ['...##...', '...##...', '..####..', '########', '########', '..####..', '...##...', '...##...'];
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') g.set(x, y, 0xffffffff); }));
  return g;
}

/** 8x8 soft circle with stepped alpha (a pixel-art "puff"). */
export function drawPuffGrid(): PixelGrid {
  const g = new PixelGrid(8, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const d = Math.hypot(x + 0.5 - 4, y + 0.5 - 4);
    if (d <= 4) g.set(x, y, withAlpha(0xffffffff, d < 1.8 ? 255 : d < 3 ? 190 : 100));
  }
  return g;
}

export function drawPixelGrid(): PixelGrid {
  const g = new PixelGrid(1, 1);
  g.set(0, 0, 0xffffffff);
  return g;
}

/** 16x8 tips of tall grass drawn over a character's feet while they stand in it (2 frames, 32x8). */
export function drawGrassCoverGrid(theme: RouteTheme): PixelGrid {
  const th = getTheme(theme);
  const g = new PixelGrid(32, 8);
  for (let f = 0; f < 2; f++) {
    const ox = f * 16;
    for (let i = 0; i < 6; i++) {
      const x = 1 + i * 2 + (i & 1 ? 0 : 0);
      const lean = f === 0 ? (i & 1 ? 1 : -1) : (i & 1 ? -1 : 1);
      const hgt = 5 + ((i * 3 + f) % 3);
      for (let y = 0; y < hgt; y++) {
        const yy = 8 - 1 - y;
        const xx = ox + x + (y > 3 ? lean : 0);
        g.set(xx, yy, y > hgt - 3 ? th.tall.tip : y > 1 ? th.tall.mid : th.tall.lo);
        if (y < 4) g.set(xx + 1, yy, th.tall.lo);
      }
    }
    g.hline(ox, 7, 14, th.tall.lo);
  }
  return g;
}

/** 14x16 "!" speech bubble that pops over a trainer that has spotted you. */
export function drawExclBubbleGrid(): PixelGrid {
  const g = new PixelGrid(14, 16);
  const ink = hex('#181820');
  g.rect(1, 1, 12, 11, hex('#ffffff'));
  g.rect(2, 0, 10, 13, hex('#ffffff'));
  g.set(6, 13, hex('#ffffff')); g.set(7, 13, hex('#ffffff')); g.set(6, 14, hex('#ffffff'));
  for (const [x, y, w, h] of [[6, 2, 2, 5], [6, 9, 2, 2]] as const) g.rect(x, y, w, h, hex('#e0344a'));
  g.set(6, 2, hex('#ff8a9a'));
  g.outline(ink);
  return g;
}
