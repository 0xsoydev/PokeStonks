import Phaser from 'phaser';
import { EventBus } from '../net/events';

export class UIScene extends Phaser.Scene {
  constructor() {
    super('UI');
  }

  create() {
    EventBus.on('hp', this.onHP, this);
    EventBus.on('dialog', this.onDialog, this);
    EventBus.on('timer', this.onTimer, this);

    this.events.on('shutdown', () => {
      EventBus.off('hp', this.onHP, this);
      EventBus.off('dialog', this.onDialog, this);
      EventBus.off('timer', this.onTimer, this);
    });
  }

  private onHP(_data: { who: string; hp: number }) {
    // HP bar updates driven by BattleScene
  }

  private onDialog(_data: { msg: string }) {
    // Dialog driven by BattleScene
  }

  private onTimer(_data: { seconds: number }) {
    // Timer driven by BattleScene
  }
}
