import { randomInt } from 'node:crypto';

/** Integer RNG in [0, max). Server battles use the crypto one; tests inject a seeded one. */
export interface Rng {
  int(max: number): number;
}

export const cryptoRng: Rng = {
  int: (max) => (max <= 1 ? 0 : randomInt(max)),
};

/** Deterministic mulberry32, for reproducible tests/simulations only. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    int(max: number) {
      if (max <= 1) return 0;
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * max);
    },
  };
}
