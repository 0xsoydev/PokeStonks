import { Schema, defineTypes, MapSchema } from '@colyseus/schema';

export class MonState extends Schema {
  id: string = '';
  affinity: string = '';
  level: number = 5;
  hp: number = 0;
  maxHp: number = 0;
  atk: number = 0;
  def: number = 0;
  spa: number = 0;
  spd: number = 0;
  spe: number = 0;
  pp: MapSchema<number> = new MapSchema<number>();
  atkStage: number = 0;
  defStage: number = 0;
}

defineTypes(MonState, {
  id: 'string',
  affinity: 'string',
  level: 'uint8',
  hp: 'int16',
  maxHp: 'int16',
  atk: 'int16',
  def: 'int16',
  spa: 'int16',
  spd: 'int16',
  spe: 'int16',
  pp: { map: 'uint8' },
  atkStage: 'int8',
  defStage: 'int8',
});
