'use client';

import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import GridEngine from 'grid-engine';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { OverworldScene } from './scenes/OverworldScene';
import { BattleScene } from './scenes/BattleScene';
import { UIScene } from './scenes/UIScene';

interface PhaserMountProps {
  marketId: string;
  onExit?: () => void;
}

export default function PhaserMount({ marketId, onExit }: PhaserMountProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: 960,
      height: 640,
      pixelArt: true,
      roundPixels: true,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      physics: { default: 'arcade', arcade: { debug: false } },
      scene: [BootScene, PreloadScene, OverworldScene, BattleScene, UIScene],
      plugins: {
        scene: [
          { key: 'gridEngine', plugin: GridEngine, mapping: 'gridEngine' },
        ],
      },
    });

    game.scene.start('Boot', { marketId, onExit });
    gameRef.current = game;

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [marketId, onExit]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, zIndex: 50 }}
    />
  );
}
