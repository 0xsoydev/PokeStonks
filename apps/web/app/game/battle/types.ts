import type Phaser from 'phaser';
import type { Affinity, SeatKey } from 'game-core';
import type { MonPlate } from './plates';

export interface Combatant {
  seat: SeatKey;
  ally: boolean;
  speciesId: string;
  name: string;
  affinity: Affinity;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  plate: MonPlate;
  baseX: number;
  baseY: number;
  baseScale: number;
}
