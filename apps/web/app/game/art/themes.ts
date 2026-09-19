import { hex, makeRamp, type Color, type Ramp } from './pixel';

export type RouteTheme = 'tech' | 'bluechip' | 'energy' | 'meme' | 'consumer' | 'crypto';
export const ROUTE_THEMES: readonly RouteTheme[] = ['bluechip', 'tech', 'energy', 'meme', 'consumer', 'crypto'];

export function isRouteTheme(t: unknown): t is RouteTheme {
  return typeof t === 'string' && (ROUTE_THEMES as readonly string[]).includes(t);
}

export type PathStyle = 'cobble' | 'plate' | 'dirt' | 'pave';
export type RoofStyle = 'shingle' | 'metal' | 'corrugated' | 'stripe';
export type WallStyle = 'brick' | 'panel' | 'plank' | 'stucco' | 'marble';
export type FloorStyle = 'wood' | 'plate' | 'checker' | 'marble';

/** Everything that changes between routes: the tileset painter only ever reads this. */
export interface ThemePal {
  id: RouteTheme;
  label: string;
  grass: { base: Color; hi: Color; lo: Color; tuft: Color };
  tall: { base: Color; mid: Color; tip: Color; lo: Color };
  sand: { base: Color; hi: Color; lo: Color };
  path: { style: PathStyle; base: Color; hi: Color; lo: Color; mortar: Color; edge: Color };
  water: { base: Color; hi: Color; lo: Color; deep: Color; foam: Color; edge: Color };
  leaf: Ramp;
  leafAlt: Ramp;
  trunk: Ramp;
  flowers: [Color, Color, Color];
  roof: { style: RoofStyle; ramp: Ramp; alt: Ramp };
  wall: { style: WallStyle; ramp: Ramp; trim: Ramp };
  glass: Ramp;
  accent: Ramp;
  floor: { style: FloorStyle; a: Ramp; b: Ramp };
  iwall: Ramp;
  iwallTrim: Ramp;
  carpet: Ramp;
  counter: Ramp;
  glow: Color;
}

const r = makeRamp;
const h = hex;

export const THEMES: Record<RouteTheme, ThemePal> = {
  bluechip: {
    id: 'bluechip', label: 'Blue-chip meadow',
    grass: { base: h('#58b04a'), hi: h('#7ccc62'), lo: h('#3f8f3e'), tuft: h('#2c7434') },
    tall: { base: h('#2f7d3a'), mid: h('#42a04c'), tip: h('#86dc66'), lo: h('#1d5a2c') },
    sand: { base: h('#e8d59c'), hi: h('#f6eac0'), lo: h('#c9b378') },
    path: { style: 'cobble', base: h('#c98f62'), hi: h('#e0ac7c'), lo: h('#a26c46'), mortar: h('#7a4c34'), edge: h('#5a3624') },
    water: { base: h('#3f8fe0'), hi: h('#86c6ff'), lo: h('#2a6cc0'), deep: h('#1f4f9a'), foam: h('#dcf2ff'), edge: h('#183e7c') },
    leaf: r('#3f9a44'), leafAlt: r('#5cb24a'), trunk: r('#8a5630'),
    flowers: [h('#ec4a52'), h('#ffd23f'), h('#f6f6ff')],
    roof: { style: 'shingle', ramp: r('#c2483f'), alt: r('#8f2f2c') },
    wall: { style: 'brick', ramp: r('#e6c9a0'), trim: r('#8a6a4a') },
    glass: r('#7cc4ee'), accent: r('#ffd23f'),
    floor: { style: 'wood', a: r('#bd8c58'), b: r('#a97a4a') },
    iwall: r('#e0cfa4'), iwallTrim: r('#7a5a3a'), carpet: r('#b03a4c'), counter: r('#8a5a34'),
    glow: h('#ffd23f'),
  },
  tech: {
    id: 'tech', label: 'Silicon steel',
    grass: { base: h('#3f8f8a'), hi: h('#62b6ac'), lo: h('#2e7078'), tuft: h('#215a68') },
    tall: { base: h('#1f5a6a'), mid: h('#33849a'), tip: h('#78e0e0'), lo: h('#133f50') },
    sand: { base: h('#aab6c4'), hi: h('#ccd6e2'), lo: h('#8794a8') },
    path: { style: 'plate', base: h('#8e9eb6'), hi: h('#b8c6dc'), lo: h('#66768e'), mortar: h('#3c4a66'), edge: h('#252f4a') },
    water: { base: h('#2c72d0'), hi: h('#76b4ff'), lo: h('#2258b0'), deep: h('#183f88'), foam: h('#cfeaff'), edge: h('#122c66') },
    leaf: r('#3a9c9c'), leafAlt: r('#2f7ea8'), trunk: r('#5c5e74'),
    flowers: [h('#4de1ff'), h('#f4f4ff'), h('#9a7aff')],
    roof: { style: 'metal', ramp: r('#4c6ca0'), alt: r('#364f80') },
    wall: { style: 'panel', ramp: r('#c2ceda'), trim: r('#56668a') },
    glass: r('#5ad0f0'), accent: r('#4de1ff'),
    floor: { style: 'plate', a: r('#8494ac'), b: r('#7484a0') },
    iwall: r('#34425e'), iwallTrim: r('#4de1ff'), carpet: r('#2a5c9c'), counter: r('#56668a'),
    glow: h('#4de1ff'),
  },
  energy: {
    id: 'energy', label: 'Oilfield dust',
    grass: { base: h('#aaa24e'), hi: h('#c6bd66'), lo: h('#8a8238'), tuft: h('#6a6a2c') },
    tall: { base: h('#75863a'), mid: h('#9aa84a'), tip: h('#d4d472'), lo: h('#526428') },
    sand: { base: h('#dcb47a'), hi: h('#f0cf98'), lo: h('#b48a52') },
    path: { style: 'dirt', base: h('#d2a56c'), hi: h('#e8c48c'), lo: h('#a87c48'), mortar: h('#8a6238'), edge: h('#5e4020') },
    water: { base: h('#3d84a6'), hi: h('#7ab8d0'), lo: h('#2c6888'), deep: h('#1f5068'), foam: h('#d8f0f4'), edge: h('#163c50') },
    leaf: r('#8c9a3a'), leafAlt: r('#c8842f'), trunk: r('#6c4228'),
    flowers: [h('#ff8a2a'), h('#ffd23f'), h('#c03a2a')],
    roof: { style: 'corrugated', ramp: r('#b8582c'), alt: r('#8c3e1e') },
    wall: { style: 'plank', ramp: r('#e4cfa4'), trim: r('#8a5a2a') },
    glass: r('#8ccce8'), accent: r('#ff8a2a'),
    floor: { style: 'wood', a: r('#c39c6a'), b: r('#b08a58') },
    iwall: r('#a87850'), iwallTrim: r('#5e3c22'), carpet: r('#7c3a2a'), counter: r('#7a5030'),
    glow: h('#ff8a2a'),
  },
  meme: {
    id: 'meme', label: 'Neon meme-lands',
    grass: { base: h('#4c9c6c'), hi: h('#70cc8c'), lo: h('#337a56'), tuft: h('#ff5ab4') },
    tall: { base: h('#2a6a6a'), mid: h('#3a8c88'), tip: h('#ff7ac8'), lo: h('#1a4a52') },
    sand: { base: h('#d8b4e8'), hi: h('#efd6fa'), lo: h('#b088c8') },
    path: { style: 'plate', base: h('#5c3c8c'), hi: h('#7c5abc'), lo: h('#402a6c'), mortar: h('#ff4fb0'), edge: h('#2a1a4a') },
    water: { base: h('#4a5adf'), hi: h('#a4acff'), lo: h('#3444b8'), deep: h('#252e8a'), foam: h('#f0e0ff'), edge: h('#1a2066') },
    leaf: r('#ff8ac8'), leafAlt: r('#e05aa8'), trunk: r('#6e3c5a'),
    flowers: [h('#ff5ab4'), h('#5ae8ff'), h('#ffe25a')],
    roof: { style: 'shingle', ramp: r('#d43c9c'), alt: r('#a22a7a') },
    wall: { style: 'stucco', ramp: r('#f2daf2'), trim: r('#8c4a9c') },
    glass: r('#8ce8ff'), accent: r('#ff5ab4'),
    floor: { style: 'checker', a: r('#5c3c8c'), b: r('#4a2c7c') },
    iwall: r('#2c1c4c'), iwallTrim: r('#ff5ab4'), carpet: r('#ff5ab4'), counter: r('#6c3c9c'),
    glow: h('#ff5ab4'),
  },
  consumer: {
    id: 'consumer', label: 'Shopfront harbor',
    grass: { base: h('#64c44e'), hi: h('#88de6a'), lo: h('#46a23c'), tuft: h('#2e8a34') },
    tall: { base: h('#2f8f3a'), mid: h('#48b24e'), tip: h('#8ce46a'), lo: h('#1f6a2c') },
    sand: { base: h('#f0dca0'), hi: h('#fff0c4'), lo: h('#d0b878') },
    path: { style: 'pave', base: h('#e6dec8'), hi: h('#f8f2e0'), lo: h('#c6bca2'), mortar: h('#a89e86'), edge: h('#7e7660') },
    water: { base: h('#3fb0e8'), hi: h('#8adcff'), lo: h('#2a88c8'), deep: h('#1f68a8'), foam: h('#e6f8ff'), edge: h('#1a5288') },
    leaf: r('#5ac84a'), leafAlt: r('#3aa838'), trunk: r('#8a5a30'),
    flowers: [h('#ec4a52'), h('#ffd23f'), h('#ff9a3a')],
    roof: { style: 'stripe', ramp: r('#e24c3c'), alt: r('#fff4e8') },
    wall: { style: 'stucco', ramp: r('#fff0d0'), trim: r('#e08a3a') },
    glass: r('#8ad8f4'), accent: r('#2ab8b0'),
    floor: { style: 'checker', a: r('#f4ecd8'), b: r('#d8ccb0') },
    iwall: r('#f2bc64'), iwallTrim: r('#a86a28'), carpet: r('#e24c3c'), counter: r('#c8843c'),
    glow: h('#2ab8b0'),
  },
  crypto: {
    id: 'crypto', label: 'Ledger violet',
    grass: { base: h('#5c4c9c'), hi: h('#7c6ac2'), lo: h('#44367c'), tuft: h('#f0c040') },
    tall: { base: h('#3a2a78'), mid: h('#5a48a8'), tip: h('#b494ff'), lo: h('#241a58') },
    sand: { base: h('#e0c890'), hi: h('#f4e2b0'), lo: h('#b89c60') },
    path: { style: 'plate', base: h('#d8b04a'), hi: h('#f6da7c'), lo: h('#aa862c'), mortar: h('#7a5a1c'), edge: h('#4a3410') },
    water: { base: h('#4a58c8'), hi: h('#8c9aff'), lo: h('#3242a2'), deep: h('#212c7a'), foam: h('#e4e8ff'), edge: h('#161e58') },
    leaf: r('#8c5ad2'), leafAlt: r('#6c3cb4'), trunk: r('#4c3c5c'),
    flowers: [h('#ffd23f'), h('#5ae8ff'), h('#ff7ac8')],
    roof: { style: 'shingle', ramp: r('#6c4cba'), alt: r('#4c3494') },
    wall: { style: 'marble', ramp: r('#dcd4f2'), trim: r('#caa03c') },
    glass: r('#9aa8ff'), accent: r('#f0c040'),
    floor: { style: 'marble', a: r('#cac2e2'), b: r('#b4acd2') },
    iwall: r('#3c2c6c'), iwallTrim: r('#f0c040'), carpet: r('#7c4cd4'), counter: r('#5c4494'),
    glow: h('#f0c040'),
  },
};

export function getTheme(t: string): ThemePal {
  return isRouteTheme(t) ? THEMES[t] : THEMES.bluechip;
}
