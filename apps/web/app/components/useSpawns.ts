'use client';

import { useEffect, useState } from 'react';
import { buildCollection, type SpawnCollection } from '../api/spawns/transform';

const REFRESH_MS = 60_000;

/** Same 12 markets with static prices and `live:false`: what the globe shows if the API is unreachable. */
function offlineCollection(): SpawnCollection {
  return buildCollection(null, Math.floor(Date.now() / 1000), {
    marketOpen: null,
    nextOpen: null,
    nextClose: null,
    reason: 'error',
  });
}

function isCollection(v: unknown): v is SpawnCollection {
  return !!v && typeof v === 'object' && Array.isArray((v as SpawnCollection).features) && (v as SpawnCollection).features.length > 0;
}

/**
 * Markets for the globe. Starts from a static collection so pins can appear immediately, then swaps in
 * /api/spawns (live Pyth prices) and refreshes every minute while the tab is visible.
 */
export function useSpawns(enabled = true): { spawns: SpawnCollection; loaded: boolean } {
  const [spawns, setSpawns] = useState<SpawnCollection>(offlineCollection);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let ctrl: AbortController | null = null;

    async function load() {
      if (document.hidden) return;
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        const res = await fetch('/api/spawns', { signal: ctrl.signal, cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const json: unknown = await res.json();
        if (alive && isCollection(json)) {
          setSpawns(json);
          setLoaded(true);
        }
      } catch {
        /* keep whatever we had: static markets still work */
      }
    }

    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
      ctrl?.abort();
    };
  }, [enabled]);

  return { spawns, loaded };
}
