'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

/** Dev harness: /dev/battle?species=tsla&market=tsla&mode=practice|quick|host|join[&code=ABCDE]. */
function Harness() {
  const host = useRef<HTMLDivElement>(null);
  const params = useSearchParams();
  const species = params.get('species') ?? 'tsla';
  const market = params.get('market') ?? 'tsla';
  const mode = params.get('mode') ?? 'practice';
  const code = params.get('code') ?? '';

  useEffect(() => {
    let game: import('phaser').Game | null = null;
    let cancelled = false;
    (async () => {
      const [{ default: Phaser }, { DevBattleBoot }, { BattleScene }] = await Promise.all([
        import('phaser'), import('../../game/scenes/DevBattleBoot'), import('../../game/scenes/BattleScene'),
      ]);
      await document.fonts.load('12px "Press Start 2P"').catch(() => {});
      if (cancelled || !host.current) return;
      game = new Phaser.Game({
        type: Phaser.AUTO, parent: host.current, width: 960, height: 640, backgroundColor: '#0b1030',
        pixelArt: true, roundPixels: true, antialias: false,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [DevBattleBoot, BattleScene],
        callbacks: { preBoot: (g) => { g.registry.set('speciesId', species); g.registry.set('marketId', market); g.registry.set('devMode', mode); g.registry.set('devCode', code); } },
      });
      (window as unknown as { __game?: unknown }).__game = game;
    })();
    return () => { cancelled = true; game?.destroy(true); };
  }, [species, market, mode, code]);

  return <div ref={host} style={{ position: 'fixed', inset: 0, background: '#0b1030' }} />;
}

export default function Page() {
  return <Suspense><Harness /></Suspense>;
}
