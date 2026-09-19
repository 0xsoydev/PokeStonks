import { Client, type Room } from '@colyseus/sdk';
import {
  MSG, PROTOCOL_VERSION, ROOM_NAME,
  type SeatKey, type StatKey, type TapCategory, type TurnResolved, type BattleEnd, type ClaimStatus,
  type BattleJoinOptions,
} from 'game-core';

export type ConnState = 'online' | 'reconnecting' | 'closed';

export interface MonView {
  speciesId: string; name: string; affinity: string; level: number;
  hp: number; maxHp: number;
  atk: number; def: number; spa: number; spd: number; spe: number;
  moves: string[];
  pp: Record<string, number>;
  stages: Record<StatKey, number>;
}

export interface PlayerView {
  sessionId: string; wallet: string; ticker: string;
  isBot: boolean; connected: boolean; locked: boolean;
  mon: MonView;
}

export interface Snapshot {
  phase: 'WAITING' | 'INTRO' | 'COMMAND' | 'RESOLVE' | 'END';
  mode: string;
  turnNo: number;
  turnMs: number;
  waitMs: number;
  winner: string;
  moodA: number;
  moodB: number;
  players: Partial<Record<SeatKey, PlayerView>>;
}

export function colyseusUrl(): string {
  const env = process.env.NEXT_PUBLIC_COLYSEUS_URL;
  if (env) return env;
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    return `${protocol === 'https:' ? 'wss' : 'ws'}://${hostname}:2567`;
  }
  return 'ws://localhost:2567';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Listener<T> = (v: T) => void;

/**
 * Client end of one battle room. Attaches every message handler at join time and buffers what
 * arrives, so nothing is lost while the encounter cutscene is still playing. Seat identity comes
 * from synced state (`sessionId`), never from a one-shot message.
 */
export class BattleSession {
  conn: ConnState = 'online';
  battleEnd: BattleEnd | null = null;
  lastClaim: ClaimStatus | null = null;
  mood = { A: 1, B: 1, pctA: 0, pctB: 0 };
  private turns: TurnResolved[] = [];
  private seenTurns = new Set<number>();
  private cache: Snapshot | null = null;
  private dirty = true;
  private listeners = { turn: new Set<Listener<void>>(), end: new Set<Listener<BattleEnd>>(), claim: new Set<Listener<ClaimStatus>>(), conn: new Set<Listener<ConnState>>(), rejected: new Set<Listener<string>>() };
  private closed = false;

  private constructor(readonly client: Client, readonly room: Room<any, any>) {
    room.onStateChange(() => { this.dirty = true; });
    room.onMessage(MSG.turnResolved, (m: TurnResolved) => {
      if (this.seenTurns.has(m.turnNo)) return; // idempotent on replay
      this.seenTurns.add(m.turnNo);
      this.turns.push(m);
      this.listeners.turn.forEach((f) => f());
    });
    room.onMessage(MSG.battleEnd, (m: BattleEnd) => { this.battleEnd = m; this.listeners.end.forEach((f) => f(m)); });
    room.onMessage(MSG.claimStatus, (m: ClaimStatus) => { this.lastClaim = m; this.listeners.claim.forEach((f) => f(m)); });
    room.onMessage(MSG.mood, (m: BattleSession['mood']) => { this.mood = m; });
    room.onMessage(MSG.rejected, (m: { reason: string }) => this.listeners.rejected.forEach((f) => f(m.reason)));
    room.onMessage(MSG.seat, () => { /* state is the source of truth */ });
    room.onDrop(() => this.setConn('reconnecting'));
    room.onReconnect(() => { this.dirty = true; this.setConn('online'); });
    room.onLeave(() => this.setConn('closed'));
    room.onError(() => { /* surfaced through onLeave */ });
  }

  private static async connect(make: (c: Client) => Promise<Room<any, any>>): Promise<BattleSession> {
    const client = new Client(colyseusUrl());
    let last: unknown;
    for (let i = 0; i < 3; i++) {
      try {
        const room = await make(client);
        // The first state patch can land a tick after the join resolves.
        if (!room.state) await new Promise<void>((res) => room.onStateChange.once(() => res()));
        return new BattleSession(client, room);
      } catch (e: any) {
        last = e;
        const code = e?.code;
        // Out-of-date client / bad options / unknown duel code: retrying can't help.
        if (code === 4426 || code === 4400 || code === 4404 || /not found/i.test(e?.message ?? '')) break;
        await sleep(500 * (i + 1));
      }
    }
    throw new Error(readable(last));
  }

  /** Join (or create) a quick-match room. Retries transient failures; throws a readable Error. */
  static join(opts: Omit<BattleJoinOptions, 'protocol' | 'mode'>): Promise<BattleSession> {
    return BattleSession.connect((c) => c.joinOrCreate(ROOM_NAME, { ...opts, mode: 'quick', protocol: PROTOCOL_VERSION }));
  }

  /** Host a private duel. The room id is a short shareable code. */
  static host(opts: Omit<BattleJoinOptions, 'protocol' | 'mode'>): Promise<BattleSession> {
    return BattleSession.connect((c) => c.create(ROOM_NAME, { ...opts, mode: 'private', protocol: PROTOCOL_VERSION }));
  }

  /** Join a friend's duel by its code. */
  static joinCode(code: string, opts: Omit<BattleJoinOptions, 'protocol' | 'mode'>): Promise<BattleSession> {
    return BattleSession.connect((c) => c.joinById(code.trim().toUpperCase(), { ...opts, mode: 'private', protocol: PROTOCOL_VERSION }));
  }

  // ─────────────────────────────── state ───────────────────────────────────

  private setConn(c: ConnState) { this.conn = c; this.listeners.conn.forEach((f) => f(c)); }

  get roomId(): string { return this.room.roomId; }

  /** Plain-object view of synced state (cached until the next patch). */
  snapshot(): Snapshot | null {
    const st = this.room.state;
    if (!st) return null;
    if (!this.dirty && this.cache) return this.cache;
    const players: Snapshot['players'] = {};
    st.players?.forEach((p: any, k: string) => {
      const m = p.active;
      const pp: Record<string, number> = {};
      m.pp?.forEach((v: number, id: string) => { pp[id] = v; });
      players[k as SeatKey] = {
        sessionId: p.sessionId, wallet: p.wallet, ticker: p.ticker, isBot: p.isBot, connected: p.connected, locked: p.locked,
        mon: {
          speciesId: m.speciesId, name: m.name, affinity: m.affinity, level: m.level, hp: m.hp, maxHp: m.maxHp,
          atk: m.atk, def: m.def, spa: m.spa, spd: m.spd, spe: m.spe,
          moves: Array.from(m.moves as Iterable<string>),
          pp,
          stages: { atk: m.atkStage, def: m.defStage, spa: m.spaStage, spd: m.spdStage, spe: m.speStage },
        },
      };
    });
    this.cache = {
      phase: st.phase, mode: st.mode, turnNo: st.turnNo, turnMs: st.turnMs, waitMs: st.waitMs, winner: st.winner,
      moodA: st.moodA, moodB: st.moodB, players,
    };
    this.dirty = false;
    return this.cache;
  }

  mySeat(): SeatKey | null {
    const s = this.snapshot();
    if (!s) return null;
    for (const k of ['A', 'B'] as const) if (s.players[k]?.sessionId === this.room.sessionId) return k;
    return null;
  }

  foeSeat(): SeatKey | null {
    const me = this.mySeat();
    return me ? (me === 'A' ? 'B' : 'A') : null;
  }

  bothSeated(): boolean {
    const s = this.snapshot();
    return Boolean(s?.players.A && s?.players.B);
  }

  // ───────────────────────────── subscriptions ─────────────────────────────

  onTurn(f: Listener<void>) { this.listeners.turn.add(f); return () => this.listeners.turn.delete(f); }
  onEnd(f: Listener<BattleEnd>) { this.listeners.end.add(f); return () => this.listeners.end.delete(f); }
  onClaim(f: Listener<ClaimStatus>) { this.listeners.claim.add(f); return () => this.listeners.claim.delete(f); }
  onConn(f: Listener<ConnState>) { this.listeners.conn.add(f); return () => this.listeners.conn.delete(f); }
  onRejected(f: Listener<string>) { this.listeners.rejected.add(f); return () => this.listeners.rejected.delete(f); }

  /** Take (and clear) resolved turns that have arrived but not been played. Oldest first. */
  drainTurns(): TurnResolved[] {
    const t = this.turns.sort((a, b) => a.turnNo - b.turnNo);
    this.turns = [];
    return t;
  }

  hasPendingTurns(): boolean { return this.turns.length > 0; }

  // ─────────────────────────────── inputs ──────────────────────────────────

  ready() { this.send(MSG.ready, {}); }
  lock(turnNo: number, moveId: string, tap: TapCategory) { this.send(MSG.lockMove, { turnNo, moveId, tap }); }
  ack(turnNo: number) { this.send(MSG.turnAck, { turnNo }); }
  flee() { this.send(MSG.flee, {}); }
  requestClaim() { this.send(MSG.requestClaim, {}); }

  private send(type: string, payload: unknown) {
    if (this.closed) return;
    try { this.room.send(type, payload); } catch { /* connection is reconnecting; the server resyncs us */ }
  }

  async leave() {
    if (this.closed) return;
    this.closed = true;
    try { await this.room.leave(true); } catch { /* already gone */ }
  }
}

function readable(e: unknown): string {
  const err = e as { code?: number; message?: string } | undefined;
  if (err?.code === 4426) return 'Your game is out of date. Refresh the page.';
  if (err?.code === 4404 || /not found/i.test(err?.message ?? '')) return 'No duel found with that code. Check it and try again.';
  if (err?.code === 4409) return 'That wallet is already in a match. Give it a moment and try again.';
  const m = err?.message ?? '';
  if (/fetch failed|Failed to fetch|NetworkError|ECONNREFUSED|WebSocket/i.test(m) || !m) {
    return "Can't reach the battle server. Check your connection and try again.";
  }
  return m;
}
