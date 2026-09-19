import { CX, K, W, BIG_EYE, DOT_EYE, eyeLegend, hex, makeRamp, mix, lighten, dropShape, type MonCtx } from '../monkit';

const mirror = (pts: ReadonlyArray<readonly [number, number]>, axis: number) =>
  pts.map(([x, y]) => [2 * axis - x, y] as const);

/** AMZN / Amazoo: chubby orange otter-seal with a smile-arrow belly and a droplet crest. */
export function amzn(c: MonCtx) {
  const { p, g, A, B, front } = c;
  const cream = makeRamp(mix(A.hi, hex('#fff6dc'), 0.6));
  const aqua = makeRamp('#59c9f0');

  // tail flukes (prominent from behind)
  if (!front) {
    for (const s of [-1, 1] as const) p.blob(CX + s * 5.2, 28.6, 4.6, 2.4, B, { rot: s * -0.3 });
  }
  // flippers
  for (const s of [-1, 1] as const) p.blob(CX + s * 11.4, 22.4, 2.8, 5, B, { rot: s * 0.45 });
  for (const s of [-1, 1] as const) if (front) p.blob(CX + s * 6, 29.4, 3.8, 1.9, B);
  p.blob(CX, 21.6, 10.6, 8.4, A);
  if (front) {
    p.blob(CX, 23.6, 7.2, 5.6, cream, { edge: false, clean: true, bias: 0.05 });
    // smile-arrow: a swoosh from the left "a" to the right "z" ending in an arrowhead
    const sm = B.deep;
    for (const [x, y] of [[11, 24], [12, 25], [13, 26], [14, 26], [15, 27], [16, 27], [17, 27], [18, 26], [19, 26], [20, 25]] as const) g.set(x, y, sm);
    g.set(21, 24, sm); g.set(22, 23, sm); g.set(20, 23, sm); g.set(21, 23, sm); g.set(22, 25, sm);
    g.set(11, 23, sm);
  } else {
    // slate saddle stripe
    p.blob(CX, 20.6, 4, 6.6, B, { edge: 'soft' });
    g.line(CX - 1, 16, CX - 1, 24, B.hi);
  }
  // head
  p.blob(CX, 12.6, 8.8, 7, A);
  for (const s of [-1, 1] as const) p.blob(CX + s * 7, 6.6, 2.4, 2.4, B);
  dropShape(p, CX, 5.2, 2.5, aqua, 1.8);
  if (front) {
    p.blob(CX, 15.6, 5, 3.4, cream, { edge: false, clean: true });
    p.stamp(BIG_EYE, 9, 10, eyeLegend(hex('#2b3a4a')));
    p.stamp(BIG_EYE, 20, 10, eyeLegend(hex('#2b3a4a')));
    g.set(15, 14, K); g.set(16, 14, K);
    g.set(14, 16, K); g.set(15, 17, K); g.set(16, 17, K); g.set(17, 16, K);
    // whiskers
    g.hline(5, 15, 2, B.mid); g.hline(25, 15, 2, B.mid); g.hline(5, 17, 2, B.mid); g.hline(25, 17, 2, B.mid);
  } else {
    g.line(9, 10, 12, 8, A.hi);
  }
  void W; void DOT_EYE; void lighten;
}

/** NKE / Nikefin: big-headed blue sprinter-fish with swoosh fins, a white belly and a droplet crest. */
export function nke(c: MonCtx) {
  const { p, g, A, front } = c;
  const white = makeRamp('#f6f6f6');
  const aqua = makeRamp('#7fd4ff');
  const swoosh = [[11.6, 22.4], [6.4, 24.6], [2.2, 21.6], [0.6, 15.2], [4.2, 18.6], [8.4, 19.2], [12, 17.6]] as const;

  // tail flukes
  for (const s of [-1, 1] as const) p.blob(CX + s * 4.6, 30, 3.8, 1.7, front ? white : A, { rot: s * -0.35 });
  // swoosh fins (arms)
  if (front) for (const s of [-1, 1] as const) p.facet(s < 0 ? swoosh : swoosh.map(([x, y]) => [2 * CX - x, y] as const), white, 0.5);
  // body + head
  p.blob(CX, 24, 6.8, 6.6, A);
  if (front) p.blob(CX, 25.2, 4.2, 5, white, { edge: false, clean: true, bias: 0.1 });
  p.blob(CX, 13.2, 9.6, 8.2, A);
  dropShape(p, CX, 4.4, 2.6, aqua, 1.9);
  if (front) {
    p.blob(CX, 17.2, 5.2, 3.2, white, { edge: false, clean: true });
    // confident eyes: heavy lid, white with a dark pupil pointing forward
    for (const s of [-1, 1] as const) {
      const ex = s < 0 ? 9 : 19;
      g.rect(ex, 11, 4, 1, K);
      g.rect(ex, 12, 4, 2, W);
      g.rect(ex + (s < 0 ? 2 : 0), 12, 2, 2, K);
      g.set(ex + (s < 0 ? 2 : 0), 12, W);
    }
    g.set(15, 16, K); g.set(16, 16, K);
    g.hline(14, 19, 4, K); g.set(13, 18, K); g.set(18, 18, K);
  } else {
    // giant swoosh dorsal marking
    p.facet([[10, 27], [8.6, 21], [10, 15], [15, 12.4], [21, 11.6], [17, 15.6], [14, 20], [12.4, 24.6]], white, 0.5);
    g.line(9, 10, 12, 8, A.hi);
  }
}
