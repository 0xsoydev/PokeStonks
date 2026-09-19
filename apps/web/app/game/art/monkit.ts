import { PixelGrid, hex, mix, lighten, darken, makeRamp, type Color, type Ramp } from './pixel';
import { Painter } from './paint';

export const MON = 32;
export const CX = MON / 2;

export type Facing = 'front' | 'back';

export interface MonCtx {
  g: PixelGrid;
  p: Painter;
  front: boolean;
  /** Ramps derived from the species' [primary, secondary] palette colours. */
  A: Ramp;
  B: Ramp;
  /** Run `fn` once for the left (-1) and once for the right (+1) side of the body. */
  sym(fn: (s: -1 | 1) => void): void;
}

export type MonPainter = (c: MonCtx) => void;

export const K = hex('#1a1226'); // ink for eyes/mouths
export const W = hex('#ffffff');
export const CREAM = hex('#fff6dc');

/** 2x3 "dot" eye with an upper-left glint: the default readable eye at 32px. */
export const DOT_EYE = ['WK', 'KK', 'KK'];
/** 3x4 wide-eyed variant with an iris colour (I). */
export const BIG_EYE = ['.KK', 'KWK', 'KIK', '.KK'];

export function eyeLegend(iris: Color = hex('#3a2c58')): Record<string, Color> {
  return { K, W, I: iris };
}

export function tint(c: Color | string, toward: Color | string, t: number): Color {
  return mix(typeof c === 'string' ? hex(c) : c, typeof toward === 'string' ? hex(toward) : toward, t);
}

export { hex, mix, lighten, darken, makeRamp };
export type { Color, Ramp };

/** Teardrop (tip up) built from a disc + triangle so it shades like every other part. */
export function dropShape(p: import('./paint').Painter, cx: number, cy: number, r: number, ramp: Ramp, tip = 1.7) {
  p.blob(cx, cy, r, r, ramp);
  p.poly([[cx - r * 0.86, cy - r * 0.45], [cx, cy - r * tip], [cx + r * 0.86, cy - r * 0.45]], ramp, { edge: 'auto' });
  p.blob(cx, cy, r - 0.6, r - 0.6, ramp, { edge: false });
}

/** Nested flame tongue (tip up) in 2-3 colours; `sway` bends the tip sideways. */
export function flameShape(
  p: import('./paint').Painter, cx: number, baseY: number, w: number, h: number, sway: number,
  cols: readonly [Color, Color, Color?], edge?: Color,
) {
  const tongue = (k: number, dy: number): Array<[number, number]> => {
    const ww = w * k, hh = h * k, by = baseY - dy;
    return [
      [cx - ww * 0.5, by], [cx - ww * 0.58, by - hh * 0.28], [cx - ww * 0.3 + sway * 0.25, by - hh * 0.6],
      [cx + sway, by - hh], [cx + ww * 0.08 + sway * 0.5, by - hh * 0.6], [cx + ww * 0.5, by - hh * 0.36], [cx + ww * 0.5, by],
    ];
  };
  p.flat(tongue(1, 0), cols[0], edge);
  p.flat(tongue(0.66, 0.4), cols[1]);
  if (cols[2] !== undefined) p.flat(tongue(0.36, 0.7), cols[2]);
}
