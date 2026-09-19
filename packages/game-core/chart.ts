import type { Affinity } from './types';

/**
 * Gen-3 type chart restricted to our six types.
 * Row = attacking type, column = defending type. Matches the mainline games:
 *  - Fire beats Grass, resisted by Fire/Water
 *  - Water beats Fire, resisted by Water/Grass
 *  - Grass beats Water, resisted by Grass/Fire
 *  - Electric beats Water, resisted by Electric/Grass
 *  - Psychic is resisted only by Psychic (no Fighting/Poison in this roster)
 *  - Normal is neutral to everything here
 */
const CHART: Record<Affinity, Record<Affinity, number>> = {
  Normal:   { Normal: 1, Electric: 1,   Grass: 1,   Fire: 1,   Water: 1,   Psychic: 1 },
  Electric: { Normal: 1, Electric: 0.5, Grass: 0.5, Fire: 1,   Water: 2,   Psychic: 1 },
  Grass:    { Normal: 1, Electric: 1,   Grass: 0.5, Fire: 0.5, Water: 2,   Psychic: 1 },
  Fire:     { Normal: 1, Electric: 1,   Grass: 2,   Fire: 0.5, Water: 0.5, Psychic: 1 },
  Water:    { Normal: 1, Electric: 1,   Grass: 0.5, Fire: 2,   Water: 0.5, Psychic: 1 },
  Psychic:  { Normal: 1, Electric: 1,   Grass: 1,   Fire: 1,   Water: 1,   Psychic: 0.5 },
};

export function typeMult(atkType: Affinity, defType: Affinity): number {
  return CHART[atkType]?.[defType] ?? 1;
}

export const getTypeMultiplier = typeMult;

export function effectivenessLabel(mult: number): 'super' | 'resist' | 'neutral' {
  return mult > 1 ? 'super' : mult < 1 ? 'resist' : 'neutral';
}
