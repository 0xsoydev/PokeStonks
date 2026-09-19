import { type SeatKey, type TapCategory, getMove, computeDamage, STRUGGLE } from 'game-core';
import type { BattleEngine, Choice } from './battle.ts';
import type { Rng } from './rng.ts';
import { other } from './battle.ts';

/**
 * Broker AI. Scores each legal move by expected damage as a fraction of the foe's remaining HP,
 * values setup moves while healthy, then mostly plays the best move with some variety so a bot
 * fight doesn't feel scripted. Uses only the engine's public state — no privileged info.
 */
export function chooseBotMove(engine: BattleEngine, key: SeatKey, rng: Rng): Choice {
  const me = engine.seats[key];
  const foe = engine.seats[other(key)];
  const legal = engine.legalMoveIds(key);

  const scored = legal.map((id) => {
    const mv = getMove(id);
    let score: number;
    if (mv.category === 'status') {
      const meHealthy = me.mon.hp / me.mon.maxHp > 0.55;
      const first = (mv.effects ?? []).every((e) => {
        const holder = e.target === 'self' ? me : foe;
        return e.stages > 0 ? holder.mon.stages[e.stat] < 2 : holder.mon.stages[e.stat] > -2;
      });
      score = meHealthy && first ? 0.32 : 0.02;
    } else {
      const physical = mv.category === 'physical';
      const d = computeDamage({
        level: me.mon.level,
        atkStat: physical ? me.mon.atk : me.mon.spa,
        atkStage: physical ? me.mon.stages.atk : me.mon.stages.spa,
        atkAffinity: me.mon.affinity,
        defStat: physical ? foe.mon.def : foe.mon.spd,
        defStage: physical ? foe.mon.stages.def : foe.mon.stages.spd,
        defAffinity: foe.mon.affinity,
        move: mv, tap: 'good', stockBuff: me.buff, critRoll: 1, spreadRoll: 8,
      }).damage;
      score = (Math.min(d, foe.mon.hp) / Math.max(1, foe.mon.hp)) * (mv.accuracy / 100);
      if (d >= foe.mon.hp) score += 1; // a guaranteed-ish finisher always wins
      if (mv.priority > 0 && foe.mon.hp <= d) score += 0.5;
    }
    return { id, score };
  }).sort((a, b) => b.score - a.score);

  let pick = scored[0].id;
  if (scored.length > 1 && rng.int(100) < 25) {
    pick = scored[Math.min(scored.length - 1, 1 + rng.int(Math.min(2, scored.length - 1)))].id;
  }
  if (!engine.isLegal(key, pick)) pick = legal[0] ?? STRUGGLE.id;

  const r = rng.int(100);
  const tap: TapCategory = r < 18 ? 'perfect' : r < 82 ? 'good' : 'miss';
  return { moveId: pick, tap };
}
