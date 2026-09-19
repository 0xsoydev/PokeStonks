import { Room, Client } from 'colyseus';
import { BattleState } from '../state/BattleState.ts';
import { PlayerState } from '../state/PlayerState.ts';
import { MonState } from '../state/MonState.ts';
import { BrokerBot } from '../bot/BrokerBot.ts';
import { getMove, legalMoves } from 'game-core/moves.ts';
import { computeDamage, stockBuffFromPct, accuracyCheck, missChanceFromTap } from 'game-core/damage.ts';
import { z } from 'zod';
import * as crypto from 'crypto';

const TURN_TIME_MS = 30_000;
const MAX_MSG_PER_SEC = 10;

const LockMoveSchema = z.object({
  turnNo: z.number().int().min(0),
  moveId: z.string(),
  tapCategory: z.enum(['perfect', 'good', 'miss']),
});

interface ClientState {
  msgCount: number;
  lastMsgReset: number;
  bot?: BrokerBot;
  seatIndex: number;
}

export class BattleRoom extends Room<BattleState> {
  private rngSeed = crypto.randomBytes(16).toString('hex');
  private clientData = new Map<Client, ClientState>();
  private turnTimer?: ReturnType<typeof setTimeout>;
  private seatCounter = 0;
  private botClient?: { sessionId: string };

  // Seeded RNG for auditability
  private rngCounter = 0;
  private serverRand(max: number): number {
    const hash = crypto.createHash('sha256');
    hash.update(this.rngSeed + ':' + this.rngCounter++);
    const buf = hash.digest();
    return buf.readUInt32BE(0) % max;
  }

  onCreate(options: any) {
    this.maxClients = 2;
    this.setState(new BattleState());
    this.state.phase = 'INTRO';
    this.state.turnNo = 0;

    // Seed stock buffs from options (default 1.0)
    this.state.tickerA = options?.tickerA ?? '';
    this.state.tickerB = options?.tickerB ?? '';
    this.state.stockBuffA = options?.stockBuffA ?? 1;
    this.state.stockBuffB = options?.stockBuffB ?? 1;

    // Register message handlers with rate-limit
    this.onMessage('lockMove', (client, data) => {
      if (!this.rateLimit(client)) return;
      this.handleLockMove(client, data);
    });
    this.onMessage('flee', (client) => {
      if (!this.rateLimit(client)) return;
      this.handleFlee(client);
    });
    this.onMessage('requestVoucher', (client) => {
      if (!this.rateLimit(client)) return;
      this.handleRequestVoucher(client);
    });

    // After INTRO, transition to COMMAND
    this.clock.setTimeout(() => {
      this.state.phase = 'COMMAND';
      this.startTurnTimer();
    }, 3000);
  }

  onJoin(client: Client, options: any) {
    const seat = this.seatCounter++;
    const cs: ClientState = {
      msgCount: 0,
      lastMsgReset: Date.now(),
      seatIndex: seat,
    };
    this.clientData.set(client, cs);

    const player = new PlayerState();
    player.wallet = options?.wallet ?? `bot_${client.sessionId}`;
    player.connected = true;
    player.isBot = false;

    // Initialize mon from options or default
    const mon = new MonState();
    mon.id = options?.monId ?? 'BROKER_A';
    mon.affinity = options?.affinity ?? 'Electric';
    mon.level = options?.level ?? 5;
    mon.maxHp = options?.maxHp ?? 52;
    mon.hp = mon.maxHp;
    mon.atk = options?.atk ?? 48;
    mon.def = options?.def ?? 40;
    mon.spa = options?.spa ?? 65;
    mon.spd = options?.spd ?? 50;
    mon.spe = options?.spe ?? 55;
    // Initialize PP
    const learnset = options?.learnset ?? ['TACKLE', 'THUNDER', 'QUICK_ATTACK', 'GROWL'];
    for (const moveId of learnset) {
      const m = getMove(moveId);
      mon.pp.set(moveId, m.pp);
    }
    player.active = mon;

    const key = seat === 0 ? 'A' : 'B';
    this.state.players.set(key, player);

    // Bot slot handling
    if (options?.isBot) {
      player.isBot = true;
      player.wallet = `bot_${client.sessionId}`;
      cs.bot = new BrokerBot();
      this.botClient = { sessionId: client.sessionId };
    }
  }

  onDrop(client: Client, consented: boolean) {
    const cs = this.clientData.get(client);
    if (!cs) return;

    if (!consented) {
      // Allow reconnection for 30s
      this.allowReconnection(client, 30).then(() => {
        // Client reconnected - state is auto-synced by Colyseus
        const key = cs.seatIndex === 0 ? 'A' : 'B';
        const player = this.state.players.get(key);
        if (player) player.connected = true;
      }).catch(() => {
        // 30s timeout - opponent wins
        this.awardWin(cs.seatIndex === 0 ? 'B' : 'A');
      });
    } else {
      // Consented leave - opponent wins immediately
      this.awardWin(cs.seatIndex === 0 ? 'B' : 'A');
    }
  }

  onDispose() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
  }

  private rateLimit(client: Client): boolean {
    const cs = this.clientData.get(client);
    if (!cs) return false;
    const now = Date.now();
    if (now - cs.lastMsgReset > 1000) {
      cs.msgCount = 0;
      cs.lastMsgReset = now;
    }
    cs.msgCount++;
    if (cs.msgCount > MAX_MSG_PER_SEC) {
      client.close(4000, 'rate limit exceeded');
      return false;
    }
    return true;
  }

  private handleLockMove(client: Client, data: any) {
    if (this.state.phase !== 'COMMAND') return;
    if (this.state.winner) return;

    const cs = this.clientData.get(client);
    if (!cs) return;

    const key = cs.seatIndex === 0 ? 'A' : 'B';
    const player = this.state.players.get(key);
    if (!player || player.locked) return;

    // Validate with Zod
    const parsed = LockMoveSchema.safeParse(data);
    if (!parsed.success) return;
    const { turnNo, moveId, tapCategory } = parsed.data;

    // Anti-cheat: turnNo must match
    if (turnNo !== this.state.turnNo) return;

    // Move must be legal
    const move = getMove(moveId);
    if (move.id !== moveId && moveId !== 'STRUGGLE') return;

    // PP check (STRUGGLE bypass)
    if (moveId !== 'STRUGGLE') {
      const pp = player.active.pp.get(moveId) ?? 0;
      if (pp <= 0) return;
    }

    // Alive check
    if (player.active.hp <= 0) return;

    // All PP = 0 → auto-Struggle
    let finalMove = moveId;
    const ppEntries: Record<string, number> = {};
    player.active.pp.forEach((v, k) => { ppEntries[k] = v; });
    if (legalMoves(ppEntries).length === 0 && moveId !== 'STRUGGLE') {
      finalMove = 'STRUGGLE';
    }

    // Lock it in
    player.locked = true;
    player.lockedMove = finalMove;
    player.lockedTap = tapCategory;

    // Consume PP
    if (finalMove !== 'STRUGGLE') {
      const pp = player.active.pp.get(finalMove) ?? 0;
      player.active.pp.set(finalMove, Math.max(0, pp - 1));
    }

    // Check if both locked → resolve
    const players = ['A', 'B'];
    const allLocked = players.every(k => this.state.players.get(k)?.locked);
    if (allLocked) {
      this.resolveTurn();
    }
  }

  private handleFlee(client: Client) {
    if (this.state.phase !== 'COMMAND') return;
    const cs = this.clientData.get(client);
    if (!cs) return;
    const key = cs.seatIndex === 0 ? 'A' : 'B';
    const player = this.state.players.get(key);
    if (!player || player.locked) return;

    // Flee: 50% chance
    const fled = this.serverRand(2) === 0;
    if (fled) {
      this.state.winner = cs.seatIndex === 0 ? 'B' : 'A';
      this.state.phase = 'END';
      this.broadcast('battleEnd', {
        winner: this.state.winner,
        stake: 0,
        priceProof: '',
      });
      if (this.turnTimer) clearTimeout(this.turnTimer);
    } else {
      // Failed flee - wasted turn
      player.locked = true;
      player.lockedMove = 'STRUGGLE';
      player.lockedTap = 'good';
      const allLocked = ['A', 'B'].every(k => this.state.players.get(k)?.locked);
      if (allLocked) this.resolveTurn();
    }
  }

  private handleRequestVoucher(client: Client) {
    // Placeholder - will sign EIP-712 voucher in web3 module
    this.broadcast('voucher', {
      claim: { to: '', token: '', amount: 0, brokerId: 0, roomId: this.roomId, nonce: 0, deadline: 0 },
      sig: '0x',
    });
  }

  private startTurnTimer() {
    this.state.turnDeadline = Date.now() + TURN_TIME_MS;
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = setTimeout(() => {
      this.autoLockExpired();
    }, TURN_TIME_MS);
  }

  private autoLockExpired() {
    const players = ['A', 'B'] as const;
    for (const key of players) {
      const p = this.state.players.get(key);
      if (p && !p.locked && p.active.hp > 0) {
        // Auto-pick first legal move at 'good' tap
        const ppEntries: Record<string, number> = {};
        p.active.pp.forEach((v, k) => { ppEntries[k] = v; });
        const moves = legalMoves(ppEntries);
        p.locked = true;
        p.lockedMove = moves.length > 0 ? moves[0] : 'STRUGGLE';
        p.lockedTap = 'good';

        // Consume PP
        if (p.lockedMove !== 'STRUGGLE') {
          const pp = p.active.pp.get(p.lockedMove) ?? 0;
          p.active.pp.set(p.lockedMove, Math.max(0, pp - 1));
        }
      }
    }
    this.resolveTurn();
  }

  private resolveTurn() {
    if (this.turnTimer) clearTimeout(this.turnTimer);

    const pA = this.state.players.get('A')!;
    const pB = this.state.players.get('B')!;

    // Turn order: priority desc → speed desc → random tie
    const moveA = getMove(pA.lockedMove);
    const moveB = getMove(pB.lockedMove);

    const orderA = { priority: moveA.priority, speed: pA.active.spe, key: 'A' as const };
    const orderB = { priority: moveB.priority, speed: pB.active.spe, key: 'B' as const };

    const first = orderA.priority > orderB.priority ? orderA
      : orderB.priority > orderA.priority ? orderB
      : orderA.speed > orderB.speed ? orderA
      : orderB.speed > orderA.speed ? orderB
      : this.serverRand(2) === 0 ? orderA : orderB;

    const second = first.key === 'A' ? orderB : orderA;
    const attacker = first.key === 'A' ? pA : pB;
    const defender = first.key === 'A' ? pB : pA;
    const atkKey = first.key;
    const defKey = first.key === 'A' ? 'B' : 'A';

    const events: any[] = [];

    // Execute first attacker
    const event1 = this.executeMove(attacker, defender, atkKey, defKey);
    events.push(event1);

    // Check if defender fainted
    if (defender.active.hp > 0) {
      // Execute second attacker
      const event2 = this.executeMove(defender, attacker, defKey, atkKey);
      events.push(event2);
    }

    // Faint check → END
    const faintedA = pA.active.hp <= 0;
    const faintedB = pB.active.hp <= 0;

    if (faintedA || faintedB) {
      this.state.winner = faintedA ? 'B' : 'A';
      this.state.phase = 'END';
      this.broadcast('battleEnd', {
        winner: this.state.winner,
        stake: 0,
        priceProof: '',
      });
    } else {
      this.state.turnNo++;
      this.state.phase = 'COMMAND';
      this.startTurnTimer();
    }

    // Reset locks
    pA.locked = false;
    pB.locked = false;
    pA.lockedMove = '';
    pB.lockedMove = '';
    pA.lockedTap = '';
    pB.lockedTap = '';

    // Broadcast resolved turn
    this.broadcast('turnResolved', {
      turnNo: this.state.turnNo - (faintedA || faintedB ? 0 : 1),
      events,
    });
  }

  private executeMove(
    attacker: PlayerState,
    defender: PlayerState,
    atkKey: 'A' | 'B',
    defKey: 'A' | 'B',
  ): any {
    const move = getMove(attacker.lockedMove);
    const tapCategory = attacker.lockedTap as 'perfect' | 'good' | 'miss';
    const stockBuff = atkKey === 'A' ? this.state.stockBuffA : this.state.stockBuffB;

    const event: any = {
      by: atkKey,
      move: move.id,
      dmg: 0,
      crit: false,
      tapMult: 1,
      typeMult: 1,
      hpAfter: defender.active.hp,
      ppAfter: 0,
      msg: '',
      fx: '',
    };

    if (move.category === 'status') {
      // Growl: -1 target Atk stage
      if (move.id === 'GROWL') {
        defender.active.atkStage = Math.max(-6, defender.active.atkStage - 1);
        event.msg = `${attacker.active.id} used ${move.name}! ${defender.active.id}'s Attack fell!`;
      }
      event.ppAfter = attacker.active.pp.get(move.id) ?? 0;
      return event;
    }

    // Accuracy check
    const accRoll = this.serverRand(100);
    if (!accuracyCheck(move.accuracy, accRoll)) {
      event.msg = `${attacker.active.id}'s ${move.name} missed!`;
      event.fx = 'miss';
      event.ppAfter = attacker.active.pp.get(move.id) ?? 0;
      return event;
    }

    // Extra miss chance from tap miss
    if (tapCategory === 'miss' && this.serverRand(100) < 10) {
      event.msg = `${attacker.active.id}'s ${move.name} missed!`;
      event.fx = 'miss';
      event.ppAfter = attacker.active.pp.get(move.id) ?? 0;
      return event;
    }

    // Compute damage
    const atkStat = move.category === 'physical' ? attacker.active.atk : attacker.active.spa;
    const defStat = move.category === 'physical' ? defender.active.def : defender.active.spd;
    const defStage = move.category === 'physical' ? defender.active.defStage : 0;

    const result = computeDamage({
      atkLevel: attacker.active.level,
      atkStat,
      atkAffinity: attacker.active.affinity as any,
      defStat,
      defStage,
      defAffinity: defender.active.affinity as any,
      move,
      tapCategory,
      stockBuff,
      critRoll: this.serverRand(16),
      spreadRoll: this.serverRand(16),
    });

    defender.active.hp = Math.max(0, defender.active.hp - result.damage);

    event.dmg = result.damage;
    event.crit = result.isCrit;
    event.tapMult = result.tapMult;
    event.typeMult = result.typeMultVal;
    event.hpAfter = defender.active.hp;
    event.ppAfter = attacker.active.pp.get(move.id) ?? 0;

    // Build message
    let msg = `${attacker.active.id} used ${move.name}!`;
    if (result.isCrit) msg += ' Critical hit!';
    if (result.typeMultVal > 1) msg += " It's super effective!";
    if (result.typeMultVal < 1) msg += " It's not very effective...";
    event.msg = msg;

    // Struggle recoil
    if (move.id === 'STRUGGLE') {
      const recoil = Math.max(1, Math.floor(attacker.active.maxHp / 4));
      attacker.active.hp = Math.max(1, attacker.active.hp - recoil);
    }

    return event;
  }

  private awardWin(winnerKey: string) {
    this.state.winner = winnerKey;
    this.state.phase = 'END';
    this.broadcast('battleEnd', {
      winner: winnerKey,
      stake: 0,
      priceProof: '',
    });
    if (this.turnTimer) clearTimeout(this.turnTimer);
  }
}
