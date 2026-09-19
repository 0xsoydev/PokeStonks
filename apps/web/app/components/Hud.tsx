'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { SPECIES_LIST } from 'game-core';
import { useSessionStore } from '../stores/sessionStore';
import { totalSstock } from '../stores/walletStore';
import { useIdentity } from '../web3/identity';
import { useWalletData } from '../web3/useWalletData';
import { addressUrl } from '../web3/chains';
import { formatAmount, formatMon, shortAddress, ZERO } from '../web3/format';
import { audio } from '../game/audio';
import { Icon } from './Icon';
import { Portrait } from './Portrait';
import Toasts from './Toasts';
import { Button, Panel } from './ui';

function useMuted(): boolean {
  return useSyncExternalStore(
    (cb) => audio.onChange(cb),
    () => audio.isMuted(),
    () => false,
  );
}

/**
 * Always-on heads-up display (top right). Full on the globe; inside a route it shrinks to the identity
 * pill and the mute toggle so the game keeps its screen. The container ignores pointer events, only the
 * controls take them, so it never blocks the game's input area.
 */
export default function Hud() {
  const { address, displayName, mode, logout } = useIdentity();
  const playing = useSessionStore((s) => s.marketId !== null);
  const setStage = useSessionStore((s) => s.setStage);
  const wallet = useWalletData(address);
  const muted = useMuted();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  if (!address) return null;

  const total = totalSstock(wallet.sstock);
  const owned = SPECIES_LIST.filter((s) => (wallet.sstock[s.ticker] ?? ZERO) > ZERO);
  const loading = wallet.status === 'loading' || (wallet.status === 'idle' && !wallet.updatedAt);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      audio.sfx('menu_select');
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: the address is still selectable in the explorer link */
    }
  };

  return (
    <aside
      aria-label="Wallet and controls"
      className="pointer-events-none fixed top-0 right-0 flex max-w-full flex-col items-end p-1 pt-[max(0.25rem,env(safe-area-inset-top))] pr-[max(0.25rem,env(safe-area-inset-right))]"
    >
      <Panel tone="plate" className="pointer-events-auto p-2!">
        <div className="flex items-center gap-1">
          <span className="chip chip-plain" title={mode === 'guest' ? 'Throwaway testnet wallet saved in this browser' : 'Wallet created for your Google account'}>
            {mode === 'guest' ? 'Guest' : 'Google'}
          </span>
          <span className="px-1 text-[15px] tabular-nums" title={displayName}>
            {shortAddress(address)}
          </span>
          <Button variant="secondary" small icon onClick={copy} aria-label={copied ? 'Address copied' : 'Copy wallet address'}>
            <Icon name={copied ? 'check' : 'copy'} size={14} />
          </Button>
          <a
            className="btn btn-secondary btn-sm btn-icon"
            href={addressUrl(address)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View wallet on MonadVision (opens in a new tab)"
          >
            <Icon name="external" size={14} />
          </a>
        </div>

        {!playing && (
          <>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
              <p className="text-[13px] leading-tight text-slate">
                <span className="font-pixel t-8">MON</span>{' '}
                <span className="font-pixel t-10 text-ink tabular-nums">{loading ? '…' : formatMon(wallet.mon)}</span>
              </p>
              <button
                type="button"
                className="flex min-h-[44px] items-center gap-2 text-left"
                aria-expanded={open}
                aria-controls="hud-sstock"
                onClick={() => setOpen((v) => !v)}
              >
                <span className="text-[13px] leading-tight text-slate">
                  <span className="font-pixel t-8">sSTOCK</span>{' '}
                  <span className="font-pixel t-10 text-ink tabular-nums">{loading ? '…' : formatAmount(total, 18, 2)}</span>
                </span>
                <Icon name={open ? 'up' : 'down'} size={12} className="text-navy" />
              </button>
            </div>
            {wallet.error && wallet.updatedAt && (
              <p className="px-1 text-[13px] text-red-deep" role="status">
                {wallet.error}
              </p>
            )}
            {open && (
              <ul id="hud-sstock" className="mt-1 max-h-[36dvh] overflow-y-auto px-1">
                {owned.length === 0 ? (
                  <li className="py-1 text-[14px] leading-snug text-slate">No tokens yet. Win a battle to earn your first sSTOCK.</li>
                ) : (
                  owned.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 py-0.5">
                      <Portrait speciesId={s.id} size={32} />
                      <span className="font-pixel t-8 flex-1">s{s.ticker}</span>
                      <span className="text-[15px] tabular-nums">{formatAmount(wallet.sstock[s.ticker], 18, 4)}</span>
                    </li>
                  ))
                )}
              </ul>
            )}
          </>
        )}
      </Panel>

      <div className="pointer-events-auto flex items-center">
        <Button
          variant="quiet"
          small
          icon
          aria-pressed={muted}
          aria-label={muted ? 'Turn sound on' : 'Mute sound'}
          onClick={() => {
            audio.setMuted(!muted);
          }}
        >
          <Icon name={muted ? 'soundOff' : 'soundOn'} size={18} />
        </Button>
        {!playing && (
          <>
            <Link href="/collection" className="btn btn-quiet btn-sm btn-icon" aria-label="Open your collection" title="Collection" onClick={() => audio.sfx('menu_select')}>
              <Icon name="grid" size={18} />
            </Link>
            <Button
              variant="quiet"
              small
              icon
              aria-label="Change broker"
              title="Change broker"
              onClick={() => {
                audio.sfx('menu_select');
                setStage('select');
              }}
            >
              <Icon name="swap" size={18} />
            </Button>
            <Button
              variant="quiet"
              small
              icon
              aria-label="Sign out"
              title="Sign out"
              onClick={() => {
                audio.sfx('menu_back');
                logout();
              }}
            >
              <Icon name="power" size={18} />
            </Button>
          </>
        )}
      </div>

      <Toasts />
      <span className="sr-only-x" role="status">
        {copied ? 'Wallet address copied' : ''}
      </span>
    </aside>
  );
}
