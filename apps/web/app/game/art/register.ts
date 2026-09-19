import type Phaser from 'phaser';
import { SPECIES_LIST } from 'game-core';
import { renderMonGrid, MON_GRID } from './mons';
import { drawTilesetGrid, ATLAS_COLS } from './tileset';
import { CHAR_KEYS, CHAR_W, CHAR_H, CHAR_COLS, CHAR_ROWS, drawCharSheet } from './characters';
import {
  BG_SCALE, drawBattleBgGrid, drawExclBubbleGrid, drawGrassCoverGrid, drawPixelGrid, drawPlatformGrid,
  drawPuffGrid, drawShadowBlobGrid, drawSparkGrid,
} from './battle';
import { ROUTE_THEMES } from './themes';
import type { PixelGrid } from './pixel';

/** Phaser.Textures.FilterMode.NEAREST, inlined so this module never imports Phaser at runtime. */
const NEAREST = 1;

export interface ArtStep { label: string; run: () => void }

function addGrid(scene: Phaser.Scene, key: string, grid: PixelGrid, scale = 1): Phaser.Textures.Texture | null {
  if (scene.textures.exists(key)) return null;
  const tex = scene.textures.addCanvas(key, grid.toCanvas(scale));
  tex?.setFilter(NEAREST);
  return tex;
}

function addSheet(scene: Phaser.Scene, key: string, grid: PixelGrid, fw: number, fh: number) {
  const tex = addGrid(scene, key, grid);
  if (!tex) return;
  const cols = Math.floor(grid.w / fw), rows = Math.floor(grid.h / fh);
  for (let i = 0; i < cols * rows; i++) tex.add(i, 0, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh);
}

/**
 * The full art build as a list of small steps so a loading bar can tick between them.
 * Every step is idempotent (skips textures that already exist).
 */
export function artSteps(scene: Phaser.Scene): ArtStep[] {
  const steps: ArtStep[] = [];
  steps.push({ label: 'Particles', run: () => {
    addGrid(scene, 'pixel', drawPixelGrid());
    addGrid(scene, 'spark', drawSparkGrid());
    addGrid(scene, 'puff', drawPuffGrid());
    addGrid(scene, 'shadow_blob', drawShadowBlobGrid());
    addGrid(scene, 'bubble_excl', drawExclBubbleGrid());
  } });
  for (const theme of ROUTE_THEMES) {
    steps.push({ label: `Tiles ${theme}`, run: () => {
      const atlas = drawTilesetGrid(theme);
      addSheet(scene, `tiles_${theme}`, atlas, 16, 16);
      if (theme === 'bluechip') addSheet(scene, 'tiles', atlas, 16, 16);
      addSheet(scene, `grass_cover_${theme}`, drawGrassCoverGrid(theme), 16, 8);
    } });
  }
  steps.push({ label: 'Characters', run: () => {
    for (const k of CHAR_KEYS) addSheet(scene, `char_${k}`, drawCharSheet(k), CHAR_W, CHAR_H);
  } });
  for (let i = 0; i < SPECIES_LIST.length; i += 3) {
    const chunk = SPECIES_LIST.slice(i, i + 3);
    steps.push({ label: `BrokerMon ${chunk.map((s) => s.ticker).join(' ')}`, run: () => {
      for (const s of chunk) {
        addGrid(scene, `mon_${s.id}_front`, renderMonGrid(s.id, 'front'), 128 / MON_GRID);
        addGrid(scene, `mon_${s.id}_back`, renderMonGrid(s.id, 'back'), 128 / MON_GRID);
      }
    } });
  }
  for (const theme of ROUTE_THEMES) {
    steps.push({ label: `Arena ${theme}`, run: () => {
      addGrid(scene, `bg_battle_${theme}`, drawBattleBgGrid(theme), BG_SCALE);
      addGrid(scene, `platform_foe_${theme}`, drawPlatformGrid('foe', theme), 4);
      addGrid(scene, `platform_ally_${theme}`, drawPlatformGrid('ally', theme), 4);
      if (theme === 'bluechip') {
        addGrid(scene, 'platform_foe', drawPlatformGrid('foe', theme), 4);
        addGrid(scene, 'platform_ally', drawPlatformGrid('ally', theme), 4);
      }
    } });
  }
  return steps;
}

/** Build every texture the game uses (idempotent). */
export function registerArt(scene: Phaser.Scene): void {
  for (const s of artSteps(scene)) s.run();
}

export { ATLAS_COLS, CHAR_COLS, CHAR_ROWS };
