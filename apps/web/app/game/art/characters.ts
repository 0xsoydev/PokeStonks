import { PixelGrid, hex, makeRamp, mix, lighten, rgba, type Color, type Ramp } from './pixel';
import { Painter } from './paint';

export const CHAR_W = 16;
export const CHAR_H = 24;
export const CHAR_COLS = 3;
export const CHAR_ROWS = 4;

export type CharKey = 'player_a' | 'player_b' | 'npc_1' | 'npc_2' | 'npc_3';
export const CHAR_KEYS: readonly CharKey[] = ['player_a', 'player_b', 'npc_1', 'npc_2', 'npc_3'];

/**
 * Sheet layout (3 columns x 4 rows of 16x24 frames): rows are down, left, right, up;
 * in each row the columns are [left foot forward, standing, right foot forward].
 * This is the exact shape grid-engine's `walkingAnimationMapping` wants.
 */
export const CHAR_WALK_MAPPING = {
  down: { leftFoot: 0, standing: 1, rightFoot: 2 },
  left: { leftFoot: 3, standing: 4, rightFoot: 5 },
  right: { leftFoot: 6, standing: 7, rightFoot: 8 },
  up: { leftFoot: 9, standing: 10, rightFoot: 11 },
} as const;

type Facing = 'down' | 'left' | 'right' | 'up';
const ROW: Facing[] = ['down', 'left', 'right', 'up'];

interface Look {
  skin: Ramp;
  hair: Ramp;
  hairStyle: 'short' | 'pony' | 'slick' | 'none';
  hat?: { kind: 'cap' | 'hardhat' | 'visor'; ramp: Ramp; logo?: Color };
  shirt: Ramp;
  jacket?: Ramp;          // open jacket over the shirt
  pants: Ramp;
  shoes: Ramp;
  tie?: Color;
  pack?: Ramp;            // backpack visible from the back / sides
  vest?: Ramp;
  eye: Color;
}

const INK = hex('#181020');
const S = (c: string) => makeRamp(c);

const LOOKS: Record<CharKey, Look> = {
  player_a: {
    skin: S('#e8b48a'), hair: S('#5a3a28'), hairStyle: 'short',
    hat: { kind: 'cap', ramp: S('#d8a830'), logo: hex('#183088') },
    shirt: S('#f0f0f0'), jacket: S('#2848b8'), pants: S('#283058'), shoes: S('#e8e8f0'),
    pack: S('#d8a830'), eye: INK,
  },
  player_b: {
    skin: S('#f0c09c'), hair: S('#7a3a5a'), hairStyle: 'pony',
    hat: { kind: 'cap', ramp: S('#e8e8f0'), logo: hex('#d04a88') },
    shirt: S('#f4f4ff'), jacket: S('#d04a88'), pants: S('#3a3a6a'), shoes: S('#e05a8a'),
    pack: S('#f0c840'), eye: INK,
  },
  npc_1: {
    skin: S('#d8a07a'), hair: S('#2a2a34'), hairStyle: 'slick',
    shirt: S('#f4f4f4'), jacket: S('#5a6070'), pants: S('#4a5060'), shoes: S('#20202c'),
    tie: hex('#d8383c'), eye: INK,
  },
  npc_2: {
    skin: S('#f0c09c'), hair: S('#c8843c'), hairStyle: 'short',
    hat: { kind: 'hardhat', ramp: S('#f0c030') },
    shirt: S('#e8e0c0'), vest: S('#48a848'), pants: S('#6a5a3a'), shoes: S('#4a3a2a'),
    pack: S('#8a6a3a'), eye: INK,
  },
  npc_3: {
    skin: S('#c8926c'), hair: S('#8a8a98'), hairStyle: 'short',
    hat: { kind: 'visor', ramp: S('#3aa858') },
    shirt: S('#fafafa'), vest: S('#28486a'), pants: S('#2a2a3a'), shoes: S('#3a2a20'),
    tie: hex('#d8a830'), eye: INK,
  },
};

function drawFrame(look: Look, facing: Facing, phase: 0 | 1 | 2): PixelGrid {
  const g = new PixelGrid(CHAR_W, CHAR_H);
  drawLegs(g, look, facing, phase);
  const upper = new PixelGrid(CHAR_W, CHAR_H);
  drawUpper(upper, look, facing, phase);
  // walking frames dip the upper body by a pixel, like the handheld originals
  g.blit(upper, 0, phase === 1 ? 0 : 1);
  g.outline(INK);
  // soft ground shadow (drawn after the outline so it is not outlined)
  for (let y = 21; y <= 23; y++) for (let x = 2; x <= 13; x++) {
    const u = (x + 0.5 - 8) / 5.8, v = (y + 0.5 - 21.6) / 1.9;
    if (u * u + v * v <= 1 && g.get(x, y) === 0) g.set(x, y, rgba(10, 6, 24, 78));
  }
  return g;
}

function drawLegs(g: PixelGrid, look: Look, facing: Facing, phase: 0 | 1 | 2) {
  const side = facing === 'left' || facing === 'right';
  const flip = facing === 'right' ? 1 : -1;
  const stepL = phase === 0, stepR = phase === 2;
  const legY = 16;
  const legs = (x: number, len: number, ramp: Ramp) => {
    g.rect(x, legY, 3, len, ramp.mid);
    g.vline(x, legY, len, ramp.hi);
    g.vline(x + 2, legY, len, ramp.sh);
  };
  const shoe = (x: number, y: number, w = 3) => { g.rect(x, y, w, 2, look.shoes.mid); g.hline(x, y, w, look.shoes.hi); g.hline(x, y + 1, w, look.shoes.deep); };
  if (!side) {
    // planted leg reaches the ground, the other one is lifted a couple of pixels
    const lLen = stepR ? 2 : 4, rLen = stepL ? 2 : 4;
    legs(5, lLen, look.pants); legs(8, rLen, look.pants);
    shoe(5, legY + lLen, 3); shoe(8, legY + rLen, 3);
  } else {
    const fx = phase === 1 ? 0 : 2;
    const front = stepL ? -fx * flip : fx * flip; // alternate which leg leads
    const back = -front;
    const x0 = 6;
    legs(x0 + back, 3, look.pants); shoe(x0 + back, legY + 3, 3);
    legs(x0 + front, 4, look.pants); shoe(x0 + front + (flip > 0 ? 1 : -1), legY + 4, 3);
  }
}

function drawUpper(g: PixelGrid, look: Look, facing: Facing, phase: 0 | 1 | 2) {
  const p = new Painter(g);
  const side = facing === 'left' || facing === 'right';
  const flip = facing === 'right' ? 1 : -1;
  const bob = 0;
  const stepL = phase === 0, stepR = phase === 2;

  // ---- torso
  const tY = 10 + bob;
  const torso = look.jacket ?? look.vest ?? look.shirt;
  p.blob(8, tY + 3.2, 4.4, 3.6, torso, { pow: 2.6, edge: 'soft' });
  if (!side) {
    if (look.jacket) { g.vline(8, tY + 1, 6, look.shirt.mid); g.vline(7, tY + 1, 6, look.shirt.hi); g.vline(9, tY + 1, 6, look.shirt.mid); }
    else if (look.vest) { g.rect(6, tY + 1, 4, 5, look.shirt.mid); g.vline(5, tY + 1, 5, look.vest.hi); g.vline(10, tY + 1, 5, look.vest.sh); }
    if (look.tie) { g.rect(8, tY + 1, 1, 4, look.tie); g.set(8, tY + 1, lighten(look.tie, 0.3)); g.set(7, tY, look.shirt.hi); g.set(9, tY, look.shirt.hi); }
    g.hline(5, tY + 6, 6, look.pants.deep); // belt
  } else {
    if (look.jacket) g.vline(8 + flip * 2, tY + 1, 5, look.shirt.mid);
    g.hline(5, tY + 6, 6, look.pants.deep);
  }

  // ---- arms (swing opposite to legs)
  const armL = stepL ? 1 : stepR ? -1 : 0, armR = -armL;
  const sleeve = look.jacket ?? look.vest ?? look.shirt;
  const arm = (x: number, dy: number) => {
    g.rect(x, tY + 1 + dy, 2, 3, sleeve.mid); g.vline(x, tY + 1 + dy, 3, sleeve.hi);
    g.rect(x, tY + 4 + dy, 2, 2, look.skin.mid); g.set(x, tY + 4 + dy, look.skin.hi);
  };
  if (!side) { arm(2, armL); arm(12, armR); }
  else {
    const ax = 7, dy = stepL ? -1 : stepR ? 1 : 0;
    arm(ax, dy);
  }

  // ---- backpack (visible from up and the sides)
  if (look.pack && (facing === 'up' || side)) {
    if (facing === 'up') { p.blob(8, tY + 3, 3.6, 3.2, look.pack, { edge: 'deep' }); g.hline(6, tY + 1, 4, look.pack.hi); }
    else { const x = flip > 0 ? 3 : 10; g.rect(x, tY + 1, 3, 5, look.pack.mid); g.vline(x, tY + 1, 5, look.pack.hi); g.vline(x + 2, tY + 1, 5, look.pack.deep); }
  }

  // ---- head
  const hY = 6.4;
  const hx = side ? 8 + flip * 0.6 : 8;
  p.blob(hx, hY, 4.3, 3.8, look.skin, { edge: 'soft' });
  const hair = look.hair;
  const top = 2, bot = 10; // head rows
  void top; void bot;
  if (facing === 'down') {
    if (look.hairStyle !== 'none') {
      p.blob(8, 4.6, 4.5, 2.6, hair, { edge: false });
      g.rect(4, 5, 1, 3, hair.mid); g.rect(11, 5, 1, 3, hair.mid);
      if (look.hairStyle === 'slick') { g.hline(5, 5, 6, hair.deep); g.hline(6, 4, 3, hair.hi); }
      if (look.hairStyle === 'short' || look.hairStyle === 'pony') { g.hline(5, 5, 2, hair.mid); g.hline(9, 5, 2, hair.mid); g.set(7, 5, hair.sh); g.set(8, 5, hair.sh); }
    }
    // eyes + tiny mouth
    g.rect(5, 7, 2, 2, look.eye); g.rect(9, 7, 2, 2, look.eye);
    g.set(5, 7, hex('#ffffff')); g.set(9, 7, hex('#ffffff'));
    g.set(7, 9, mix(look.skin.mid, INK, 0.45)); g.set(8, 9, mix(look.skin.mid, INK, 0.45));
    if (look.hairStyle === 'pony') { g.set(4, 8, hair.mid); g.set(11, 8, hair.mid); }
  } else if (facing === 'up') {
    p.blob(8, 6.6, 4.5, 3.9, hair, { edge: 'soft' });
    g.hline(5, 8, 6, hair.sh); g.hline(6, 9, 4, hair.deep);
    if (look.hairStyle === 'pony') { p.blob(8, 11, 1.8, 2.6, hair, { edge: 'deep' }); g.set(8, 9, lighten(hair.mid, 0.3)); }
  } else {
    // profile: hair over the back of the head, face toward `flip`
    const back = -flip;
    p.blob(8 + back * 1.4, 5.4, 3.6, 3.2, hair, { edge: false });
    g.rect(8 + (back > 0 ? 2 : -3), 6, 2, 3, hair.mid);
    p.blob(8 + back * 0.2, 4.4, 4.2, 2.3, hair, { edge: false });
    // eye + nose
    g.rect(8 + flip * 2, 7, 1, 2, look.eye);
    g.set(8 + flip * 4, 8, look.skin.sh);
    g.set(8 + flip * 2 + flip, 9, mix(look.skin.mid, INK, 0.4));
    if (look.hairStyle === 'pony') { p.blob(8 + back * 4.6, 9, 1.7, 3, hair, { edge: 'deep' }); }
  }

  // ---- headwear
  if (look.hat) {
    const h = look.hat;
    if (h.kind === 'cap') {
      p.blob(hx, 4, 4.6, 2.9, h.ramp, { edge: 'auto' });
      if (facing === 'down') { g.rect(4, 5, 8, 1, h.ramp.deep); g.rect(5, 6, 6, 1, h.ramp.sh); if (h.logo) { g.set(7, 3, h.logo); g.set(8, 3, h.logo); } }
      if (facing === 'up') g.hline(5, 6, 6, h.ramp.deep);
      if (side) { g.rect(hx + flip * 3 - (flip < 0 ? 2 : 0), 5, 3, 1, h.ramp.deep); g.rect(hx + flip * 3 - (flip < 0 ? 1 : 0), 6, 2, 1, h.ramp.sh); }
    } else if (h.kind === 'hardhat') {
      p.blob(hx, 4.2, 4.8, 3, h.ramp, { edge: 'auto' });
      g.rect(3, 5, 10, 1, h.ramp.sh); g.hline(4, 4, 8, h.ramp.deep);
      g.vline(8, 1, 3, h.ramp.hi);
    } else {
      // eyeshade visor
      g.rect(4, 4, 8, 3, h.ramp.mid); g.hline(4, 4, 8, h.ramp.hi); g.hline(3, 6, 10, h.ramp.deep);
      g.hline(4, 3, 8, h.ramp.sh);
    }
  }

}

const sheetCache = new Map<CharKey, PixelGrid>();

/** 48x96 sheet: 3 frame columns x 4 direction rows of 16x24. */
export function drawCharSheet(key: CharKey): PixelGrid {
  const hit = sheetCache.get(key);
  if (hit) return hit;
  const look = LOOKS[key];
  const sheet = new PixelGrid(CHAR_W * CHAR_COLS, CHAR_H * CHAR_ROWS);
  ROW.forEach((facing, r) => {
    ([0, 1, 2] as const).forEach((phase, c) => {
      sheet.blit(drawFrame(look, facing, phase), c * CHAR_W, r * CHAR_H);
    });
  });
  sheetCache.set(key, sheet);
  return sheet;
}

/** Sheet as a canvas, for React / the gallery. */
export function drawCharacter(key: CharKey): HTMLCanvasElement {
  return drawCharSheet(key).toCanvas(1);
}
