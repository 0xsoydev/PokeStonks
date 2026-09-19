import { CX, K, W, DOT_EYE, eyeLegend, hex, makeRamp, mix, lighten, darken, flameShape, type MonCtx } from '../monkit';

/** GME / Gamestomp: stompy red bull-lizard with a controller-shaped flame crest. */
export function gme(c: MonCtx) {
  const { p, g, A, B, front } = c;
  const gold = B;
  const belly = makeRamp(mix(B.mid, hex('#fff0b0'), 0.35));
  const fireCols = [hex('#e2452b'), hex('#f58a2a'), hex('#ffe27a')] as const;
  const claw = hex('#fff2d0');
  const pad = makeRamp('#ffb93a');

  // flame tail: big and central when seen from behind
  const tx = front ? 26.4 : 22.6;
  p.limb(front ? 21 : 18, 28, front ? 25.6 : 21.6, 25, 3.2, 2, A);
  flameShape(p, tx, 25, 8, 12, front ? 2 : 3, fireCols, A.line);

  // stomping feet
  for (const s of [-1, 1] as const) {
    p.blob(CX + s * 7.6, 29.4, 5, 2.4, gold);
    if (front) for (let i = -1; i <= 1; i++) g.set(CX + s * 7.6 + i * 2.8, 31, claw);
  }
  for (const s of [-1, 1] as const) p.blob(CX + s * 10.8, 24, 2.6, 3.8, A, { rot: s * -0.3 });
  p.blob(CX, 24.4, 10, 6.2, A);
  if (front) {
    p.blob(CX, 25.2, 6, 4.4, belly, { edge: false, clean: true, bias: 0.05 });
    for (let i = 0; i < 2; i++) g.hline(12, 24 + i * 2, 8, gold.sh);
  } else {
    for (let i = 0; i < 3; i++) {
      const y = 20 + i * 3;
      p.facet([[CX - 2.6, y + 2.2], [CX, y - 1.4], [CX + 2.6, y + 2.2]], gold, 0.5);
    }
  }
  // head
  p.blob(CX, 18, 8.8, 6.2, A);

  // flame tongues behind the controller
  flameShape(p, CX - 6.6, 7, 4.4, 6.4, -1.2, [fireCols[0], fireCols[1]], A.line);
  flameShape(p, CX, 6.4, 5.6, 8.6, 0.6, fireCols, A.line);
  flameShape(p, CX + 6.6, 7, 4.4, 6.4, 1.2, [fireCols[0], fireCols[1]], A.line);
  // the controller itself
  const x0 = 6, y0 = 5;
  const shape = [
    '..HHHHHHHHHHHHHHHH..',
    '.HGGGGGGGGGGGGGGGGS.',
    'HGGGGGGGGGGGGGGGGGGS',
    'HGGGGGGGGGGGGGGGGGGS',
    'HGGGGGGGGGGGGGGGGGGS',
    'HGGGGGGGGGGGGGGGGGGS',
    '.HGGGGGG......GGGGS.',
    '..HGGGGG......GGGGS.',
    '...SSSS........SSS..',
  ];
  p.stamp(shape, x0, y0, { H: pad.hi, G: pad.mid, S: pad.sh });
  // rim + inner shading so it reads as a lit plastic shell
  for (let i = 0; i < 20; i++) { const c0 = g.get(x0 + i, y0 + 5); if (c0 === pad.mid) g.set(x0 + i, y0 + 5, pad.sh); }
  if (front) {
    const D = hex('#2b1a22');
    g.set(10, y0 + 2, D); g.rect(9, y0 + 3, 3, 1, D); g.set(10, y0 + 4, D); // d-pad
    g.set(21, y0 + 2, hex('#e2452b')); g.set(19, y0 + 3, hex('#3a8ae8')); g.set(23, y0 + 3, hex('#5fd05a')); g.set(21, y0 + 4, hex('#ffe27a')); // buttons
    g.rect(14, y0 + 3, 2, 1, pad.deep); g.rect(17, y0 + 3, 2, 1, pad.deep);
  } else {
    g.hline(9, y0 + 1, 5, pad.hi); g.hline(18, y0 + 1, 5, pad.hi);
    g.hline(12, y0 + 3, 8, pad.sh);
  }

  if (front) {
    p.blob(CX, 21.4, 4.6, 2.6, belly, { edge: false, clean: true });
    p.stamp(DOT_EYE, 11, 15, eyeLegend());
    p.stamp(DOT_EYE, 19, 15, eyeLegend());
    g.set(10, 14, A.line); g.set(11, 14, A.line); g.set(12, 15 - 1, A.line);
    g.set(21, 14, A.line); g.set(20, 14, A.line); g.set(19, 14, A.line);
    g.set(14, 20, K); g.set(17, 20, K);
    g.hline(13, 22, 6, K); g.set(13, 23, W); g.set(18, 23, W);
  }
}

/** AMD / Amdrake: dark-winged orange drake with chip-pin spikes and a CPU-die chest. */
export function amd(c: MonCtx) {
  const { p, g, A, B, front } = c;
  const wing = makeRamp('#2b2f3a');
  const belly = makeRamp(mix(A.hi, hex('#ffe9a8'), 0.55));
  const pin = hex('#c9d0dc');
  const fireCols = [hex('#e9542f'), hex('#f5a02a'), hex('#ffe27a')] as const;

  // wings
  for (const s of [-1, 1] as const) {
    const w = [[CX + s * 6, 15], [CX + s * 15.4, 5.4], [CX + s * 14.4, 12], [CX + s * 15.6, 16.4], [CX + s * 12, 16.4], [CX + s * 12.4, 22], [CX + s * 7.6, 21]] as const;
    p.poly(w, wing, { edge: 'deep' });
    g.line(CX + s * 7, 16, CX + s * 14.6, 7, A.mid);
    g.line(CX + s * 7.6, 17, CX + s * 13, 15, A.sh);
    g.line(CX + s * 8, 19, CX + s * 11.6, 20, A.sh);
  }
  // tail with a flame tip
  p.limb(front ? 18 : 16, 26, front ? 24.6 : 22, 28.6, 2.6, 1.3, A);
  flameShape(p, front ? 27 : 24.4, 28.8, 4, 6, 1, fireCols, A.line);
  // legs
  for (const s of [-1, 1] as const) {
    p.blob(CX + s * 4.4, 29, 3.2, 2, wing);
  }
  p.blob(CX, 21.4, 6.8, 7.6, A);
  if (front) {
    p.blob(CX, 22.6, 4, 5.6, belly, { edge: false, clean: true });
    // CPU die on the chest
    p.stamp([
      '.P.P.P.',
      'PDDDDDP',
      '.DLLLD.',
      'PDLKLDP',
      '.DLLLD.',
      'PDDDDDP',
      '.P.P.P.',
    ], 12.5, 18, { P: pin, D: wing.deep, L: wing.mid, K: A.hi });
  } else {
    for (let i = 0; i < 4; i++) {
      const y = 14 + i * 3.4;
      g.rect(CX - 1, y, 2, 2, wing.deep);
      g.set(CX - 1, y, pin); g.set(CX, y, pin);
    }
  }
  // head
  p.blob(CX, 11.4, 7.2, 5.8, A);
  // chip-pin crest
  const pins: Array<[number, number]> = [[15, 6], [11, 4.6], [19, 4.6], [7, 3.4], [23, 3.4]];
  for (const [x, hgt] of pins) {
    g.rect(x, Math.round(7.6 - hgt), 2, Math.round(hgt), wing.deep);
    g.set(x, Math.round(7.6 - hgt), pin); g.set(x + 1, Math.round(7.6 - hgt), pin);
    g.set(x + 1, Math.round(9.6 - hgt), wing.mid);
  }
  // side pins (cheek spikes)
  for (const s of [-1, 1] as const) {
    for (let i = 0; i < 2; i++) {
      const x = s < 0 ? 3 : 25, y = 9 + i * 3;
      g.rect(x, y, 4, 2, wing.deep); g.set(s < 0 ? x : x + 3, y, pin); g.set(s < 0 ? x : x + 3, y + 1, pin);
    }
  }
  if (front) {
    // narrow fierce eyes
    for (const s of [-1, 1] as const) {
      const ex = s < 0 ? 10 : 19;
      g.rect(ex, 10, 3, 2, hex('#ffd23a'));
      g.set(ex + (s < 0 ? 2 : 0), 10, K); g.set(ex + (s < 0 ? 2 : 0), 11, K);
      g.set(ex + (s < 0 ? 0 : 2), 9, A.line); g.set(ex + 1, 9, A.line);
    }
    g.set(15, 13, K); g.set(16, 13, K);
    g.hline(13, 15, 6, K); g.set(13, 16, W); g.set(18, 16, W);
  } else {
    g.hline(11, 9, 10, A.hi);
  }
}
