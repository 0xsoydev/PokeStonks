'use client';

import { useEffect, useRef, useState } from 'react';
import { EventBus } from '../game/net/events';
import { audio } from '../game/audio';
import { Button, Panel } from './ui';

const CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;

/** Start or join a private duel. The battle itself runs in the game; this only collects intent. */
export default function DuelDialog({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const valid = CODE_RE.test(code);

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const host = () => { audio.sfx('menu_select'); onClose(); EventBus.emit('duel:host'); };
  const join = () => { if (!valid) return; audio.sfx('menu_select'); onClose(); EventBus.emit('duel:join', { code }); };

  return (
    <div className="pointer-events-auto fixed inset-0 z-[70] grid place-items-center bg-black/55 p-3" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Panel tone="dialog" role="dialog" aria-modal="true" aria-labelledby="duel-title" className="w-full max-w-[420px] p-4!" onKeyDown={(e) => e.stopPropagation()}>
        <h2 id="duel-title" className="font-pixel t-12 mb-3 text-yellow">Duel a friend</h2>
        <p className="mb-3 text-[16px] leading-snug text-white">
          Open the game on two devices. One of you hosts and reads out the code; the other types it in.
        </p>
        <Button onClick={host} className="w-full">Host a duel</Button>
        <p className="font-pixel t-8 my-3 text-center text-cream/80">or</p>
        <form onSubmit={(e) => { e.preventDefault(); join(); }} className="flex gap-2">
          <label className="sr-only" htmlFor="duel-code">Duel code</label>
          <input
            id="duel-code"
            ref={input}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="CODE"
            className="font-pixel t-14 min-w-0 flex-1 bg-cream px-3 py-2 text-center tracking-widest text-ink uppercase outline-none focus-visible:ring-4 focus-visible:ring-yellow"
          />
          <Button type="submit" disabled={!valid}>Join</Button>
        </form>
        <div className="mt-3 flex justify-end">
          <Button variant="quiet" small onClick={() => { audio.sfx('menu_back'); onClose(); }}>Cancel</Button>
        </div>
      </Panel>
    </div>
  );
}
