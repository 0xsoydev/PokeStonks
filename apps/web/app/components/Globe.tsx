'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Map, Popup, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import PixelBlast from './PixelBlast';
import dynamic from 'next/dynamic';

const PhaserMount = dynamic(() => import('../game/PhaserMount'), { ssr: false });

setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

const STYLE = 'https://tiles.openfreemap.org/styles/bright';

export default function Globe() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const [selected, setSelected] = useState<{ marketId: string; name: string; symbol: string; price: number } | null>(null);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new Map({ container: ref.current, style: STYLE, center: [-98, 39.5], zoom: 3 });
    mapRef.current = map;
    map.on('style.load', () => map.setProjection({ type: 'globe' }));
    map.on('load', async () => {
      try {
        const res = await fetch('/api/spawns');
        const geojson = await res.json();
        map.addSource('markets', { type: 'geojson', data: geojson });
        map.addLayer({
          id: 'markets',
          type: 'circle',
          source: 'markets',
          paint: { 'circle-radius': 8, 'circle-color': '#a855f7', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' },
        });
        map.on('click', 'markets', (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const coords = (f.geometry as any).coordinates as [number, number];
          const props = f.properties as any;
          map.flyTo({ center: coords, zoom: 10, essential: true });
          setSelected({ marketId: props.marketId, name: props.name, symbol: props.symbol, price: props.price });
        });
        map.on('mouseenter', 'markets', () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', 'markets', () => (map.getCanvas().style.cursor = ''));
      } catch {
        // API not available, use fallback pins
      }
    });
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  const handleEnter = useCallback(() => {
    if (!selected) return;
    setEntering(true);
  }, [selected]);

  if (entering && selected) {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
        <PhaserMount marketId={selected.marketId} onExit={() => setEntering(false)} />
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', background: '#E2F0FF' }}>
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
        <PixelBlast
          variant="square"
          pixelSize={4}
          color="#94C6FC"
          patternScale={2.25}
          patternDensity={0.35}
          pixelSizeJitter={0}
          enableRipples
          rippleSpeed={0.4}
          rippleThickness={0.12}
          rippleIntensityScale={1.5}
          liquid
          liquidStrength={0.12}
          liquidRadius={1.2}
          liquidWobbleSpeed={5}
          speed={1}
          edgeFade={0}
          transparent
        />
      </div>
      <div ref={ref} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />

      {/* Bottom sheet */}
      {selected && (
        <div className="absolute bottom-0 left-0 right-0 z-40 flex flex-col items-center bg-black/80 p-6 text-white rounded-t-2xl">
          <h2 className="text-lg font-bold mb-1">{selected.symbol} Route</h2>
          <p className="text-sm text-gray-300 mb-1">{selected.name}</p>
          <p className="text-xs text-purple-400 mb-4">Price: ${selected.price.toFixed(2)}</p>
          <button
            onClick={handleEnter}
            className="rounded-lg bg-purple-600 px-8 py-3 text-sm font-bold hover:bg-purple-500 transition"
          >
            Enter Route
          </button>
        </div>
      )}
    </div>
  );
}
