import type { BrokerMon, Move, TapScore, Affinity } from './types';
import { typeMult } from './chart';

const TAP_MULT: Record<string, number> = {
  perfect: 1.1,
  good: 1.0,
  miss: 0.85,
};

const STAGE_MULT: Record<number, number> = {
  '-6': 2 / 8, '-5': 2 / 7, '-4': 2 / 6, '-3': 2 / 5, '-2': 2 / 4, '-1': 2 / 3,
  0: 1,
  1: 3 / 2, 2: 4 / 2, 3: 5 / 2, 4: 6 / 2, 5: 7 / 2, 6: 8 / 2,
};

export interface DamageInput {
  atkLevel: number;
  atkStat: number;
  atkAffinity: Affinity;
  defStat: number;
  defStage: number;
  defAffinity: Affinity;
  move: Move;
  tapCategory: 'perfect' | 'good' | 'miss';
  stockBuff: number;
  critRoll: number;
  spreadRoll: number;
}

export interface DamageOutput {
  damage: number;
  isCrit: boolean;
  typeMultVal: number;
  tapMult: number;
}

export function computeDamage(input: DamageInput): DamageOutput;
export function computeDamage(
  atk: BrokerMon,
  def: BrokerMon,
  move: Move,
  tap: TapScore,
  stockBuff: number,
  rng?: () => number,
): number;
export function computeDamage(
  atkOrInput: DamageInput | BrokerMon,
  def?: BrokerMon,
  move?: Move,
  tap?: TapScore,
  stockBuff?: number,
  rng: () => number = () => Math.floor(Math.random() * 16),
): number | DamageOutput {
  // Legacy positional args path (used by tests)
  if ('id' in atkOrInput && def && move && tap && stockBuff !== undefined) {
    const atk = atkOrInput as BrokerMon;
    return computeDamageLegacy(atk, def, move, tap, stockBuff, rng);
  }

  // Object path (used by BattleRoom server)
  const input = atkOrInput as DamageInput;
  return computeDamageServer(input);
}

function computeDamageServer(input: DamageInput): DamageOutput {
  const { atkLevel, atkStat, atkAffinity, defStat, defStage, defAffinity,
          move, tapCategory, stockBuff, critRoll, spreadRoll } = input;

  if (move.category === 'status') {
    return { damage: 0, isCrit: false, typeMultVal: 1, tapMult: 1 };
  }

  const D = Math.max(1, Math.floor(defStat * (STAGE_MULT[defStage] ?? 1)));
  const A = move.category === 'physical' ? atkStat : atkStat;

  let base = Math.floor(Math.floor(((2 * atkLevel / 5 + 2) * move.power * A / D) / 50) + 2);

  const isCrit = critRoll === 0 || tapCategory === 'perfect';
  if (isCrit) base = Math.floor(base * 2);

  const tapMult = TAP_MULT[tapCategory];
  let dmg = Math.floor(base * tapMult);

  if (move.type === atkAffinity) dmg = Math.floor(dmg * 1.5);

  const tm = typeMult(move.type, defAffinity);
  dmg = Math.floor(dmg * tm);

  dmg = Math.floor(dmg * stockBuff);

  dmg = Math.floor(dmg * (85 + spreadRoll) / 100);

  return { damage: Math.max(1, dmg), isCrit, typeMultVal: tm, tapMult };
}

function computeDamageLegacy(
  atk: BrokerMon,
  def: BrokerMon,
  move: Move,
  tap: TapScore,
  stockBuff: number,
  rng: () => number,
): number {
  if (move.category === 'status') return 0;

  const D = Math.max(1, Math.floor(def.def * (STAGE_MULT[def.defStage] ?? 1)));
  const A = move.category === 'physical' ? atk.atk : atk.spa;

  let base = Math.floor(Math.floor(((2 * atk.level / 5 + 2) * move.power * A / D) / 50) + 2);

  const critRoll = rng();
  const isCrit = critRoll === 0 || tap.category === 'perfect';
  if (isCrit) base = Math.floor(base * 2);

  let dmg = Math.floor(base * tap.tapScore);

  if (move.type === atk.affinity) dmg = Math.floor(dmg * 1.5);

  const tm = typeMult(move.type, def.affinity);
  dmg = Math.floor(dmg * tm);

  dmg = Math.floor(dmg * stockBuff);

  const spreadRoll = rng();
  dmg = Math.floor(dmg * (85 + spreadRoll) / 100);

  return Math.max(1, dmg);
}

export function stockBuffFromPct(dailyPct: number): number {
  if (dailyPct > 2) return 1.1;
  if (dailyPct < -2) return 0.9;
  return 1.0;
}

export function accuracyCheck(accuracy: number, rng: number): boolean {
  return rng < accuracy;
}

export function missChanceFromTap(tapCategory: string): number {
  return tapCategory === 'miss' ? 0.10 : 0;
}
