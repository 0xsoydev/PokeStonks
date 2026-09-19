import Phaser from 'phaser';
import type { Affinity } from 'game-core';
import { audio } from '../audio';
import { delay, tweenP, txt, TYPE_COLOR } from './ui';
import type { Combatant } from './types';

type Pt = { x: number; y: number };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rnd = Phaser.Math.Between;

const D = 30; // effects render above sprites, below the dialog

export const centerOf = (c: Combatant): Pt => ({ x: c.sprite.x, y: c.sprite.y - c.sprite.displayHeight * 0.1 });

/** Physical lunge toward the foe and back. */
export function lunge(scene: Phaser.Scene, c: Combatant): Promise<void> {
  const dx = c.ally ? 46 : -46, dy = c.ally ? -22 : 22;
  return new Promise((res) => {
    scene.tweens.add({
      targets: c.sprite, x: c.baseX + dx, y: c.baseY + dy, duration: 110, ease: 'Cubic.easeOut', yoyo: true,
      onComplete: () => { c.sprite.setPosition(c.baseX, c.baseY); res(); },
    });
  });
}

export async function hitFlash(scene: Phaser.Scene, sprite: Phaser.GameObjects.Image): Promise<void> {
  for (let i = 0; i < 3; i++) {
    sprite.setTintFill(0xffffff);
    await delay(scene, 45);
    sprite.clearTint();
    await delay(scene, 40);
  }
}

export const hitStop = (scene: Phaser.Scene, ms = 80) => delay(scene, ms);

export function shake(scene: Phaser.Scene, mult: number, crit: boolean) {
  const strong = crit || mult > 1;
  scene.cameras.main.shake(strong ? 240 : 140, strong ? 0.011 : 0.005);
}

/** Squash on impact, returns to base scale. */
export function squash(scene: Phaser.Scene, c: Combatant) {
  scene.tweens.add({
    targets: c.sprite, scaleX: c.baseScale * 1.14, scaleY: c.baseScale * 0.86, duration: 70, yoyo: true, ease: 'Sine.easeOut',
    onComplete: () => c.sprite.setScale(c.baseScale),
  });
}

export function damageNumber(scene: Phaser.Scene, at: Pt, dmg: number, crit: boolean, mult: number) {
  if (dmg <= 0) return;
  const color = crit ? '#ffd23c' : mult > 1 ? '#ff8a3c' : mult < 1 ? '#a8a8c0' : '#ffffff';
  const t = txt(scene, at.x, at.y - 20, `-${dmg}`, crit ? 30 : 22, color, { stroke: '#181818', strokeThickness: 6 }).setOrigin(0.5).setDepth(D + 5);
  t.setScale(0.5);
  scene.tweens.add({ targets: t, scale: crit ? 1.3 : 1, duration: 140, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: t, y: t.y - 64, alpha: 0, delay: 420, duration: 480, ease: 'Sine.easeIn', onComplete: () => t.destroy() });
}

export function critBurst(scene: Phaser.Scene, at: Pt) {
  audio.sfx('crit');
  scene.cameras.main.flash(90, 255, 244, 190);
  for (let i = 0; i < 10; i++) {
    const s = scene.add.star(at.x, at.y, 4, 3, 9, 0xffd23c).setDepth(D + 4);
    const a = (i / 10) * Math.PI * 2, r = rnd(56, 96);
    scene.tweens.add({ targets: s, x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r, alpha: 0, angle: 180, scale: 0.3, duration: 480, ease: 'Cubic.easeOut', onComplete: () => s.destroy() });
  }
}

export async function faint(scene: Phaser.Scene, c: Combatant): Promise<void> {
  audio.sfx('faint');
  scene.tweens.add({ targets: c.shadow, alpha: 0, duration: 500 });
  await tweenP(scene, { targets: c.sprite, y: c.baseY + 70, alpha: 0, scaleY: c.baseScale * 0.3, duration: 620, ease: 'Sine.easeIn' });
  c.sprite.setVisible(false);
}

export function statArrows(scene: Phaser.Scene, c: Combatant, up: boolean): Promise<void> {
  audio.sfx(up ? 'stat_up' : 'stat_down');
  const at = centerOf(c);
  const color = up ? '#58d858' : '#f85858';
  for (let i = 0; i < 4; i++) {
    const a = txt(scene, at.x + (i - 1.5) * 34, at.y + (up ? 44 : -44), up ? '▲' : '▼', 22, color, { stroke: '#181818', strokeThickness: 4 }).setOrigin(0.5).setDepth(D + 3).setAlpha(0);
    scene.tweens.add({
      targets: a, alpha: { from: 0, to: 1 }, y: a.y + (up ? -70 : 70), delay: i * 90, duration: 560, ease: 'Sine.easeOut',
      onComplete: () => scene.tweens.add({ targets: a, alpha: 0, duration: 200, onComplete: () => a.destroy() }),
    });
  }
  if (up) scene.tweens.add({ targets: c.sprite, y: c.baseY - 10, duration: 160, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' });
  else scene.tweens.add({ targets: c.sprite, x: c.baseX + 8, duration: 60, yoyo: true, repeat: 3 });
  return delay(scene, 780);
}

function impactStar(scene: Phaser.Scene, at: Pt, color: number, size = 1) {
  const s = scene.add.star(at.x, at.y, 8, 10 * size, 34 * size, color).setDepth(D + 2).setAlpha(0.95);
  scene.tweens.add({ targets: s, scale: { from: 0.3, to: 1.4 }, alpha: 0, angle: 45, duration: 300, ease: 'Cubic.easeOut', onComplete: () => s.destroy() });
}

function ring(scene: Phaser.Scene, at: Pt, color: number, from = 8, to = 90, ms = 420, delayMs = 0) {
  const r = scene.add.circle(at.x, at.y, from).setDepth(D + 1).setStrokeStyle(5, color, 1).setFillStyle(color, 0.12);
  scene.tweens.add({ targets: r, radius: to, alpha: 0, delay: delayMs, duration: ms, ease: 'Cubic.easeOut', onComplete: () => r.destroy() });
}

function projectiles(
  scene: Phaser.Scene, from: Pt, to: Pt, n: number, make: (i: number) => Phaser.GameObjects.Shape,
  opts: { lift: number; dur: number; stagger: number; spread?: number },
): Promise<void> {
  return new Promise((res) => {
    let done = 0;
    for (let i = 0; i < n; i++) {
      const o = make(i).setDepth(D);
      const jx = rnd(-(opts.spread ?? 14), opts.spread ?? 14), jy = rnd(-(opts.spread ?? 14), opts.spread ?? 14);
      const ctr = { t: 0 };
      scene.tweens.add({
        targets: ctr, t: 1, delay: i * opts.stagger, duration: opts.dur, ease: 'Sine.easeIn',
        onStart: () => o.setPosition(from.x, from.y),
        onUpdate: () => o.setPosition(lerp(from.x, to.x + jx, ctr.t), lerp(from.y, to.y + jy, ctr.t) - Math.sin(Math.PI * ctr.t) * opts.lift),
        onComplete: () => { o.destroy(); if (++done === n) res(); },
      });
    }
  });
}

function bolt(scene: Phaser.Scene, from: Pt, to: Pt) {
  const g = scene.add.graphics().setDepth(D + 2);
  const pts: Pt[] = [from];
  const N = 9;
  for (let i = 1; i < N; i++) pts.push({ x: lerp(from.x, to.x, i / N) + rnd(-26, 26), y: lerp(from.y, to.y, i / N) + rnd(-26, 26) });
  pts.push(to);
  const stroke = (w: number, c: number) => { g.lineStyle(w, c, 1); g.beginPath(); g.moveTo(pts[0].x, pts[0].y); pts.slice(1).forEach((p) => g.lineTo(p.x, p.y)); g.strokePath(); };
  stroke(10, 0xf8d030); stroke(4, 0xffffff);
  scene.tweens.add({ targets: g, alpha: 0, duration: 110, onComplete: () => g.destroy() });
}

/**
 * Type-specific attack animation from `from` to `to`. Every type reads differently at a glance:
 * lightning arcs, ember volleys, water arcs, leaf spirals, psychic ripples, plain impact stars.
 */
export async function castType(scene: Phaser.Scene, type: Affinity, from: Pt, to: Pt): Promise<void> {
  const col = TYPE_COLOR[type] ?? 0xffffff;
  switch (type) {
    case 'Electric': {
      scene.cameras.main.flash(70, 255, 240, 120);
      for (let i = 0; i < 4; i++) { bolt(scene, from, to); await delay(scene, 85); }
      impactStar(scene, to, 0xfff0a0, 1.2);
      break;
    }
    case 'Fire': {
      await projectiles(scene, from, to, 12, (i) => scene.add.circle(0, 0, rnd(6, 11), [0xf04020, 0xf08030, 0xffd050][i % 3]), { lift: 60, dur: 330, stagger: 30 });
      for (let i = 0; i < 14; i++) {
        const p = scene.add.circle(to.x, to.y, rnd(5, 10), [0xf04020, 0xf08030, 0xffd050][i % 3]).setDepth(D + 1);
        const a = (i / 14) * Math.PI * 2, r = rnd(40, 90);
        scene.tweens.add({ targets: p, x: to.x + Math.cos(a) * r, y: to.y + Math.sin(a) * r - 20, alpha: 0, scale: 0.2, duration: 420, ease: 'Cubic.easeOut', onComplete: () => p.destroy() });
      }
      ring(scene, to, 0xf08030, 10, 80, 380);
      break;
    }
    case 'Water': {
      await projectiles(scene, from, to, 12, () => scene.add.circle(0, 0, rnd(5, 9), 0x6890f0).setStrokeStyle(2, 0xdfeaff), { lift: 90, dur: 360, stagger: 32 });
      ring(scene, to, 0x9fbfff, 8, 96, 460);
      ring(scene, to, 0x6890f0, 8, 60, 380, 90);
      break;
    }
    case 'Grass': {
      await projectiles(scene, from, to, 9, (i) => scene.add.rectangle(0, 0, 16, 7, i % 2 ? 0x78c850 : 0x4aa838).setAngle(rnd(0, 180)), { lift: 50, dur: 360, stagger: 45, spread: 22 });
      for (let i = 0; i < 8; i++) {
        const l = scene.add.rectangle(to.x, to.y, 12, 6, 0x78c850).setDepth(D + 1).setAngle(rnd(0, 180));
        scene.tweens.add({ targets: l, x: to.x + rnd(-60, 60), y: to.y + rnd(-50, 50), angle: l.angle + 200, alpha: 0, duration: 420, onComplete: () => l.destroy() });
      }
      break;
    }
    case 'Psychic': {
      scene.cameras.main.flash(120, 248, 88, 140);
      ring(scene, to, 0xf85888, 6, 110, 520);
      ring(scene, to, 0xffb3cc, 6, 150, 620, 120);
      ring(scene, to, 0xf85888, 6, 190, 720, 240);
      await delay(scene, 520);
      break;
    }
    default: {
      impactStar(scene, to, 0xffffff, 1);
      impactStar(scene, to, col, 0.7);
      await delay(scene, 200);
    }
  }
}
