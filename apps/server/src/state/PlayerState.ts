import { Schema, defineTypes } from '@colyseus/schema';
import { MonState } from './MonState.ts';

export class PlayerState extends Schema {
  wallet: string = '';
  connected: boolean = true;
  isBot: boolean = false;
  active: MonState = new MonState();
  locked: boolean = false;
  lockedMove: string = '';
  lockedTap: string = '';
}

defineTypes(PlayerState, {
  wallet: 'string',
  connected: 'boolean',
  isBot: 'boolean',
  active: MonState,
  locked: 'boolean',
  lockedMove: 'string',
  lockedTap: 'string',
});
