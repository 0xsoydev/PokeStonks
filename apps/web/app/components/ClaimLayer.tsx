'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ClaimStatus } from 'game-core';
import { getSpecies } from 'game-core';
import { EventBus } from '../game/net/events';
import { audio } from '../game/audio';
import { useSessionStore } from '../stores/sessionStore';
import { txUrl } from '../web3/chains';
import { formatBps, formatMintedString, shortAddress } from '../web3/format';
import { NftCard } from './NftCard';
import { Button, LinkButton, MoodChip, Panel, Spinner } from './ui';

interface View {
  status: ClaimStatus;
  /** Ticker of the winning broker, for the "+X sTSLA" line. */
  ticker: string | null;
  open: boolean;
}

const IN_PROGRESS = new Set<ClaimStatus['state']>(['signing', 'submitted']);

/**
 * Turns the server-relayed claim (EventBus 'claim:status') into UI: a live "settling" card while the
 * relayer works, then a result dialog. Players never sign or pay; the copy says so where it matters.
 */
export default function ClaimLayer() {
  const [view, setView] = useState<View | null>(null);
  const winTicker = useRef<string | null>(null);
  const lastConfirmed = useRef<string | null>(null);

  useEffect(() => {
    const offEnd = EventBus.on('battle:end', (e) => {
      if (e.won && e.ticker) winTicker.current = e.ticker;
    });
    const offClaim = EventBus.on('claim:status', (status) => {
      const speciesId = useSessionStore.getState().speciesId;
      const ticker = winTicker.current ?? (speciesId ? getSpecies(speciesId).ticker : null);
      setView({ status, ticker, open: true });
      if (status.state === 'confirmed') {
        const sig = status.txHash ?? 'confirmed';
        if (lastConfirmed.current !== sig) {
          lastConfirmed.current = sig;
          audio.sfx('claim');
          EventBus.emit('wallet:refresh');
        }
      } else if (status.state === 'failed' || status.state === 'ineligible') {
        audio.sfx('error');
      }
    });
    return () => {
      offEnd();
      offClaim();
    };
  }, []);

  const close = useCallback(() => setView((v) => (v ? { ...v, open: false } : v)), []);

  if (!view || !view.open) return null;
  return IN_PROGRESS.has(view.status.state) ? (
    <ProgressCard status={view.status} />
  ) : (
    <ResultDialog status={view.status} ticker={view.ticker} onClose={close} />
  );
}

/* ------------------------------------------------------------------ in progress */

function ProgressCard({ status }: { status: ClaimStatus }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[80] flex justify-center px-1 pt-[env(safe-area-inset-top)]">
      <Panel tone="dialog" role="status" className="pointer-events-auto w-[min(100%_-_1rem,22rem)] animate-[toast-in_240ms_steps(3,end)_both] py-3!">
        <p className="flex items-center gap-3">
          <Spinner className="text-yellow" />
          <span className="font-pixel t-10 leading-snug">Settling on Monad</span>
        </p>
        <p className="mt-2 text-[15px] leading-snug">
          {status.state === 'signing'
            ? 'Getting your reward approved. This is free: the game server pays the fee.'
            : 'Your reward was sent to the chain. Waiting for confirmation, usually a second or two.'}
        </p>
        {status.txHash && (
          <p className="mt-1 text-[14px]">
            <a className="underline decoration-2 underline-offset-2" href={txUrl(status.txHash)} target="_blank" rel="noopener noreferrer">
              Follow transaction {shortAddress(status.txHash, 6, 4)}
            </a>
          </p>
        )}
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------------- result */

function ResultDialog({ status, ticker, onClose }: { status: ClaimStatus; ticker: string | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);

  // Move focus in, give it back on close, keep Tab inside.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    primary.current?.focus();
    return () => before?.focus?.();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Keep the game from also reacting to keys meant for this dialog.
    e.stopPropagation();
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = ref.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
    if (!nodes?.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
  };

  const confirmed = status.state === 'confirmed';
  const titleId = 'claim-title';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-navy-deep/70 p-2 pt-[max(0.5rem,env(safe-area-inset-top))]" onKeyDown={onKeyDown}>
      <div ref={ref} role="alertdialog" aria-modal="true" aria-labelledby={titleId} className="my-auto w-[min(100%_-_1rem,26rem)]">
        <Panel tone={confirmed ? 'dialog' : 'plate'} className="animate-[sheet-in_360ms_steps(3,end)_both]">
          {confirmed ? <Confirmed status={status} ticker={ticker} titleId={titleId} /> : <Problem status={status} titleId={titleId} />}

          <div className="mt-3 flex flex-wrap items-center justify-end gap-x-1">
            {confirmed && (
              <LinkButton href="/collection" variant="secondary" small>
                Open collection
              </LinkButton>
            )}
            <Button ref={primary} onClick={onClose}>
              {confirmed ? 'Keep playing' : 'Got it'}
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Confirmed({ status, ticker, titleId }: { status: ClaimStatus; ticker: string | null; titleId: string }) {
  const amount = formatMintedString(status.minted);
  const bps = status.buffBps ?? 0;
  const symbol = ticker ?? 'STOCK';
  return (
    <div>
      <h2 id={titleId} className="font-pixel t-10 leading-snug text-cream">
        Reward received
      </h2>
      <p className="font-pixel t-20 mt-2 break-words leading-snug text-yellow tabular-nums" aria-label={`Plus ${amount} s${symbol}`}>
        +{amount} s{symbol}
      </p>
      <div className="mt-1 flex flex-wrap items-center">
        {bps > 0 && <MoodChip mood="bull" className="min-h-[24px]!" />}
        {bps < 0 && <MoodChip mood="bear" className="min-h-[24px]!" />}
        <span className="text-[15px]">
          {bps > 0 && `${formatBps(bps)} bull bonus: ${symbol} was above its average.`}
          {bps < 0 && `${formatBps(bps)} bear drag: ${symbol} was below its average.`}
          {bps === 0 && 'No market bonus or drag on this one.'}
        </span>
      </div>

      {status.nftId && (
        <div className="mt-3">
          <p className="text-[15px]">
            New BrokerMon #{status.nftId} joined your collection.
          </p>
          <div className="mx-auto mt-2 max-w-[15rem]">
            <NftCard id={status.nftId} retries={4} compact />
          </div>
        </div>
      )}

      {status.txHash && (
        <p className="mt-3 text-[15px]">
          <a className="underline decoration-2 underline-offset-2" href={txUrl(status.txHash)} target="_blank" rel="noopener noreferrer">
            View transaction {shortAddress(status.txHash, 6, 4)} on MonadVision
          </a>
        </p>
      )}
    </div>
  );
}

function Problem({ status, titleId }: { status: ClaimStatus; titleId: string }) {
  const ineligible = status.state === 'ineligible';
  const detail = status.error ? status.error.slice(0, 240) : null;
  return (
    <div>
      <h2 id={titleId} className="font-pixel t-12 leading-snug text-navy">
        {ineligible ? 'No reward for this battle' : 'Reward not sent'}
      </h2>
      <p className="mt-2 text-[16px] leading-snug">
        {ineligible
          ? 'Rewards are paid for real battles that you win with a wallet connected. Practice battles do not pay out.'
          : 'The reward transaction did not go through. You were not charged anything: the game server pays the network fee.'}
      </p>
      {detail && (
        <div className="panel panel-well panel-flat mt-2">
          <p className="text-[14px] leading-snug break-words text-slate">Server said: {detail}</p>
        </div>
      )}
      <p className="mt-2 text-[16px] leading-snug">
        {ineligible
          ? 'Head back to a route and win a battle to earn tokens.'
          : 'Press Claim on the battle result screen to try again. If it keeps failing, wait a minute and battle again.'}
      </p>
    </div>
  );
}
