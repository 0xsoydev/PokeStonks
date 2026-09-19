import { MARKETS, getSpecies } from 'game-core';
import {
  buildCollection,
  stripHexPrefix,
  type HermesParsedFeed,
  type SpawnCollection,
  type SpawnMeta,
} from './transform';

/**
 * Server-side price source for /api/spawns.
 *
 * Since 2026-08-26 Hermes price routes need an API key (`Authorization: Bearer <key>`); the
 * metadata routes (`/v2/price_feeds`, which also carry `market_hours`) stay open. Configure
 * PYTH_API_KEY (server only, never NEXT_PUBLIC_) and optionally HERMES_URL. Without a key this
 * degrades to static prices with `live:false` and the open/closed flag from the metadata route.
 */

const API_KEY = process.env.PYTH_API_KEY?.trim() || '';
// Keyed requests go to Pyth's authenticated Hermes host; the old public host now rejects price routes.
const HERMES_URL = (process.env.HERMES_URL || (API_KEY ? 'https://pyth.dourolabs.app/hermes' : 'https://hermes.pyth.network')).replace(/\/+$/, '');
const PRICE_TTL_MS = 30_000;
const HOURS_TTL_MS = 5 * 60_000;
const TIMEOUT_MS = 3_000;

type Reason = SpawnMeta['reason'];

interface PriceResult {
  at: number;
  feeds: HermesParsedFeed[] | null;
  reason: Reason;
}
interface HoursResult {
  at: number;
  marketOpen: boolean | null;
  nextOpen: number | null;
  nextClose: number | null;
}

let priceCache: PriceResult | null = null;
let priceInflight: Promise<PriceResult> | null = null;
let hoursCache: HoursResult | null = null;
let hoursInflight: Promise<HoursResult> | null = null;

function headers(): HeadersInit {
  return API_KEY ? { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' } : { Accept: 'application/json' };
}

async function getFeeds(ids: string[]): Promise<{ status: number; feeds: HermesParsedFeed[] }> {
  const url = `${HERMES_URL}/v2/updates/price/latest?${ids.map((id) => `ids[]=${id}`).join('&')}&parsed=true&encoding=hex`;
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
  if (!res.ok) return { status: res.status, feeds: [] };
  const body = (await res.json()) as { parsed?: HermesParsedFeed[] };
  return { status: 200, feeds: Array.isArray(body.parsed) ? body.parsed : [] };
}

async function fetchPrices(): Promise<PriceResult> {
  const ids = MARKETS.map((m) => getSpecies(m.speciesId).feedId);
  try {
    const all = await getFeeds(ids);
    if (all.status === 200) {
      return { at: Date.now(), feeds: all.feeds.length ? all.feeds : null, reason: all.feeds.length ? null : 'empty' };
    }
    if (all.status === 401 || all.status === 403) {
      // A key is often entitled to only some feeds, and one forbidden id fails the whole batch.
      // Ask per feed and keep whatever the key is allowed to read; the rest stay "last known".
      const each = await Promise.allSettled(ids.map((id) => getFeeds([id])));
      const feeds = each.flatMap((r) => (r.status === 'fulfilled' && r.value.status === 200 ? r.value.feeds : []));
      if (feeds.length) return { at: Date.now(), feeds, reason: null };
      return { at: Date.now(), feeds: null, reason: API_KEY ? 'unauthorized' : 'no-key' };
    }
    return { at: Date.now(), feeds: null, reason: 'error' };
  } catch (e) {
    const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return { at: Date.now(), feeds: null, reason: timeout ? 'timeout' : 'error' };
  }
}

async function fetchHours(): Promise<HoursResult> {
  const none = { at: Date.now(), marketOpen: null, nextOpen: null, nextClose: null };
  try {
    // All 12 tickers are US equities on one schedule: AAPL's `market_hours` stands for them all.
    const aapl = getSpecies('aapl').feedId;
    const url = `${HERMES_URL}/v2/price_feeds?query=${encodeURIComponent('Equity.US.AAPL/USD')}&asset_type=equity`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(2_500), cache: 'no-store' });
    if (!res.ok) return none;
    const list = (await res.json()) as Array<{ id: string; market_hours?: { is_open?: boolean; next_open?: number; next_close?: number } }>;
    const hit = list.find((f) => stripHexPrefix(f.id) === stripHexPrefix(aapl));
    const h = hit?.market_hours;
    if (!h || typeof h.is_open !== 'boolean') return none;
    return { at: Date.now(), marketOpen: h.is_open, nextOpen: h.next_open ?? null, nextClose: h.next_close ?? null };
  } catch {
    return none;
  }
}

function cached<T extends { at: number }>(
  get: () => T | null,
  set: (v: T) => void,
  getInflight: () => Promise<T> | null,
  setInflight: (p: Promise<T> | null) => void,
  ttl: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = get();
  if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit);
  const pending = getInflight();
  if (pending) return pending;
  const p = load()
    .then((v) => {
      set(v);
      return v;
    })
    .finally(() => setInflight(null));
  setInflight(p);
  return p;
}

/** The full FeatureCollection. Never rejects: any failure yields the same 12 markets with `live:false`. */
export async function getSpawnCollection(nowMs: number = Date.now()): Promise<SpawnCollection> {
  const nowSec = Math.floor(nowMs / 1000);
  try {
    const [prices, hours] = await Promise.all([
      cached(() => priceCache, (v) => (priceCache = v), () => priceInflight, (p) => (priceInflight = p), PRICE_TTL_MS, fetchPrices),
      cached(() => hoursCache, (v) => (hoursCache = v), () => hoursInflight, (p) => (hoursInflight = p), HOURS_TTL_MS, fetchHours),
    ]);
    return buildCollection(prices.feeds, nowSec, { ...hours, reason: prices.feeds ? null : prices.reason });
  } catch {
    return buildCollection(null, nowSec, { marketOpen: null, nextOpen: null, nextClose: null, reason: 'error' });
  }
}
