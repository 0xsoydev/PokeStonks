'use client';

import { useEffect, useState } from 'react';
import { readNft, type NftView } from '../web3/contracts';
import { Panel, Spinner } from './ui';

type Load = { id: string; nft: NftView | null; done: boolean };

/**
 * Load a BrokerMon's on-chain metadata (tokenURI -> JSON -> SVG). `retries` re-asks a few times, since
 * a token minted a moment ago can lag on the RPC node. Never throws.
 */
export function useNft(id: bigint | string | null | undefined, retries = 0): { nft: NftView | null; loading: boolean } {
  const key = id === null || id === undefined ? null : String(id);
  const [state, setState] = useState<Load | null>(null);

  useEffect(() => {
    if (key === null) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attempt = async (left: number) => {
      const nft = await readNft(key);
      if (!alive) return;
      if (nft || left <= 0) {
        setState({ id: key, nft, done: true });
        return;
      }
      timer = setTimeout(() => void attempt(left - 1), 2_000);
    };
    void attempt(retries);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [key, retries]);

  if (key === null) return { nft: null, loading: false };
  const mine = state && state.id === key ? state : null;
  return { nft: mine?.nft ?? null, loading: !mine?.done };
}

/** A BrokerMon card as drawn by the contract itself (on-chain SVG), with its traits underneath. */
export function NftCard({ id, retries = 0, compact = false }: { id: bigint | string; retries?: number; compact?: boolean }) {
  const { nft, loading } = useNft(id, retries);
  const label = `BrokerMon #${String(id)}`;

  return (
    <Panel tone="plate" className="p-2!">
      <figure className="m-0">
        <div className="panel panel-well panel-flat m-0! flex aspect-square items-center justify-center overflow-hidden p-0!">
          {nft?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={nft.image} alt={nft.name} className="block h-full w-full object-contain" draggable={false} />
          ) : loading ? (
            <span className="flex flex-col items-center gap-2 text-slate" role="status">
              <Spinner />
              <span className="font-pixel t-8">Reading chain</span>
            </span>
          ) : (
            <span className="px-3 text-center text-[14px] leading-snug text-slate">Artwork is not available from the chain right now.</span>
          )}
        </div>
        <figcaption className="mt-2">
          <p className="font-pixel t-10 leading-snug text-navy">{nft?.name ?? label}</p>
          {!compact && nft && nft.attributes.length > 0 && (
            <div className="mt-1 flex flex-wrap">
              {nft.attributes.slice(0, 6).map((a) => (
                <span key={a.trait} className="chip chip-plain">
                  {a.trait} {a.value}
                </span>
              ))}
            </div>
          )}
        </figcaption>
      </figure>
    </Panel>
  );
}
