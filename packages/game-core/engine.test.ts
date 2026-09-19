import { describe, it, expect } from 'vitest';
import {
  typeMult, AFFINITIES, MOVES, getMove, legalMoves, isKnownMove,
  SPECIES, SPECIES_LIST, getSpecies, buildMon, calcStat, calcHp, stageMultiplier, applyStage,
  computeDamage, accuracyCheck, TAP_MULT, stockBuff, buffFromSpotEma, deviationPct,
  rollEncounter, ROUTE_TABLES, GRASS_SLOT_WEIGHTS, MARKETS, effectiveSpeed,
} from './index';
import type { DamageInput } from './index';

describe('type chart (Gen-3 faithful)', () => {
  it.each([
    ['Fire', 'Grass', 2], ['Fire', 'Water', 0.5], ['Fire', 'Fire', 0.5],
    ['Water', 'Fire', 2], ['Water', 'Grass', 0.5], ['Water', 'Water', 0.5],
    ['Grass', 'Water', 2], ['Grass', 'Fire', 0.5], ['Grass', 'Grass', 0.5],
    ['Electric', 'Water', 2], ['Electric', 'Grass', 0.5], ['Electric', 'Electric', 0.5],
    ['Psychic', 'Psychic', 0.5], ['Normal', 'Psychic', 1], ['Electric', 'Fire', 1],
  ] as const)('%s vs %s = %s', (a, d, m) => expect(typeMult(a, d)).toBe(m));

  it('is a complete 6x6 table of legal multipliers', () => {
    for (const a of AFFINITIES) for (const d of AFFINITIES) expect([0.5, 1, 2]).toContain(typeMult(a, d));
  });
});

describe('moves', () => {
  it('uses mainline Gen-3 numbers for the headline moves', () => {
    expect(MOVES.THUNDER).toMatchObject({ power: 120, accuracy: 70, pp: 10 });
    expect(MOVES.THUNDERBOLT).toMatchObject({ power: 95, accuracy: 100, pp: 15 });
    expect(MOVES.QUICK_ATTACK.priority).toBe(1);
  });
  it('FRLG split: Normal is physical, everything else damaging is special', () => {
    for (const mv of Object.values(MOVES)) {
      if (mv.category === 'status') continue;
      expect(mv.category).toBe(mv.type === 'Normal' ? 'physical' : 'special');
    }
  });
  it('unknown ids fall back to Struggle and never crash', () => {
    expect(getMove('NOPE').id).toBe('STRUGGLE');
    expect(isKnownMove('__proto__')).toBe(false);
  });
  it('legalMoves excludes empty-PP and Struggle', () => {
    expect(legalMoves({ TACKLE: 0, THUNDER: 3, STRUGGLE: 9 })).toEqual(['THUNDER']);
    expect(legalMoves({ TACKLE: 0 })).toEqual([]);
  });
});

describe('species roster', () => {
  it('has 12 species, unique nums 1..12, two of each type', () => {
    expect(SPECIES_LIST).toHaveLength(12);
    expect(SPECIES_LIST.map((s) => s.num)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const t of AFFINITIES) expect(SPECIES_LIST.filter((s) => s.affinity === t)).toHaveLength(2);
  });
  it('every learnset is 4 known moves incl. at least one damaging move', () => {
    for (const s of SPECIES_LIST) {
      expect(s.learnset).toHaveLength(4);
      for (const id of s.learnset) expect(isKnownMove(id)).toBe(true);
      expect(s.learnset.some((id) => MOVES[id].power > 0)).toBe(true);
    }
  });
  it('feed ids are 32-byte hex', () => {
    for (const s of SPECIES_LIST) expect(s.feedId).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it('unknown species resolves safely', () => expect(getSpecies('zzz').id).toBe('aapl'));
});

describe('stats', () => {
  it('Gen-3 formulas at L50, IV 15', () => {
    expect(calcStat(105, 50)).toBe(117);
    expect(calcHp(100, 50)).toBe(167);
  });
  it('stage multipliers', () => {
    expect(stageMultiplier(0)).toBe(1);
    expect(stageMultiplier(1)).toBe(1.5);
    expect(stageMultiplier(2)).toBe(2);
    expect(stageMultiplier(-1)).toBeCloseTo(2 / 3);
    expect(stageMultiplier(-6)).toBe(0.25);
    expect(stageMultiplier(99)).toBe(4); // clamped to +6
  });
  it('buildMon derives everything from species + level, clamps level', () => {
    const m = buildMon('tsla', 50);
    expect(m.maxHp).toBe(m.hp);
    expect(m.spa).toBe(calcStat(SPECIES.tsla.base.spa, 50));
    expect(m.pp.THUNDERBOLT).toBe(15);
    expect(buildMon('tsla', 9999).level).toBe(100);
    expect(buildMon('tsla', -4).level).toBe(5);
    expect(buildMon('tsla', NaN).level).toBe(50);
  });
  it('speed stages change turn-order speed', () => {
    const m = buildMon('aapl');
    const base = effectiveSpeed(m);
    m.stages.spe = 2;
    expect(effectiveSpeed(m)).toBe(base * 2);
  });
  it('applyStage never returns < 1', () => expect(applyStage(1, -6)).toBe(1));
});

const base = (over: Partial<DamageInput> = {}): DamageInput => ({
  level: 50, atkStat: 117, atkStage: 0, atkAffinity: 'Electric',
  defStat: 97, defStage: 0, defAffinity: 'Water',
  move: MOVES.THUNDERBOLT, tap: 'good', stockBuff: 1, critRoll: 5, spreadRoll: 15, ...over,
});

describe('computeDamage', () => {
  it('hand-computed: L50 Thunderbolt STAB super-effective = 156 (max roll)', () => {
    const r = computeDamage(base());
    expect(r.damage).toBe(156);
    expect(r.isCrit).toBe(false);
    expect(r.typeMultVal).toBe(2);
  });
  it('min roll = 132', () => expect(computeDamage(base({ spreadRoll: 0 })).damage).toBe(132));
  it('resisted hit is halved before spread', () => {
    const r = computeDamage(base({ defAffinity: 'Grass' }));
    expect(r.typeMultVal).toBe(0.5);
    expect(r.damage).toBeLessThan(computeDamage(base({ defAffinity: 'Fire' })).damage);
  });
  it('STAB adds 1.5x', () => {
    const stab = computeDamage(base({ defAffinity: 'Fire' })).damage;
    const noStab = computeDamage(base({ defAffinity: 'Fire', atkAffinity: 'Normal' })).damage;
    expect(stab).toBeGreaterThan(noStab);
  });
  it('a Perfect tap always crits and is 1.1x', () => {
    const r = computeDamage(base({ tap: 'perfect', critRoll: 9 }));
    expect(r.isCrit).toBe(true);
    expect(r.tapMult).toBe(TAP_MULT.perfect);
  });
  it('critRoll 0 crits on a Good tap (6.25% case)', () => {
    expect(computeDamage(base({ critRoll: 0 })).isCrit).toBe(true);
    expect(computeDamage(base({ critRoll: 1 })).isCrit).toBe(false);
  });
  it('crit ignores the attacker negative stage and defender positive stage', () => {
    const crit = computeDamage(base({ critRoll: 0, atkStage: -3, defStage: 3 })).damage;
    const clean = computeDamage(base({ critRoll: 0 })).damage;
    expect(crit).toBe(clean);
    const nocrit = computeDamage(base({ atkStage: -3, defStage: 3 })).damage;
    expect(nocrit).toBeLessThan(computeDamage(base()).damage);
  });
  it('attacker Atk/SpA stages raise damage (Growl/Swords Dance actually matter)', () => {
    expect(computeDamage(base({ atkStage: 2 })).damage).toBeGreaterThan(computeDamage(base()).damage);
    expect(computeDamage(base({ atkStage: -2 })).damage).toBeLessThan(computeDamage(base()).damage);
  });
  it('bull buff > flat > bear', () => {
    const bull = computeDamage(base({ stockBuff: 1.1 })).damage;
    const flat = computeDamage(base()).damage;
    const bear = computeDamage(base({ stockBuff: 0.9 })).damage;
    expect(bull).toBeGreaterThan(flat);
    expect(flat).toBeGreaterThan(bear);
  });
  it('miss tap is 0.85x', () => expect(computeDamage(base({ tap: 'miss' })).damage).toBeLessThan(computeDamage(base()).damage));
  it('status moves deal 0', () => expect(computeDamage(base({ move: MOVES.GROWL })).damage).toBe(0));
  it('always at least 1', () => {
    expect(computeDamage(base({ atkStat: 1, defStat: 999, move: MOVES.TACKLE, atkAffinity: 'Fire', defAffinity: 'Normal' })).damage).toBeGreaterThanOrEqual(1);
  });
  it('is deterministic for identical inputs', () => {
    expect(computeDamage(base())).toEqual(computeDamage(base()));
  });
  it('spread never exceeds 100% of the unspread value', () => {
    for (let r = 0; r <= 15; r++) expect(computeDamage(base({ spreadRoll: r })).damage).toBeLessThanOrEqual(156);
  });
});

describe('accuracy', () => {
  it('roll 0..99 < accuracy', () => {
    expect(accuracyCheck(70, 69)).toBe(true);
    expect(accuracyCheck(70, 70)).toBe(false);
    expect(accuracyCheck(100, 99)).toBe(true);
  });
});

describe('stock buff', () => {
  it('thresholds are strict at +/-2%', () => {
    expect(stockBuff(2.01)).toBe(1.1);
    expect(stockBuff(2)).toBe(1);
    expect(stockBuff(-2)).toBe(1);
    expect(stockBuff(-2.01)).toBe(0.9);
  });
  it('spot vs EMA', () => {
    expect(deviationPct(103, 100)).toBeCloseTo(3);
    expect(buffFromSpotEma(103, 100).mood).toBe('bull');
    expect(buffFromSpotEma(96, 100).mood).toBe('bear');
    expect(buffFromSpotEma(100, 100).mood).toBe('flat');
  });
  it('degenerate inputs are flat, never NaN', () => {
    expect(buffFromSpotEma(5, 0).buff).toBe(1);
    expect(buffFromSpotEma(NaN, 100).buff).toBe(1);
  });
});

describe('encounters', () => {
  it('slot weights sum to 100 and every route table has 12 valid slots', () => {
    expect(GRASS_SLOT_WEIGHTS.reduce((a, b) => a + b, 0)).toBe(100);
    for (const t of Object.values(ROUTE_TABLES)) {
      expect(t.slots).toHaveLength(12);
      for (const s of t.slots) expect(SPECIES[s.speciesId]).toBeDefined();
    }
  });
  it('encounter rate over 200k steps ≈ 11.1%', () => {
    let hits = 0;
    const N = 200_000;
    let seed = 12345;
    const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    for (let i = 0; i < N; i++) if (rollEncounter(ROUTE_TABLES.tech, rng)) hits++;
    expect(hits / N).toBeGreaterThan(0.105);
    expect(hits / N).toBeLessThan(0.117);
  });
  it('every market has a valid species and route theme', () => {
    expect(MARKETS).toHaveLength(12);
    for (const m of MARKETS) {
      expect(SPECIES[m.speciesId]).toBeDefined();
      expect(ROUTE_TABLES[m.routeTheme]).toBeDefined();
    }
  });
});
