/**
 * App-wide typed event bus. Deliberately Phaser-free so React components can import it
 * without pulling Phaser into the server bundle. Scenes, the net layer and React all talk
 * through this — nothing reaches into another module's internals.
 */
import type { ClaimStatus, BattleEnd, SeatKey } from 'game-core';

export interface GameEvents {
  /** Player closed the game and wants the globe back. */
  'game:exit': void;
  /** A battle scene has started (after cutscene). */
  'battle:start': { roomId: string; seat: SeatKey; foeSpeciesId: string; isBot: boolean };
  /** Battle finished; overlay is up. */
  'battle:end': BattleEnd & { won: boolean };
  /** Battle overlay closed, overworld resumes. */
  'battle:closed': void;
  /** Winner tapped Claim in the battle-end overlay. */
  'claim:request': void;
  /** Server-relayed claim progress. React shows toasts / refreshes balances on `confirmed`. */
  'claim:status': ClaimStatus;
  /** Anyone can ask the wallet HUD to refetch balances. */
  'wallet:refresh': void;
  /** HUD → game: start a private duel (host shows a code; the friend joins with it). */
  'duel:host': void;
  'duel:join': { code: string };
  /** Overworld → HUD: transient text like "Healed!" or "A rival Broker challenges you!". */
  'toast': { text: string; tone?: 'info' | 'good' | 'bad' };
}

type Handler<T> = (payload: T) => void;

class Bus {
  private map = new Map<string, Set<Handler<never>>>();

  on<K extends keyof GameEvents>(event: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.map.get(event as string);
    if (!set) this.map.set(event as string, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => this.off(event, fn);
  }

  once<K extends keyof GameEvents>(event: K, fn: Handler<GameEvents[K]>): () => void {
    const off = this.on(event, (p) => { off(); fn(p); });
    return off;
  }

  off<K extends keyof GameEvents>(event: K, fn: Handler<GameEvents[K]>): void {
    this.map.get(event as string)?.delete(fn as Handler<never>);
  }

  emit<K extends keyof GameEvents>(event: K, ...args: GameEvents[K] extends void ? [] : [GameEvents[K]]): void {
    this.map.get(event as string)?.forEach((fn) => {
      try { (fn as Handler<unknown>)(args[0]); } catch (e) { console.error(`[EventBus] handler for ${String(event)} threw`, e); }
    });
  }
}

export const EventBus = new Bus();
