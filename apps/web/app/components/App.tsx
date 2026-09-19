'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSessionStore } from '../stores/sessionStore';
import { useIdentity } from '../web3/identity';
import { audio } from '../game/audio';
import Title from './Title';
import BrokerSelect from './BrokerSelect';
import Hud from './Hud';
import ClaimLayer from './ClaimLayer';
import ConnectWalletDialog from './ConnectWalletDialog';

// MapLibre + three (pixel field) only ever run in the browser.
const Globe = dynamic(() => import('./Globe'), { ssr: false });

/** Length of the dissolve that hands the screen over to the globe (matches .boot-out in globals.css). */
const BOOT_MS = 540;

type Leaving = 'title' | 'select' | null;

export default function App() {
  const stage = useSessionStore((s) => s.stage);
  const speciesId = useSessionStore((s) => s.speciesId);
  const hydrated = useSessionStore((s) => s.hydrated);
  const marketId = useSessionStore((s) => s.marketId);
  const setStage = useSessionStore((s) => s.setStage);
  const chooseSpecies = useSessionStore((s) => s.chooseSpecies);
  const exitRoute = useSessionStore((s) => s.exitRoute);
  const hydrate = useSessionStore((s) => s.hydrate);
  const { status } = useIdentity();

  const [leaving, setLeaving] = useState<Leaving>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => hydrate(), [hydrate]);

  // The Phaser canvas draws text in "Press Start 2P": have the font ready before a route is ever entered.
  useEffect(() => {
    void document.fonts?.load('16px "Press Start 2P"').catch(() => {});
  }, []);

  // Browsers only allow audio after a gesture: unlock on the first one, anywhere.
  useEffect(() => {
    const unlock = () => {
      void audio.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Title music on every screen except inside a route (the game owns its own tracks).
  useEffect(() => {
    if (marketId === null) audio.bgm('title');
  }, [marketId]);

  useEffect(
    () => () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    },
    [],
  );

  // Lost the session (signed out in another tab, wallet disconnected): back to the start, never a dead screen.
  useEffect(() => {
    if (status === 'signed-out' && stage !== 'title') {
      exitRoute();
      setStage('title');
    }
  }, [status, stage, exitRoute, setStage]);

  /** Title/select -> globe: one move. The screen dissolves in pixel steps while Globe pulls the camera in. */
  const goGlobe = useCallback(
    (from: 'title' | 'select') => {
      setLeaving(from);
      setStage('globe');
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      leaveTimer.current = setTimeout(() => setLeaving(null), BOOT_MS);
    },
    [setStage],
  );

  const onTitleContinue = useCallback(() => {
    if (speciesId) goGlobe('title');
    else setStage('select');
  }, [speciesId, goGlobe, setStage]);

  const onConfirmBroker = useCallback(
    (id: string) => {
      chooseSpecies(id);
      goGlobe('select');
    },
    [chooseSpecies, goGlobe],
  );

  const showTitle = stage === 'title' || leaving === 'title';
  const showSelect = stage === 'select' || leaving === 'select';
  const showHud = status === 'signed-in' && stage === 'globe';

  return (
    <main className="fixed inset-0 overflow-hidden bg-sky-pale">
      <Globe />

      {showTitle && (
        <div className={`pointer-events-none absolute inset-0 z-30 ${leaving === 'title' ? 'boot-out' : ''}`}>
          <Title ready={hydrated} onContinue={onTitleContinue} />
        </div>
      )}

      {showSelect && (
        <div className={`pointer-events-none absolute inset-0 z-30 ${leaving === 'select' ? 'boot-out' : ''}`}>
          <BrokerSelect
            initialId={speciesId}
            onConfirm={onConfirmBroker}
            onBack={() => (speciesId ? goGlobe('select') : setStage('title'))}
          />
        </div>
      )}

      {showHud && (
        <div className="boot-in relative z-[60]" style={{ animationDelay: leaving ? '1400ms' : '0ms' }}>
          <Hud />
        </div>
      )}

      <ClaimLayer />
      <ConnectWalletDialog />
    </main>
  );
}
