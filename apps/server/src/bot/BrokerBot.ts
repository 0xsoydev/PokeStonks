import { PlayerState } from '../state/PlayerState.ts';
import { getMove } from 'game-core/moves.ts';

export class BrokerBot {
  private thinkMs: number;

  constructor() {
    this.thinkMs = 600 + Math.floor(Math.random() * 300);
  }

  async decide(player: PlayerState): Promise<{ moveId: string; tapCategory: 'good' }> {
    await new Promise(r => setTimeout(r, this.thinkMs));

    const ppMap: Record<string, number> = {};
    player.active.pp.forEach((v, k) => { ppMap[k] = v; });

    const moves = Object.keys(ppMap).filter(id => ppMap[id] > 0 && getMove(id).id === id);
    const moveId = moves.length > 0
      ? moves[Math.floor(Math.random() * moves.length)]
      : 'STRUGGLE';

    return { moveId, tapCategory: 'good' };
  }
}
