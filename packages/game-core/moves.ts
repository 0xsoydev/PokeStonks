import type { Move } from './types';

/**
 * Move pool with mainline Gen-3 numbers. FRLG physical/special split is type based:
 * Normal = physical, every other type here = special.
 */
const m = (x: Move): Move => x;

export const MOVES: Record<string, Move> = {
  TACKLE:        m({ id: 'TACKLE',        name: 'Tackle',        type: 'Normal',   power: 35,  accuracy: 95,  pp: 35, category: 'physical', priority: 0 }),
  QUICK_ATTACK:  m({ id: 'QUICK_ATTACK',  name: 'Quick Attack',  type: 'Normal',   power: 40,  accuracy: 100, pp: 30, category: 'physical', priority: 1 }),
  BODY_SLAM:     m({ id: 'BODY_SLAM',     name: 'Body Slam',     type: 'Normal',   power: 85,  accuracy: 100, pp: 15, category: 'physical', priority: 0 }),
  GROWL:         m({ id: 'GROWL',         name: 'Growl',         type: 'Normal',   power: 0,   accuracy: 100, pp: 40, category: 'status',   priority: 0, effects: [{ target: 'foe',  stat: 'atk', stages: -1 }] }),
  TAIL_WHIP:     m({ id: 'TAIL_WHIP',     name: 'Tail Whip',     type: 'Normal',   power: 0,   accuracy: 100, pp: 30, category: 'status',   priority: 0, effects: [{ target: 'foe',  stat: 'def', stages: -1 }] }),
  SWORDS_DANCE:  m({ id: 'SWORDS_DANCE',  name: 'Swords Dance',  type: 'Normal',   power: 0,   accuracy: 100, pp: 30, category: 'status',   priority: 0, effects: [{ target: 'self', stat: 'atk', stages: 2 }] }),
  AGILITY:       m({ id: 'AGILITY',       name: 'Agility',       type: 'Psychic',  power: 0,   accuracy: 100, pp: 30, category: 'status',   priority: 0, effects: [{ target: 'self', stat: 'spe', stages: 2 }] }),
  CALM_MIND:     m({ id: 'CALM_MIND',     name: 'Calm Mind',     type: 'Psychic',  power: 0,   accuracy: 100, pp: 20, category: 'status',   priority: 0, effects: [{ target: 'self', stat: 'spa', stages: 1 }, { target: 'self', stat: 'spd', stages: 1 }] }),
  EMBER:         m({ id: 'EMBER',         name: 'Ember',         type: 'Fire',     power: 40,  accuracy: 100, pp: 25, category: 'special',  priority: 0 }),
  FLAMETHROWER:  m({ id: 'FLAMETHROWER',  name: 'Flamethrower',  type: 'Fire',     power: 95,  accuracy: 100, pp: 15, category: 'special',  priority: 0 }),
  WATER_GUN:     m({ id: 'WATER_GUN',     name: 'Water Gun',     type: 'Water',    power: 40,  accuracy: 100, pp: 25, category: 'special',  priority: 0 }),
  SURF:          m({ id: 'SURF',          name: 'Surf',          type: 'Water',    power: 95,  accuracy: 100, pp: 15, category: 'special',  priority: 0 }),
  VINE_WHIP:     m({ id: 'VINE_WHIP',     name: 'Vine Whip',     type: 'Grass',    power: 35,  accuracy: 100, pp: 10, category: 'special',  priority: 0 }),
  RAZOR_LEAF:    m({ id: 'RAZOR_LEAF',    name: 'Razor Leaf',    type: 'Grass',    power: 55,  accuracy: 95,  pp: 25, category: 'special',  priority: 0 }),
  THUNDER_SHOCK: m({ id: 'THUNDER_SHOCK', name: 'Thunder Shock', type: 'Electric', power: 40,  accuracy: 100, pp: 30, category: 'special',  priority: 0 }),
  THUNDERBOLT:   m({ id: 'THUNDERBOLT',   name: 'Thunderbolt',   type: 'Electric', power: 95,  accuracy: 100, pp: 15, category: 'special',  priority: 0 }),
  THUNDER:       m({ id: 'THUNDER',       name: 'Thunder',       type: 'Electric', power: 120, accuracy: 70,  pp: 10, category: 'special',  priority: 0 }),
  CONFUSION:     m({ id: 'CONFUSION',     name: 'Confusion',     type: 'Psychic',  power: 50,  accuracy: 100, pp: 25, category: 'special',  priority: 0 }),
  PSYCHIC:       m({ id: 'PSYCHIC',       name: 'Psychic',       type: 'Psychic',  power: 90,  accuracy: 100, pp: 10, category: 'special',  priority: 0 }),
  STRUGGLE:      m({ id: 'STRUGGLE',      name: 'Struggle',      type: 'Normal',   power: 50,  accuracy: 100, pp: 1,  category: 'physical', priority: 0 }),
};

export const STRUGGLE = MOVES.STRUGGLE;

export function isKnownMove(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(MOVES, id);
}

/** Unknown ids resolve to Struggle so a bad id can never crash a turn. */
export function getMove(id: string): Move {
  return isKnownMove(id) ? MOVES[id] : STRUGGLE;
}

/** Ids of moves that still have PP. Struggle is never listed (it is the forced fallback). */
export function legalMoves(pp: Record<string, number>): string[] {
  return Object.keys(pp).filter((id) => isKnownMove(id) && id !== 'STRUGGLE' && pp[id] > 0);
}
