'use client';

import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';
import { useIdentity } from '../web3/identity';
import { shortAddress } from '../web3/format';
import { audio } from '../game/audio';
import { Logotype } from './Logotype';
import { Panel } from './ui';

interface Props {
  /** Persisted choices have been read; safe to decide where "Continue" goes. */
  ready: boolean;
  onContinue: () => void;
}

/**
 * Title screen. The wordmark hangs straight on the pixel field; the only surface is a navy dialog
 * with the menu, like a handheld's title menu: the blinking triangle marks the current choice.
 */
export default function Title({ ready, onContinue }: Props) {
  const { status, mode, address, displayName, login, playAsGuest, logout } = useIdentity();
  const menuRef = useRef<HTMLDivElement>(null);
  /** Set when the player starts a sign-in here, so finishing it carries them straight on. */
  const awaiting = useRef(false);

  useEffect(() => {
    if (awaiting.current && status === 'signed-in') {
      awaiting.current = false;
      audio.sfx('menu_select');
      onContinue();
    }
  }, [status, onContinue]);

  // Keyboard players land on the first choice.
  useEffect(() => {
    const first = menuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])');
    first?.focus({ preventScroll: true });
  }, [status]);

  const onMenuKey = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next].focus();
    audio.sfx('menu_move');
    e.preventDefault();
  }, []);

  const startWallet = () => {
    audio.sfx('menu_select');
    awaiting.current = true;
    login();
  };
  const startGuest = () => {
    audio.sfx('menu_select');
    awaiting.current = true;
    playAsGuest();
  };
  const proceed = () => {
    audio.sfx('menu_select');
    onContinue();
  };

  const signedIn = status === 'signed-in';
  const walletLabel = mode === 'guest' ? 'Guest wallet on this device' : 'Your connected wallet';

  return (
    <section
      aria-labelledby="title-heading"
      className="pointer-events-none flex h-full flex-col items-center justify-between px-3 pt-[max(7vh,1.5rem)] pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <header className="w-[min(88vw,34rem)]">
        <h1 id="title-heading" className="m-0">
          <Logotype />
        </h1>
      </header>

      <Panel tone="dialog" className="pointer-events-auto w-[min(100%_-_1rem,28rem)]" aria-label="Start menu">
        <p className="text-[17px] leading-snug">
          Pick a stock as your monster, battle other players, and win tokens on Monad testnet.
        </p>

        <div ref={menuRef} role="group" aria-label="Sign in" onKeyDown={onMenuKey} className="mt-3 -mx-2">
          {signedIn ? (
            <>
              <button type="button" className="menu-item" onClick={proceed} disabled={!ready}>
                <span>
                  Continue as {displayName}
                  <small>
                    {walletLabel}
                    {address ? ` · ${shortAddress(address)}` : ''}
                  </small>
                </span>
              </button>
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  audio.sfx('menu_back');
                  logout();
                }}
              >
                <span>Sign out</span>
              </button>
            </>
          ) : (
            <>
              <button type="button" className="menu-item" onClick={startWallet} disabled={status === 'loading'}>
                <span>
                  Connect wallet
                  <small>{status === 'loading' ? 'Checking your wallet…' : 'MetaMask or any browser wallet with MON. Needed to claim rewards.'}</small>
                </span>
              </button>
              <button type="button" className="menu-item" onClick={startGuest}>
                <span>
                  Play as guest
                  <small>Instant. Plays the full game; connect a wallet when you want to claim.</small>
                </span>
              </button>
            </>
          )}
        </div>

        <p className="mt-2 text-[13px] leading-snug text-cream/75">
          Rewards are synthetic testnet tokens and collectibles. They have no cash value.
        </p>
      </Panel>
    </section>
  );
}
