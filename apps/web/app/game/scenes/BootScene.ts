import * as Phaser from 'phaser';
import { artSteps } from '../art/register';

/** Only the latest Boot run may continue (PhaserMount can start this scene twice). */
let bootToken = 0;

const FONT_LOAD_TIMEOUT_MS = 2000;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  /**
   * PhaserMount writes marketId / speciesId / wallet / onExit into the registry before Boot runs.
   * Never overwrite them; only fill gaps from scene-start data (older mounts pass data that way).
   */
  init(data?: Record<string, unknown>) {
    if (!data) return;
    for (const key of ['marketId', 'speciesId', 'wallet', 'onExit']) {
      if (data[key] !== undefined && !this.registry.has(key)) this.registry.set(key, data[key]);
    }
  }

  create() {
    const token = ++bootToken;
    this.cameras.main.setBackgroundColor('#0f1f5c');
    void this.boot(token);
  }

  private async boot(token: number) {
    // Press Start 2P is loaded by the page CSS: wait for it so Phaser text measures correctly.
    if (typeof document !== 'undefined' && document.fonts) {
      await Promise.race([
        document.fonts.load('12px "Press Start 2P"').catch(() => undefined),
        new Promise((res) => window.setTimeout(res, FONT_LOAD_TIMEOUT_MS)),
      ]);
    }
    if (token !== bootToken || !this.sys.isActive()) return;

    // The particle/utility textures are needed by the very next scene; the rest of the art is built
    // step by step under the loading bar in PreloadScene (registerArt() is just all those steps).
    artSteps(this)[0].run();
    this.scene.start('Preload');
  }
}
