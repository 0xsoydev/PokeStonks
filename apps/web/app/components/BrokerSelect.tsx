'use client';

import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { DEFAULT_LEVEL, SPECIES_LIST, calcHp, calcStat, getMove, getSpecies } from 'game-core';
import { audio } from '../game/audio';
import { Portrait } from './Portrait';
import { Button, Panel, StatBar, TYPE_COLOR, TypeChip, TypeDot } from './ui';

const COLS = 4;
const STAT_MAX = 180;

interface Props {
  /** The remembered broker, if any. */
  initialId: string | null;
  onConfirm: (speciesId: string) => void;
  onBack: () => void;
}

export default function BrokerSelect({ initialId, onConfirm, onBack }: Props) {
  const [activeId, setActiveId] = useState<string>(initialId ?? SPECIES_LIST[0].id);
  const tiles = useRef<Record<string, HTMLButtonElement | null>>({});
  const active = getSpecies(activeId);

  const move = useCallback((id: string) => {
    setActiveId(id);
    audio.sfx('menu_move');
    tiles.current[id]?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = SPECIES_LIST.findIndex((s) => s.id === activeId);
    let next = i;
    switch (e.key) {
      case 'ArrowRight': next = Math.min(SPECIES_LIST.length - 1, i + 1); break;
      case 'ArrowLeft': next = Math.max(0, i - 1); break;
      case 'ArrowDown': next = Math.min(SPECIES_LIST.length - 1, i + COLS); break;
      case 'ArrowUp': next = Math.max(0, i - COLS); break;
      case 'Home': next = 0; break;
      case 'End': next = SPECIES_LIST.length - 1; break;
      case 'Enter':
        e.preventDefault();
        audio.sfx('menu_select');
        onConfirm(activeId);
        return;
      default: return;
    }
    e.preventDefault();
    if (next !== i) move(SPECIES_LIST[next].id);
  };

  const stats: Array<[string, number]> = [
    ['HP', calcHp(active.base.hp, DEFAULT_LEVEL)],
    ['Atk', calcStat(active.base.atk, DEFAULT_LEVEL)],
    ['Def', calcStat(active.base.def, DEFAULT_LEVEL)],
    ['SpA', calcStat(active.base.spa, DEFAULT_LEVEL)],
    ['SpD', calcStat(active.base.spd, DEFAULT_LEVEL)],
    ['Spe', calcStat(active.base.spe, DEFAULT_LEVEL)],
  ];

  return (
    <section aria-labelledby="select-heading" className="pointer-events-none relative h-full">
      <div className="pointer-events-auto absolute inset-0 overflow-y-auto overscroll-contain pb-28">
        <div className="mx-auto flex min-h-full max-w-[64rem] flex-col gap-2 px-2 pt-[max(0.75rem,env(safe-area-inset-top))] md:grid md:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] md:items-start md:gap-6 md:px-6 md:pt-8">
          <Panel tone="dialog">
            <h1 id="select-heading" className="font-pixel t-12 leading-relaxed text-yellow">
              Choose your BrokerMon
            </h1>
            <p className="mt-2 text-[15px] leading-snug">
              Your broker fights for you and wins tokens of its own stock. You can change it any time from the map.
            </p>
            <div
              role="radiogroup"
              aria-label="BrokerMon"
              onKeyDown={onKeyDown}
              className="mt-3 grid grid-cols-4 gap-1"
            >
              {SPECIES_LIST.map((s) => {
                const on = s.id === activeId;
                return (
                  <button
                    key={s.id}
                    ref={(el) => {
                      tiles.current[s.id] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={`${s.name}, ${s.ticker}, ${s.affinity} type`}
                    tabIndex={on ? 0 : -1}
                    className="tile"
                    style={{ ['--t' as string]: TYPE_COLOR[s.affinity] }}
                    onClick={() => {
                      if (!on) move(s.id);
                    }}
                  >
                    <Portrait speciesId={s.id} size={64} />
                    <span>{s.ticker}</span>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel tone="plate" className="md:sticky md:top-8">
            <div className="flex items-start gap-3">
              <Portrait speciesId={active.id} size={96} title={active.name} />
              <div className="min-w-0 flex-1">
                <h2 className="font-pixel t-14 leading-snug text-navy">{active.name}</h2>
                <p className="font-pixel t-10 mt-1 text-slate">{active.ticker}</p>
                <div className="mt-1 flex flex-wrap items-center">
                  <TypeChip type={active.affinity} />
                  <span className="chip chip-plain">{active.sector}</span>
                </div>
              </div>
            </div>
            <p className="mt-2 text-[16px] leading-snug">{active.tagline}</p>

            <Panel tone="well" className="mt-2">
              <h3 className="font-pixel t-8 mb-2 text-slate">Stats at level {DEFAULT_LEVEL}</h3>
              <div className="flex flex-col gap-2">
                {stats.map(([label, value]) => (
                  <StatBar key={label} label={label} value={value} max={STAT_MAX} />
                ))}
              </div>
            </Panel>

            <h3 className="font-pixel t-8 mt-3 text-slate">Moves</h3>
            <ul className="mt-1 grid gap-1 sm:grid-cols-2">
              {active.learnset.map((id) => {
                const m = getMove(id);
                return (
                  <li key={id} className="flex items-center gap-2 text-[15px] leading-tight">
                    <TypeDot type={m.type} />
                    <span className="min-w-0">
                      <b>{m.name}</b>
                      <br />
                      <span className="text-slate">
                        {m.power > 0 ? `${m.power} power` : 'Status'}, {m.accuracy}% accuracy
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Panel tone="dialog" className="pointer-events-auto flex w-[min(100%_-_1rem,40rem)] flex-wrap items-center justify-between gap-x-2 py-2!">
          <Button
            variant="quiet"
            small
            onClick={() => {
              audio.sfx('menu_back');
              onBack();
            }}
          >
            {initialId ? 'Back to map' : 'Back'}
          </Button>
          <Button
            onClick={() => {
              audio.sfx('menu_select');
              onConfirm(activeId);
            }}
          >
            Choose {active.name}
          </Button>
        </Panel>
      </div>
    </section>
  );
}
