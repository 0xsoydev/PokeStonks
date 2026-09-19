import { rollEncounter } from 'game-core';
import type { EncounterTable, EncounterSlot, BrokerMon, Affinity } from 'game-core';

export { rollEncounter };

export function buildWildMon(slot: EncounterSlot, speciesName: string, affinity: Affinity): BrokerMon {
  const level = slot.levelRange[0] + Math.floor(Math.random() * (slot.levelRange[1] - slot.levelRange[0] + 1));
  return {
    id: `wild_${slot.speciesId}_${Date.now()}`,
    name: speciesName,
    affinity,
    level,
    hp: 20 + level * 4,
    maxHp: 20 + level * 4,
    atk: 8 + level * 2,
    def: 6 + level,
    spa: 9 + level * 2,
    spd: 7 + level,
    spe: 8 + level,
    moves: ['TACKLE', 'GROWL'],
    pp: { TACKLE: 35, GROWL: 40 },
    atkStage: 0,
    defStage: 0,
  };
}

// ponytail: placeholder tables, swap with Tiled object-layer data
export const TECH_ROUTE_TABLE: EncounterTable = {
  encounterValue: 320,
  slots: [
    { speciesId: 'nvda',  weight: 20, levelRange: [3, 5] },
    { speciesId: 'tsla',  weight: 20, levelRange: [3, 5] },
    { speciesId: 'aapl',  weight: 10, levelRange: [4, 6] },
    { speciesId: 'goog',  weight: 10, levelRange: [4, 6] },
    { speciesId: 'amzn',  weight: 10, levelRange: [3, 5] },
    { speciesId: 'meta',  weight: 10, levelRange: [4, 6] },
    { speciesId: 'msft',  weight: 5,  levelRange: [5, 7] },
    { speciesId: 'coin',  weight: 5,  levelRange: [5, 7] },
    { speciesId: 'gme',   weight: 4,  levelRange: [2, 4] },
    { speciesId: 'bbby',  weight: 4,  levelRange: [2, 4] },
    { speciesId: 'revlv', weight: 1,  levelRange: [6, 8] },
    { speciesId: 'tothe', weight: 1,  levelRange: [6, 8] },
  ],
};

const SPECIES_NAMES: Record<string, { name: string; affinity: Affinity }> = {
  nvda:  { name: 'NVDA',  affinity: 'Electric' },
  tsla:  { name: 'TSLA',  affinity: 'Electric' },
  aapl:  { name: 'AAPL',  affinity: 'Normal' },
  goog:  { name: 'GOOG',  affinity: 'Psychic' },
  amzn:  { name: 'AMZN',  affinity: 'Water' },
  meta:  { name: 'META',  affinity: 'Psychic' },
  msft:  { name: 'MSFT',  affinity: 'Normal' },
  coin:  { name: 'COIN',  affinity: 'Psychic' },
  gme:   { name: 'GME',   affinity: 'Fire' },
  bbby:  { name: 'BBBY',  affinity: 'Grass' },
  revlv: { name: 'REVLV', affinity: 'Fire' },
  tothe: { name: '2TH3',  affinity: 'Water' },
};

export function resolveSpecies(speciesId: string) {
  return SPECIES_NAMES[speciesId] ?? { name: speciesId.toUpperCase(), affinity: 'Normal' as Affinity };
}
