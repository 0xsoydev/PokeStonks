import type { Affinity } from './types';

const CHART: Record<Affinity, Record<Affinity, number>> = {
  Normal:   { Normal: 1, Electric: 1, Grass: 1, Fire: 1, Water: 1, Psychic: 1 },
  Electric: { Normal: 1, Electric: 0.5, Grass: 2, Fire: 1, Water: 1, Psychic: 1 },
  Grass:    { Normal: 1, Electric: 0.5, Grass: 0.5, Fire: 2, Water: 0.5, Psychic: 1 },
  Fire:     { Normal: 1, Electric: 1, Grass: 0.5, Fire: 0.5, Water: 2, Psychic: 1 },
  Water:    { Normal: 1, Electric: 1, Grass: 2, Fire: 0.5, Water: 0.5, Psychic: 1 },
  Psychic:  { Normal: 1, Electric: 1, Grass: 1, Fire: 1, Water: 1, Psychic: 0.5 },
};

export function typeMult(atkType: Affinity, defType: Affinity): number {
  return CHART[atkType]?.[defType] ?? 1;
}

export function getTypeMultiplier(atkType: Affinity, defType: Affinity): number {
  return typeMult(atkType, defType);
}
