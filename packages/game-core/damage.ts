import type { Affinity, Move, TapCategory } from './types';
import { typeMult } from './chart';
import { applyStage } from './stats';

export const TAP_MULT: Record<TapCategory, number> = {
  perfect: 1.1,
  good: 1.0,
  miss: 0.85,
};

/** Extra chance (percent) that a Miss-zone tap makes the move whiff outright. */
export const TAP_MISS_EXTRA_PCT = 10;

export interface DamageInput {
  level: number;
  /** Raw (un-staged) offensive stat: Atk for physical, SpA for special. */
  atkStat: number;
  atkStage: number;
  atkAffinity: Affinity;
  /** Raw (un-staged) defensive stat: Def for physical, SpD for special. */
  defStat: number;
  defStage: number;
  defAffinity: Affinity;
  move: Move;
  tap: TapCategory;
  /** Ticker mood multiplier from the live Pyth price: 0.9 | 1.0 | 1.1. */
  stockBuff: number;
  /** Server RNG 0..15. 0 = critical hit (6.25%). */
  critRoll: number;
  /** Server RNG 0..15. Random spread 85..100%. */
  spreadRoll: number;
}

export interface DamageOutput {
  damage: number;
  isCrit: boolean;
  typeMultVal: number;
  tapMult: number;
}

/**
 * Gen-3 damage:
 *   base = floor(floor(floor(2L/5+2) * P * A / D) / 50) + 2
 *   crit x2 (ignores the attacker's negative and defender's positive stages)
 *   then tap, STAB 1.5, type chart, stock buff, 85-100% spread — each floored.
 * A Perfect tap forces the crit. Pure and deterministic given the two rolls.
 */
export function computeDamage(i: DamageInput): DamageOutput {
  if (i.move.category === 'status' || i.move.power <= 0) {
    return { damage: 0, isCrit: false, typeMultVal: 1, tapMult: 1 };
  }

  const isCrit = i.critRoll === 0 || i.tap === 'perfect';
  const atkStage = isCrit ? Math.max(0, i.atkStage) : i.atkStage;
  const defStage = isCrit ? Math.min(0, i.defStage) : i.defStage;

  const A = applyStage(i.atkStat, atkStage);
  const D = applyStage(i.defStat, defStage);

  const levelTerm = Math.floor((2 * i.level) / 5) + 2;
  let dmg = Math.floor(Math.floor((levelTerm * i.move.power * A) / D) / 50) + 2;

  if (isCrit) dmg = dmg * 2;

  const tapMult = TAP_MULT[i.tap];
  dmg = Math.floor(dmg * tapMult);
  if (i.move.type === i.atkAffinity) dmg = Math.floor(dmg * 1.5);
  const tm = typeMult(i.move.type, i.defAffinity);
  dmg = Math.floor(dmg * tm);
  dmg = Math.floor(dmg * i.stockBuff);
  dmg = Math.floor((dmg * (85 + i.spreadRoll)) / 100);

  return { damage: Math.max(1, dmg), isCrit, typeMultVal: tm, tapMult };
}

/** roll is 0..99. */
export function accuracyCheck(accuracy: number, roll: number): boolean {
  return roll < accuracy;
}
