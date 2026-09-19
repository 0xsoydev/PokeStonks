export type Affinity = 'Normal' | 'Electric' | 'Grass' | 'Fire' | 'Water' | 'Psychic';

export type MoveCategory = 'physical' | 'special' | 'status';

export interface TapScore {
  tapScore: number;
  category: 'perfect' | 'good' | 'miss';
}

export interface Move {
  id: string;
  name: string;
  type: Affinity;
  power: number | null;
  accuracy: number;
  pp: number;
  category: MoveCategory;
  priority: number;
  effect?: string;
}

export interface BrokerMon {
  id: string;
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
  atkStage: number;
  defStage: number;
  moves: string[];
  pp: Record<string, number>;
}

export interface TurnEvent {
  by: string;
  move: string;
  dmg: number;
  crit: boolean;
  tapMult: number;
  typeMult: number;
  hpAfter: number;
  ppAfter: number;
  msg: string;
  fx?: string;
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
