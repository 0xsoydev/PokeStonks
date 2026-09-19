'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SPECIES_LIST } from 'game-core';
import { NftCard } from '../components/NftCard';
import { Icon } from '../components/Icon';
import { Portrait } from '../components/Portrait';
import { LinkButton, Button, Panel, Spinner } from '../components/ui';
import { EventBus } from '../game/net/events';
import { audio } from '../game/audio';
import { useIdentity } from '../web3/identity';
import { useWalletData } from '../web3/useWalletData';
import { addressUrl } from '../web3/chains';
import { contractsConfigured, getAddresses, readRecord, type OnchainRecord } from '../web3/contracts';
import { formatAmount, formatMon, shortAddress, ZERO } from '../web3/format';
import { totalSstock } from '../stores/walletStore';

/** Battle record from BattleArena. `undefined` = loading, `null` = unavailable. */
function useRecord(address: `0x${string}` | undefined): OnchainRecord | null | undefined {
  const [state, setState] = useState<{ address: string; record: OnchainRecord | null } | undefined>(undefined);
  useEffect(() => {
    if (!address) return;
    let alive = true;
    const load = () => {
      void readRecord(address).then((record) => {
        if (alive) setState({ address, record });
      });
    };
    load();
    const timer = setInterval(load, 20_000);
    const off = EventBus.on('wallet:refresh', () => setTimeout(load, 2_500));
    return () => {
      alive = false;
      clearInterval(timer);
      off();
    };
  }, [address]);
  return address && state?.address === address ? state.record : undefined;
}

export default function CollectionView() {
  const { status, address, displayName, mode, privyEnabled, login, playAsGuest } = useIdentity();
  const wallet = useWalletData(address);
  const record = useRecord(address);
  const deployed = contractsConfigured();

  return (
    <div className="collection-bg min-h-dvh pb-16">
      <div className="mx-auto max-w-[64rem] px-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:px-6">
        <header className="flex flex-wrap items-center gap-x-3">
          <Link href="/" className="btn btn-quiet btn-sm" onClick={() => audio.sfx('menu_back')}>
            Back to map
          </Link>
          <h1 className="font-pixel t-14 leading-snug text-navy">Your collection</h1>
        </header>

        {status === 'loading' && <Skeleton />}

        {status === 'signed-out' && (
          <Panel tone="dialog" className="mt-4 max-w-[28rem]">
            <h2 className="font-pixel t-12 leading-snug text-yellow">Sign in to see your collection</h2>
            <p className="mt-2 text-[16px] leading-snug">
              Your tokens and BrokerMon live in your wallet. Sign in with the same account you battled with.
            </p>
            <div className="mt-3 flex flex-wrap">
              {privyEnabled && <Button onClick={login}>Sign in with Google</Button>}
              <Button variant={privyEnabled ? 'quiet' : 'primary'} onClick={playAsGuest}>
                Play as guest
              </Button>
            </div>
          </Panel>
        )}

        {status === 'signed-in' && address && (
          <div className="mt-2">
            <Panel tone="plate" className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2!">
              <span className="chip chip-plain">{mode === 'guest' ? 'Guest wallet' : 'Google wallet'}</span>
              <span className="text-[16px]">
                {displayName} <span className="tabular-nums text-slate">{shortAddress(address, 6, 4)}</span>
              </span>
              <a
                className="btn btn-secondary btn-sm"
                href={addressUrl(address)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="external" size={14} />
                MonadVision
              </a>
              <span className="text-[15px] text-slate">
                <span className="font-pixel t-8">MON</span>{' '}
                <span className="font-pixel t-10 text-ink tabular-nums">{wallet.updatedAt ? formatMon(wallet.mon) : '…'}</span>
              </span>
            </Panel>

            {!deployed && (
              <Panel tone="plate" role="status" className="mt-2 py-2!">
                <p className="text-[15px] leading-snug">
                  The game contracts are not deployed for this build yet, so balances read as zero. Rewards will show up here once they are live.
                </p>
              </Panel>
            )}
            {wallet.error && wallet.updatedAt && (
              <Panel tone="plate" role="status" className="mt-2 py-2!">
                <p className="text-[15px] leading-snug text-red-deep">{wallet.error}</p>
              </Panel>
            )}

            <RecordSection record={record} arenaDeployed={!!getAddresses().arena} />
            <TokensSection loading={wallet.status === 'loading' || !wallet.updatedAt} sstock={wallet.sstock} />
            <NftSection loading={wallet.status === 'loading' || !wallet.updatedAt} ids={wallet.nftIds} brokerDeployed={!!getAddresses().brokerMon} />
          </div>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mt-6 mb-1 flex flex-wrap items-baseline gap-x-3 px-1">
      <h2 className="font-pixel t-12 leading-snug text-navy">{children}</h2>
      {aside && <p className="text-[15px] text-slate">{aside}</p>}
    </div>
  );
}

function RecordSection({ record, arenaDeployed }: { record: OnchainRecord | null | undefined; arenaDeployed: boolean }) {
  const wins = record ? Number(record.wins) : 0;
  const losses = record ? Number(record.losses) : 0;
  const played = wins + losses;
  return (
    <section aria-labelledby="record-h">
      <SectionTitle>
        <span id="record-h">Battle record</span>
      </SectionTitle>
      <Panel tone="plate">
        {record === undefined && arenaDeployed ? (
          <p className="flex items-center gap-2 text-slate" role="status">
            <Spinner /> <span className="text-[15px]">Reading your record from the arena…</span>
          </p>
        ) : record ? (
          <dl className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Wins" value={String(wins)} />
            <Stat label="Losses" value={String(losses)} />
            <Stat label={played ? 'Win rate' : 'Battles'} value={played ? `${Math.round((wins / played) * 100)}%` : '0'} />
            <div className="col-span-3 text-left text-[15px] text-slate">
              Lifetime rewards minted to you: <b className="text-ink tabular-nums">{formatAmount(record.totalMinted, 18, 2)}</b> sSTOCK
            </div>
          </dl>
        ) : (
          <p className="text-[15px] leading-snug">
            {arenaDeployed
              ? 'Could not read your record from the arena right now. It will retry on its own.'
              : 'Your wins and losses are recorded on-chain by the arena contract. They will appear here once it is live.'}
          </p>
        )}
      </Panel>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-pixel t-8 text-slate">{label}</dt>
      <dd className="font-pixel t-20 m-0 mt-1 tabular-nums text-navy">{value}</dd>
    </div>
  );
}

function TokensSection({ loading, sstock }: { loading: boolean; sstock: Record<string, bigint> }) {
  const total = totalSstock(sstock);
  return (
    <section aria-labelledby="tokens-h">
      <SectionTitle aside={loading ? undefined : `${formatAmount(total, 18, 2)} sSTOCK in total`}>
        <span id="tokens-h">Stock tokens</span>
      </SectionTitle>
      <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4">
        {SPECIES_LIST.map((s) => {
          const amount = sstock[s.ticker] ?? ZERO;
          const has = amount > ZERO;
          return (
            <li key={s.id}>
              <Panel tone="plate" className={`flex items-center gap-2 p-2! ${has ? '' : 'opacity-60'}`}>
                <Portrait speciesId={s.id} size={32} />
                <div className="min-w-0">
                  <p className="font-pixel t-8 leading-snug">s{s.ticker}</p>
                  <p className="text-[16px] tabular-nums leading-tight">{loading ? '…' : formatAmount(amount, 18, 4)}</p>
                </div>
              </Panel>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NftSection({ loading, ids, brokerDeployed }: { loading: boolean; ids: bigint[]; brokerDeployed: boolean }) {
  return (
    <section aria-labelledby="nft-h">
      <SectionTitle aside={!loading && ids.length ? `${ids.length} owned` : undefined}>
        <span id="nft-h">BrokerMon</span>
      </SectionTitle>
      {loading ? (
        <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i}>
              <Panel tone="plate" className="skeleton aspect-[4/5]">
                <span className="sr-only-x">Loading</span>
              </Panel>
            </li>
          ))}
        </ul>
      ) : ids.length === 0 ? (
        <Panel tone="plate">
          <p className="text-[16px] leading-snug">
            {brokerDeployed
              ? 'No BrokerMon yet. When you win a battle there is a chance to capture one, and it is minted straight to this wallet.'
              : 'Captured BrokerMon will show up here once the collectible contract is live.'}
          </p>
          <div className="mt-2">
            <LinkButton href="/" variant="primary" small>
              Go battle
            </LinkButton>
          </div>
        </Panel>
      ) : (
        <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4">
          {ids.map((id) => (
            <li key={String(id)}>
              <NftCard id={id} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="mt-4" role="status" aria-label="Loading your collection">
      <Panel tone="plate" className="skeleton h-14" />
      <ul className="mt-4 grid grid-cols-2 gap-1 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i}>
            <Panel tone="plate" className="skeleton h-16" />
          </li>
        ))}
      </ul>
    </div>
  );
}
