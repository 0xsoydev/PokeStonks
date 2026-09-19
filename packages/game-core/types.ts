export type Affinity = 'Normal' | 'Electric' | 'Grass' | 'Fire' | 'Water' | 'Psychic';
export const AFFINITIES: Affinity[] = ['Normal', 'Electric', 'Grass', 'Fire', 'Water', 'Psychic'];
/** Index matches the Solidity enum used by BrokerMonNFT / markets.json. */
export const AFFINITY_INDEX: Record<Affinity, number> = {
  Normal: 0, Electric: 1, Grass: 2, Fire: 3, Water: 4, Psychic: 5,
};

export type MoveCategory = 'physical' | 'special' | 'status';
export type StatKey = 'atk' | 'def' | 'spa' | 'spd' | 'spe';
export type TapCategory = 'perfect' | 'good' | 'miss';

export interface TapScore {
  tapScore: number;
  category: TapCategory;
}

/** A stat-stage change applied by a status move. */
export interface StatEffect {
  target: 'self' | 'foe';
  stat: StatKey;
  stages: number;
}

export interface Move {
  id: string;
  name: string;
  type: Affinity;
  /** 0 for status moves. */
  power: number;
  accuracy: number;
  pp: number;
  category: MoveCategory;
  priority: number;
  effects?: StatEffect[];
}

export interface BaseStats {
  hp: number; atk: number; def: number; spa: number; spd: number; spe: number;
}

export interface Species {
  id: string;
  /** 1..12, matches speciesId in contracts/markets.json. */
  num: number;
  name: string;
  ticker: string;
  affinity: Affinity;
  base: BaseStats;
  learnset: string[];
  /** Pyth price feed id (0x-prefixed, chain independent). */
  feedId: string;
  /** Two-tone palette used by procedural art and UI: [primary, secondary]. */
  colors: [string, string];
  sector: string;
  tagline: string;
}

export type Stages = Record<StatKey, number>;

export interface BrokerMon {
  speciesId: string;
  name: string;
  affinity: Affinity;
  level: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
  stages: Stages;
  moves: string[];
  pp: Record<string, number>;
}

export interface TurnEvent {
  /** Seat of the acting player. */
  by: 'A' | 'B';
  move: string;
  /** Damage dealt to the target (0 for status / miss). */
  dmg: number;
  crit: boolean;
  tapMult: number;
  typeMult: number;
  /** Target HP after this event. */
  hpAfter: number;
  /** Actor PP for this move after this event. */
  ppAfter: number;
  msg: string;
  /** 'miss' | 'stat' | 'recoil' | '' — drives client FX. */
  fx?: string;
  /** Present on stat-change events: who was affected and the resulting stage. */
  stat?: { target: 'A' | 'B'; stat: StatKey; stages: number; now: number };
  /** Actor HP after recoil (Struggle). */
  actorHpAfter?: number;
  /** True when the target fainted from this event. */
  faint?: boolean;
}

export interface TurnResolved {
  turnNo: number;
  events: TurnEvent[];
}

export interface EncounterSlot {
  speciesId: string;
  weight: number;
  levelRange: [number, number];
}

export interface EncounterTable {
  /** Gen-3 style: roll 0..2879, encounter when roll < encounterValue. */
  encounterValue: number;
  slots: EncounterSlot[];
}

export interface SpawnPin {
  marketId: string;
  symbol: string;
  name: string;
  coordinates: [number, number];
  routeTheme: string;
  price?: number;
}
