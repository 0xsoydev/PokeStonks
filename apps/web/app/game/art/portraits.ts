import { renderMonGrid, MON_GRID } from './mons';

const cache = new Map<string, string>();

/**
 * PNG data URL of a species' front sprite, nearest-neighbour upscaled (cached). Browser only.
 * `size` is the square edge in CSS pixels; multiples of 32 are pixel-perfect.
 */
export function speciesPortraitDataUrl(speciesId: string, size = 128): string {
  const key = `${speciesId}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = false;
  renderMonGrid(speciesId, 'front').drawTo(ctx, 0, 0, size / MON_GRID);
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
