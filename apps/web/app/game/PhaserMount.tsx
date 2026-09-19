'use client';

import { useEffect, useRef, useState } from 'react';
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
  const walletRef = useRef(wallet);
  useEffect(() => { exitRef.current = onExit; });
  // Connecting a wallet mid-route must not restart the game: update the registry in place.
  useEffect(() => {
    walletRef.current = wallet;
    gameRef.current?.registry.set('wallet', wallet);
  }, [wallet]);
  const [rotateHint, setRotateHint] = useState(false);

  // The game is 3:2 landscape; on a portrait phone it letterboxes to a small strip, so suggest rotating.
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
    const update = () => setRotateHint(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

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
            g.registry.set('wallet', walletRef.current);
            g.registry.set('onExit', () => exitRef.current());
          },
        },
      });
      gameRef.current = game;
      // Dev-only handle for QA scripts and console debugging; stripped from production builds.
      if (process.env.NODE_ENV !== 'production') (window as unknown as { __game?: unknown }).__game = game;
    })();

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [marketId, speciesId]);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: '#0b1030', touchAction: 'none' }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      {rotateHint && (
        <p
          role="status"
          style={{
            position: 'absolute', left: 8, right: 8, bottom: 'max(12px, env(safe-area-inset-bottom))', margin: 0, zIndex: 2,
            padding: '10px 12px', textAlign: 'center', pointerEvents: 'none',
            background: '#183088', color: '#f8f8d0', border: '3px solid #d8a830', fontSize: 15, lineHeight: 1.3,
          }}
        >
          Rotate your phone for a bigger view.
        </p>
      )}
    </div>
  );
}
