import { CX, K, W, DOT_EYE, eyeLegend, hex, makeRamp, mix, lighten, type MonCtx } from '../monkit';
import { ellipseMask } from '../pixel';

const CHEEK = hex('#f4909f');

/** AAPL / Applon: round silver apple-cat with big ears, one bitten, and a leaf sprout. */
export function aapl(c: MonCtx) {
  const { p, g, A, B, front, sym } = c;
  const leaf = makeRamp('#4fbf5c');
  const belly = makeRamp(mix(A.hi, hex('#ffffff'), 0.55));

  if (!front) p.blob(CX, 27.2, 3.4, 2.9, B); // stubby round tail nub

  // big ears, tilted out; the left one has the bite that says "Apple"
  sym((s) => {
    const x = CX + s * 7.6;
    const cut = s < 0 ? { cut: ellipseMask(x - 3.6, 3.2, 2.5, 2.6) } : {};
    p.blob(x, 5.8, 3.9, 6.4, A, { rot: s * 0.26, ...cut });
    if (front) p.blob(x + s * 0.3, 7.2, 2, 4.2, B, { rot: s * 0.26, edge: 'soft' });
  });
  // feet + arms + body
  sym((s) => {
    p.blob(CX + s * 5.4, 28.4, 3.7, 2.1, B);
    p.blob(CX + s * 9.6, 22.4, 2.4, 3.5, A, { rot: s * -0.3 });
  });
  p.blob(CX, 22.8, 8.6, 6.6, A);
  if (front) p.blob(CX, 23.6, 4.8, 4.2, belly, { edge: false, clean: true, bias: 0.05 });
  // head
  p.blob(CX, 15.4, 10, 8.2, A);
  // leaf sprout
  g.line(16, 7, 17, 4, leaf.deep);
  p.poly([[16.5, 6], [17.4, 2.6], [21.5, 0.8], [25.4, 1.4], [24.4, 5], [20.4, 6.4]], leaf);
  g.line(18, 4, 23, 2, leaf.sh);

  if (front) {
    p.stamp(DOT_EYE, 11, 14, eyeLegend());
    p.stamp(DOT_EYE, 19, 14, eyeLegend());
    g.rect(7, 18, 2, 2, CHEEK);
    g.rect(23, 18, 2, 2, CHEEK);
    g.set(14, 19, K); g.set(15, 20, K); g.set(16, 20, K); g.set(17, 19, K);
  } else {
    g.line(9, 12, 12, 9, A.hi);
    g.line(11, 22, 20, 22, A.sh);
    g.line(13, 23, 18, 23, A.sh);
  }
  void W;
}

/** MSFT / Microsaur: sturdy blue dino, big frill-ears, four-pane window crest. */
export function msft(c: MonCtx) {
  const { p, g, A, B, front, sym } = c;
  const belly = makeRamp(mix(A.hi, hex('#ffffff'), 0.5));
  const claw = hex('#fff2d0');

  // thick tail curling out to the right (behind body)
  p.limb(21, 25.5, 27.5, 22, 3.2, 1.8, A);
  p.limb(27.5, 22, 29.5, 17.5, 1.9, 1.1, A);
  if (!front) {
    p.limb(CX + 1, 26.5, 22.5, 26, 3.6, 3, A);
  }
  // back plates for the back view sit behind the head; drawn later in front of the body
  sym((s) => {
    // frill-ears
    const x = CX + s * 9.6;
    p.blob(x, 10.4, 3.7, 5.2, A, { rot: s * 0.45 });
    if (front) p.blob(x - s * 0.1, 11.2, 2.0, 3.4, B, { rot: s * 0.45, edge: 'soft' });
  });
  sym((s) => {
    p.blob(CX + s * 5.6, 28.6, 3.9, 2.4, A);
    g.set(CX + s * 5.6 - 2 + (s < 0 ? 0 : 0), 30, claw);
  });
  sym((s) => p.blob(CX + s * 9.6, 22.2, 2.5, 3, A, { rot: s * -0.3 }));
  p.blob(CX, 22.4, 9.4, 7.4, A);
  if (front) p.blob(CX, 23.8, 5.6, 5, belly, { edge: false, clean: true, bias: 0.05 });
  // head
  p.blob(CX, 13.6, 9.6, 7.4, A);

  // window crest: four panes in a navy frame
  const R = hex('#ef4a3a'), G = hex('#5fc44a'), Bl = hex('#3d9df0'), Y = hex('#ffc933');
  p.stamp([
    'FFFFFFF',
    'FRRFGGF',
    'FRRFGGF',
    'FFFFFFF',
    'FBBFYYF',
    'FBBFYYF',
    'FFFFFFF',
  ], 13, 1, { F: B.deep, R, G, B: Bl, Y });
  g.set(14, 2, lighten(R, 0.5)); g.set(18, 2, lighten(G, 0.5)); g.set(14, 5, lighten(Bl, 0.5)); g.set(18, 5, lighten(Y, 0.5));

  if (front) {
    p.stamp(DOT_EYE, 11, 12, eyeLegend());
    p.stamp(DOT_EYE, 19, 12, eyeLegend());
    // brows: calm and sturdy
    g.hline(10, 11, 4, B.deep); g.hline(18, 11, 4, B.deep);
    g.set(15, 15, B.deep); g.set(17, 15, B.deep);
    g.hline(13, 17, 6, K); g.set(12, 16, K); g.set(19, 16, K);
  } else {
    // dorsal plates down the back
    for (let i = 0; i < 3; i++) {
      const y = 14 + i * 4.6;
      p.poly([[CX, y - 2.4], [CX + 2.8, y], [CX, y + 2.4], [CX - 2.8, y]], B, { edge: 'deep' });
      g.set(CX - 1, y - 1, lighten(B.hi, 0.2));
    }
    g.hline(11, 26, 10, A.sh);
  }
}
