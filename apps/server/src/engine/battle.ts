import {
  type BrokerMon, type SeatKey, type TapCategory, type TurnEvent, type StatChange,
  type StatKey, getMove, legalMoves, STRUGGLE, computeDamage, accuracyCheck,
  TAP_MISS_EXTRA_PCT, effectiveSpeed, clampStage, STAT_LABEL,
} from 'game-core';
import type { Rng } from './rng.ts';

export interface EngineSeat {
  key: SeatKey;
  mon: BrokerMon;
  /** Species ticker, e.g. "TSLA". */
  ticker: string;
  /** Live-price mood multiplier for THIS seat's outgoing damage: 0.9 | 1.0 | 1.1. */
  buff: number;
}

export interface Choice {
  moveId: string;
  tap: TapCategory;
}

export type EndReason = 'faint' | 'flee' | 'forfeit' | 'disconnect';

export const other = (k: SeatKey): SeatKey => (k === 'A' ? 'B' : 'A');

const STAGE_VERB: Record<number, string> = {
  [-2]: 'harshly fell!', [-1]: 'fell!', 1: 'rose!', 2: 'rose sharply!',
};

/**
 * Authoritative battle simulation. Pure: no I/O, no clocks, no Colyseus. All randomness comes
 * from the injected Rng, drawn in a fixed order so a seeded run is exactly reproducible.
 */
export class BattleEngine {
  readonly seats: Record<SeatKey, EngineSeat>;
  turnNo = 0;
  winner: SeatKey | null = null;
  endReason: EndReason | null = null;

  constructor(a: EngineSeat, b: EngineSeat, private readonly rng: Rng) {
    this.seats = { A: a, B: b };
  }

  /** Moves the player may choose this turn. Struggle only when every PP is spent. */
  legalMoveIds(key: SeatKey): string[] {
    const ids = legalMoves(this.seats[key].mon.pp);
    return ids.length > 0 ? ids : [STRUGGLE.id];
  }

  isLegal(key: SeatKey, moveId: string): boolean {
    return this.legalMoveIds(key).includes(moveId);
  }

  /** Default choice for a player who ran out the clock: first legal move, neutral tap. */
  autoChoice(key: SeatKey): Choice {
    return { moveId: this.legalMoveIds(key)[0], tap: 'good' };
  }

  forfeit(loser: SeatKey, reason: EndReason = 'forfeit'): void {
    if (this.winner) return;
    this.winner = other(loser);
    this.endReason = reason;
  }

  private order(c: Record<SeatKey, Choice>): [SeatKey, SeatKey] {
    const pa = getMove(c.A.moveId).priority;
    const pb = getMove(c.B.moveId).priority;
    if (pa !== pb) return pa > pb ? ['A', 'B'] : ['B', 'A'];
    const sa = effectiveSpeed(this.seats.A.mon);
    const sb = effectiveSpeed(this.seats.B.mon);
    if (sa !== sb) return sa > sb ? ['A', 'B'] : ['B', 'A'];
    return this.rng.int(2) === 0 ? ['A', 'B'] : ['B', 'A'];
  }

  /**
   * Resolve one full turn. Caller must already have validated both choices with `isLegal`.
   * Returns the ordered events both clients will animate.
   */
  resolveTurn(choices: Record<SeatKey, Choice>): TurnEvent[] {
    if (this.winner) return [];
    const events: TurnEvent[] = [];
    for (const key of this.order(choices)) {
      const actor = this.seats[key];
      if (actor.mon.hp <= 0) continue;
      events.push(this.execute(key, choices[key]));
      if (this.seats[other(key)].mon.hp <= 0) {
        this.winner = key;
        this.endReason = 'faint';
        break;
      }
    }
    this.turnNo++;
    return events;
  }

  private hp(): Record<SeatKey, number> {
    return { A: this.seats.A.mon.hp, B: this.seats.B.mon.hp };
  }

  private execute(key: SeatKey, choice: Choice): TurnEvent {
    const actor = this.seats[key];
    const foeKey = other(key);
    const target = this.seats[foeKey];
    const move = getMove(choice.moveId);

    if (move.id !== STRUGGLE.id) {
      actor.mon.pp[move.id] = Math.max(0, (actor.mon.pp[move.id] ?? 0) - 1);
    }
    const lines = [`${actor.mon.name} used ${move.name}!`];
    const ev: TurnEvent = {
      by: key, move: move.id, moveName: move.name, dmg: 0, crit: false, tapMult: 1, typeMult: 1,
      hp: this.hp(), ppAfter: actor.mon.pp[move.id] ?? 0, msg: '', fx: '',
    };

    // RNG draw order is fixed: accuracy, [tap-miss], crit, spread.
    const accRoll = this.rng.int(100);

    if (move.category === 'status') {
      const targetsFoe = (move.effects ?? []).some((e) => e.target === 'foe');
      if (targetsFoe && !accuracyCheck(move.accuracy, accRoll)) {
        lines.push(`${actor.mon.name}'s ${move.name} missed!`);
        ev.fx = 'miss';
      } else {
        const stats: StatChange[] = [];
        for (const e of move.effects ?? []) {
          const holder = e.target === 'self' ? actor : target;
          const cur = holder.mon.stages[e.stat as StatKey];
          const next = clampStage(cur + e.stages);
          if (next === cur) {
            lines.push(`${holder.mon.name}'s ${STAT_LABEL[e.stat]} won't go any ${e.stages > 0 ? 'higher' : 'lower'}!`);
          } else {
            holder.mon.stages[e.stat] = next;
            const verb = STAGE_VERB[Math.max(-2, Math.min(2, e.stages))] ?? (e.stages > 0 ? 'rose!' : 'fell!');
            lines.push(`${holder.mon.name}'s ${STAT_LABEL[e.stat]} ${verb}`);
            stats.push({ target: e.target === 'self' ? key : foeKey, stat: e.stat, stages: e.stages, now: next });
          }
        }
        if (stats.length > 0) { ev.fx = 'stat'; ev.stats = stats; }
      }
      ev.msg = lines.join('\n');
      return ev;
    }

    let hit = accuracyCheck(move.accuracy, accRoll);
    // Whiffing the tap bar carries an extra chance to miss outright.
    if (hit && choice.tap === 'miss' && this.rng.int(100) < TAP_MISS_EXTRA_PCT) hit = false;
    const critRoll = this.rng.int(16);
    const spreadRoll = this.rng.int(16);

    if (!hit) {
      lines.push(`${actor.mon.name}'s attack missed!`);
      ev.fx = 'miss';
      ev.msg = lines.join('\n');
      return ev;
    }

    const physical = move.category === 'physical';
    const out = computeDamage({
      level: actor.mon.level,
      atkStat: physical ? actor.mon.atk : actor.mon.spa,
      atkStage: physical ? actor.mon.stages.atk : actor.mon.stages.spa,
      atkAffinity: actor.mon.affinity,
      defStat: physical ? target.mon.def : target.mon.spd,
      defStage: physical ? target.mon.stages.def : target.mon.stages.spd,
      defAffinity: target.mon.affinity,
      move, tap: choice.tap, stockBuff: actor.buff, critRoll, spreadRoll,
    });

    const before = target.mon.hp;
    target.mon.hp = Math.max(0, before - out.damage);
    ev.dmg = before - target.mon.hp;
    ev.crit = out.isCrit;
    ev.tapMult = out.tapMult;
    ev.typeMult = out.typeMultVal;

    if (out.isCrit) lines.push('A critical hit!');
    if (out.typeMultVal > 1) lines.push("It's super effective!");
    else if (out.typeMultVal < 1) lines.push("It's not very effective...");

    if (move.id === STRUGGLE.id) {
      // Gen-3 Struggle: recoil is 1/4 of damage dealt. It can't KO the user (keeps double-KO draws impossible).
      const recoil = Math.min(Math.max(1, Math.floor(ev.dmg / 4)), Math.max(0, actor.mon.hp - 1));
      if (recoil > 0) {
        actor.mon.hp -= recoil;
        lines.push(`${actor.mon.name} is hit with recoil!`);
        ev.fx = 'recoil';
      }
    }

    if (target.mon.hp <= 0) {
      lines.push(`${target.mon.name} fainted!`);
      ev.faint = foeKey;
    }
    ev.hp = this.hp();
    ev.msg = lines.join('\n');
    return ev;
  }
}
