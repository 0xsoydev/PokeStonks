import { getSpecies, buffFromSpotEma, type Mood } from 'game-core';
import { config } from '../config.ts';

export interface PriceMood {
  buff: number;
  pct: number;
  mood: Mood;
  /** True only when a fresh-enough Pyth price backed this reading. */
  live: boolean;
}

const FLAT: PriceMood = { buff: 1, pct: 0, mood: 'flat', live: false };
const TTL_MS = 15_000;
/** Equity feeds stop publishing when US markets close; older than this we treat the mood as neutral. */
const MAX_AGE_S = 3 * 24 * 3600;

interface Entry { at: number; mood: PriceMood; bytes: `0x${string}`[] }

async function fetchJson(url: string, ms: number): Promise<any> {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: config.pythApiKey ? { Authorization: `Bearer ${config.pythApiKey}` } : undefined,
    });
    if (!r.ok) throw new Error(`hermes ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(to);
  }
}

/** Live Pyth prices via Hermes (needs PYTH_API_KEY; without it every reading is neutral). Every method degrades to neutral/empty and NEVER throws. */
export class PriceService {
  private cache = new Map<string, Entry>();
  private inflight = new Map<string, Promise<Entry>>();

  private async load(feedId: string): Promise<Entry> {
    const now = Date.now();
    const hit = this.cache.get(feedId);
    if (hit && now - hit.at < TTL_MS) return hit;
    const pending = this.inflight.get(feedId);
    if (pending) return pending;

    const p = (async (): Promise<Entry> => {
      try {
        const url = `${config.hermesUrl}/v2/updates/price/latest?ids[]=${feedId}&encoding=hex&parsed=true`;
        const j = await fetchJson(url, 2500);
        const parsed = j?.parsed?.[0];
        if (!parsed) throw new Error('no parsed price');
        const spot = Number(parsed.price.price);
        const ema = Number(parsed.ema_price.price);
        const ageS = Math.floor(Date.now() / 1000) - Number(parsed.price.publish_time);
        const live = ageS <= MAX_AGE_S;
        const r = buffFromSpotEma(spot, ema);
        const bytes = ((j.binary?.data ?? []) as string[]).map((h) => (h.startsWith('0x') ? h : `0x${h}`) as `0x${string}`);
        const entry: Entry = {
          at: Date.now(),
          mood: live ? { buff: r.buff, pct: r.pct, mood: r.mood, live: true } : FLAT,
          bytes,
        };
        this.cache.set(feedId, entry);
        return entry;
      } catch {
        // Keep serving a stale reading briefly rather than flapping to neutral on a blip.
        return hit ? { ...hit, at: Date.now() - TTL_MS + 3000 } : { at: Date.now() - TTL_MS + 3000, mood: FLAT, bytes: [] };
      } finally {
        this.inflight.delete(feedId);
      }
    })();
    this.inflight.set(feedId, p);
    return p;
  }

  async mood(speciesId: string): Promise<PriceMood> {
    return (await this.load(getSpecies(speciesId).feedId)).mood;
  }

  /** Fresh signed Pyth update blobs for `BattleArena.claim`. Empty array = claim without an update. */
  async updateData(speciesId: string): Promise<`0x${string}`[]> {
    const feedId = getSpecies(speciesId).feedId;
    this.cache.delete(feedId); // a claim wants the freshest signed blob
    return (await this.load(feedId)).bytes;
  }
}
