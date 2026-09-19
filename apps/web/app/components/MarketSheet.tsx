'use client';

import { useEffect, useState } from 'react';
import { getSpecies, type Mood } from 'game-core';
import type { SpawnFeature, SpawnMeta } from '../api/spawns/transform';
import { previewBuff } from '../web3/contracts';
import { formatPct, formatUsd } from '../web3/format';
import { Portrait } from './Portrait';
import { Icon } from './Icon';
import { Button, MoodChip, Panel, TypeChip } from './ui';

const THEME_LABEL: Record<string, string> = {
  tech: 'Tech route',
  bluechip: 'Blue-chip route',
  energy: 'Energy route',
  meme: 'Meme route',
  consumer: 'Consumer route',
  crypto: 'Crypto route',
};

interface Props {
  feature: SpawnFeature;
  meta: SpawnMeta;
  /** The player's current broker, shown so the choice is visible right where they commit. */
  speciesId: string | null;
  onEnter: () => void;
  onClose: () => void;
  onChangeBroker: () => void;
}

/** When the API has no live print, ask the arena contract what Pyth says on Monad (null if undeployed). */
function useOnchainMood(symbol: string, enabled: boolean): { mood: Mood; bps: number } | null {
  const [state, setState] = useState<{ symbol: string; mood: Mood; bps: number } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void previewBuff(symbol).then((r) => {
      if (!alive || !r || r.stale) return;
      setState({ symbol, mood: r.buffBps > 0 ? 'bull' : r.buffBps < 0 ? 'bear' : 'flat', bps: r.buffBps });
    });
    return () => {
      alive = false;
    };
  }, [symbol, enabled]);
  return enabled && state?.symbol === symbol ? state : null;
}

function reopenLabel(meta: SpawnMeta): string | null {
  if (!meta.nextOpen) return null;
  try {
    return new Date(meta.nextOpen * 1000).toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' });
  } catch {
    return null;
  }
}

function moodCopy(symbol: string, mood: Mood, pct?: number): string {
  const gap = pct === undefined ? '' : ` ${Math.abs(pct).toFixed(1)}%`;
  if (mood === 'bull') return `${symbol} trades${gap} above its recent average. ${symbol} BrokerMon deal 10% more damage while that holds.`;
  if (mood === 'bear') return `${symbol} trades${gap} below its recent average. ${symbol} BrokerMon deal 10% less damage while that holds.`;
  return `${symbol} is within 2% of its recent average, so it gives no bonus and no drag.`;
}

export default function MarketSheet({ feature, meta, speciesId, onEnter, onClose, onChangeBroker }: Props) {
  const p = feature.properties;
  const sp = getSpecies(p.speciesId);
  const mine = speciesId ? getSpecies(speciesId) : null;
  const onchain = useOnchainMood(p.symbol, !p.live);
  const reopen = reopenLabel(meta);

  let mood: Mood = 'flat';
  let explain: string;
  let source = '';
  if (p.live) {
    mood = p.mood;
    explain = moodCopy(p.symbol, p.mood, p.pct);
    source = 'Live from Pyth';
  } else if (onchain) {
    mood = onchain.mood;
    explain = moodCopy(p.symbol, onchain.mood);
    source = 'Pyth price on Monad';
  } else if (meta.marketOpen === false) {
    explain = `US markets are closed${reopen ? ` until ${reopen}` : ''}. You can still battle; no bonus or drag applies until prices move again.`;
    source = 'Last known price';
  } else {
    explain = 'Live prices are unavailable right now. You can still battle; the arena checks the price again when a reward is claimed.';
    source = 'Approximate price';
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center pb-[max(8px,env(safe-area-inset-bottom))] sm:justify-start sm:pl-4">
      <Panel
        tone="plate"
        role="dialog"
        aria-label={`${p.name}, ${p.city}`}
        className="pointer-events-auto w-[min(100%_-_1rem,30rem)] animate-[sheet-in_360ms_steps(3,end)_both]"
      >
        <div className="flex items-start gap-3">
          <Portrait speciesId={p.speciesId} size={64} title={sp.name} />
          <div className="min-w-0 flex-1">
            <h2 className="font-pixel t-12 leading-snug text-navy">{p.name}</h2>
            <p className="mt-1 text-[15px] text-slate">
              {p.city} · {THEME_LABEL[p.routeTheme] ?? 'Route'}
            </p>
            <div className="mt-1 flex flex-wrap items-center">
              <TypeChip type={sp.affinity} />
            </div>
          </div>
          <Button variant="secondary" small icon aria-label="Close route details" onClick={onClose}>
            <Icon name="close" size={14} />
          </Button>
        </div>

        <Panel tone="well" className="mt-2" role="group" aria-label={`${p.symbol} price`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-pixel t-10 text-slate">{p.symbol}</span>
            <span className="font-pixel t-16 tabular-nums">{formatUsd(p.price)}</span>
            <MoodChip mood={mood} />
            {p.live && <span className="font-pixel t-8 text-slate">{formatPct(p.pct)} vs avg</span>}
          </div>
          <p className="mt-2 text-[15px] leading-snug">{explain}</p>
          <p className="mt-1 text-[13px] text-slate">{source}</p>
        </Panel>

        <div className="mt-2 flex items-center gap-3">
          {mine ? (
            <>
              <Portrait speciesId={mine.id} size={32} />
              <p className="min-w-0 flex-1 text-[15px] leading-tight">
                <span className="text-slate">Your broker</span>
                <br />
                <b>{mine.name}</b> <span className="text-slate">({mine.ticker})</span>
              </p>
              <Button variant="secondary" small onClick={onChangeBroker}>
                Change broker
              </Button>
            </>
          ) : (
            <Button variant="secondary" small onClick={onChangeBroker}>
              Pick a broker
            </Button>
          )}
        </div>

        <div className="mt-2 flex justify-end">
          <Button onClick={onEnter} disabled={!mine} className="w-full sm:w-auto">
            Enter route
          </Button>
        </div>
      </Panel>
    </div>
  );
}
