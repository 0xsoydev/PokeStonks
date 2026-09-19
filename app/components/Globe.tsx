'use client';

import { useEffect, useRef, useState } from 'react';
import { Map, Popup, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// ponytail: worker vendored to public/maplibre via predev/prebuild (Next breaks the bundled worker URL in v6)
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

// ponytail: static mock pins, replace with onchain vault feed when mock ERC20s land
const PINS = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { symbol: 'AAPL', drop: '0.025' }, geometry: { type: 'Point', coordinates: [-122.032, 37.323] } },
    { type: 'Feature', properties: { symbol: 'TSLA', drop: '0.03' }, geometry: { type: 'Point', coordinates: [-97.743, 30.267] } },
    { type: 'Feature', properties: { symbol: 'NVDA', drop: '1' }, geometry: { type: 'Point', coordinates: [-121.96, 37.42] } },
    { type: 'Feature', properties: { symbol: 'GME', drop: '0.25' }, geometry: { type: 'Point', coordinates: [-74.006, 40.7128] } },
    { type: 'Feature', properties: { symbol: 'AMZN', drop: '0.02' }, geometry: { type: 'Point', coordinates: [-122.336, 47.606] } },
  ],
} as const;

const STYLE = 'https://tiles.openfreemap.org/styles/bright';

export default function Globe() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new Map({ container: ref.current, style: STYLE, center: [-98, 39.5], zoom: 3 });
    // ponytail: hardcoded US view, fitBounds over PINS when pins go global
    mapRef.current = map;
    map.on('style.load', () => map.setProjection({ type: 'globe' }));
    map.on('load', () => {
      map.addSource('stonks', { type: 'geojson', data: PINS as unknown as { type: string; features: unknown[] } });
      map.addLayer({ id: 'stonks', type: 'circle', source: 'stonks', paint: { 'circle-radius': 8, 'circle-color': '#a855f7', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } });
      map.on('click', 'stonks', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const coords = (f.geometry as { type: string; coordinates: number[] }).coordinates as [number, number];
        const props = f.properties as { symbol: string; drop: string };
        setSelected(`${props.symbol} · ${props.drop}/catch`);
        map.flyTo({ center: coords, zoom: 10, essential: true });
        new Popup().setLngLat(coords).setHTML(`<strong>${props.symbol}</strong><p>${props.drop} / catch</p>`).addTo(map);
      });
      map.on('mouseenter', 'stonks', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'stonks', () => (map.getCanvas().style.cursor = ''));
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', background: '#06090f' }}>
      {/* ponytail: flat backdrop, setSky() atmosphere when globe styling gets a pass */}
      <div ref={ref} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
      {selected && (
        <div className="absolute left-4 top-4 rounded-lg bg-black/70 px-4 py-2 text-sm text-white">{selected}</div>
      )}
    </div>
  );
}
