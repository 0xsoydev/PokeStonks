import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// Copies map sprite PNGs from maps/assets into public/ so the canvas renderer
// can load them at runtime. Mirrors scripts/copy-maplibre-worker.mjs.
// Generated output lives in /public/maps (gitignored) — never edit it directly.
const dest = path.join(process.cwd(), 'public', 'maps');

// meadowbrook (pokemon-style) tileset + trainer sheet + map definition
cpSync(
  path.join(process.cwd(), 'maps', 'assets', 'meadowbrook'),
  path.join(dest, 'meadowbrook'),
  { recursive: true },
);
cpSync(
  path.join(process.cwd(), 'maps', 'data', 'meadowbrook.tmj'),
  path.join(dest, 'meadowbrook', 'meadowbrook.tmj'),
);

// craftpix village tileset (superseded by meadowbrook on /maps, kept for later reuse)
const src = path.join(process.cwd(), 'maps', 'assets', 'village-tileset');
const villageDest = path.join(dest, 'village');

mkdirSync(villageDest, { recursive: true });
for (const dir of ['tiles', 'tiles2', 'objects', 'animated']) {
  cpSync(path.join(src, dir), path.join(villageDest, dir), { recursive: true });
}
console.log(`map assets copied -> ${dest}`);
