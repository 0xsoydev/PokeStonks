import type { SpawnPin } from './types';

export type RouteTheme = 'tech' | 'bluechip' | 'energy' | 'meme' | 'consumer' | 'crypto';

export interface Market extends SpawnPin {
  speciesId: string;
  routeTheme: RouteTheme;
  city: string;
}

/** One globe market per species. Coordinates are the real HQ cities. */
export const MARKETS: Market[] = [
  { marketId: 'aapl', speciesId: 'aapl', symbol: 'AAPL', name: 'Apple Route',     city: 'Cupertino',     coordinates: [-122.032, 37.323],  routeTheme: 'bluechip' },
  { marketId: 'msft', speciesId: 'msft', symbol: 'MSFT', name: 'Redmond Route',   city: 'Redmond',       coordinates: [-122.121, 47.674],  routeTheme: 'bluechip' },
  { marketId: 'tsla', speciesId: 'tsla', symbol: 'TSLA', name: 'Gigafactory Route', city: 'Austin',      coordinates: [-97.743, 30.267],   routeTheme: 'tech' },
  { marketId: 'nvda', speciesId: 'nvda', symbol: 'NVDA', name: 'Silicon Route',   city: 'Santa Clara',   coordinates: [-121.964, 37.354],  routeTheme: 'tech' },
  { marketId: 'amd',  speciesId: 'amd',  symbol: 'AMD',  name: 'Markham Route',   city: 'Markham',       coordinates: [-79.337, 43.867],   routeTheme: 'tech' },
  { marketId: 'xom',  speciesId: 'xom',  symbol: 'XOM',  name: 'Oilfield Route',  city: 'Spring',        coordinates: [-95.417, 30.079],   routeTheme: 'energy' },
  { marketId: 'cvx',  speciesId: 'cvx',  symbol: 'CVX',  name: 'Refinery Route',  city: 'San Ramon',     coordinates: [-121.978, 37.78],   routeTheme: 'energy' },
  { marketId: 'gme',  speciesId: 'gme',  symbol: 'GME',  name: 'Wall Street Route', city: 'New York',    coordinates: [-74.006, 40.7128],  routeTheme: 'meme' },
  { marketId: 'amzn', speciesId: 'amzn', symbol: 'AMZN', name: 'Harbor Route',    city: 'Seattle',       coordinates: [-122.336, 47.606],  routeTheme: 'consumer' },
  { marketId: 'nke',  speciesId: 'nke',  symbol: 'NKE',  name: 'Track Route',     city: 'Beaverton',     coordinates: [-122.803, 45.487],  routeTheme: 'consumer' },
  { marketId: 'coin', speciesId: 'coin', symbol: 'COIN', name: 'Ledger Route',    city: 'San Francisco', coordinates: [-122.419, 37.775],  routeTheme: 'crypto' },
  { marketId: 'mstr', speciesId: 'mstr', symbol: 'MSTR', name: 'Treasury Route',  city: 'Tysons',        coordinates: [-77.223, 38.919],   routeTheme: 'crypto' },
];

export function getMarket(marketId: string): Market | undefined {
  return MARKETS.find((m) => m.marketId === marketId);
}
