import { CX, K, W, hex, makeRamp, mix, lighten, darken, type MonCtx } from '../monkit';

const mirror = (pts: ReadonlyArray<readonly [number, number]>, axis: number) =>
  pts.map(([x, y]) => [2 * axis - x, y] as const);

/** TSLA / Teslaq: angular cyber-cat with a lightning-bolt tail, static cheek tufts and a red visor stripe. */
export function tsla(c: MonCtx) {
  const { p, g, A, B, front } = c;
  const belly = makeRamp(mix(A.hi, hex('#fff8e0'), 0.6));
  const red = B;
  const bx = front ? 13.4 : 16; // body axis: shifted left in front view to balance the bolt
  const hi = hex('#fff6b0');
  const bolt = front
    ? ([[24.4, 0.4], [30.8, 0.4], [26.6, 10], [31.2, 10], [19.8, 29.4], [22.6, 16.2], [18.6, 16.2]] as const)
    : ([[17.2, 3], [23.6, 3], [19.4, 13.2], [24, 13.2], [11.6, 31], [15, 18.2], [11, 18.2]] as const);

  if (front) p.facet(bolt, A, 0.5);

  // swept-back ear blades
  for (const s of [-1, 1] as const) {
    p.facet([[bx + s * 5.8, 9.6], [bx + s * 11.6, 3.4], [bx + s * 2.6, 6.8]], A, 0.6);
    p.flat([[bx + s * 6.4, 8.4], [bx + s * 10.4, 4.6], [bx + s * 4.4, 7]], red.mid);
  }
  // legs + shield-shaped torso
  p.blob(bx - 4.2, 28.6, 3.6, 2.3, A);
  p.blob(bx + 4.2, 28.6, 3.6, 2.3, A);
  p.blob(bx, 22.6, 6.8, 6.6, A);
  p.blob(bx, 23.6, 3.6, 4.6, belly, { edge: false, clean: true });
  if (front) {
    // racing stripe with a little bolt notch
    g.vline(Math.round(bx) - 1, 19, 8, red.mid); g.vline(Math.round(bx), 19, 8, red.mid);
    g.set(Math.round(bx) + 1, 22, red.mid); g.set(Math.round(bx) - 2, 24, red.mid);
  }
  // angular head
  const head = [[-8.2, 3.2], [-5, -0.4], [5, -0.4], [8.2, 3.2], [8.2, 9], [4, 12.2], [-4, 12.2], [-8.2, 9]] as const;
  p.blob(bx, 12.6, 8.4, 6.6, A, { pow: 2.6 });
  void head;
  // forehead spikes
  p.facet([[bx - 3.6, 7], [bx - 2.2, 2], [bx - 0.4, 6.6]], A, 0.6);
  p.facet([[bx - 1.2, 6.6], [bx + 0.6, 0.6], [bx + 2.2, 6.6]], A, 0.6);
  p.facet([[bx + 0.6, 7], [bx + 3.2, 2.2], [bx + 4.4, 7.4]], A, 0.6);

  if (front) {
    // cheek tufts: static spikes
    for (const s of [-1, 1] as const) {
      p.facet([[bx + s * 7, 12], [bx + s * 13, 10.4], [bx + s * 9.6, 13.4]], A, 0.6);
      p.facet([[bx + s * 7, 14.4], [bx + s * 12.6, 15.2], [bx + s * 8, 17]], A, 0.6);
    }
    // red visor stripe with glowing slit eyes
    p.flat([[bx - 9, 10.4], [bx + 9, 10.4], [bx + 9.6, 13.4], [bx + 7, 14.6], [bx - 7, 14.6], [bx - 9.6, 13.4]], red.mid, red.line);
    g.hline(Math.round(bx) - 8, 11, 16, red.hi);
    for (const s of [-1, 1] as const) {
      const ex = Math.round(bx + s * 4.2) - 1;
      g.rect(ex, 11, 3, 3, hi);
      g.set(ex + 1, 12, K); g.set(ex + 1, 13, K);
    }
    // tiny nose + fang smile
    g.set(Math.round(bx) - 1, 16, K); g.set(Math.round(bx), 16, K);
    g.set(Math.round(bx) - 2, 17, K); g.set(Math.round(bx) + 1, 17, K);
    g.set(Math.round(bx) - 1, 17, W);
  } else {
    p.facet(bolt, A, 0.5);
    for (let i = 0; i < 3; i++) {
      g.hline(Math.round(bx) - 6, 20 + i * 3, 3, red.mid);
      g.hline(Math.round(bx) + 3, 20 + i * 3, 3, red.mid);
    }
    g.hline(Math.round(bx) - 6, 10, 12, red.mid);
  }
}

/** NVDA / Nvidra: armoured hydra-lizard with a glowing green eye-visor and a GPU-fan chest. */
export function nvda(c: MonCtx) {
  const { p, g, A, B, front } = c;
  const glow = hex('#eaffb0');
  const neon = hex('#9aff3c');
  const metal = makeRamp('#6b8552');
  const helm = makeRamp('#33472a');

  // jagged tail
  const tail = [[21, 25], [26, 21.5], [25, 18], [30, 14.5], [30.4, 19.6], [28.2, 25.6], [23.4, 29.4]] as const;
  if (front) p.facet(tail, A, 0.5);
  // legs + torso
  for (const s of [-1, 1] as const) {
    p.facet([[CX + s * 3, 26.5], [CX + s * 10.4, 26.5], [CX + s * 11, 30.6], [CX + s * 2.6, 30.6]], metal, 0.5);
    for (const dx of [5, 7.4, 9.8]) g.set(CX + s * dx - (s > 0 ? 1 : 0), 31, neon);
  }
  p.poly([[8, 14], [24, 14], [27.4, 22.4], [23.4, 29.6], [8.6, 29.6], [4.6, 22.4]], A, { edge: 'deep' });
  // pauldrons with lime spikes
  for (const s of [-1, 1] as const) {
    p.facet([[CX + s * 5.6, 12.6], [CX + s * 12.6, 11.4], [CX + s * 14, 18.4], [CX + s * 9.6, 21], [CX + s * 5.2, 17.4]], metal, 0.5);
    p.facet([[CX + s * 11, 12], [CX + s * 15.4, 6.2], [CX + s * 14.6, 14]], A, 0.5);
  }

  if (front) {
    // GPU-fan chest emblem
    p.disc(CX, 22.4, 4.4, 4.4, helm.deep, K);
    for (const [dx, dy] of [[0, -3], [0, 2], [-3, 0], [2, 0], [-2, -2], [1, 1], [-2, 1], [1, -2]] as const) g.set(CX + dx, 22 + dy, neon);
    g.rect(CX - 1, 21, 2, 2, glow);
    for (let i = 0; i < 2; i++) g.hline(11, 26 + i * 2 - 1, 10, A.sh);
  } else {
    for (let i = 0; i < 4; i++) {
      const y = 14 + i * 4;
      p.facet([[CX - 2.6, y + 3.6], [CX, y - 0.8], [CX + 2.6, y + 3.6]], metal, 0.5);
      g.set(CX - 1, y + 2, neon);
    }
    p.facet(tail.map(([x, y]) => [x - 8, y + 1] as const), A, 0.5);
  }

  // helm
  p.facet([[10.4, 6.2], [21.6, 6.2], [25, 11.4], [21.4, 16.8], [10.6, 16.8], [7, 11.4]], helm, 0.6);
  for (const s of [-1, 1] as const) {
    p.facet([[CX + s * 5.4, 7.6], [CX + s * 11, 0.4], [CX + s * 9.6, 8.6]], metal, 0.5);
    g.set(CX + s * 10.4 - (s > 0 ? 1 : 0), 2, neon); g.set(CX + s * 10 - (s > 0 ? 1 : 0), 3, neon);
  }
  if (front) {
    // glowing visor + halo
    g.hline(9, 9, 14, mix(neon, helm.mid, 0.6));
    g.hline(9, 14, 14, mix(neon, helm.mid, 0.6));
    p.flat([[8.4, 9.8], [23.6, 9.8], [22.6, 13.6], [9.4, 13.6]], neon, K);
    g.hline(10, 10, 12, glow);
    g.hline(10, 12, 12, A.mid);
    g.rect(11, 11, 2, 1, K); g.rect(19, 11, 2, 1, K);
    // vents + jaw
    for (const s of [-1, 1] as const) { g.hline(CX + s * 7 - (s > 0 ? 1 : 0), 15, 2, helm.deep); }
    g.hline(12, 16, 8, K);
    g.set(13, 17, W); g.set(18, 17, W);
  } else {
    g.hline(11, 9, 10, A.hi);
    g.hline(10, 12, 12, helm.deep);
    g.hline(11, 14, 10, helm.deep);
  }
  void darken;
}
