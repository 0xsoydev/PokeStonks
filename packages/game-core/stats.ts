import type { BrokerMon, Stages, StatKey } from './types';
import { getMove } from './moves';
import { getSpecies } from './species';

export const DEFAULT_LEVEL = 50;
export const MIN_LEVEL = 5;
export const MAX_LEVEL = 100;
/** Fixed IV for every mon: no hidden stat variance, both sides are strictly symmetric. */
export const IV = 15;

export function clampLevel(level: unknown): number {
  const n = typeof level === 'number' && Number.isFinite(level) ? Math.floor(level) : DEFAULT_LEVEL;
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, n));
}

/** Gen-3 stat formula (no EVs, neutral nature). */
export function calcStat(base: number, level: number): number {
  return Math.floor(((2 * base + IV) * level) / 100) + 5;
}

/**
 * Pacing constant for 1v1. Mainline matches are 6v6 (~15 turns total); ours is a single mon a side,
 * so HP is scaled to land a typical fight around 6-8 turns. The damage formula stays canonical,
 * so type matchups, STAB, crits and stages all mean exactly what they do in the games.
 */
export const HP_SCALE = 2.6;

/** Gen-3 HP formula exactly as in the mainline games (before pacing). */
export function calcHpCanonical(base: number, level: number): number {
  return Math.floor(((2 * base + IV) * level) / 100) + level + 10;
}

/** Battle HP: canonical Gen-3 HP times the 1v1 pacing scale. */
export function calcHp(base: number, level: number): number {
  return Math.floor(calcHpCanonical(base, level) * HP_SCALE);
}

export function freshStages(): Stages {
  return { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
}

export const STAGE_MIN = -6;
export const STAGE_MAX = 6;

export function clampStage(n: number): number {
  return Math.max(STAGE_MIN, Math.min(STAGE_MAX, n));
}

/** Gen-3 stat stage multipliers: (2+n)/2 for n>=0, 2/(2-n) for n<0. */
export function stageMultiplier(stage: number): number {
  const s = clampStage(stage);
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
}

export function applyStage(stat: number, stage: number): number {
  return Math.max(1, Math.floor(stat * stageMultiplier(stage)));
}

/** Effective speed for turn order. */
export function effectiveSpeed(mon: Pick<BrokerMon, 'spe' | 'stages'>): number {
  return applyStage(mon.spe, mon.stages.spe);
}

/** Build a battle-ready mon from a species + level. The ONLY way mons enter a battle. */
export function buildMon(speciesId: string, level: number = DEFAULT_LEVEL): BrokerMon {
  const sp = getSpecies(speciesId);
  const lv = clampLevel(level);
  const maxHp = calcHp(sp.base.hp, lv);
  const pp: Record<string, number> = {};
  for (const id of sp.learnset) pp[id] = getMove(id).pp;
  return {
    speciesId: sp.id,
    name: sp.name,
    affinity: sp.affinity,
    level: lv,
    hp: maxHp,
    maxHp,
    atk: calcStat(sp.base.atk, lv),
    def: calcStat(sp.base.def, lv),
    spa: calcStat(sp.base.spa, lv),
    spd: calcStat(sp.base.spd, lv),
    spe: calcStat(sp.base.spe, lv),
    stages: freshStages(),
    moves: [...sp.learnset],
    pp,
  };
}

export const STAT_LABEL: Record<StatKey, string> = {
  atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed',
};
