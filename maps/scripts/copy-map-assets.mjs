import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// Copies the canonical tileset PNGs from maps/assets into public/ so the
// canvas renderer can load them at runtime. Mirrors scripts/copy-maplibre-worker.mjs.
// Generated output lives in /public/maps (gitignored) — never edit it directly.
const src = path.join(process.cwd(), 'maps', 'assets', 'village-tileset');
const dest = path.join(process.cwd(), 'public', 'maps', 'village');

mkdirSync(dest, { recursive: true });
for (const dir of ['tiles', 'tiles2', 'objects', 'animated']) {
  cpSync(path.join(src, dir), path.join(dest, dir), { recursive: true });
}
console.log(`map assets copied: ${src} -> ${dest}`);
