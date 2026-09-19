'use client';

import { useState } from 'react';
import { Button, Card } from 'pixel-retroui';
import { useAccount, useModal, useParaViemAccount } from '@getpara/react-sdk';
import { PINS } from './Globe';

// ponytail: mons static until battle roster lands; stocks + cities read live from PINS
const MONS = [
  { name: 'Pikachu', price: '0.01 MON' },
  { name: 'Charmander', price: '0.02 MON' },
  { name: 'Squirtle', price: '0.02 MON' },
];

type Tab = 'stocks' | 'loc' | 'mons';

export default function Overlay({ selected, selIdx, onPick, onLocate }: {
  selected: string | null; selIdx: number | null; onPick: (s: string) => void; onLocate: (i: number) => void;
}) {
  const [tab, setTab] = useState<Tab>('stocks');
  // ponytail: real Para session; address chip only, full portfolio view when battle stakes land
  const { openModal } = useModal();
  // ponytail: guest_mode flips isConnected true on load (Para auto-mints a guest wallet); treat guest as NOT connected so Connect shows. Kill guest sessions for good by disabling guest mode in the project config.
  const { isConnected, embedded } = useAccount();
  const { viemAccount } = useParaViemAccount();
  const connected = isConnected && !embedded?.isGuestMode;
  const short = viemAccount?.address ? `${viemAccount.address.slice(0, 6)}…${viemAccount.address.slice(-4)}` : 'Connected';
  const cities: Record<string, number[]> = {};
  PINS.features.forEach((f, i) => {
    const c = (f.properties as { city: string }).city;
    if (!cities[c]) cities[c] = [];
    cities[c].push(i);
  });
  const row = (name: string, sub: string, active: boolean, fn: () => void, key: string) => (
    <button key={key} onClick={fn} className={`flex w-full items-center justify-between px-2 py-1.5 hover:bg-black/10 ${active ? 'bg-black/10 font-bold' : ''}`}>
      <span>{name}</span>
      <span className="opacity-60">{sub}</span>
    </button>
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-10 p-4">
      <Card className="pointer-events-auto absolute left-4 top-4 w-56 md:w-72 !p-3">
        <div className="mb-2 font-minecraft text-xs opacity-70">NEARBY</div>
        <div className="mb-2 grid grid-cols-3 gap-1.5 font-minecraft text-xs">
          <Button onClick={() => setTab('stocks')} className={`whitespace-nowrap !px-1 text-[10px] ${tab === 'stocks' ? '' : 'opacity-60'}`}>Stocks</Button>
          <Button onClick={() => setTab('loc')} className={`whitespace-nowrap !px-1 text-[10px] ${tab === 'loc' ? '' : 'opacity-60'}`}>Location</Button>
          <Button onClick={() => setTab('mons')} className={`whitespace-nowrap !px-1 text-[10px] ${tab === 'mons' ? '' : 'opacity-60'}`}>Pokemon</Button>
        </div>
        <div className="max-h-64 overflow-auto text-sm">
          {tab === 'stocks' && PINS.features.map((f, i) => {
            const p = f.properties as { symbol: string; drop: string };
            return row(p.symbol, `${p.drop}/catch`, i === selIdx, () => onLocate(i), `${p.symbol}-${i}`);
          })}
          {tab === 'loc' && Object.entries(cities).map(([city, idxs]) => (
            <div key={city}>
              <button onClick={() => onLocate(idxs[0])} className="w-full px-2 pb-0.5 pt-1.5 text-left font-minecraft text-xs opacity-70 hover:opacity-100">
                {city} · {idxs.length}
              </button>
              {idxs.map((i) => {
                const p = PINS.features[i].properties as { symbol: string; drop: string };
                return row(p.symbol, `${p.drop}/catch`, i === selIdx, () => onLocate(i), `${p.symbol}-${i}`);
              })}
            </div>
          ))}
          {tab === 'mons' && MONS.map((m) => row(m.name, m.price, false, () => onPick(m.name), m.name))}
        </div>
      </Card>

      <div className="pointer-events-auto absolute right-4 top-4 font-minecraft text-xs">
        {connected ? (
          <Card className="!p-2"><button onClick={() => openModal()} className="px-2">{short}</button></Card>
        ) : (
          <Button bg="#16a34a" textColor="#fff" shadow="#14532d" onClick={() => openModal()}>Connect</Button>
        )}
      </div>

      <Card className="pointer-events-auto absolute bottom-4 right-4 w-56 md:w-72 !p-3 text-sm">
        <div className="mb-2 font-minecraft text-xs">{selected ?? 'Tap a pin'}</div>
        <Button bg="#e82127" textColor="#fff" shadow="#7f1d1d" disabled={!selected} className="w-full">
          Battle
        </Button>
      </Card>
    </div>
  );
}
