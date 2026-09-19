import * as Phaser from 'phaser';
import { registerArt } from '../art';
import { BattleSession } from '../net/session';
import { EventBus } from '../net/events';
import { txt } from '../battle/ui';

/** Dev-only entry: builds the art, opens a practice match vs a bot, and jumps straight into Battle. */
export class DevBattleBoot extends Phaser.Scene {
  constructor() { super('DevBattleBoot'); }

  create() {
    registerArt(this);
    const note = txt(this, 480, 320, 'Connecting to the battle server...', 14, '#ffffff').setOrigin(0.5);
    const speciesId = (this.registry.get('speciesId') as string) ?? 'tsla';
    const marketId = (this.registry.get('marketId') as string) ?? 'tsla';
    const wallet = (this.registry.get('wallet') as string) ?? `0x${Date.now().toString(16).padStart(40, '0')}`;
    const devMode = (this.registry.get('devMode') as string) ?? 'practice';
    const code = (this.registry.get('devCode') as string) ?? '';
    const base = { wallet, speciesId, marketId };
    const open =
      devMode === 'host' ? BattleSession.host(base)
      : devMode === 'join' ? BattleSession.joinCode(code, base)
      : devMode === 'quick' ? BattleSession.join(base)
      : BattleSession.practice(base);
    open.then(
      (session) => {
        (window as unknown as { __session?: unknown }).__session = session;
        note.setText(devMode === 'host' ? `Duel code: ${session.roomId}` : 'Waiting for opponent...');
        const wait = this.time.addEvent({
          delay: 100, loop: true,
          callback: () => {
            if (!session.bothSeated()) return;
            wait.remove();
            this.scene.start('Battle', { session, marketId, kind: devMode === 'host' || devMode === 'join' ? 'duel' : 'wild' });
          },
        });
      },
      (e: Error) => note.setText(e.message).setColor('#f85858'),
    );
    EventBus.on('battle:closed', () => window.location.reload());
  }
}
