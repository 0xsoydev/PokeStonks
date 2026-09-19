import type { Move } from './types';

export const MOVES: Record<string, Move> = {
  TACKLE: {
    id: 'TACKLE', name: 'Tackle', type: 'Normal',
    power: 35, accuracy: 95, pp: 35, category: 'physical', priority: 0,
  },
  GROWL: {
    id: 'GROWL', name: 'Growl', type: 'Normal',
    power: 0, accuracy: 100, pp: 40, category: 'status', priority: 0,
  },
  THUNDER: {
    id: 'THUNDER', name: 'Thunder', type: 'Electric',
    power: 90, accuracy: 90, pp: 15, category: 'special', priority: 0,
  },
  QUICK_ATTACK: {
    id: 'QUICK_ATTACK', name: 'Quick Attack', type: 'Normal',
    power: 40, accuracy: 100, pp: 30, category: 'physical', priority: 1,
  },
  STRUGGLE: {
    id: 'STRUGGLE', name: 'Struggle', type: 'Normal',
    power: 50, accuracy: 100, pp: 999, category: 'physical', priority: 0,
  },
};

export function getMove(id: string): Move {
  return MOVES[id] ?? MOVES.STRUGGLE;
}

export function legalMoves(pp: Record<string, number>): string[] {
  return Object.keys(pp).filter(id => pp[id] > 0 && MOVES[id]);
}
