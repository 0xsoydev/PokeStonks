import { Room, Client, ServerError, CloseCode, type Delayed } from 'colyseus';
import { z } from 'zod';
import {
  buildMon, DEFAULT_LEVEL, getSpecies, isSpeciesId, SPECIES_IDS, ROUTE_TABLES, getMarket, pickSlot,
  TIMING, MSG, PROTOCOL_VERSION, type SeatKey, type BattleEnd, type ClaimStatus, type BrokerMon, type TapCategory,
} from 'game-core';
import { BattleState, PlayerState, MonState } from '../state/schemas.ts';
import { BattleEngine, other, type Choice, type EndReason } from '../engine/battle.ts';
import { chooseBotMove } from '../engine/bot.ts';
import { cryptoRng } from '../engine/rng.ts';
import { config } from '../config.ts';
import { prices, claims } from '../services.ts';

const JoinOptions = z.object({
  wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'wallet must be an 0x address'),
  speciesId: z.string().refine(isSpeciesId, 'unknown species'),
  mode: z.enum(['quick', 'practice', 'private']).default('quick'),
  marketId: z.string().max(24).optional(),
  protocol: z.number().int().optional(),
});
type Join = z.infer<typeof JoinOptions>;

const LockMove = z.object({
  turnNo: z.number().int().min(0).max(10_000),
  moveId: z.string().min(1).max(32),
  tap: z.enum(['perfect', 'good', 'miss']),
});
const TurnAck = z.object({ turnNo: z.number().int().min(0).max(10_000) });

const ALL: SeatKey[] = ['A', 'B'];
const CLAIM_LINGER_MS = 150_000;
const MAX_IDLE_STRIKES = 3;

/** Scale a wait down in tests; identity in production. */
const T = (ms: number) => (config.fastTiming ? Math.max(15, Math.floor(ms * 0.02)) : ms);

function pickBotSpecies(marketId: string | undefined, avoid: string): string {
  const theme = getMarket(marketId ?? '')?.routeTheme ?? 'tech';
  const table = ROUTE_TABLES[theme];
  for (let i = 0; i < 8; i++) {
    const id = pickSlot(table, () => cryptoRng.int(1_000_000) / 1_000_000).speciesId;
    if (id !== avoid) return id;
  }
  return SPECIES_IDS.find((s) => s !== avoid) ?? SPECIES_IDS[0];
}

/**
 * One authoritative 1v1 battle. The client sends INPUTS only (a species pick, a move + tap bucket);
 * the server owns stats, RNG, ordering, PP, HP and the result. A seat's chosen move is private until
 * the turn resolves.
 */
export class BattleRoom extends Room<{ state: BattleState }> {
  maxClients = 2;
  autoDispose = true;
  maxMessagesPerSecond = 20;

  private engine?: BattleEngine;
  private seatBySession = new Map<string, SeatKey>();
  private joinOf = new Map<SeatKey, Join>();
  private choices: Partial<Record<SeatKey, Choice>> = {};
  private readies = new Set<SeatKey>();
  private acks = new Set<SeatKey>();
  private idleStrikes: Record<SeatKey, number> = { A: 0, B: 0 };
  private botKey?: SeatKey;
  private stamp = Date.now();
  private started = false;
  private finished = false;
  private resolvingTurn = -1;
  private claimRequested = false;
  private lastClaim?: ClaimStatus;
  private endInfo?: BattleEnd;

  private botTimer?: Delayed;
  private waitTicker?: Delayed;
  private readyTimer?: Delayed;
  private turnTimer?: Delayed;
  private ackTimer?: Delayed;
  private endTimer?: Delayed;
  private waitDeadline = 0;

  // ─────────────────────────────── lifecycle ───────────────────────────────

  onCreate(options: { mode?: string; marketId?: string }) {
    const mode = options?.mode === 'practice' || options?.mode === 'private' ? options.mode : 'quick';
    this.setState(new BattleState());
    this.state.phase = 'WAITING';
    this.state.mode = mode;
    this.state.marketId = options?.marketId ?? '';
    if (mode === 'private') this.setPrivate(true);

    this.onMessage(MSG.ready, (client) => this.onReady(client));
    this.onMessage(MSG.lockMove, (client, raw) => this.onLockMove(client, raw));
    this.onMessage(MSG.turnAck, (client, raw) => this.onTurnAck(client, raw));
    this.onMessage(MSG.flee, (client) => this.onFlee(client));
    this.onMessage(MSG.requestClaim, (client) => this.onRequestClaim(client));
  }

  async onAuth(_client: Client, options: unknown): Promise<Join> {
    const parsed = JoinOptions.safeParse(options);
    if (!parsed.success) throw new ServerError(4400, 'Invalid join options');
    const o = parsed.data;
    if (o.protocol !== undefined && o.protocol !== PROTOCOL_VERSION) {
      throw new ServerError(4426, 'Your game is out of date. Refresh the page.');
    }
    // One wallet can't fight itself for rewards (private rooms are for friends/testing).
    if (this.state.mode !== 'private') {
      for (const j of this.joinOf.values()) {
        if (j.wallet.toLowerCase() === o.wallet.toLowerCase()) throw new ServerError(4409, 'That wallet is already in this match');
      }
    }
    return o;
  }

  onJoin(client: Client, _options: unknown, auth: Join) {
    const key: SeatKey = this.state.players.has('A') ? 'B' : 'A';
    this.seatBySession.set(client.sessionId, key);
    this.joinOf.set(key, auth);
    this.addPlayer(key, buildMon(auth.speciesId, DEFAULT_LEVEL), auth.wallet, false, client.sessionId);
    client.send(MSG.seat, { key, roomId: this.roomId });

    if (this.state.players.has('A') && this.state.players.has('B')) {
      void this.onBothSeated();
      return;
    }
    // Alone: wait for a human, then fall back to a Broker bot.
    const mode = this.state.mode;
    if (mode === 'practice') {
      this.botTimer = this.clock.setTimeout(() => this.fillBot(), T(500));
    } else if (mode === 'quick') {
      const ms = config.queueBotMs ?? TIMING.QUEUE_BOT_MS;
      this.waitDeadline = Date.now() + ms;
      this.state.waitMs = ms;
      this.botTimer = this.clock.setTimeout(() => this.fillBot(), ms);
      this.waitTicker = this.clock.setInterval(() => {
        this.state.waitMs = Math.max(0, this.waitDeadline - Date.now());
      }, 500);
    }
  }

  /** Unexpected disconnect: hold the seat, then forfeit if they don't return. */
  async onDrop(client: Client) {
    const key = this.seatBySession.get(client.sessionId);
    if (!key) return;
    if (this.finished || this.state.phase === 'WAITING') return; // onLeave cleans up
    const p = this.state.players.get(key);
    if (p) p.connected = false;
    try {
      await this.allowReconnection(client, config.reconnectSeconds);
    } catch {
      this.forfeit(key, 'disconnect');
    }
  }

  onReconnect(client: Client) {
    const key = this.seatBySession.get(client.sessionId);
    if (!key) return;
    const p = this.state.players.get(key);
    if (p) p.connected = true;
    client.send(MSG.seat, { key, roomId: this.roomId });
    // Re-send anything the client may have missed; state itself is snapshotted automatically.
    if (this.endInfo) client.send(MSG.battleEnd, this.endInfo);
    if (this.lastClaim) client.send(MSG.claimStatus, this.lastClaim);
  }

  onLeave(client: Client, code?: number) {
    const key = this.seatBySession.get(client.sessionId);
    if (!key) return;
    if (this.state.phase === 'WAITING') {
      this.state.players.delete(key);
      this.joinOf.delete(key);
      this.seatBySession.delete(client.sessionId);
      this.botTimer?.clear();
      this.waitTicker?.clear();
      this.state.waitMs = 0;
      return;
    }
    // Consented leave = the player quit; anything else = their connection dropped and never came back.
    if (!this.finished) this.forfeit(key, code === CloseCode.CONSENTED ? 'forfeit' : 'disconnect');
  }

  onDispose() {
    for (const t of [this.botTimer, this.waitTicker, this.readyTimer, this.turnTimer, this.ackTimer, this.endTimer]) t?.clear();
  }

  // ───────────────────────────── seat / setup ──────────────────────────────

  private addPlayer(key: SeatKey, mon: BrokerMon, wallet: string, isBot: boolean, sessionId = '') {
    const p = new PlayerState();
    p.sessionId = sessionId;
    p.wallet = wallet;
    p.ticker = getSpecies(mon.speciesId).ticker;
    p.isBot = isBot;
    p.connected = true;
    p.locked = false;
    const m = new MonState();
    m.speciesId = mon.speciesId; m.name = mon.name; m.affinity = mon.affinity; m.level = mon.level;
    m.maxHp = mon.maxHp; m.atk = mon.atk; m.def = mon.def; m.spa = mon.spa; m.spd = mon.spd; m.spe = mon.spe;
    for (const id of mon.moves) m.moves.push(id);
    p.active = m;
    this.state.players.set(key, p);
    this.pushMon(key, mon);
  }

  private pushMon(key: SeatKey, mon: BrokerMon) {
    const m = this.state.players.get(key)!.active;
    m.hp = mon.hp;
    for (const [id, n] of Object.entries(mon.pp)) m.pp.set(id, n);
    m.atkStage = mon.stages.atk; m.defStage = mon.stages.def; m.spaStage = mon.stages.spa;
    m.spdStage = mon.stages.spd; m.speStage = mon.stages.spe;
  }

  private fillBot() {
    if (this.started || this.state.players.has('B') || this.state.players.size === 0) return;
    const humanKey: SeatKey = this.state.players.has('A') ? 'A' : 'B';
    const botKey = other(humanKey);
    const human = this.state.players.get(humanKey)!;
    const speciesId = pickBotSpecies(this.state.marketId, human.active.speciesId);
    this.botKey = botKey;
    this.readies.add(botKey);
    this.acks.add(botKey);
    this.addPlayer(botKey, buildMon(speciesId, DEFAULT_LEVEL), '', true);
    void this.onBothSeated();
  }

  private async onBothSeated() {
    if (this.started) return;
    this.started = true;
    this.botTimer?.clear();
    this.waitTicker?.clear();
    this.state.waitMs = 0;
    await this.lock();

    const monOf = (k: SeatKey): BrokerMon => {
      const m = this.state.players.get(k)!.active;
      return buildMon(m.speciesId, m.level);
    };
    const [mA, mB] = await Promise.all([
      prices.mood(this.state.players.get('A')!.active.speciesId),
      prices.mood(this.state.players.get('B')!.active.speciesId),
    ]);
    const seat = (k: SeatKey, buff: number) => ({
      key: k, mon: monOf(k), ticker: this.state.players.get(k)!.ticker, buff,
    });
    this.engine = new BattleEngine(seat('A', mA.buff), seat('B', mB.buff), cryptoRng);
    this.state.moodA = mA.buff;
    this.state.moodB = mB.buff;
    this.broadcast(MSG.mood, { A: mA.buff, B: mB.buff, pctA: mA.pct, pctB: mB.pct });

    this.state.phase = 'INTRO';
    // Start anyway if a client never reports ready (background tab, slow load).
    this.readyTimer = this.clock.setTimeout(() => this.beginIntro(), T(TIMING.READY_TIMEOUT_MS));
    this.maybeBegin();
  }

  // ─────────────────────────────── messages ────────────────────────────────

  private seatOf(client: Client): SeatKey | undefined {
    return this.seatBySession.get(client.sessionId);
  }

  private humanSeats(): SeatKey[] {
    return ALL.filter((k) => k !== this.botKey && this.state.players.has(k));
  }

  private onReady(client: Client) {
    const key = this.seatOf(client);
    if (!key || this.state.phase !== 'INTRO') return;
    this.readies.add(key);
    this.maybeBegin();
  }

  private maybeBegin() {
    if (this.state.phase !== 'INTRO' || !this.engine) return;
    if (ALL.every((k) => this.readies.has(k))) this.beginIntro();
  }

  private introDone = false;
  private beginIntro() {
    if (this.introDone || !this.engine) return;
    this.introDone = true;
    this.readyTimer?.clear();
    this.clock.setTimeout(() => this.openCommand(), T(TIMING.INTRO_MS));
  }

  private onLockMove(client: Client, raw: unknown) {
    const key = this.seatOf(client);
    if (!key || !this.engine) return;
    const parsed = LockMove.safeParse(raw);
    if (!parsed.success) return this.reject(client, 'Malformed move.');
    const { turnNo, moveId, tap } = parsed.data;
    if (this.state.phase !== 'COMMAND' || this.finished) return this.reject(client, 'Not accepting moves right now.');
    if (turnNo !== this.engine.turnNo) return this.reject(client, 'That turn is already over.');
    if (this.choices[key]) return; // duplicate lock — first commit wins
    if (!this.engine.isLegal(key, moveId)) return this.reject(client, 'That move is not available.');
    this.idleStrikes[key] = 0;
    this.lockChoice(key, { moveId, tap: tap as TapCategory });
  }

  private reject(client: Client, reason: string) {
    client.send(MSG.rejected, { reason });
  }

  private lockChoice(key: SeatKey, choice: Choice) {
    if (this.choices[key] || this.state.phase !== 'COMMAND') return;
    this.choices[key] = choice;
    const p = this.state.players.get(key);
    if (p) p.locked = true;
    if (ALL.every((k) => this.choices[k])) this.resolve();
  }

  private onFlee(client: Client) {
    const key = this.seatOf(client);
    if (!key || this.finished || !this.engine) return;
    // Quitting counts at any point in the fight, including while animations play.
    if (this.state.phase === 'WAITING' || this.state.phase === 'END') return;
    this.forfeit(key, 'flee');
  }

  private onTurnAck(client: Client, raw: unknown) {
    const key = this.seatOf(client);
    const parsed = TurnAck.safeParse(raw);
    if (!key || !parsed.success || parsed.data.turnNo !== this.resolvingTurn) return;
    this.acks.add(key);
    this.checkAcks();
  }

  // ───────────────────────────── turn machinery ────────────────────────────

  private turnMs(): number {
    return this.state.mode === 'practice' ? TIMING.PRACTICE_TURN_MS : TIMING.TURN_MS;
  }

  private openCommand() {
    if (!this.engine || this.finished) return;
    this.choices = {};
    for (const k of ALL) { const p = this.state.players.get(k); if (p) p.locked = false; }
    const ms = this.turnMs();
    this.state.turnNo = this.engine.turnNo;
    this.state.turnMs = ms;
    this.state.phase = 'COMMAND';
    this.turnTimer?.clear();
    // +250ms grace so a tap landing on the buzzer still counts.
    this.turnTimer = this.clock.setTimeout(() => this.onTurnExpired(), T(ms) + T(250));

    if (this.botKey) {
      const key = this.botKey;
      const think = TIMING.BOT_THINK_MIN_MS + cryptoRng.int(TIMING.BOT_THINK_MAX_MS - TIMING.BOT_THINK_MIN_MS);
      this.clock.setTimeout(() => {
        if (this.state.phase === 'COMMAND' && !this.finished && this.engine) {
          this.lockChoice(key, chooseBotMove(this.engine, key, cryptoRng));
        }
      }, T(think));
    }
  }

  private onTurnExpired() {
    if (this.state.phase !== 'COMMAND' || !this.engine || this.finished) return;
    for (const k of ALL) {
      if (this.choices[k]) continue;
      // A dropped player is covered by the reconnect window, not the AFK counter.
      const connected = this.state.players.get(k)?.connected !== false;
      if (connected) this.idleStrikes[k]++;
      if (this.idleStrikes[k] >= MAX_IDLE_STRIKES && k !== this.botKey) {
        this.forfeit(k, 'forfeit'); // AFK: don't hold the opponent hostage
        return;
      }
      this.lockChoice(k, this.engine.autoChoice(k));
    }
  }

  private resolve() {
    const engine = this.engine;
    if (!engine || this.finished || this.state.phase !== 'COMMAND') return;
    this.turnTimer?.clear();
    this.state.phase = 'RESOLVE';
    const turnNo = engine.turnNo;
    const events = engine.resolveTurn(this.choices as Record<SeatKey, Choice>);
    this.choices = {};
    for (const k of ALL) this.pushMon(k, engine.seats[k].mon);
    this.resolvingTurn = turnNo;
    this.acks = new Set(this.botKey ? [this.botKey] : []);
    this.broadcast(MSG.turnResolved, { turnNo, events });

    const wait = Math.min(
      TIMING.RESOLVE_BASE_MS + events.length * TIMING.RESOLVE_PER_EVENT_MS + (engine.winner ? 1500 : 0),
      15_000,
    );
    this.ackTimer?.clear();
    this.ackTimer = this.clock.setTimeout(() => this.afterResolve(), T(wait));
    this.checkAcks();
  }

  private checkAcks() {
    if (this.state.phase !== 'RESOLVE') return;
    const waiting = this.humanSeats().filter((k) => this.state.players.get(k)?.connected && !this.acks.has(k));
    if (waiting.length === 0) this.afterResolve();
  }

  private afterResolve() {
    if (this.state.phase !== 'RESOLVE') return;
    this.ackTimer?.clear();
    if (this.engine?.winner) this.endBattle();
    else this.openCommand();
  }

  // ─────────────────────────────── ending ──────────────────────────────────

  private forfeit(loser: SeatKey, reason: EndReason) {
    if (this.finished || !this.engine) {
      // Left before the engine existed (e.g. during price fetch): just close out.
      if (!this.finished) { this.finished = true; this.state.phase = 'END'; this.endTimer = this.clock.setTimeout(() => this.disconnect(), 1000); }
      return;
    }
    this.engine.forfeit(loser, reason);
    this.turnTimer?.clear();
    this.ackTimer?.clear();
    this.endBattle();
  }

  private endBattle() {
    const engine = this.engine;
    if (!engine || this.finished || !engine.winner) return;
    this.finished = true;
    this.turnTimer?.clear();
    this.ackTimer?.clear();
    const winner = engine.winner;
    const loser = other(winner);
    const winP = this.state.players.get(winner)!;
    const loseSp = getSpecies(engine.seats[loser].mon.speciesId);
    const claimable = !winP.isBot && this.state.mode !== 'practice' && Boolean(winP.wallet) && claims.enabled;

    this.state.winner = winner;
    this.state.phase = 'END';
    this.endInfo = {
      winner, reason: engine.endReason ?? 'faint', turns: engine.turnNo, roomId: this.roomId,
      ticker: loseSp.ticker, claimable,
    };
    this.broadcast(MSG.battleEnd, this.endInfo);
    this.endTimer = this.clock.setTimeout(() => this.disconnect(), CLAIM_LINGER_MS);
  }

  private onRequestClaim(client: Client) {
    const key = this.seatOf(client);
    const send = (s: ClaimStatus) => { this.lastClaim = s; try { client.send(MSG.claimStatus, s); } catch { /* client gone; tx continues */ } };
    if (!key || !this.engine || !this.finished || !this.endInfo) return this.reject(client, 'The battle is not over.');
    if (key !== this.endInfo.winner) return send({ state: 'ineligible', error: 'Only the winner can claim the prize.' });
    if (!this.endInfo.claimable) return send({ state: 'ineligible', error: claims.enabled ? 'This match does not pay rewards.' : 'Rewards are not live on this server yet.' });
    if (this.claimRequested) { if (this.lastClaim) client.send(MSG.claimStatus, this.lastClaim); return; }
    this.claimRequested = true;

    const loser = other(key);
    const winP = this.state.players.get(key)!;
    const losP = this.state.players.get(loser)!;
    const loseSp = getSpecies(this.engine.seats[loser].mon.speciesId);
    const humanFoe = !losP.isBot;
    void claims.claim({
      roomId: this.roomId,
      roomStamp: this.stamp,
      winner: winP.wallet as `0x${string}`,
      loser: humanFoe ? (losP.wallet as `0x${string}`) : undefined,
      ticker: loseSp.ticker,
      prizeSpeciesId: loseSp.id,
      humanFoe,
      captureSpeciesNum: loseSp.num,
      level: this.engine.seats[key].mon.level,
    }, send);
  }
}
