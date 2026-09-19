import { NextResponse } from 'next/server';
import type { SpawnPin } from 'game-core';

const SPAWNS: SpawnPin[] = [
  { marketId: 'aapl', symbol: 'AAPL', name: 'Apple Route', coordinates: [-122.032, 37.323], routeTheme: 'tech', price: 198.5 },
  { marketId: 'tsla', symbol: 'TSLA', name: 'Tesla Route', coordinates: [-97.743, 30.267], routeTheme: 'tech', price: 245.2 },
  { marketId: 'nvda', symbol: 'NVDA', name: 'Nvidia Route', coordinates: [-121.96, 37.42], routeTheme: 'tech', price: 875.0 },
  { marketId: 'gme',  symbol: 'GME',  name: 'GameStop Route', coordinates: [-74.006, 40.7128], routeTheme: 'meme', price: 25.8 },
  { marketId: 'amzn', symbol: 'AMZN', name: 'Amazon Route', coordinates: [-122.336, 47.606], routeTheme: 'consumer', price: 185.3 },
];

export async function GET() {
  const geojson = {
    type: 'FeatureCollection',
    features: SPAWNS.map(s => ({
      type: 'Feature',
      properties: { marketId: s.marketId, symbol: s.symbol, name: s.name, routeTheme: s.routeTheme, price: s.price },
      geometry: { type: 'Point', coordinates: s.coordinates },
    })),
  };
  return NextResponse.json(geojson);
}
