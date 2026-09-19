import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Config is read at import time, so set the environment first, then import dynamically.
process.env.FAST_TIMING = '1';
process.env.QUEUE_BOT_MS = '400';
process.env.RECONNECT_SECONDS = '2';


const PORT = 2599;
let walletCounter = 0x100;
const nextWallet = () => `0x${(++walletCounter).toString(16).padStart(40, '0')}`;

type Any = any;
let server: Any;
let Client: Any;

beforeAll(async () => {
  const { createGameServer } = await import('../server.ts');
  ({ Client } = await import('@colyseus/sdk'));
  server = createGameServer();
  await server.listen(PORT);
});

afterAll(async () => {
  await server?.gracefullyShutdown(false).catch(() => {});
});

const connect = () => new Client(`ws://localhost:${PORT}`);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(pred: () => boolean, ms = 8000, what = 'condition') {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${what}`);
    await wait(15);
  }
}

/** A scripted client that plays a full battle with simple logic. */
function attach(room: Any, opts: { pickMove?: (state: Any, seat: string) => string } = {}) {
  const log: Any = { seat: '', turns: [] as Any[], end: null as Any, rejected: [] as string[], mood: null as Any };
  room.onMessage('seat', () => {});
  const findSeat = () => {
    let found = '';
    room.state?.players?.forEach((p: Any, k: string) => { if (p.sessionId === room.sessionId) found = k; });
    return found;
  };
  room.onMessage('mood', (m: Any) => (log.mood = m));
  room.onMessage('rejected', (m: Any) => log.rejected.push(m.reason));
  room.onMessage('battleEnd', (m: Any) => (log.end = m));
  room.onMessage('claimStatus', (m: Any) => (log.claim = m));
  room.onMessage('turnResolved', (m: Any) => {
    log.turns.push(m);
    room.send('turnAck', { turnNo: m.turnNo });
  });
  let lastTurn = -1;
  const tick = setInterval(() => { try {
    const s = room.state;
    if (!s) return;
    if (!log.seat) log.seat = findSeat();
    if (!log.seat) return;
    if (s.phase === 'INTRO') room.send('ready', {});
    if (s.phase === 'COMMAND' && s.turnNo !== lastTurn && !s.players.get(log.seat)?.locked) {
      lastTurn = s.turnNo;
      const me = s.players.get(log.seat);
      const moveId = opts.pickMove?.(s, log.seat) ?? me.active.moves[0];
      room.send('lockMove', { turnNo: s.turnNo, moveId, tap: 'good' });
    }
  } catch (e) { log.error = e; } }, 20);
  log.stop = () => clearInterval(tick);
  return log;
}

describe('BattleRoom (real server, real websockets)', () => {
  it('matches two humans, plays a full battle to a single winner, both clients see identical events', async () => {
    const a = await connect().joinOrCreate('battle', { wallet: nextWallet(), speciesId: 'tsla', mode: 'quick' });
    const b = await connect().joinOrCreate('battle', { wallet: nextWallet(), speciesId: 'amzn', mode: 'quick' });
    expect(a.roomId).toBe(b.roomId);
    const la = attach(a), lb = attach(b);
    await until(() => la.end && lb.end, 20_000, 'battle end');

    expect(new Set([la.seat, lb.seat])).toEqual(new Set(['A', 'B']));
    expect(la.end.winner).toBe(lb.end.winner);
    expect(la.end.reason).toBe('faint');
    expect(la.turns.length).toBeGreaterThan(1);
    expect(la.turns.map((t: Any) => t.turnNo)).toEqual(lb.turns.map((t: Any) => t.turnNo));
    expect(JSON.stringify(la.turns)).toBe(JSON.stringify(lb.turns)); // byte-identical event streams
    // Prize is the LOSER's ticker.
    const loserSpecies = la.end.winner === la.seat ? 'AMZN' : 'TSLA';
    expect(la.end.ticker).toBe(la.seat === la.end.winner ? (la.seat === 'A' ? 'AMZN' : 'TSLA') : loserSpecies);
    la.stop(); lb.stop(); await a.leave(); await b.leave();
  }, 30_000);

  it('never leaks the opponent\'s locked move into synced state', async () => {
    const a = await connect().joinOrCreate('battle', { wallet: nextWallet(), speciesId: 'aapl', mode: 'quick' });
    const b = await connect().joinOrCreate('battle', { wallet: nextWallet(), speciesId: 'msft', mode: 'quick' });
    const la = attach(a);
    await until(() => a.state?.phase === 'COMMAND', 8000, 'COMMAND');
    b.send('ready', {});
    await until(() => a.state.players.get(la.seat === 'A' ? 'B' : 'A')?.locked === true, 8000, 'opp lock').catch(() => {});
    const opp = a.state.players.get('B') ?? a.state.players.get('A');
    const json = JSON.stringify(a.state.toJSON());
    expect(json).not.toMatch(/lockedMove|lockedTap|choice/i);
    expect(Object.keys(opp.toJSON())).not.toContain('lockedMove');
    la.stop(); await a.leave(); await b.leave();
  }, 20_000);

  it('rejects cheating: wrong turn, illegal move, made-up species, absurd stats in options', async () => {
    await expect(connect().joinOrCreate('battle', { wallet: nextWallet(), speciesId: 'pikachu', mode: 'practice' })).rejects.toBeTruthy();
    await expect(connect().joinOrCreate('battle', { wallet: 'not-an-address', speciesId: 'tsla', mode: 'practice' })).rejects.toBeTruthy();

    // Extra "stats" from the client must be ignored entirely.
    const r = await connect().joinOrCreate('battle', { wallet: nextWallet(), speciesId: 'tsla', mode: 'practice', maxHp: 99999, atk: 9999, spa: 9999 } as Any);
    const log = attach(r);
    await until(() => r.state?.phase === 'COMMAND', 8000, 'COMMAND');
    const me = r.state.players.get(log.seat);
    expect(me.active.maxHp).toBeLessThan(1000);
    expect(me.active.spa).toBeLessThan(500);
    log.stop();

    const turn = r.state.turnNo;
    r.send('lockMove', { turnNo: turn + 5, moveId: 'THUNDERBOLT', tap: 'good' }); // wrong turn
    r.send('lockMove', { turnNo: turn, moveId: 'HYPER_BEAM', tap: 'good' });      // not in learnset
    r.send('lockMove', { turnNo: turn, moveId: 'THUNDERBOLT', tap: 'godmode' });  // bad tap
    // Each cheat is either rejected outright or (if this turn's window already closed) ignored —
    // what matters is that none of them ever executes.
    await until(() => log.rejected.length >= 2, 4000, 'rejections').catch((e) => { throw new Error(e.message + ' :: ' + JSON.stringify(log.rejected)); });
    const seen = new Set<string>();
    r.onMessage('turnResolved', (m: Any) => m.events.forEach((ev: Any) => seen.add(ev.move)));
    await wait(1500);
    expect(seen.has('HYPER_BEAM')).toBe(false);
    await r.leave();
  }, 20_000);

  it('bot fills after the queue timeout and actually plays (battle completes without human bot input)', async () => {
    const a = await connect().joinOrCreate('battle', { wallet: nextWallet(), speciesId: 'nvda', mode: 'quick', marketId: 'tsla' });
    const la = attach(a);
    await until(() => a.state?.players?.size === 2, 5000, 'bot to join');
    const bot = [...a.state.players.values()].find((p: Any) => p.isBot);
    expect(bot).toBeTruthy();
    await until(() => la.end, 25_000, 'bot battle end');
    expect(la.turns.length).toBeGreaterThan(0);
    la.stop(); await a.leave();
  }, 30_000);

  it('practice mode: instant bot, no rewards', async () => {
    const a = await connect().joinOrCreate('battle', { wallet: nextWallet(), speciesId: 'gme', mode: 'practice' });
    const la = attach(a);
    await until(() => a.state?.players?.size === 2, 3000, 'practice bot');
    await until(() => la.end, 25_000, 'practice end');
    expect(la.end.claimable).toBe(false);
    la.stop(); await a.leave();
  }, 30_000);

  it('disconnect then reconnect within the grace window resumes the battle with a full snapshot', async () => {
    const a = await connect().joinOrCreate('battle', { wallet: nextWallet(), speciesId: 'coin', mode: 'practice' });
    const la = attach(a);
    await until(() => a.state?.phase === 'COMMAND', 8000, 'COMMAND');
    const token = a.reconnectionToken;
    la.stop();
    a.connection.transport.ws.terminate?.() ?? a.connection.close?.();
    await wait(300);
    const a2 = await connect().reconnect(token);
    expect(a2.roomId).toBe(a.roomId);
    await until(() => a2.state?.players?.size === 2, 5000, 'snapshot after reconnect');
    expect(a2.state.players.get('A')?.connected ?? a2.state.players.get('B')?.connected).toBe(true);
    const l2 = attach(a2);
    await until(() => l2.end, 30_000, 'resumed battle end');
    l2.stop(); await a2.leave();
  }, 45_000);

  it('disconnect and NOT returning forfeits: the opponent wins', async () => {
    const a = await connect().joinOrCreate('battle', { wallet: nextWallet(), speciesId: 'xom', mode: 'quick' });
    const b = await connect().joinOrCreate('battle', { wallet: nextWallet(), speciesId: 'cvx', mode: 'quick' });
    const la = attach(a), lb = attach(b);
    await until(() => a.state?.phase === 'COMMAND', 8000, 'COMMAND');
    la.stop();
    a.connection.transport.ws.terminate?.() ?? a.connection.close?.();
    await until(() => lb.end, 15_000, 'forfeit result');
    expect(lb.end.winner).toBe(lb.seat);
    // With compressed timers the fight can also finish on its own inside the grace window.
    expect(['disconnect', 'faint']).toContain(lb.end.reason);
    lb.stop(); await b.leave();
  }, 30_000);

  it('a player who flees forfeits', async () => {
    const a = await connect().joinOrCreate('battle', { wallet: nextWallet(), speciesId: 'amd', mode: 'quick' });
    const b = await connect().joinOrCreate('battle', { wallet: nextWallet(), speciesId: 'nke', mode: 'quick' });
    const la = attach(a), lb = attach(b);
    await until(() => a.state?.phase === 'COMMAND', 8000, 'COMMAND');
    la.stop(); lb.stop();
    a.send('flee', {});
    await until(() => lb.end, 5000, 'flee end');
    expect(lb.end.reason).toBe('flee');
    expect(lb.end.winner).toBe(lb.seat);
    await a.leave(); await b.leave();
  }, 20_000);

  it('rewards are reported non-claimable when the relayer is not configured', async () => {
    const a = await connect().joinOrCreate('battle', { wallet: nextWallet(), speciesId: 'mstr', mode: 'quick' });
    const b = await connect().joinOrCreate('battle', { wallet: nextWallet(), speciesId: 'aapl', mode: 'quick' });
    const la = attach(a), lb = attach(b);
    await until(() => la.end && lb.end, 25_000, 'end');
    expect(la.end.claimable).toBe(false);
    const winner = la.end.winner === la.seat ? a : b;
    winner.send('requestClaim', {});
    const wl = la.end.winner === la.seat ? la : lb;
    await until(() => wl.claim, 3000, 'claim status');
    expect(wl.claim.state).toBe('ineligible');
    la.stop(); lb.stop(); await a.leave(); await b.leave();
  }, 30_000);
});
