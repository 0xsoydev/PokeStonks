'use client';

import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';

interface PhaserMountProps {
  marketId: string;
  speciesId: string;
  wallet: string;
  onExit: () => void;
}

/**
 * Hosts the Phaser game. Loaded with `next/dynamic({ ssr:false })`. The game instance lives in a ref
 * (never state) and is destroyed on unmount, which makes React 19 StrictMode's mount → unmount →
 * remount safe: the first instance is torn down before the second is created.
 */
export default function PhaserMount({ marketId, speciesId, wallet, onExit }: PhaserMountProps) {
  const host = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  useEffect(() => {
    if (!host.current || gameRef.current) return;
    let cancelled = false;

    (async () => {
      // Phaser touches `window` at import time, so it is only ever loaded on the client.
      const [{ default: PhaserLib }, { default: GridEngine }, scenes] = await Promise.all([
        import('phaser'),
        import('grid-engine'),
        Promise.all([
          import('./scenes/BootScene'), import('./scenes/PreloadScene'),
          import('./scenes/OverworldScene'), import('./scenes/BattleScene'),
        ]),
      ]);
      if (cancelled || !host.current) return;
      const [boot, preload, overworld, battle] = scenes;

      const game = new PhaserLib.Game({
        type: PhaserLib.AUTO,
        parent: host.current,
        width: 960,
        height: 640,
        backgroundColor: '#0b1030',
        pixelArt: true,
        roundPixels: true,
        antialias: false,
        disableContextMenu: true,
        input: { activePointers: 3 },
        scale: { mode: PhaserLib.Scale.FIT, autoCenter: PhaserLib.Scale.CENTER_BOTH },
        scene: [boot.BootScene, preload.PreloadScene, overworld.OverworldScene, battle.BattleScene],
        plugins: { scene: [{ key: 'gridEngine', plugin: GridEngine, mapping: 'gridEngine' }] },
        callbacks: {
          // Registry is populated before the first scene boots, so scenes can read it in init().
          preBoot: (g) => {
            g.registry.set('marketId', marketId);
            g.registry.set('speciesId', speciesId);
            g.registry.set('wallet', wallet);
            g.registry.set('onExit', () => exitRef.current());
          },
        },
      });
      gameRef.current = game;
    })();

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [marketId, speciesId, wallet]);

  return <div ref={host} style={{ position: 'absolute', inset: 0, zIndex: 50, background: '#0b1030', touchAction: 'none' }} />;
}
