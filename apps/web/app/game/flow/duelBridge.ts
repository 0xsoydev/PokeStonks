import type Phaser from 'phaser';
import { EventBus } from '../net/events';
import { runDuel } from './encounterFlow';

/**
 * Lets the React HUD start a private duel inside the running overworld. The overworld scene calls this
 * once in create() and invokes the returned function on shutdown.
 */
export function bindDuelEvents(scene: Phaser.Scene, marketId: string): () => void {
  const start = (role: 'host' | 'join', code?: string) => {
    if (scene.sys.isPaused() || !scene.sys.isActive()) return;
    void runDuel(scene, { marketId, role, code });
  };
  const offs = [
    EventBus.on('duel:host', () => start('host')),
    EventBus.on('duel:join', ({ code }) => start('join', code)),
  ];
  return () => offs.forEach((off) => off());
}
