import { schema, t, type SchemaType } from '@colyseus/schema';

/** Public, synced battle state. Hidden info (a seat's locked move) is NEVER stored here. */
export const MonState = schema({
  speciesId: t.string(),
  name: t.string(),
  affinity: t.string(),
  level: t.uint8(),
  hp: t.int16(),
  maxHp: t.int16(),
  atk: t.int16(),
  def: t.int16(),
  spa: t.int16(),
  spd: t.int16(),
  spe: t.int16(),
  moves: t.array('string'),
  pp: t.map('uint8'),
  atkStage: t.int8(),
  defStage: t.int8(),
  spaStage: t.int8(),
  spdStage: t.int8(),
  speStage: t.int8(),
}, 'MonState');
export type MonState = SchemaType<typeof MonState>;

export const PlayerState = schema({
  /** Colyseus session of the connected client, so a client finds its own seat from state (no message race). */
  sessionId: t.string(),
  wallet: t.string(),
  ticker: t.string(),
  isBot: t.boolean(),
  connected: t.boolean(),
  /** True once this seat has committed a move this turn. The move itself stays private. */
  locked: t.boolean(),
  active: MonState,
}, 'PlayerState');
export type PlayerState = SchemaType<typeof PlayerState>;

export const BattleState = schema({
  /** WAITING | INTRO | COMMAND | RESOLVE | END */
  phase: t.string(),
  mode: t.string(),
  marketId: t.string(),
  turnNo: t.uint16(),
  /** Length of the current command window, ms. Clients count down locally from receipt. */
  turnMs: t.uint32(),
  /** Remaining time before a bot fills the empty seat, ms (0 when not waiting). */
  waitMs: t.uint32(),
  winner: t.string(),
  moodA: t.float32(),
  moodB: t.float32(),
  players: t.map(PlayerState),
}, 'BattleState');
export type BattleState = SchemaType<typeof BattleState>;
