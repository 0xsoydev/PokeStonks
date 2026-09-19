import type { TapCategory, TurnResolved, SeatKey } from './types';

/** Bump when a breaking wire change ships; server rejects mismatching clients. */
export const PROTOCOL_VERSION = 1;

export type { SeatKey };
export type BattleMode = 'quick' | 'practice' | 'private';

export const ROOM_NAME = 'battle';

/** Timings (ms) — authoritative on the server, mirrored by the client only for display. */
export const TIMING = {
  /** How long a lone player waits for a human before a bot fills the seat. */
  QUEUE_BOT_MS: 20_000,
  /** Both clients must send `ready`; the server starts anyway after this. */
  READY_TIMEOUT_MS: 8_000,
  INTRO_MS: 4_600,
  TURN_MS: 30_000,
  PRACTICE_TURN_MS: 45_000,
  RECONNECT_S: 30,
  BOT_THINK_MIN_MS: 900,
  BOT_THINK_MAX_MS: 1_800,
  /** Time the server waits after a turn is resolved before opening the next COMMAND phase,
   *  so both clients can finish playing the animation queue. Scaled by event count. */
  RESOLVE_BASE_MS: 1_200,
  RESOLVE_PER_EVENT_MS: 1_700,
} as const;

export type BattlePhase = 'WAITING' | 'INTRO' | 'COMMAND' | 'RESOLVE' | 'END';

/** Client -> server join options. Stats are NEVER sent by the client — only a species pick. */
export interface BattleJoinOptions {
  wallet: string;
  speciesId: string;
  mode?: BattleMode;
  /** Market the player is roaming; bots use its route table. */
  marketId?: string;
  protocol?: number;
}

/** Client -> server messages. */
export interface ClientMessages {
  ready: Record<string, never>;
  lockMove: { turnNo: number; moveId: string; tap: TapCategory };
  /** Client finished playing a turn's animations; the server opens the next COMMAND when both ack. */
  turnAck: { turnNo: number };
  flee: Record<string, never>;
  requestClaim: Record<string, never>;
}

export type EndReason = 'faint' | 'flee' | 'forfeit' | 'disconnect';

export interface BattleEnd {
  winner: SeatKey;
  reason: EndReason;
  turns: number;
  roomId: string;
  /** The prize: the LOSER's ticker — you win the stock you beat. */
  ticker: string;
  /** Whether a claim voucher can be issued (human winner with a wallet, non-practice). */
  claimable: boolean;
}

export type ClaimState = 'signing' | 'submitted' | 'confirmed' | 'failed' | 'ineligible';

export interface ClaimStatus {
  state: ClaimState;
  txHash?: string;
  minted?: string; // decimal string, 18 dp
  buffBps?: number;
  nftId?: string;
  error?: string;
}

/** Server -> client messages. */
export interface ServerMessages {
  /** Convenience only — may arrive before a handler is registered. The source of truth is
   *  `state.players[k].sessionId === room.sessionId`. */
  seat: { key: SeatKey; roomId: string };
  turnResolved: TurnResolved;
  battleEnd: BattleEnd;
  claimStatus: ClaimStatus;
  /** Live per-seat mood update from Pyth. */
  mood: { A: number; B: number; pctA: number; pctB: number };
  /** Non-fatal rejection, e.g. an illegal move. Client just re-opens the menu. */
  rejected: { reason: string };
}

export const MSG = {
  ready: 'ready',
  turnAck: 'turnAck',
  lockMove: 'lockMove',
  flee: 'flee',
  requestClaim: 'requestClaim',
  seat: 'seat',
  turnResolved: 'turnResolved',
  battleEnd: 'battleEnd',
  claimStatus: 'claimStatus',
  mood: 'mood',
  rejected: 'rejected',
} as const;
