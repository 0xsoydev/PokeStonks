import Phaser from 'phaser';

export const W = 960;
export const H = 640;
export const FONT = '"Press Start 2P", monospace';

/** Shared palette — the same values the web UI tokens use, so both layers read as one world. */
export const C = {
  navy: 0x183088, navyDark: 0x0f1f5c, gold: 0xd8a830, cream: 0xf8f8d0, ink: 0x181818, slate: 0x484878,
  white: 0xffffff, red: 0xe84040, redDark: 0xa82424, green: 0x58d858, greenDark: 0x2f8a34,
  yellow: 0xf8d858, gray: 0xa8a8a8, grayDark: 0x606068, blue: 0x5898f8,
} as const;

export const TYPE_COLOR: Record<string, number> = {
  Normal: 0xa8a878, Electric: 0xf8d030, Grass: 0x78c850, Fire: 0xf08030, Water: 0x6890f0, Psychic: 0xf85888,
};

export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export function txt(
  scene: Phaser.Scene, x: number, y: number, s: string, size = 12, color = '#ffffff',
  style: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, ...style });
  t.setResolution(2);
  return t;
}

/** Filled rect with clipped corners — the chunky pixel-bevel used by every panel. */
export function notched(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, fill: number, alpha = 1, n = 3) {
  g.fillStyle(fill, alpha);
  g.fillRect(x + n, y, w - 2 * n, h);
  g.fillRect(x, y + n, w, h - 2 * n);
}

export interface FrameOpts { fill: number; border: number; borderW?: number; alpha?: number; inner?: number }

/** Bordered pixel panel. Optional `inner` draws a second, inset ring (used for the dialog double border). */
export function drawFrame(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, o: FrameOpts) {
  const bw = o.borderW ?? 3;
  notched(g, x, y, w, h, o.border, o.alpha ?? 1, bw);
  notched(g, x + bw, y + bw, w - bw * 2, h - bw * 2, o.fill, o.alpha ?? 1, Math.max(1, bw - 1));
  if (o.inner !== undefined) {
    g.lineStyle(2, o.inner, 1);
    g.strokeRect(x + bw + 3, y + bw + 3, w - (bw + 3) * 2, h - (bw + 3) * 2);
  }
}

export function hpColor(ratio: number): number {
  return ratio > 0.5 ? 0x58d858 : ratio > 0.2 ? 0xf8d858 : 0xf85858;
}

export const delay = (scene: Phaser.Scene, ms: number) =>
  new Promise<void>((res) => { scene.time.delayedCall(ms, res); });

export function tweenP(scene: Phaser.Scene, cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
  return new Promise((res) => { scene.tweens.add({ ...cfg, onComplete: () => res() }); });
}

/** Format an 18-decimal integer string as a short decimal ("0.11"). */
export function formatToken(raw: string | undefined, dp = 4): string {
  if (!raw || !/^\d+$/.test(raw)) return '0';
  const s = raw.padStart(19, '0');
  const whole = s.slice(0, -18).replace(/^0+(?=\d)/, '');
  const frac = s.slice(-18).slice(0, dp).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

export const isTouch = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false);
