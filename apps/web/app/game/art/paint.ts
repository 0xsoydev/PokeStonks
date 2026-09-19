import {
  PixelGrid, ellipseMask, polyMask, capsuleMask, bounds,
  type Color, type Mask, type Ramp, hex, mix, hash2,
} from './pixel';

export interface ShapeOpts {
  /** Rotation of the ellipse in radians (clockwise on screen). */
  rot?: number;
  /** Pixels for which this returns true are carved out of the shape (bites, notches). */
  cut?: Mask;
  /** Part contour: 'auto' = deep on the lit-away side, softer on the lit side. false = none. */
  edge?: 'auto' | 'deep' | 'soft' | false;
  /** Light direction override (screen space, unnormalised). */
  light?: readonly [number, number];
  /** Skip the dither band between mid and shade tones. */
  clean?: boolean;
  /** Push the tone thresholds: >0 = more shade, <0 = more light. */
  bias?: number;
  /** Superellipse exponent for blob(): 2 = ellipse, ~3 = barrel-ish box. */
  pow?: number;
}

const L0: readonly [number, number] = [-0.5, -0.66];

/**
 * Shading primitives for hand-tuned sprites. Everything is painted with a fixed upper-left light
 * so that mirrored parts (both ears, both eyes) still read as parts of one lit object.
 */
export class Painter {
  constructor(readonly g: PixelGrid) {}

  private tone(l: number, x: number, y: number, ramp: Ramp, opts: ShapeOpts): Color {
    const b = opts.bias ?? 0;
    const hiT = 0.84 - b, shT = 0.14 + b;
    if (l > hiT) return ramp.hi;
    if (l > shT) return ramp.mid;
    if (!opts.clean && l > shT - 0.14 && ((x + y) & 1) === 0) return ramp.mid;
    return ramp.sh;
  }

  /** Generic shaded part: `nrm` returns the surface normal (x,y in -1..1) for a pixel. */
  shade(
    mask: Mask, box: { x0: number; y0: number; x1: number; y1: number },
    nrm: (x: number, y: number) => readonly [number, number],
    ramp: Ramp, opts: ShapeOpts = {},
  ) {
    const g = this.g;
    const m: Mask = opts.cut ? (x, y) => mask(x, y) && !opts.cut!(x, y) : mask;
    const [lx, ly] = opts.light ?? L0;
    const lz = 0.62;
    const ln = Math.hypot(lx, ly, lz);
    const edge = opts.edge === undefined ? 'auto' : opts.edge;
    const x0 = Math.floor(box.x0) - 1, y0 = Math.floor(box.y0) - 1, x1 = Math.ceil(box.x1) + 1, y1 = Math.ceil(box.y1) + 1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!g.inb(x, y) || !m(x, y)) continue;
        const [nx, ny] = nrm(x, y);
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const l = (nx * lx + ny * ly + nz * lz) / ln;
        let c = this.tone(l, x, y, ramp, opts);
        if (edge && (!m(x - 1, y) || !m(x + 1, y) || !m(x, y - 1) || !m(x, y + 1))) {
          const lowerRight = nx * 0.6 + ny * 0.8 > -0.05;
          c = edge === 'deep' ? ramp.deep : edge === 'soft' ? ramp.sh : lowerRight ? ramp.deep : ramp.sh;
        }
        g.set(x, y, c);
      }
    }
  }

  /** Lit ellipse (optionally rotated). Centre may be fractional so parts can be symmetric on a 32 grid. */
  blob(cx: number, cy: number, rx: number, ry: number, ramp: Ramp, opts: ShapeOpts = {}) {
    const rot = opts.rot ?? 0;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const r = Math.max(rx, ry) + 1;
    this.shade(
      ellipseMask(cx, cy, rx, ry, rot, opts.pow ?? 2),
      { x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r },
      (x, y) => {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const u = Math.max(-1, Math.min(1, (dx * cs + dy * sn) / rx));
        const v = Math.max(-1, Math.min(1, (-dx * sn + dy * cs) / ry));
        // rotate the local normal back into screen space
        return [u * cs - v * sn, u * sn + v * cs] as const;
      },
      ramp, opts,
    );
  }

  /** Lit polygon: tone from a diagonal gradient across its bounding box (good for ears, leaves, fins). */
  poly(pts: ReadonlyArray<readonly [number, number]>, ramp: Ramp, opts: ShapeOpts = {}) {
    const b = bounds(pts);
    const w = Math.max(1, b.x1 - b.x0), h = Math.max(1, b.y1 - b.y0);
    this.shade(
      polyMask(pts), b,
      (x, y) => {
        const u = ((x + 0.5 - b.x0) / w) * 2 - 1;
        const v = ((y + 0.5 - b.y0) / h) * 2 - 1;
        return [u * 0.85, v * 0.85] as const;
      },
      ramp, opts,
    );
  }

  /**
   * Crisp two-tone "facet" polygon: light rim on the upper-left edges, deep rim on the lower-right,
   * diagonal split between mid and shade. Reads better than gradient shading for armour, bolts and wings.
   */
  facet(pts: ReadonlyArray<readonly [number, number]>, ramp: Ramp, split = 0.55) {
    const b = bounds(pts);
    const m = polyMask(pts);
    const w = Math.max(1, b.x1 - b.x0), h = Math.max(1, b.y1 - b.y0);
    const g = this.g;
    for (let y = Math.floor(b.y0); y <= Math.ceil(b.y1); y++) {
      for (let x = Math.floor(b.x0); x <= Math.ceil(b.x1); x++) {
        if (!g.inb(x, y) || !m(x, y)) continue;
        const t = ((x + 0.5 - b.x0) / w) * 0.45 + ((y + 0.5 - b.y0) / h) * 0.55;
        let c = t > split ? ramp.sh : ramp.mid;
        if (Math.abs(t - split) < 0.05 && ((x + y) & 1) === 0) c = t > split ? ramp.mid : ramp.sh;
        if (!m(x - 1, y) || !m(x, y - 1)) c = t > split ? ramp.mid : ramp.hi;
        else if (!m(x + 1, y) || !m(x, y + 1)) c = ramp.deep;
        g.set(x, y, c);
      }
    }
  }

  /** Lit capsule (limb / tail segment). */
  limb(x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, ramp: Ramp, opts: ShapeOpts = {}) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nxv = -dy / len, nyv = dx / len; // unit normal to the axis
    const rmax = Math.max(r0, r1) + 1;
    this.shade(
      capsuleMask(x0, y0, x1, y1, r0, r1),
      { x0: Math.min(x0, x1) - rmax, y0: Math.min(y0, y1) - rmax, x1: Math.max(x0, x1) + rmax, y1: Math.max(y0, y1) + rmax },
      (x, y) => {
        const px = x + 0.5 - x0, py = y + 0.5 - y0;
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (len * len)));
        const r = r0 + (r1 - r0) * t;
        const side = ((px - t * dx) * nxv + (py - t * dy) * nyv) / Math.max(0.5, r);
        const s = Math.max(-1, Math.min(1, side));
        const along = (t - 0.5) * 0.5;
        return [nxv * s + (dx / len) * along, nyv * s + (dy / len) * along] as const;
      },
      ramp, opts,
    );
  }

  /** Flat-colour ellipse (no lighting, optional contour colour). */
  disc(cx: number, cy: number, rx: number, ry: number, c: Color, edge?: Color, rot = 0) {
    const m = ellipseMask(cx, cy, rx, ry, rot);
    const r = Math.max(rx, ry) + 1;
    const g = this.g;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (!g.inb(x, y) || !m(x, y)) continue;
        const isEdge = edge !== undefined && (!m(x - 1, y) || !m(x + 1, y) || !m(x, y - 1) || !m(x, y + 1));
        g.set(x, y, isEdge ? edge! : c);
      }
    }
  }

  /** Flat-colour polygon with optional contour colour. */
  flat(pts: ReadonlyArray<readonly [number, number]>, c: Color, edge?: Color) {
    const m = polyMask(pts);
    const b = bounds(pts);
    const g = this.g;
    for (let y = Math.floor(b.y0); y <= Math.ceil(b.y1); y++) {
      for (let x = Math.floor(b.x0); x <= Math.ceil(b.x1); x++) {
        if (!g.inb(x, y) || !m(x, y)) continue;
        const isEdge = edge !== undefined && (!m(x - 1, y) || !m(x + 1, y) || !m(x, y - 1) || !m(x, y + 1));
        g.set(x, y, isEdge ? edge! : c);
      }
    }
  }

  /** Remove pixels inside a mask (bites, holes). */
  erase(mask: Mask, box: { x0: number; y0: number; x1: number; y1: number }) {
    for (let y = Math.floor(box.y0); y <= Math.ceil(box.y1); y++)
      for (let x = Math.floor(box.x0); x <= Math.ceil(box.x1); x++)
        if (this.g.inb(x, y) && mask(x, y)) this.g.set(x, y, 0);
  }

  /**
   * ASCII sprite stamp. '.' and ' ' are transparent; other chars look up `legend`.
   * Anchor is the top-left of the first row.
   */
  stamp(rows: readonly string[], x: number, y: number, legend: Record<string, Color>, flipX = false) {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const ch = row[flipX ? row.length - 1 - i : i];
        if (ch === '.' || ch === ' ') continue;
        const c = legend[ch];
        if (c !== undefined) this.g.set(x + i, y + j, c);
      }
    }
  }

  /** Scatter dither speckle inside already-painted pixels of a given colour. */
  speckle(target: Color, c: Color, density: number, seed: number) {
    const g = this.g;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++)
      if (g.get(x, y) === target && hash2(x, y, seed) < density) g.set(x, y, c);
  }
}

export { capsuleMask, ellipseMask, polyMask, hex, mix };
