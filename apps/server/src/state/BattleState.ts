import { Schema, defineTypes, MapSchema } from '@colyseus/schema';
import { PlayerState } from './PlayerState.ts';

export class BattleState extends Schema {
  phase: string = 'INTRO';
  turnNo: number = 0;
  turnDeadline: number = 0;
  winner: string = '';
  players: MapSchema<PlayerState> = new MapSchema<PlayerState>();
  tickerA: string = '';
  tickerB: string = '';
  stockBuffA: number = 1;
  stockBuffB: number = 1;
}

defineTypes(BattleState, {
  phase: 'string',
  turnNo: 'uint16',
  turnDeadline: 'number',
  winner: 'string',
  players: { map: PlayerState },
  tickerA: 'string',
  tickerB: 'string',
  stockBuffA: 'number',
  stockBuffB: 'number',
});
