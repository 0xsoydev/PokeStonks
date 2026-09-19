import type Phaser from 'phaser';

export const W = 960;
export const H = 640;
export const FONT = '"Press Start 2P", monospace';

/** Same palette the battle UI and the web UI tokens use, so every layer reads as one world. */
export const C = {
  navy: 0x183088, navyDark: 0x0f1f5c, gold: 0xd8a830, cream: 0xf8f8d0, ink: 0x181818, slate: 0x484878,
  white: 0xffffff, red: 0xe84040, green: 0x58d858, yellow: 0xf8d858,
} as const;

export const TYPE_COLOR: Record<string, number> = {
  Normal: 0xa8a878, Electric: 0xf8d030, Grass: 0x78c850, Fire: 0xf08030, Water: 0x6890f0, Psychic: 0xf85888,
};

export function txt(
  scene: Phaser.Scene, x: number, y: number, s: string, size = 12, color = '#ffffff',
  style: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, ...style });
  t.setResolution(2);
  return t;
}

/** Rect with clipped corners: the chunky pixel bevel used by every panel. */
export function notched(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, fill: number, alpha = 1, n = 3) {
  g.fillStyle(fill, alpha);
  g.fillRect(x + n, y, w - 2 * n, h);
  g.fillRect(x, y + n, w, h - 2 * n);
}

export interface FrameOpts { fill: number; border: number; borderW?: number; alpha?: number; inner?: number }

/** Bordered pixel panel; `inner` adds the second, inset ring of the double-border dialog frame. */
export function drawFrame(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, o: FrameOpts) {
  const bw = o.borderW ?? 3;
  notched(g, x, y, w, h, o.border, o.alpha ?? 1, bw);
  notched(g, x + bw, y + bw, w - bw * 2, h - bw * 2, o.fill, o.alpha ?? 1, Math.max(1, bw - 1));
  if (o.inner !== undefined) {
    g.lineStyle(2, o.inner, 1);
    g.strokeRect(x + bw + 3, y + bw + 3, w - (bw + 3) * 2, h - (bw + 3) * 2);
  }
}

export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
  } catch {
    return false;
  }
}

/** Split dialog lines into pages of at most two lines each. */
export function pagesFrom(lines: readonly string[]): string[] {
  if (lines.length <= 3) return [lines.join('\n')];
  const pages: string[] = [];
  for (let i = 0; i < lines.length; i += 2) pages.push(lines.slice(i, i + 2).join('\n'));
  return pages;
}
