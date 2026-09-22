'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount, useConnect, useConnectors } from 'wagmi';
import { audio } from '../game/audio';
import { monadTestnet } from '../web3/chains';
import { resolveConnected, useConnectDialog } from '../web3/connectDialog';
import { Button, Panel, Spinner } from './ui';

function readable(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/reject|denied|cancel/i.test(m)) return 'You closed the wallet request. Try again when you are ready.';
  if (/already pending/i.test(m)) return 'Your wallet already has a request open. Check the extension.';
  return 'Could not connect that wallet. Unlock it and try again.';
}

const isMobile = () => typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** Phones have no wallet extension: send them into the MetaMask app's built-in browser instead. */
function NoWallet() {
  if (isMobile()) {
    const here = typeof window !== 'undefined' ? `${window.location.host}${window.location.pathname}` : '';
    return (
      <div className="mb-3">
        <p className="mb-3 text-[16px] leading-snug text-cream">
          Phone browsers can&apos;t connect a wallet. Open PokeStonks inside the MetaMask app (its built-in browser) to connect
          and claim rewards. Tip: start there before you battle.
        </p>
        <a className="btn w-full" href={`https://metamask.app.link/dapp/${here}`}>Open in MetaMask app</a>
      </div>
    );
  }
  return (
    <p className="mb-3 text-[16px] leading-snug text-cream">
      No browser wallet found. Install{' '}
      <a className="underline decoration-2 underline-offset-2" href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer">MetaMask</a>
      , add Monad testnet, get MON from the{' '}
      <a className="underline decoration-2 underline-offset-2" href="https://faucet.monad.xyz" target="_blank" rel="noopener noreferrer">faucet</a>
      , then reload this page.
    </p>
  );
}

/** Pick a browser wallet. Opens from the title, the HUD, or the Claim button mid-battle. */
export default function ConnectWalletDialog() {
  const open = useConnectDialog((s) => s.open);
  // Mounting only while open gives every opening fresh state (no stale error from last time).
  return open ? <Dialog /> : null;
}

function Dialog() {
  const { reason, close } = useConnectDialog();
  const connectors = useConnectors();
  const { connectAsync, isPending } = useConnect();
  const { status } = useAccount();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const first = useRef<HTMLButtonElement>(null);

  // Wallets announce themselves (EIP-6963); the generic "Injected" entry is only useful when none did.
  const named = connectors.filter((c) => c.id !== 'injected');
  const list = named.length ? named : connectors.filter(() => typeof window !== 'undefined' && 'ethereum' in window);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close]);

  useEffect(() => {
    if (status === 'connected') resolveConnected();
  }, [status]);

  const pick = async (id: string) => {
    const c = connectors.find((x) => x.id === id);
    if (!c) return;
    audio.sfx('menu_select');
    setError(null);
    setBusyId(id);
    try {
      await connectAsync({ connector: c, chainId: monadTestnet.id });
      resolveConnected();
    } catch (e) {
      audio.sfx('error');
      setError(readable(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[90] grid place-items-center bg-black/60 p-3"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Panel tone="dialog" role="dialog" aria-modal="true" aria-labelledby="connect-title" className="w-full max-w-[420px] p-4!">
        <h2 id="connect-title" className="font-pixel t-12 mb-2 text-yellow">Connect a wallet</h2>
        <p className="mb-3 text-[16px] leading-snug text-white">
          {reason ?? 'Use a wallet that holds some MON on Monad testnet. You pay a small network fee when you claim a reward.'}
        </p>

        {list.length === 0 ? (
          <NoWallet />
        ) : (
          <ul className="mb-2 flex flex-col gap-2">
            {list.map((c, i) => (
              <li key={c.uid}>
                <Button ref={i === 0 ? first : undefined} className="w-full justify-start!" onClick={() => void pick(c.id)} disabled={isPending}>
                  {/* Wallet icons are data URIs announced by the extension; next/image adds nothing here. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.icon ? <img src={c.icon} alt="" width={22} height={22} className="mr-2 inline-block align-middle" /> : null}
                  <span className="align-middle">{c.id === 'injected' ? 'Browser wallet' : c.name}</span>
                  {busyId === c.id && <Spinner className="ml-2 inline-block align-middle" />}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {busyId && <p className="text-[15px] text-cream">Approve the connection in your wallet.</p>}
        {error && <p role="alert" className="text-[15px] text-yellow">{error}</p>}

        <div className="mt-3 flex justify-end">
          <Button variant="quiet" small onClick={() => { audio.sfx('menu_back'); close(); }}>Cancel</Button>
        </div>
      </Panel>
    </div>
  );
}
