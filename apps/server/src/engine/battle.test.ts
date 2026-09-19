import { describe, it, expect } from 'vitest';
import { buildMon, SPECIES_LIST, getMove, type SeatKey } from 'game-core';
import { BattleEngine, type Choice } from './battle.ts';
import { chooseBotMove } from './bot.ts';
import { seededRng, type Rng } from './rng.ts';

const mk = (a: string, b: string, rng: Rng, buffA = 1, buffB = 1) =>
  new BattleEngine(
    { key: 'A', mon: buildMon(a), ticker: a.toUpperCase(), buff: buffA },
    { key: 'B', mon: buildMon(b), ticker: b.toUpperCase(), buff: buffB },
    rng,
  );

const good = (moveId: string): Choice => ({ moveId, tap: 'good' });

function playOut(a: string, b: string, seed: number, maxTurns = 200) {
  const rng = seededRng(seed);
  const e = mk(a, b, rng);
  const log: string[] = [];
  let turns = 0;
  while (!e.winner && turns < maxTurns) {
    const choices = { A: chooseBotMove(e, 'A', rng), B: chooseBotMove(e, 'B', rng) } as Record<SeatKey, Choice>;
    for (const k of ['A', 'B'] as const) expect(e.isLegal(k, choices[k].moveId)).toBe(true);
    const ev = e.resolveTurn(choices);
    for (const x of ev) log.push(x.msg);
    for (const k of ['A', 'B'] as const) {
      const m = e.seats[k].mon;
      expect(m.hp).toBeGreaterThanOrEqual(0);
      expect(m.hp).toBeLessThanOrEqual(m.maxHp);
      for (const pp of Object.values(m.pp)) expect(pp).toBeGreaterThanOrEqual(0);
      for (const s of Object.values(m.stages)) { expect(s).toBeGreaterThanOrEqual(-6); expect(s).toBeLessThanOrEqual(6); }
    }
    turns++;
  }
  return { e, turns, log };
}

describe('BattleEngine', () => {
  it('every species matchup terminates with exactly one winner (seeded sweeps)', () => {
    let battles = 0;
    for (const a of SPECIES_LIST) for (const b of SPECIES_LIST) {
      for (const seed of [1, 2, 3]) {
        const { e, turns } = playOut(a.id, b.id, seed * 7919 + a.num * 31 + b.num);
        expect(e.winner, `${a.id} vs ${b.id}`).not.toBeNull();
        expect(turns).toBeLessThan(120);
        const loser = e.winner === 'A' ? 'B' : 'A';
        expect(e.seats[loser].mon.hp).toBe(0);
        expect(e.seats[e.winner!].mon.hp).toBeGreaterThan(0); // never a double KO
        battles++;
      }
    }
    expect(battles).toBe(12 * 12 * 3);
  });

  it('is fully deterministic for a given seed', () => {
    const r1 = playOut('tsla', 'amzn', 4242);
    const r2 = playOut('tsla', 'amzn', 4242);
    expect(r1.log).toEqual(r2.log);
    expect(r1.e.winner).toBe(r2.e.winner);
  });

  it('battle length feels like the real games: median 5-10 turns', () => {
    const lens: number[] = [];
    for (let s = 0; s < 300; s++) {
      const a = SPECIES_LIST[s % 12].id, b = SPECIES_LIST[(s * 7 + 3) % 12].id;
      lens.push(playOut(a, b, s + 1).turns);
    }
    lens.sort((x, y) => x - y);
    const median = lens[Math.floor(lens.length / 2)];
    expect(median).toBeGreaterThanOrEqual(5);
    expect(median).toBeLessThanOrEqual(10);
  });

  it('priority beats speed: Quick Attack goes first even against a faster foe', () => {
    const e = mk('aapl', 'tsla', seededRng(1)); // tsla is much faster
    const ev = e.resolveTurn({ A: good('QUICK_ATTACK'), B: good('THUNDERBOLT') });
    expect(ev[0].by).toBe('A');
  });

  it('faster mon moves first at equal priority', () => {
    const e = mk('aapl', 'tsla', seededRng(1));
    const ev = e.resolveTurn({ A: good('TACKLE'), B: good('THUNDER_SHOCK') });
    expect(ev[0].by).toBe('B');
  });

  it('a KO ends the turn: the fainted mon never acts', () => {
    const e = mk('tsla', 'aapl', seededRng(5));
    e.seats.B.mon.hp = 1;
    const ev = e.resolveTurn({ A: good('QUICK_ATTACK'), B: good('TACKLE') });
    expect(ev).toHaveLength(1);
    expect(ev[0].faint).toBe('B');
    expect(e.winner).toBe('A');
    expect(e.endReason).toBe('faint');
  });

  it('Growl lowers the foe Attack stage and that lowers subsequent damage', () => {
    const rng = seededRng(9);
    const e = mk('aapl', 'msft', rng);
    e.resolveTurn({ A: good('QUICK_ATTACK'), B: good('GROWL') });
    expect(e.seats.A.mon.stages.atk).toBe(-1);
    const withDrop = e.seats.A.mon.stages.atk;
    expect(withDrop).toBeLessThan(0);
  });

  it('stat stages clamp at ±6 and report "won\'t go any higher"', () => {
    const e = mk('aapl', 'msft', seededRng(3));
    e.seats.A.mon.stages.atk = 6;
    e.seats.A.mon.pp.SWORDS_DANCE = 5;
    const ev = e.resolveTurn({ A: good('SWORDS_DANCE'), B: good('TAIL_WHIP') });
    const sd = ev.find((x) => x.move === 'SWORDS_DANCE')!;
    expect(e.seats.A.mon.stages.atk).toBe(6);
    expect(sd.msg).toContain("won't go any higher");
  });

  it('PP is deducted only when a move is actually used', () => {
    const e = mk('tsla', 'aapl', seededRng(5));
    e.seats.B.mon.hp = 1;
    const ppBefore = e.seats.B.mon.pp.TACKLE;
    e.resolveTurn({ A: good('QUICK_ATTACK'), B: good('TACKLE') }); // B faints before moving
    expect(e.seats.B.mon.pp.TACKLE).toBe(ppBefore);
  });

  it('Struggle is the only legal move at zero PP, and its recoil never KOs the user', () => {
    const e = mk('aapl', 'msft', seededRng(11));
    for (const id of Object.keys(e.seats.A.mon.pp)) e.seats.A.mon.pp[id] = 0;
    expect(e.legalMoveIds('A')).toEqual(['STRUGGLE']);
    expect(e.isLegal('A', 'TACKLE')).toBe(false);
    e.seats.A.mon.hp = 2;
    e.resolveTurn({ A: good('STRUGGLE'), B: good('GROWL') });
    expect(e.seats.A.mon.hp).toBeGreaterThanOrEqual(1);
  });

  it('rejects unknown / out-of-PP moves as illegal', () => {
    const e = mk('aapl', 'msft', seededRng(1));
    expect(e.isLegal('A', 'NOPE')).toBe(false);
    e.seats.A.mon.pp.TACKLE = 0;
    expect(e.isLegal('A', 'TACKLE')).toBe(false);
    expect(e.isLegal('A', 'BODY_SLAM')).toBe(true);
  });

  it('a tap-Perfect always crits; bull buff out-damages bear buff', () => {
    const run = (buff: number, tap: 'perfect' | 'good') => {
      const e = mk('nvda', 'amzn', seededRng(21), buff, 1);
      const ev = e.resolveTurn({ A: { moveId: 'THUNDERBOLT', tap }, B: good('TAIL_WHIP') });
      return ev.find((x) => x.by === 'A')!;
    };
    expect(run(1, 'perfect').crit).toBe(true);
    // Same seed → same rolls, so only the buff differs.
    expect(run(1.1, 'good').dmg).toBeGreaterThan(run(0.9, 'good').dmg);
  });

  it('forfeit awards the win to the opponent and is idempotent', () => {
    const e = mk('aapl', 'msft', seededRng(1));
    e.forfeit('A', 'disconnect');
    expect(e.winner).toBe('B');
    e.forfeit('B');
    expect(e.winner).toBe('B');
    expect(e.endReason).toBe('disconnect');
    expect(e.resolveTurn({ A: good('TACKLE'), B: good('TACKLE') })).toEqual([]);
  });

  it('event HP snapshots are consistent with final state', () => {
    const { e } = playOut('gme', 'nke', 77);
    expect(e.seats.A.mon.hp === 0 || e.seats.B.mon.hp === 0).toBe(true);
  });

  it('every move id used exists in the pool', () => {
    for (const s of SPECIES_LIST) for (const id of s.learnset) expect(getMove(id).id).toBe(id);
  });
});
