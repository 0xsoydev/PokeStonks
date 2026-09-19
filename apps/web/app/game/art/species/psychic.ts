import { CX, K, W, BIG_EYE, eyeLegend, hex, makeRamp, mix, lighten, type MonCtx } from '../monkit';

const mirror = (pts: ReadonlyArray<readonly [number, number]>, axis: number) =>
  pts.map(([x, y]) => [2 * axis - x, y] as const);

function crystal(c: MonCtx, cx: number, cy: number, w: number, h: number, ramp: ReturnType<typeof makeRamp>) {
  const { p, g } = c;
  p.poly([[cx, cy - h], [cx + w, cy], [cx, cy + h], [cx - w, cy]], ramp, { edge: 'deep' });
  g.set(Math.round(cx - w * 0.4), Math.round(cy - h * 0.35), ramp.hi);
  g.set(Math.round(cx - w * 0.4), Math.round(cy - h * 0.05), ramp.hi);
}

/** COIN / Coinix: floating cat-spirit with a gold coin medallion, orb antennae and drifting shards. */
export function coin(c: MonCtx) {
  const { p, g, A, B, front } = c;
  const lav = B;
  const gold = makeRamp('#f5c518');
  const shard = makeRamp(mix(lav.mid, hex('#9a8cff'), 0.4));

  // drifting shards
  crystal(c, 4.4, 17.4, 2.6, 4.6, shard);
  crystal(c, 27.6, 21.6, 2.6, 4.6, shard);
  crystal(c, 26.6, 8.6, 1.8, 3, shard);
  // wispy tail tendrils
  for (const [x, len] of [[10, 4], [16, 5], [22, 4]] as const) {
    p.poly([[x - 3, 25], [x, 26 + len], [x + 3, 25]], A, { edge: 'deep' });
  }
  p.poly(front ? [[24, 22], [29.6, 25], [28.6, 29.6], [25, 27.2], [22, 25]] : [[22, 24], [29, 24], [28.6, 29.6], [24, 27], [21, 26]], lav, { edge: 'deep' });
  // body
  p.blob(CX, 21.4, 7.8, 7.6, A);
  if (front) p.blob(CX, 22.6, 4.8, 5, lav, { edge: false, clean: true, bias: 0.05 });
  else for (let i = 0; i < 3; i++) g.hline(11, 18 + i * 3, 10, A.sh);
  // ears
  for (const s of [-1, 1] as const) {
    const ear = [[CX + s * 7.6, 10], [CX + s * 9.6, 1.4], [CX + s * 2.6, 6.2]] as const;
    p.poly(ear, A, { edge: 'deep' });
    if (front) p.poly([[CX + s * 7.4, 8.4], [CX + s * 8.8, 3.8], [CX + s * 4.6, 6.4]], lav, { edge: false, clean: true });
  }
  // head
  p.blob(CX, 12.4, 9.2, 7.4, A);
  // antennae with orbs
  for (const s of [-1, 1] as const) {
    g.line(CX + s * 2, 5.2, CX + s * 3.4, 1.4, A.deep);
    g.rect(CX + s * 3.6 - (s < 0 ? 2 : 0), 0, 2, 2, lav.hi);
  }
  if (front) {
    // coin medallion
    p.blob(CX, 8.4, 3.6, 3.6, gold);
    p.disc(CX, 8.4, 2.1, 2.1, gold.mid, gold.deep);
    g.set(15, 8, gold.hi); g.set(15, 7, gold.hi);
    p.stamp(BIG_EYE, 9, 11, eyeLegend(hex('#c8b8ff')));
    p.stamp(BIG_EYE, 20, 11, eyeLegend(hex('#c8b8ff')));
    g.set(15, 16, K); g.set(16, 16, K);
    g.set(14, 17, K); g.set(17, 17, K);
    g.set(13, 18, K); g.set(18, 18, K);
    g.hline(14, 18, 4, K);
  } else {
    g.line(9, 10, 12, 8, A.hi);
    g.hline(11, 14, 10, A.sh);
  }
  void lighten; void W; void mirror;
}

/** MSTR / Stratyr: scheming purple-cloaked owl with an orbiting orange shard. */
export function mstr(c: MonCtx) {
  const { p, g, A, B, front } = c;
  const cream = makeRamp(mix(A.hi, hex('#fff4d6'), 0.6));
  const gem = makeRamp('#d067f5');
  const talon = hex('#ffe9b0');
  const shard = makeRamp('#ff9a2a');

  // orbit ring behind everything
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const x = Math.round(16 + Math.cos(a) * 14.4), y = Math.round(16.4 + Math.sin(a) * 5.6 - Math.cos(a) * 3.4);
    if (g.get(x, y) === 0) g.set(x, y, hex('#a58bd8'));
  }
  // tail feathers
  if (!front) {
    for (const [dx, dh] of [[-4, 2], [0, 3], [4, 2]] as const)
      p.poly([[CX + dx - 2.4, 26], [CX + dx, 30 + dh - 2], [CX + dx + 2.4, 26]], B, { edge: 'deep' });
  }
  // talons
  for (const s of [-1, 1] as const) {
    p.blob(CX + s * 4.2, 29.6, 2.8, 1.6, A);
    if (front) { g.set(CX + s * 4.2 - 2, 31, talon); g.set(CX + s * 4.2, 31, talon); g.set(CX + s * 4.2 + 2, 31, talon); }
  }
  // body
  p.blob(CX, 21.2, 8, 8.6, A);
  if (front) {
    p.blob(CX, 22.4, 5.2, 6.2, cream, { edge: false, clean: true, bias: 0.05 });
    // feather chevrons on the chest
    for (const y of [19, 22.5, 26]) {
      g.set(13, y, A.sh); g.set(14, y + 1, A.sh); g.set(15, y + 2, A.sh);
      g.set(18, y + 2, A.sh); g.set(17, y + 1, A.sh); g.set(19, y, A.sh);
      g.set(16, y + 2, A.mid); g.set(17, y + 2, A.mid);
    }
  }
  // wings (cloak)
  for (const s of [-1, 1] as const) {
    const wing = front
      ? p.blob(CX + s * 8.2, 21.6, 4.2, 8, B, { rot: s * -0.12 })
      : p.blob(CX + s * 4.6, 21.4, 5.8, 8.6, B, { rot: s * -0.06 });
    void wing;
    const wx = CX + s * (front ? 8.2 : 4.6);
    for (let i = 0; i < 3; i++) g.set(wx + (s < 0 ? -1 : 1) * (front ? 0 : 0) - 1 + i, 28 - (front ? 0 : 0), A.mid);
  }
  if (!front) {
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) g.set(11 + k * 3 + (r & 1) * 1.5, 16 + r * 3, A.mid);
  }
  // head
  p.blob(CX, 11.8, 9.6, 7.8, A);
  // ear tufts
  for (const s of [-1, 1] as const) p.poly([[CX + s * 5.4, 7.4], [CX + s * 9.6, 0.4], [CX + s * 9.2, 8.4]], B, { edge: 'deep' });
  if (front) {
    for (const s of [-1, 1] as const) {
      p.blob(CX + s * 4.4, 12.2, 3.9, 3.9, cream, { edge: 'soft' });
      const ex = s < 0 ? 10 : 19;
      g.rect(ex, 11, 3, 3, B.deep);
      g.set(ex, 11, W); g.set(ex + 1, 12, hex('#ff9a2a'));
      // angry brow
      const bx = CX + s * 4.4;
      g.line(bx - s * 3.6, 7, bx + s * 1.6, 9, B.deep);
      g.line(bx - s * 3.6, 8, bx + s * 1.6, 10, B.deep);
    }
    p.poly([[14.6, 14.2], [17.4, 14.2], [16, 17.4]], makeRamp('#ffc94a'), { edge: 'deep' });
    // forehead gem
    p.poly([[CX, 3.6], [CX + 2.4, 6.4], [CX, 9], [CX - 2.4, 6.4]], gem, { edge: 'deep' });
    g.set(15, 5, W);
  } else {
    g.line(9, 10, 12, 8, A.hi);
    g.hline(11, 14, 10, A.sh);
  }
  // orbiting shard
  p.facet([[27.6, 3.4], [30.6, 9], [27.6, 16], [24.6, 9]], shard, 0.5);
  g.vline(27, 6, 5, shard.hi); g.set(26, 8, W);
  g.set(30, 2, W); g.set(29, 1, shard.hi); g.set(29, 3, shard.hi); g.set(31, 3, shard.hi); g.set(30, 4, shard.hi);
  void lighten; void K; void mirror;
}
