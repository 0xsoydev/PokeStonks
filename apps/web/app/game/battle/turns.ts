import * as Phaser from 'phaser';
import { getMove, type SeatKey, type TurnEvent } from 'game-core';
import { audio } from '../audio';
import type { DialogBox } from './dialog';
import type { Combatant } from './types';
import * as fx from './fx';
import { delay } from './ui';

export interface TurnCtx {
  scene: Phaser.Scene;
  combatants: Record<SeatKey, Combatant>;
  dialog: DialogBox;
}

const other = (k: SeatKey): SeatKey => (k === 'A' ? 'B' : 'A');

/**
 * Plays one resolved turn, event by event, awaiting each animation before the next. The server sends
 * the SAME ordered list to both players, and this is the only consumer, so both screens show an
 * identical sequence regardless of packet timing.
 */
export async function playTurn(ctx: TurnCtx, events: TurnEvent[]): Promise<void> {
  for (const ev of events) await playEvent(ctx, ev);
}

async function playEvent(ctx: TurnCtx, ev: TurnEvent): Promise<void> {
  const { scene, dialog } = ctx;
  const actor = ctx.combatants[ev.by];
  const target = ctx.combatants[other(ev.by)];
  const move = getMove(ev.move);
  const lines = ev.msg.split('\n').filter(Boolean);
  const rest = lines.slice(1);

  await dialog.say(lines[0] ?? '', { holdMs: 380 });

  if (move.category === 'status') {
    if (ev.fx === 'miss') {
      audio.sfx('miss');
      await dialog.say(rest[0] ?? '', { holdMs: 650 });
      return;
    }
    for (const s of ev.stats ?? []) {
      const c = ctx.combatants[s.target];
      await fx.statArrows(scene, c, s.stages > 0);
      c.plate.setStages(stagesAfter(c, s.stat, s.now));
    }
    for (const l of rest) await dialog.say(l, { holdMs: 620 });
    return;
  }

  // Damaging move.
  const from = fx.centerOf(actor), to = fx.centerOf(target);
  if (move.type === 'Normal') { audio.sfx('miss'); await fx.lunge(scene, actor); }
  else { await Promise.all([fx.castType(scene, move.type, from, to), delay(scene, 60)]); }

  if (ev.fx === 'miss') {
    audio.sfx('miss');
    scene.tweens.add({ targets: target.sprite, x: target.baseX + (target.ally ? -40 : 40), duration: 140, yoyo: true, ease: 'Sine.easeOut' });
    await dialog.say(rest[0] ?? '', { holdMs: 650 });
    return;
  }

  // Impact.
  audio.sfx(ev.typeMult > 1 ? 'hit_super' : ev.typeMult < 1 ? 'hit_resist' : 'hit');
  fx.shake(scene, ev.typeMult, ev.crit);
  fx.squash(scene, target);
  fx.damageNumber(scene, to, ev.dmg, ev.crit, ev.typeMult);
  if (ev.crit) fx.critBurst(scene, to);
  const hp = target.plate.setHp(ev.hp[target.seat], true);
  await fx.hitFlash(scene, target.sprite);
  await fx.hitStop(scene, 60);
  await hp;
  if (ev.fx === 'recoil') await actor.plate.setHp(ev.hp[actor.seat], true);

  for (const l of rest) {
    if (/fainted!$/.test(l)) await fx.faint(scene, target);
    await dialog.say(l, { holdMs: /fainted!$/.test(l) ? 900 : 620 });
  }
}

/** Local mirror of a combatant's stages so the plate chips stay correct between snapshots. */
const localStages = new WeakMap<Combatant, Record<string, number>>();
function stagesAfter(c: Combatant, stat: string, now: number) {
  const cur = localStages.get(c) ?? { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  cur[stat] = now;
  localStages.set(c, cur);
  return cur as Record<'atk' | 'def' | 'spa' | 'spd' | 'spe', number>;
}
export function resetStages(c: Combatant, st: Record<string, number>) { localStages.set(c, { ...st }); }
