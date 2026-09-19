import type { EncounterTable, EncounterSlot } from './types';
import type { RouteTheme } from './markets';

/** Gen-3 grass slot weights: 12 slots summing to 100. */
export const GRASS_SLOT_WEIGHTS = [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1] as const;

/** Gen-3 tall-grass encounter value (out of 2880 ≈ 11.1% per step). */
export const GRASS_ENCOUNTER_VALUE = 320;

function table(species: string[], lv: [number, number]): EncounterTable {
  return {
    encounterValue: GRASS_ENCOUNTER_VALUE,
    slots: species.map((speciesId, i) => ({ speciesId, weight: GRASS_SLOT_WEIGHTS[i], levelRange: lv })),
  };
}

export const ROUTE_TABLES: Record<RouteTheme, EncounterTable> = {
  tech:     table(['tsla', 'nvda', 'amd',  'tsla', 'nvda', 'aapl', 'msft', 'coin', 'gme',  'amzn', 'mstr', 'cvx'],  [48, 52]),
  bluechip: table(['aapl', 'msft', 'aapl', 'msft', 'cvx',  'amzn', 'nke',  'tsla', 'xom',  'nvda', 'coin', 'gme'],  [48, 52]),
  energy:   table(['xom',  'cvx',  'xom',  'cvx',  'aapl', 'msft', 'gme',  'amd',  'amzn', 'nke',  'tsla', 'mstr'], [48, 52]),
  meme:     table(['gme',  'amd',  'gme',  'coin', 'mstr', 'tsla', 'nvda', 'aapl', 'amzn', 'nke',  'xom',  'cvx'],  [48, 52]),
  consumer: table(['amzn', 'nke',  'amzn', 'nke',  'aapl', 'msft', 'xom',  'cvx',  'gme',  'amd',  'tsla', 'coin'], [48, 52]),
  crypto:   table(['coin', 'mstr', 'coin', 'mstr', 'nvda', 'tsla', 'amd',  'gme',  'aapl', 'msft', 'amzn', 'nke'],  [48, 52]),
};

/**
 * Gen-3 step roll: draw 0..2879, an encounter happens when the roll is below the
 * table's encounter value, then a species is picked by slot weight.
 * `rng` returns a float in [0,1).
 */
export function rollEncounter(t: EncounterTable, rng: () => number): EncounterSlot | null {
  const roll = Math.floor(rng() * 2880);
  if (roll >= t.encounterValue) return null;
  return pickSlot(t, rng);
}

export function pickSlot(t: EncounterTable, rng: () => number): EncounterSlot {
  const total = t.slots.reduce((s, slot) => s + slot.weight, 0);
  let pick = Math.floor(rng() * total);
  for (const slot of t.slots) {
    pick -= slot.weight;
    if (pick < 0) return slot;
  }
  return t.slots[t.slots.length - 1];
}
