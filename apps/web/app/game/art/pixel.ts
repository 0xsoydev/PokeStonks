/**
 * Tiny software pixel canvas. All procedural art is painted here on a low-res logical grid
 * (Uint32 RGBA) and only then blitted to a real <canvas> with nearest-neighbour scaling.
 * Keeping the painting canvas-free makes every sprite deterministic, cheap and testable in node.
 */

/** Packed little-endian RGBA (R | G<<8 | B<<16 | A<<24). 0 = fully transparent. */
export type Color = number;

export const rgba = (r: number, g: number, b: number, a = 255): Color =>
  ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
export const cr = (c: Color) => c & 255;
export const cg = (c: Color) => (c >>> 8) & 255;
export const cb = (c: Color) => (c >>> 16) & 255;
export const ca = (c: Color) => (c >>> 24) & 255;

const hexCache = new Map<string, Color>();
export function hex(s: string): Color {
  const hit = hexCache.get(s);
  if (hit !== undefined) return hit;
  let h = s.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  const c = rgba((n >> 16) & 255, (n >> 8) & 255, n & 255, h.length === 8 ? parseInt(h.slice(6), 16) : 255);
  hexCache.set(s, c);
  return c;
}

export const toCss = (c: Color) => `rgba(${cr(c)},${cg(c)},${cb(c)},${(ca(c) / 255).toFixed(3)})`;
export const toHexString = (c: Color) =>
  '#' + [cr(c), cg(c), cb(c)].map((v) => v.toString(16).padStart(2, '0')).join('');

export function mix(a: Color, b: Color, t: number): Color {
  const k = Math.max(0, Math.min(1, t));
  return rgba(
    Math.round(cr(a) + (cr(b) - cr(a)) * k),
    Math.round(cg(a) + (cg(b) - cg(a)) * k),
    Math.round(cb(a) + (cb(b) - cb(a)) * k),
    Math.round(ca(a) + (ca(b) - ca(a)) * k),
  );
}
export const lighten = (c: Color, t: number) => mix(c, 0xffffffff, t);
export const darken = (c: Color, t: number) => mix(c, 0xff000000, t);
export const withAlpha = (c: Color, a: number): Color => rgba(cr(c), cg(c), cb(c), a);

/** Perceptual-ish luminance 0..255. */
export const luma = (c: Color) => 0.299 * cr(c) + 0.587 * cg(c) + 0.114 * cb(c);

/** A five-step ramp used everywhere: hue-shifted (shadows go cool/violet, lights go warm). */
export interface Ramp {
  hi: Color;
  mid: Color;
  sh: Color;
  deep: Color;
  line: Color;
}

const WARM = hex('#fff1c4');
const COOL = hex('#3a2a8a');
const NIGHT = hex('#160c2a');

export function makeRamp(base: Color | string): Ramp {
  const mid = typeof base === 'string' ? hex(base) : base;
  // very dark bases (e.g. #20232a) need a lift so the ramp still has visible steps
  const dark = luma(mid) < 60;
  const midAdj = dark ? mix(mid, hex('#5a6280'), 0.22) : mid;
  return {
    hi: mix(lighten(midAdj, 0.18), WARM, 0.32),
    mid: midAdj,
    sh: mix(darken(midAdj, dark ? 0.28 : 0.3), COOL, 0.2),
    deep: mix(darken(midAdj, dark ? 0.5 : 0.56), COOL, 0.28),
    line: mix(darken(midAdj, 0.78), NIGHT, 0.55),
  };
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable integer hash -> [0,1) for per-pixel noise. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export type Mask = (x: number, y: number) => boolean;
export type Shader = (x: number, y: number) => Color;

export class PixelGrid {
  readonly px: Uint32Array;
  constructor(readonly w: number, readonly h: number) {
    this.px = new Uint32Array(w * h);
  }

  inb(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x: number, y: number): Color { return this.inb(x, y) ? this.px[y * this.w + x] : 0; }
  set(x: number, y: number, c: Color) {
    x |= 0; y |= 0;
    if (this.inb(x, y)) this.px[y * this.w + x] = c;
  }
  /** Alpha-blend `c` over what is there. */
  blend(x: number, y: number, c: Color) {
    x |= 0; y |= 0;
    if (!this.inb(x, y)) return;
    const a = ca(c);
    if (a === 255) { this.px[y * this.w + x] = c; return; }
    if (a === 0) return;
    const d = this.px[y * this.w + x];
    const da = ca(d);
    if (da === 0) { this.px[y * this.w + x] = c; return; }
    const t = a / 255;
    this.px[y * this.w + x] = rgba(
      Math.round(cr(d) + (cr(c) - cr(d)) * t),
      Math.round(cg(d) + (cg(c) - cg(d)) * t),
      Math.round(cb(d) + (cb(c) - cb(d)) * t),
      Math.max(da, a),
    );
  }
  clear() { this.px.fill(0); }
  clone(): PixelGrid { const g = new PixelGrid(this.w, this.h); g.px.set(this.px); return g; }

  rect(x: number, y: number, w: number, h: number, c: Color) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  hline(x: number, y: number, len: number, c: Color) { this.rect(x, y, len, 1, c); }
  vline(x: number, y: number, len: number, c: Color) { this.rect(x, y, 1, len, c); }

  line(x0: number, y0: number, x1: number, y1: number, c: Color) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Scan the bounding box; paint where mask says so, colour from shader. */
  fill(x0: number, y0: number, x1: number, y1: number, mask: Mask, shader: Shader) {
    const ax = Math.max(0, Math.floor(x0)), ay = Math.max(0, Math.floor(y0));
    const bx = Math.min(this.w - 1, Math.ceil(x1)), by = Math.min(this.h - 1, Math.ceil(y1));
    for (let y = ay; y <= by; y++) {
      for (let x = ax; x <= bx; x++) {
        if (mask(x, y)) {
          const c = shader(x, y);
          if (c !== 0) this.px[y * this.w + x] = c;
        }
      }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: Color) {
    this.fill(cx - rx, cy - ry, cx + rx, cy + ry, ellipseMask(cx, cy, rx, ry), () => c);
  }

  /** Filled convex/concave polygon (even-odd), sampled at pixel centres. */
  poly(pts: ReadonlyArray<readonly [number, number]>, c: Color) {
    const m = polyMask(pts);
    const b = bounds(pts);
    this.fill(b.x0, b.y0, b.x1, b.y1, m, () => c);
  }

  /** Copy `src` onto this grid at (dx,dy). Transparent source pixels are skipped. */
  blit(src: PixelGrid, dx: number, dy: number, opts: { flipX?: boolean; sx?: number; sy?: number; sw?: number; sh?: number } = {}) {
    const sx0 = opts.sx ?? 0, sy0 = opts.sy ?? 0, sw = opts.sw ?? src.w, sh = opts.sh ?? src.h;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const c = src.px[(sy0 + y) * src.w + sx0 + x];
        if (c === 0) continue;
        this.blend(dx + (opts.flipX ? sw - 1 - x : x), dy + y, c);
      }
    }
  }

  flippedX(): PixelGrid {
    const g = new PixelGrid(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) g.px[y * this.w + (this.w - 1 - x)] = this.px[y * this.w + x];
    return g;
  }

  /** 1px outline drawn on transparent pixels touching opaque ones (4-neighbourhood, optional diagonals). */
  outline(c: Color, diagonals = false) {
    const src = this.px.slice();
    const w = this.w, h = this.h;
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && ca(src[y * w + x]) > 40;
    for (let y = -1; y <= h; y++) {
      for (let x = -1; x <= w; x++) {
        if (solid(x, y)) continue;
        let hit = solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1);
        if (!hit && diagonals) hit = solid(x - 1, y - 1) || solid(x + 1, y - 1) || solid(x - 1, y + 1) || solid(x + 1, y + 1);
        if (hit && this.inb(x, y)) this.px[y * w + x] = c;
      }
    }
  }

  /** Recolour every opaque pixel that touches a transparent one (inner rim), via fn. */
  rim(fn: (x: number, y: number, c: Color) => Color) {
    const src = this.px.slice();
    const w = this.w, h = this.h;
    const empty = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || ca(src[y * w + x]) < 40;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = src[y * w + x];
      if (ca(c) < 40) continue;
      if (empty(x - 1, y) || empty(x + 1, y) || empty(x, y - 1) || empty(x, y + 1)) this.px[y * w + x] = fn(x, y, c);
    }
  }

  toImageData(): ImageData {
    const id = new ImageData(this.w, this.h);
    new Uint32Array(id.data.buffer).set(this.px);
    return id;
  }

  /** Blit onto an existing 2D context with nearest-neighbour upscaling. */
  drawTo(ctx: CanvasRenderingContext2D, x = 0, y = 0, scale = 1) {
    const tmp = this.toCanvas(1);
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, x, y, this.w * scale, this.h * scale);
    ctx.imageSmoothingEnabled = prev;
  }

  toCanvas(scale = 1): HTMLCanvasElement {
    const base = document.createElement('canvas');
    base.width = this.w; base.height = this.h;
    base.getContext('2d')!.putImageData(this.toImageData(), 0, 0);
    if (scale === 1) return base;
    const out = document.createElement('canvas');
    out.width = this.w * scale; out.height = this.h * scale;
    const octx = out.getContext('2d')!;
    octx.imageSmoothingEnabled = false;
    octx.drawImage(base, 0, 0, out.width, out.height);
    return out;
  }
}

/** Ellipse (pow=2) or squircle (pow>2, boxier) mask; centre may be fractional. */
export function ellipseMask(cx: number, cy: number, rx: number, ry: number, rot = 0, pow = 2): Mask {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  return (x, y) => {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const u = (dx * cs + dy * sn) / rx;
    const v = (-dx * sn + dy * cs) / ry;
    return pow === 2 ? u * u + v * v <= 1.02 : Math.abs(u) ** pow + Math.abs(v) ** pow <= 1.02;
  };
}

export function bounds(pts: ReadonlyArray<readonly [number, number]>) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}

export function polyMask(pts: ReadonlyArray<readonly [number, number]>): Mask {
  const n = pts.length;
  return (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
}

/** Distance from point to segment. */
export function segDist(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0, dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

/** Thick line ("capsule") mask with linearly interpolated radius. */
export function capsuleMask(x0: number, y0: number, x1: number, y1: number, r0: number, r1 = r0): Mask {
  const dx = x1 - x0, dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  return (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2));
    const r = r0 + (r1 - r0) * t;
    return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy)) <= r;
  };
}

/** Encode a grid as a PNG (node/QA use only; pure JS + zlib injected by caller). */
export function crc32(buf: Uint8Array): number {
  let c: number, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
