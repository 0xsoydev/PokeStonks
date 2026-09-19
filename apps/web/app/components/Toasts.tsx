'use client';

import { useEffect, useRef, useState } from 'react';
import { EventBus, type GameEvents } from '../game/net/events';
import { Panel } from './ui';

interface Toast {
  id: number;
  text: string;
  tone: NonNullable<GameEvents['toast']['tone']>;
}

const LIFETIME_MS = 4500;
const MAX_VISIBLE = 3;

const TONE_COLOR: Record<Toast['tone'], string> = {
  info: 'var(--color-yellow)',
  good: 'var(--color-green)',
  bad: 'var(--color-red)',
};

/** Transient messages from the game (EventBus 'toast'). Stacks under the HUD; never takes focus. */
export default function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    const off = EventBus.on('toast', ({ text, tone = 'info' }) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-(MAX_VISIBLE - 1)), { id, text, tone }]);
      const t = setTimeout(() => {
        pending.delete(t);
        setToasts((list) => list.filter((x) => x.id !== id));
      }, LIFETIME_MS);
      pending.add(t);
    });
    return () => {
      off();
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  return (
    <div aria-live="polite" className="flex flex-col items-end">
      {toasts.map((t) => (
        <Panel
          key={t.id}
          tone="dialog"
          role={t.tone === 'bad' ? 'alert' : 'status'}
          className="max-w-[min(20rem,calc(100vw_-_1.5rem))] animate-[toast-in_240ms_steps(3,end)_both] px-3! py-2!"
        >
          <p className="flex items-start gap-2 text-[15px] leading-snug">
            <i className="dot mt-1" style={{ ['--chip' as string]: TONE_COLOR[t.tone] }} aria-hidden="true" />
            <span>{t.text}</span>
          </p>
        </Panel>
      ))}
    </div>
  );
}
