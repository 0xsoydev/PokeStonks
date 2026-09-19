import { getSpecies, isSpeciesId } from 'game-core';
import { PixelGrid, makeRamp } from './pixel';
import { Painter } from './paint';
import { MON, type Facing, type MonCtx, type MonPainter } from './monkit';
import { aapl, msft } from './species/normal';
import { tsla, nvda } from './species/electric';
import { xom, cvx } from './species/grass';
import { gme, amd } from './species/fire';
import { amzn, nke } from './species/water';
import { coin, mstr } from './species/psychic';

export type { Facing };
export { MON as MON_GRID };

const PAINTERS: Record<string, MonPainter> = { aapl, msft, tsla, nvda, xom, cvx, gme, amd, amzn, nke, coin, mstr };

const gridCache = new Map<string, PixelGrid>();

/** 32x32 logical pixel grid for a species (memoised, deterministic). */
export function renderMonGrid(speciesId: string, facing: Facing): PixelGrid {
  const id = isSpeciesId(speciesId) ? speciesId : 'aapl';
  const key = `${id}:${facing}`;
  const hit = gridCache.get(key);
  if (hit) return hit;

  const sp = getSpecies(id);
  const g = new PixelGrid(MON, MON);
  const A = makeRamp(sp.colors[0]);
  const B = makeRamp(sp.colors[1]);
  const p = new Painter(g);
  const ctx: MonCtx = {
    g, p, front: facing === 'front', A, B,
    sym: (fn) => { fn(-1); fn(1); },
  };
  (PAINTERS[id] ?? fallback)(ctx);
  g.outline(A.line);
  gridCache.set(key, g);
  return g;
}

function fallback(c: MonCtx) {
  c.p.blob(16, 18, 10, 9, c.A);
}

/**
 * Draw a BrokerMon onto a 2D context at (0,0). The creature is painted on a 32x32 logical grid
 * and upscaled with nearest-neighbour, so `size` should be a multiple of 32 (default 128 = x4).
 */
export function drawMon(ctx: CanvasRenderingContext2D, speciesId: string, facing: Facing, size = 128): void {
  const key = `${isSpeciesId(speciesId) ? speciesId : 'aapl'}:${facing}`;
  let src = canvasCache.get(key);
  if (!src) { src = renderMonGrid(speciesId, facing).toCanvas(1); canvasCache.set(key, src); }
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, size, size);
  ctx.imageSmoothingEnabled = prev;
}

const canvasCache = new Map<string, HTMLCanvasElement>();

