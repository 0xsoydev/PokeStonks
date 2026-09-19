import type { EncounterTable, EncounterSlot } from './types';

// Gen-3 faithful: RNG 0..2879, trigger if roll < encounterValue
export function rollEncounter(table: EncounterTable, rng: () => number): EncounterSlot | null {
  const roll = Math.floor(rng() * 2880);
  if (roll >= table.encounterValue) return null;

  const totalWeight = table.slots.reduce((s: number, slot: EncounterSlot) => s + slot.weight, 0);
  let pick = Math.floor(rng() * totalWeight);
  for (const slot of table.slots) {
    pick -= slot.weight;
    if (pick < 0) return slot;
  }
  return table.slots[table.slots.length - 1];
}
