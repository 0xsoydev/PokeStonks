import { drawTileset, ATLAS_COLS } from '../art/tileset';
import { LAYER, type BuiltMap } from './mapTypes';

/** Composite a built map (ground -> paths -> water/tall grass -> decor -> overhead) onto a canvas, for QA. */
export function drawMapPreview(map: BuiltMap, scale = 1, markers = true): HTMLCanvasElement {
  const { width: w, height: h } = map.json;
  const atlas = drawTileset(map.meta.theme);
  const out = document.createElement('canvas');
  out.width = w * 16 * scale; out.height = h * 16 * scale;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  for (const name of [LAYER.ground, LAYER.paths, LAYER.anim0, LAYER.decor, LAYER.overhead]) {
    const layer = map.json.layers.find((l) => l.name === name);
    if (!layer || layer.type !== 'tilelayer') continue;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = layer.data[y * w + x];
      if (!v) continue;
      const id = v - 1;
      ctx.drawImage(atlas, (id % ATLAS_COLS) * 16, Math.floor(id / ATLAS_COLS) * 16, 16, 16, x * 16 * scale, y * 16 * scale, 16 * scale, 16 * scale);
    }
  }
  if (markers) {
    const dot = (x: number, y: number, c: string) => { ctx.fillStyle = c; ctx.fillRect((x * 16 + 5) * scale, (y * 16 + 5) * scale, 6 * scale, 6 * scale); };
    for (const n of map.meta.npcs) dot(n.x, n.y, n.role === 'teller' ? '#ffd23f' : '#ffffff');
    for (const t of map.meta.trainers) dot(t.x, t.y, '#ff3030');
    for (const wp of map.meta.warps) dot(wp.x, wp.y, '#ff00ff');
    for (const e of map.meta.exits) dot(e.x, e.y, '#00e0ff');
    dot(map.meta.spawn.x, map.meta.spawn.y, '#40ff40');
  }
  return out;
}
