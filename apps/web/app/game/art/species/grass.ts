import { CX, K, W, DOT_EYE, eyeLegend, hex, makeRamp, mix, lighten, dropShape, type MonCtx } from '../monkit';

const mirror = (pts: ReadonlyArray<readonly [number, number]>, axis: number) =>
  pts.map(([x, y]) => [2 * axis - x, y] as const);

/** XOM / Exxonyx: moss-grown oil-barrel golem with a maroon oil-drop sprout. */
export function xom(c: MonCtx) {
  const { p, g, A, B, front } = c;
  const leaf = makeRamp('#5fd070');
  const drop = makeRamp(mix(B.mid, hex('#d2503a'), 0.35));
  const belly = makeRamp(mix(A.hi, hex('#f4ffd8'), 0.5));
  const claw = hex('#fff2d0');

  const band = (y0: number, h: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = 0; x < 32; x++) {
      if (g.get(x, y) === 0) continue;
      const t = (x - 5) / 22;
      g.set(x, y, y === y0 ? B.mid : t > 0.72 ? B.deep : B.sh);
    }
    for (let x = 0; x < 32; x++) if (g.get(x, y0) !== 0 && x < 13) g.set(x, y0, drop.hi);
  };

  // stubby feet + arms
  for (const s of [-1, 1] as const) {
    p.blob(CX + s * 6.4, 29.6, 4, 2.2, B);
    if (front) for (let i = -1; i <= 1; i++) g.set(CX + s * 6.4 + i * 2.2, 31, claw);
    p.blob(CX + s * 11.8, 22.4, 2.7, 3.8, A, { rot: s * -0.2 });
  }
  if (!front) p.poly([[CX - 3, 28], [CX, 24], [CX + 3, 28], [CX + 1, 31], [CX - 1, 31]], leaf, { edge: 'deep' });
  // barrel body with staves
  p.blob(CX, 21.6, 11, 8.6, A, { pow: 3.4 });
  for (const x of [8, 12, 20, 24]) for (let y = 15; y < 29; y++) if (g.get(x, y) !== 0 && (y + x) % 5 !== 0) g.set(x, y, A.sh);
  p.speckle(A.mid, A.sh, 0.06, 11);
  band(15, 2);
  band(26, 2);
  if (front) {
    p.blob(CX, 21.8, 6.6, 4.4, belly, { edge: false, clean: true, bias: 0.05 });
  } else {
    p.disc(21, 20, 2, 2, B.deep, K);
    g.vline(21, 22, 4, B.sh); g.vline(22, 22, 3, B.sh);
    g.set(21, 26, B.mid);
  }
  // lid ring + sprout
  p.blob(CX, 12.6, 9.8, 2.8, A, { edge: 'deep' });
  p.blob(CX, 12.3, 6.4, 1.4, belly, { edge: false, clean: true });
  g.line(16, 11, 16, 7, leaf.deep); g.line(17, 11, 17, 7, leaf.sh);
  p.poly([[16, 10.6], [9.6, 6.2], [8.6, 11]], leaf, { edge: 'deep' });
  p.poly([[17.2, 10.6], [23.6, 6.2], [24.6, 11]], leaf, { edge: 'deep' });
  g.line(15, 10, 11, 8, leaf.hi); g.line(18, 10, 22, 8, leaf.hi);
  dropShape(p, 16.5, 4.6, 3, drop, 1.8);
  g.set(15, 3, hex('#ffc8b8')); g.set(15, 4, hex('#ffc8b8')); g.set(16, 2, hex('#ffc8b8'));

  if (front) {
    p.stamp(DOT_EYE, 10, 18, eyeLegend());
    p.stamp(DOT_EYE, 20, 18, eyeLegend());
    g.hline(9, 17, 5, A.deep); g.hline(18, 17, 5, A.deep); // heavy brows
    g.set(15, 21, K); g.set(17, 21, K);
    g.hline(12, 23, 8, K); g.set(11, 22, K); g.set(20, 22, K);
    g.set(13, 24, W); g.set(14, 24, W); g.set(17, 24, W); g.set(18, 24, W);
  } else {
    g.line(8, 17, 12, 15, A.hi);
  }
  void lighten;
}

/** CVX / Chevrune: upright teal sapling-deer, blue chevrons on its chest, drop-tipped antler sprouts. */
export function cvx(c: MonCtx) {
  const { p, g, A, B, front } = c;
  const belly = makeRamp(mix(A.hi, hex('#f0fff0'), 0.55));
  const leaf = makeRamp('#58c778');

  // antler sprouts with energy-drop buds
  for (const s of [-1, 1] as const) {
    const x0 = CX + s * 3.4;
    g.line(x0, 7, CX + s * 6.6, 3.6, A.deep);
    g.line(CX + s * 6.6, 3.6, CX + s * 8.4, 1.2, A.deep);
    g.line(CX + s * 5.8, 4.4, CX + s * 9.4, 4.6, A.deep);
    dropShape(p, CX + s * 8.6, 3.6, 1.7, B, 1.9);
    dropShape(p, CX + s * 10.6, 6.4, 1.5, B, 1.9);
    // leaf ears
    p.poly([[CX + s * 5.8, 12], [CX + s * 13.4, 8.4], [CX + s * 14, 13.4], [CX + s * 8.6, 15.2]], leaf, { edge: 'deep' });
  }
  // tail tuft (back view is centred)
  if (!front) p.poly([[CX - 3, 27.6], [CX, 22.4], [CX + 3, 27.6], [CX + 1.4, 31], [CX - 1.4, 31]], leaf, { edge: 'deep' });
  else p.poly([[CX + 6, 26.6], [CX + 12.4, 21.6], [CX + 12, 28.6]], leaf, { edge: 'deep' });

  // legs with blue hooves
  for (const s of [-1, 1] as const) {
    p.limb(CX + s * 3.4, 26, CX + s * 3.6, 29.4, 2.2, 2, A);
    p.blob(CX + s * 3.6, 30, 2.7, 1.5, B);
  }
  p.blob(CX, 20.6, 7.4, 8, A);
  if (front) {
    p.blob(CX, 21.6, 4.4, 6, belly, { edge: false, clean: true, bias: 0.05 });
    // chevrons
    p.stamp(['B.....B', '.B...B.', '..B.B..', '...B...'], 12, 17, { B: B.mid });
    p.stamp(['B.....B', '.B...B.', '..B.B..', '...B...'], 12, 21, { B: B.mid });
    g.set(15, 20, B.hi); g.set(15, 24, B.hi);
  } else {
    p.stamp(['B.....B', '.B...B.', '..B.B..', '...B...'], 12, 15, { B: B.sh });
    p.stamp(['B.....B', '.B...B.', '..B.B..', '...B...'], 12, 19, { B: B.sh });
    p.stamp(['B.....B', '.B...B.', '..B.B..', '...B...'], 12, 23, { B: B.sh });
    g.set(15, 18, B.mid); g.set(15, 22, B.mid); g.set(15, 26, B.mid);
  }
  // arms
  for (const s of [-1, 1] as const) p.limb(CX + s * 7.2, 16, CX + s * 9, 22, 1.7, 1.5, A);
  // head
  p.blob(CX, 11.6, 6.8, 5.8, A);
  if (front) {
    p.blob(CX, 14, 3.6, 2.4, belly, { edge: false, clean: true });
    p.stamp(DOT_EYE, 11, 10, eyeLegend(hex('#2a5fa8')));
    p.stamp(DOT_EYE, 19, 10, eyeLegend(hex('#2a5fa8')));
    g.set(15, 13, K); g.set(16, 13, K);
    g.set(14, 15, K); g.set(15, 15, K); g.set(16, 15, K); g.set(17, 15, K);
    g.set(9, 14, hex('#f4909f')); g.set(10, 14, hex('#f4909f')); g.set(21, 14, hex('#f4909f')); g.set(22, 14, hex('#f4909f'));
  } else {
    g.line(10, 9, 13, 7, A.hi);
  }
  void mirror; void W;
}
