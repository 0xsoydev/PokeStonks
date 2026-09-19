import { MARKETS, buffFromSpotEma, getSpecies, type Market, type Mood } from 'game-core';

/**
 * Pure Hermes -> GeoJSON transform for /api/spawns. No I/O here so it can be unit-run with tsx.
 * Hermes price routes answer `{ binary, parsed: [{ id, price, ema_price, metadata }] }` where every
 * price object is `{ price: "<int string>", conf: "<int string>", expo: <int>, publish_time: <unix s> }`.
 */

export interface PythPrice {
  price: string;
  conf: string;
  expo: number;
  publish_time: number;
}

export interface HermesParsedFeed {
  id: string;
  price: PythPrice;
  ema_price: PythPrice;
}

export interface SpawnProps {
  marketId: string;
  speciesId: string;
  symbol: string;
  name: string;
  city: string;
  routeTheme: string;
  affinity: string;
  /** USD. Live spot, else last known price, else a static fallback. */
  price: number;
  /** USD EMA from Pyth, or null when unknown. */
  ema: number | null;
  /** Spot vs EMA, percent. 0 unless live. */
  pct: number;
  mood: Mood;
  /** Damage multiplier: 1.1 bull, 0.9 bear, 1 flat/unknown. */
  buff: number;
  /** True only for a fresh Pyth print while the market is open. */
  live: boolean;
  /** Seconds since the last Pyth print, or null when there is none. */
  ageSec: number | null;
}

export interface SpawnFeature {
  type: 'Feature';
  id: string;
  properties: SpawnProps;
  geometry: { type: 'Point'; coordinates: [number, number] };
}

export interface SpawnMeta {
  source: 'hermes' | 'fallback';
  /** Why prices are not live, when they are not. */
  reason: null | 'no-key' | 'unauthorized' | 'timeout' | 'error' | 'empty' | 'closed' | 'stale';
  marketOpen: boolean | null;
  nextOpen: number | null;
  nextClose: number | null;
  fetchedAt: string;
}

export interface SpawnCollection {
  type: 'FeatureCollection';
  features: SpawnFeature[];
  meta: SpawnMeta;
}

/** A Pyth print older than this is treated as a closed/idle market: no mood, "not live". */
export const LIVE_MAX_AGE_SEC = 10 * 60;

/** Rough USD levels, used only when Pyth has never answered. Clearly approximate. */
export const FALLBACK_PRICE: Record<string, number> = {
  AAPL: 230, MSFT: 450, TSLA: 250, NVDA: 130, AMD: 160, XOM: 115,
  CVX: 155, GME: 25, AMZN: 190, NKE: 80, COIN: 250, MSTR: 300,
};

export const stripHexPrefix = (id: string) => id.toLowerCase().replace(/^0x/, '');

/** Integer-string price + exponent -> number. NaN when malformed. */
export function scalePyth(p: Pick<PythPrice, 'price' | 'expo'> | undefined | null): number {
  if (!p) return NaN;
  const n = Number(p.price);
  if (!Number.isFinite(n) || !Number.isFinite(p.expo)) return NaN;
  return n * Math.pow(10, p.expo);
}

export function buildProps(market: Market, feed: HermesParsedFeed | undefined, nowSec: number, marketOpen: boolean | null): SpawnProps {
  const sp = getSpecies(market.speciesId);
  const base = {
    marketId: market.marketId,
    speciesId: market.speciesId,
    symbol: market.symbol,
    name: market.name,
    city: market.city,
    routeTheme: market.routeTheme,
    affinity: sp.affinity,
  };
  const fallback: SpawnProps = {
    ...base, price: FALLBACK_PRICE[market.symbol] ?? 100, ema: null, pct: 0, mood: 'flat', buff: 1, live: false, ageSec: null,
  };
  if (!feed) return fallback;

  const spot = scalePyth(feed.price);
  const ema = scalePyth(feed.ema_price);
  if (!(spot > 0)) return fallback;

  const publishTime = Number(feed.price.publish_time);
  const ageSec = Number.isFinite(publishTime) ? Math.max(0, nowSec - publishTime) : null;
  const fresh = ageSec !== null && ageSec <= LIVE_MAX_AGE_SEC;
  const live = fresh && marketOpen !== false && ema > 0;

  if (!live) {
    // Keep the last real price so the sheet can say "last price", but apply no mood.
    return { ...base, price: spot, ema: ema > 0 ? ema : null, pct: 0, mood: 'flat', buff: 1, live: false, ageSec };
  }
  const { buff, pct, mood } = buffFromSpotEma(spot, ema);
  return { ...base, price: spot, ema, pct, mood, buff, live: true, ageSec };
}

export function buildCollection(
  feeds: HermesParsedFeed[] | null,
  nowSec: number,
  info: { marketOpen: boolean | null; nextOpen: number | null; nextClose: number | null; reason: SpawnMeta['reason'] },
): SpawnCollection {
  const byId = new Map<string, HermesParsedFeed>();
  for (const f of feeds ?? []) if (f?.id) byId.set(stripHexPrefix(f.id), f);

  const features: SpawnFeature[] = MARKETS.map((m) => {
    const feed = byId.get(stripHexPrefix(getSpecies(m.speciesId).feedId));
    return {
      type: 'Feature',
      id: m.marketId,
      properties: buildProps(m, feed, nowSec, info.marketOpen),
      geometry: { type: 'Point', coordinates: m.coordinates },
    };
  });

  const anyLive = features.some((f) => f.properties.live);
  let reason = info.reason;
  if (!reason && !anyLive) reason = info.marketOpen === false ? 'closed' : feeds?.length ? 'stale' : 'empty';
  if (anyLive) reason = null;

  return {
    type: 'FeatureCollection',
    features,
    meta: {
      source: feeds && feeds.length ? 'hermes' : 'fallback',
      reason,
      marketOpen: info.marketOpen,
      nextOpen: info.nextOpen,
      nextClose: info.nextClose,
      fetchedAt: new Date(nowSec * 1000).toISOString(),
    },
  };
}
