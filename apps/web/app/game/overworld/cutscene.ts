import type Phaser from 'phaser';
import { getSpecies } from 'game-core';
import { audio } from '../audio';

/**
 * Encounter transition + VS screen. Everything is built from scene-local Phaser objects driven by
 * tweens/delayedCalls on the scene's own clock (no setTimeout), tracked per scene so that
 * `clearCutscene` can tear it all down and a scene shutdown mid-way cancels cleanly.
 *
 * The scene's main camera must be an unzoomed 960x640 view (OverworldScene keeps its zoomed world on a
 * separate camera), so scrollFactor-0 objects here always land in screen space.
 */

export const COVER_DEPTH = 10_000;
export type CutsceneKind = 'wild' | 'trainer';

const FONT = '"Press Start 2P"';
const NAVY = 0x183088, GOLD = 0xd8a830;

class Cut {
  objs: Phaser.GameObjects.GameObject[] = [];
  tweens = new Set<Phaser.Tweens.Tween>();
  waits = new Set<() => void>();
  cover: Phaser.GameObjects.Rectangle | null = null;
  dead = false;
  constructor(readonly scene: Phaser.Scene) {}

  own<T extends Phaser.GameObjects.GameObject>(o: T): T { this.objs.push(o); return o; }

  /** Stop tweens and release everything that is awaiting one. Objects stay until clear(). */
  cancel() {
    this.dead = true;
    for (const t of this.tweens) { try { t.stop(); } catch { /* scene already gone */ } }
    this.tweens.clear();
    const waits = [...this.waits];
    this.waits.clear();
    waits.forEach((w) => w());
  }

  clear() {
    this.cancel();
    for (const o of this.objs) { try { o.destroy(); } catch { /* already destroyed */ } }
    this.objs = [];
    this.cover = null;
  }

  tween(cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((res) => {
      if (this.dead) return res();
      const t = this.scene.tweens.add({
        ...cfg,
        onComplete: () => { this.tweens.delete(t); this.waits.delete(res); res(); },
      });
      this.tweens.add(t);
      this.waits.add(res);
    });
  }

  wait(ms: number): Promise<void> {
    return new Promise((res) => {
      if (this.dead) return res();
      const ev = this.scene.time.delayedCall(ms, () => { this.waits.delete(res); res(); });
      this.waits.add(() => { ev.remove(false); res(); });
    });
  }
}

const cuts = new WeakMap<Phaser.Scene, Cut>();

function cutFor(scene: Phaser.Scene): Cut {
  let c = cuts.get(scene);
  if (!c || c.dead) {
    c?.clear();
    c = new Cut(scene);
    cuts.set(scene, c);
    const kill = () => { const cur = cuts.get(scene); if (cur) { cur.clear(); cuts.delete(scene); } };
    scene.events.once('shutdown', kill);
    scene.events.once('destroy', kill);
  }
  return c;
}

const viewSize = (scene: Phaser.Scene) => ({ w: scene.cameras.main.width, h: scene.cameras.main.height });

function ensureCover(cut: Cut): Phaser.GameObjects.Rectangle {
  if (cut.cover && cut.cover.active) return cut.cover;
  const { w, h } = viewSize(cut.scene);
  const cover = cut.own(cut.scene.add.rectangle(w / 2, h / 2, w + 8, h + 8, 0x000000, 1)).setScrollFactor(0).setDepth(COVER_DEPTH);
  cut.cover = cover;
  return cover;
}

const hexNum = (css: string) => parseInt(css.replace('#', ''), 16);
const shadeNum = (n: number, k: number) => {
  const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
  return (Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b);
};

/**
 * 3 white flashes then a bold diagonal-bar wipe to black (~1.3s). Leaves a full-screen black cover
 * (depth 10_000, scrollFactor 0) in place; call clearCutscene() once the next scene is on screen.
 */
export async function playEncounterIntro(scene: Phaser.Scene, opts: { kind: CutsceneKind }): Promise<void> {
  const cut = cutFor(scene);
  scene.input.enabled = false;
  const { w, h } = viewSize(scene);
  const accent = opts.kind === 'trainer' ? GOLD : 0xffffff;

  // The overworld plays the encounter sting itself the moment a grass/trainer trigger fires (and stamps
  // the registry); anything else that starts an encounter (a friend duel) gets it from here.
  const stamped = scene.registry.get('encounterSfxAt') as number | undefined;
  if (!stamped || Date.now() - stamped > 2500) audio.sfx('encounter');

  // 1) classic triple flash
  const flash = cut.own(scene.add.rectangle(w / 2, h / 2, w + 8, h + 8, 0xffffff, 0)).setScrollFactor(0).setDepth(COVER_DEPTH - 1);
  for (let i = 0; i < 3; i++) {
    await cut.tween({ targets: flash, alpha: { from: 0, to: 1 }, duration: 40, yoyo: true, ease: 'Sine.easeOut' });
    if (cut.dead) return;
  }
  flash.destroy();
  await cut.wait(110);
  if (cut.dead) return;

  // 2) diagonal bars: slanted parallelograms sweep in alternately from the top and the bottom
  const bars = cut.own(scene.add.graphics()).setScrollFactor(0).setDepth(COVER_DEPTH);
  const skew = h * 0.6;
  const barW = 80;
  const n = Math.ceil((w + skew) / barW) + 1;
  const draw = (t: number) => {
    bars.clear();
    for (let i = 0; i < n; i++) {
      const p = Math.max(0, Math.min(1, t * 1.6 - (i / n) * 0.6));
      if (p <= 0) continue;
      const e = 1 - Math.pow(1 - p, 3);
      const x0 = -skew + i * barW;
      const down = (i & 1) === 0;
      const a = down ? 0 : h * (1 - e), b = down ? h * e : h;
      const xa = x0 + (a / h) * skew, xb = x0 + (b / h) * skew;
      // a hair wider than the pitch so neighbouring bars overlap: no seams when fully in
      bars.fillStyle(0x000000, 1);
      bars.beginPath();
      bars.moveTo(xa, a); bars.lineTo(xa + barW + 2, a); bars.lineTo(xb + barW + 2, b); bars.lineTo(xb, b);
      bars.closePath(); bars.fillPath();
      if (e < 1) {
        // bright leading edge
        bars.lineStyle(4, accent, 1);
        bars.beginPath();
        if (down) { bars.moveTo(xb, b); bars.lineTo(xb + barW + 2, b); } else { bars.moveTo(xa, a); bars.lineTo(xa + barW + 2, a); }
        bars.strokePath();
      }
    }
  };
  const driver = { t: 0 };
  await cut.tween({ targets: driver, t: 1, duration: 620, ease: 'Sine.easeIn', onUpdate: () => draw(driver.t) });
  if (cut.dead) return;
  ensureCover(cut);
  bars.destroy();
  await cut.wait(260);
}

export interface VersusSide { speciesId: string; name: string }
export interface VersusFoe extends VersusSide { isBot: boolean }

function panel(g: Phaser.GameObjects.Graphics, color: number, side: 'left' | 'right', w: number, h: number) {
  const slant = w * 0.16;
  const edgeTop = side === 'left' ? w * 0.585 : w * 0.615;
  const edgeBot = edgeTop - slant;
  g.fillStyle(shadeNum(color, 0.62), 1);
  g.beginPath();
  if (side === 'left') { g.moveTo(0, 0); g.lineTo(edgeTop, 0); g.lineTo(edgeBot, h); g.lineTo(0, h); }
  else { g.moveTo(edgeTop, 0); g.lineTo(w, 0); g.lineTo(w, h); g.lineTo(edgeBot, h); }
  g.closePath(); g.fillPath();
  // parallel light stripes (they share the panel's slant, so they stay inside it)
  g.fillStyle(shadeNum(color, 0.86), 1);
  const step = 46;
  for (let k = 0; k < 14; k++) {
    const a = side === 'left' ? edgeTop - 30 - k * step : edgeTop + 22 + k * step;
    const b = a + 14;
    if ((side === 'left' && a < -slant) || (side === 'right' && a > w)) break;
    g.beginPath();
    g.moveTo(a, 0); g.lineTo(b, 0); g.lineTo(b - slant, h); g.lineTo(a - slant, h);
    g.closePath(); g.fillPath();
  }
  // inner glow toward the split, then a crisp bright edge
  g.fillStyle(color, 1);
  g.beginPath();
  if (side === 'left') { g.moveTo(edgeTop - 46, 0); g.lineTo(edgeTop, 0); g.lineTo(edgeBot, h); g.lineTo(edgeBot - 46, h); }
  else { g.moveTo(edgeTop, 0); g.lineTo(edgeTop + 46, 0); g.lineTo(edgeBot + 46, h); g.lineTo(edgeBot, h); }
  g.closePath(); g.fillPath();
  g.lineStyle(6, 0xffffff, 1);
  g.beginPath(); g.moveTo(edgeTop, 0); g.lineTo(edgeBot, h); g.strokePath();
}

function plate(cut: Cut, x: number, y: number, title: string, sub: string, subColor: string): Phaser.GameObjects.Container {
  const scene = cut.scene;
  const bw = 330, bh = 84;
  const box = scene.add.graphics();
  box.fillStyle(GOLD, 1); box.fillRect(-bw / 2 - 6, -bh / 2 - 6, bw + 12, bh + 12);
  box.fillStyle(0xffffff, 1); box.fillRect(-bw / 2 - 3, -bh / 2 - 3, bw + 6, bh + 6);
  box.fillStyle(NAVY, 1); box.fillRect(-bw / 2, -bh / 2, bw, bh);
  const t = scene.add.text(0, -14, title.toUpperCase(), { fontFamily: FONT, fontSize: '20px', color: '#ffffff' }).setOrigin(0.5);
  const s = scene.add.text(0, 20, sub, { fontFamily: FONT, fontSize: '11px', color: subColor }).setOrigin(0.5);
  const c = scene.add.container(x, y, [box, t, s]).setScrollFactor(0).setDepth(COVER_DEPTH + 5);
  return cut.own(c);
}

/**
 * VS screen on the black cover: two tinted diagonal panels, both front sprites sliding in, name plates,
 * and a gold "VS" that slams in with a shake. ~1.4s, leaves everything up until clearCutscene().
 */
export async function playVersus(
  scene: Phaser.Scene, me: VersusSide, foe: VersusFoe, opts: { kind: CutsceneKind },
): Promise<void> {
  const cut = cutFor(scene);
  const { w, h } = viewSize(scene);
  ensureCover(cut);

  const myCol = hexNum(getSpecies(me.speciesId).colors[0]);
  const foeCol = hexNum(getSpecies(foe.speciesId).colors[0]);

  const left = cut.own(scene.add.graphics()).setScrollFactor(0).setDepth(COVER_DEPTH + 1);
  const right = cut.own(scene.add.graphics()).setScrollFactor(0).setDepth(COVER_DEPTH + 1);
  panel(left, myCol, 'left', w, h);
  panel(right, foeCol, 'right', w, h);
  left.x = -w; right.x = w;

  const mk = (id: string, x: number, from: number): Phaser.GameObjects.GameObject[] => {
    const key = `mon_${id}_front`;
    const out: Phaser.GameObjects.GameObject[] = [];
    if (scene.textures.exists('shadow_blob')) {
      out.push(cut.own(scene.add.image(x + from, h * 0.5 + 118, 'shadow_blob').setScale(5.4, 4.6).setAlpha(0.7).setScrollFactor(0).setDepth(COVER_DEPTH + 2)));
    }
    if (scene.textures.exists(key)) {
      out.push(cut.own(scene.add.image(x + from, h * 0.5 - 6, key).setScale(2.2).setScrollFactor(0).setDepth(COVER_DEPTH + 3)));
    }
    return out;
  };
  const myX = w * 0.25, foeX = w * 0.75;
  const mySprites = mk(me.speciesId, myX, -w);
  const foeSprites = mk(foe.speciesId, foeX, w);

  const foeTag = foe.isBot ? (opts.kind === 'trainer' ? 'TRAINER' : 'WILD') : 'RIVAL BROKER';
  const myPlate = plate(cut, myX - w * 0.02, h - 92, me.name, 'YOU', '#f8d858');
  const foePlate = plate(cut, foeX + w * 0.02, h - 92, foe.name, foeTag, '#ffb0b0');
  myPlate.x -= w; foePlate.x += w;

  audio.sfx('menu_select');
  const slide = (targets: unknown, dx: number, dur: number, delay: number, ease: string) =>
    cut.tween({ targets: targets as never, x: `+=${dx}`, duration: dur, delay, ease });

  await Promise.all([
    slide(left, w, 300, 0, 'Cubic.easeOut'), slide(right, -w, 300, 0, 'Cubic.easeOut'),
    slide(mySprites, w, 380, 90, 'Back.easeOut'), slide(foeSprites, -w, 380, 90, 'Back.easeOut'),
    slide(myPlate, w, 340, 260, 'Cubic.easeOut'), slide(foePlate, -w, 340, 260, 'Cubic.easeOut'),
  ]);
  if (cut.dead) return;
  await cut.wait(80);
  if (cut.dead) return;

  // the slam
  const vs = cut.own(scene.add.text(w / 2, h / 2 - 14, 'VS', {
    fontFamily: FONT, fontSize: '96px', color: '#f8d858', stroke: '#181818', strokeThickness: 14,
  }).setOrigin(0.5).setScrollFactor(0).setDepth(COVER_DEPTH + 8).setScale(4).setAlpha(0));
  const flash = cut.own(scene.add.rectangle(w / 2, h / 2, w + 8, h + 8, 0xffffff, 0)).setScrollFactor(0).setDepth(COVER_DEPTH + 7);
  vs.setAlpha(1);
  await cut.tween({ targets: vs, scale: 1, duration: 170, ease: 'Cubic.easeIn' });
  if (cut.dead) return;
  audio.sfx('hit');
  scene.cameras.main.shake(260, 0.014);
  flash.setAlpha(0.7);
  void cut.tween({ targets: flash, alpha: 0, duration: 200, ease: 'Sine.easeOut' });
  // spark burst
  if (scene.textures.exists('spark')) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const s = cut.own(scene.add.image(w / 2, h / 2 - 14, 'spark').setScrollFactor(0).setDepth(COVER_DEPTH + 9).setScale(2 + (i & 1)).setTint(i & 1 ? 0xffffff : GOLD));
      void cut.tween({ targets: s, x: w / 2 + Math.cos(a) * 240, y: h / 2 - 14 + Math.sin(a) * 160, alpha: 0, scale: 0.4, duration: 460, ease: 'Cubic.easeOut' });
    }
  }
  // gentle idle bob while it holds
  for (const o of [...mySprites, ...foeSprites]) {
    if ((o as Phaser.GameObjects.Image).texture?.key === 'shadow_blob') continue;
    void cut.tween({ targets: o, y: '-=6', duration: 380, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' });
  }
  await cut.wait(620);
}

/** Destroy every cover/object created by the functions above. Safe to call any time. */
export function clearCutscene(scene: Phaser.Scene): void {
  const cut = cuts.get(scene);
  if (!cut) return;
  cut.clear();
  cuts.delete(scene);
}
