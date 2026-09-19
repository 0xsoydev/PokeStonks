import { describe, it, expect } from 'vitest';
import { rollEncounter } from './encounter';
import type { EncounterTable } from './types';

const TECH_TABLE: EncounterTable = {
  encounterValue: 320,
  slots: [
    { speciesId: 'nvda', weight: 20, levelRange: [3, 5] },
    { speciesId: 'tsla', weight: 20, levelRange: [3, 5] },
    { speciesId: 'aapl', weight: 10, levelRange: [4, 6] },
    { speciesId: 'goog', weight: 10, levelRange: [4, 6] },
    { speciesId: 'amzn', weight: 10, levelRange: [3, 5] },
    { speciesId: 'meta', weight: 10, levelRange: [4, 6] },
    { speciesId: 'msft', weight: 5,  levelRange: [5, 7] },
    { speciesId: 'coin', weight: 5,  levelRange: [5, 7] },
    { speciesId: 'gme',  weight: 4,  levelRange: [2, 4] },
    { speciesId: 'bbby', weight: 4,  levelRange: [2, 4] },
    { speciesId: 'revlv', weight: 1, levelRange: [6, 8] },
    { speciesId: 'tothe', weight: 1, levelRange: [6, 8] },
  ],
};

describe('encounter system', () => {
  it('grass encounter rate ≈ 11% over 1000 steps', () => {
    let triggered = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const result = rollEncounter(TECH_TABLE, Math.random);
      if (result) triggered++;
    }
    const rate = triggered / N;
    // Gen-3 grass: 320/2880 ≈ 11.1%
    expect(rate).toBeGreaterThan(0.07);
    expect(rate).toBeLessThan(0.16);
  });

  it('returns null on high roll', () => {
    const result = rollEncounter(TECH_TABLE, () => 0.99);
    expect(result).toBeNull();
  });

  it('returns slot on low roll', () => {
    const result = rollEncounter(TECH_TABLE, () => 0.001);
    expect(result).not.toBeNull();
  });
});
