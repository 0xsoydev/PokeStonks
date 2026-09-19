'use client';

import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Map, Marker, Popup, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Button, Card } from 'pixel-retroui';
import { useWriteContract, useSwitchChain } from 'wagmi';
import { useAccount, useModal } from '@getpara/react-sdk';
import PixelBlast from './PixelBlast';
import Overlay from './Overlay';

// ponytail: worker vendored to public/maplibre via predev/prebuild (Next breaks the bundled worker URL in v6)
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

// ponytail: static mock pins, replace with onchain vault feed when mock ERC20s land
export const PINS = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { symbol: 'AAPL', drop: '0.025', logo: '/logos/apple.svg', city: 'Cupertino' }, geometry: { type: 'Point', coordinates: [-122.032, 37.323] } },
    { type: 'Feature', properties: { symbol: 'TSLA', drop: '0.03', logo: '/logos/tesla.svg', city: 'Austin' }, geometry: { type: 'Point', coordinates: [-97.743, 30.267] } },
    { type: 'Feature', properties: { symbol: 'NVDA', drop: '1', logo: '/logos/nvidia.svg', city: 'Santa Clara' }, geometry: { type: 'Point', coordinates: [-121.96, 37.42] } },
    { type: 'Feature', properties: { symbol: 'AMZN', drop: '0.02', logo: '/logos/amazon.svg', city: 'Seattle' }, geometry: { type: 'Point', coordinates: [-122.336, 47.606] } },
    // ponytail: fixed ±1km offsets around 215 Atrium, replace with GPS scatter when live location lands
    { type: 'Feature', properties: { symbol: 'TSLA', drop: '0.03', logo: '/logos/tesla.svg', city: 'Mumbai' }, geometry: { type: 'Point', coordinates: [72.8564, 19.1212] } },
    { type: 'Feature', properties: { symbol: 'NVDA', drop: '1', logo: '/logos/nvidia.svg', city: 'Mumbai' }, geometry: { type: 'Point', coordinates: [72.8744, 19.1212] } },
    { type: 'Feature', properties: { symbol: 'AMZN', drop: '0.02', logo: '/logos/amazon.svg', city: 'Mumbai' }, geometry: { type: 'Point', coordinates: [72.8654, 19.1052] } },
    // ponytail: Photon/OSM-verified brand sites (7 exact POIs, rest complex-level); full feed replaces all when vaults land
    { type: 'Feature', properties: { symbol: 'AAPL', drop: '0.025', logo: '/logos/apple.svg', city: 'Mumbai' }, geometry: { type: 'Point', coordinates: [72.8496, 19.0532] } },
    { type: 'Feature', properties: { symbol: 'AAPL', drop: '0.025', logo: '/logos/apple.svg', city: 'Delhi' }, geometry: { type: 'Point', coordinates: [77.2183, 28.5293] } },
    { type: 'Feature', properties: { symbol: 'TSLA', drop: '0.03', logo: '/logos/tesla.svg', city: 'Mumbai' }, geometry: { type: 'Point', coordinates: [72.8502, 19.0541] } },
    { type: 'Feature', properties: { symbol: 'TSLA', drop: '0.03', logo: '/logos/tesla.svg', city: 'Delhi' }, geometry: { type: 'Point', coordinates: [77.1217, 28.5518] } },
    { type: 'Feature', properties: { symbol: 'TSLA', drop: '0.03', logo: '/logos/tesla.svg', city: 'Delhi' }, geometry: { type: 'Point', coordinates: [77.1219, 28.5515] } },
    { type: 'Feature', properties: { symbol: 'TSLA', drop: '0.03', logo: '/logos/tesla.svg', city: 'Gurgaon' }, geometry: { type: 'Point', coordinates: [77.0369, 28.426] } },
    { type: 'Feature', properties: { symbol: 'NVDA', drop: '1', logo: '/logos/nvidia.svg', city: 'Bengaluru' }, geometry: { type: 'Point', coordinates: [77.7022, 12.9862] } },
    { type: 'Feature', properties: { symbol: 'NVDA', drop: '1', logo: '/logos/nvidia.svg', city: 'Hyderabad' }, geometry: { type: 'Point', coordinates: [78.3432, 17.4161] } },
    { type: 'Feature', properties: { symbol: 'NVDA', drop: '1', logo: '/logos/nvidia.svg', city: 'Gurgaon' }, geometry: { type: 'Point', coordinates: [77.0746, 28.4661] } },
    { type: 'Feature', properties: { symbol: 'NVDA', drop: '1', logo: '/logos/nvidia.svg', city: 'Pune' }, geometry: { type: 'Point', coordinates: [73.7413, 18.5943] } },
    { type: 'Feature', properties: { symbol: 'NVDA', drop: '1', logo: '/logos/nvidia.svg', city: 'Chennai' }, geometry: { type: 'Point', coordinates: [80.2046, 13.0141] } },
    { type: 'Feature', properties: { symbol: 'AMZN', drop: '0.02', logo: '/logos/amazon.svg', city: 'Hyderabad' }, geometry: { type: 'Point', coordinates: [78.3458, 17.42] } },
    { type: 'Feature', properties: { symbol: 'AMZN', drop: '0.02', logo: '/logos/amazon.svg', city: 'Bengaluru' }, geometry: { type: 'Point', coordinates: [77.7614, 12.9964] } },
    { type: 'Feature', properties: { symbol: 'AMZN', drop: '0.02', logo: '/logos/amazon.svg', city: 'Bengaluru' }, geometry: { type: 'Point', coordinates: [77.6975, 12.9802] } },
    { type: 'Feature', properties: { symbol: 'AMZN', drop: '0.02', logo: '/logos/amazon.svg', city: 'Chennai' }, geometry: { type: 'Point', coordinates: [80.1998, 13.0099] } },
    { type: 'Feature', properties: { symbol: 'AMZN', drop: '0.02', logo: '/logos/amazon.svg', city: 'Mumbai' }, geometry: { type: 'Point', coordinates: [72.8526, 19.1655] } },
    { type: 'Feature', properties: { symbol: 'AMZN', drop: '0.02', logo: '/logos/amazon.svg', city: 'Gurgaon' }, geometry: { type: 'Point', coordinates: [77.0886, 28.4995] } },
    { type: 'Feature', properties: { symbol: 'AMZN', drop: '0.02', logo: '/logos/amazon.svg', city: 'Kolkata' }, geometry: { type: 'Point', coordinates: [88.4323, 22.5702] } },
    { type: 'Feature', properties: { symbol: 'AMZN', drop: '0.02', logo: '/logos/amazon.svg', city: 'Ahmedabad' }, geometry: { type: 'Point', coordinates: [72.5554, 23.0394] } },
    { type: 'Feature', properties: { symbol: 'AMZN', drop: '0.02', logo: '/logos/amazon.svg', city: 'Noida' }, geometry: { type: 'Point', coordinates: [77.3377, 28.5454] } },
    { type: 'Feature', properties: { symbol: 'AMZN', drop: '0.02', logo: '/logos/amazon.svg', city: 'Coimbatore' }, geometry: { type: 'Point', coordinates: [76.9796, 11.054] } },
    { type: 'Feature', properties: { symbol: 'AMZN', drop: '0.02', logo: '/logos/amazon.svg', city: 'Pune' }, geometry: { type: 'Point', coordinates: [73.8841, 18.5623] } },
    { type: 'Feature', properties: { symbol: 'AMZN', drop: '0.02', logo: '/logos/amazon.svg', city: 'Kochi' }, geometry: { type: 'Point', coordinates: [76.3628, 10.0105] } },
    { type: 'Feature', properties: { symbol: 'AMZN', drop: '0.02', logo: '/logos/amazon.svg', city: 'Hyderabad' }, geometry: { type: 'Point', coordinates: [78.3822, 17.4502] } },
    { type: 'Feature', properties: { symbol: 'AMZN', drop: '0.02', logo: '/logos/amazon.svg', city: 'Jaipur' }, geometry: { type: 'Point', coordinates: [75.8053, 26.854] } },
    { type: 'Feature', properties: { symbol: 'AMZN', drop: '0.02', logo: '/logos/amazon.svg', city: 'Lucknow' }, geometry: { type: 'Point', coordinates: [81.0038, 26.8673] } },
    { type: 'Feature', properties: { symbol: 'AMZN', drop: '0.02', logo: '/logos/amazon.svg', city: 'Indore' }, geometry: { type: 'Point', coordinates: [75.8733, 22.6853] } },
    { type: 'Feature', properties: { symbol: 'AMZN', drop: '0.02', logo: '/logos/amazon.svg', city: 'Thiruvananthapuram' }, geometry: { type: 'Point', coordinates: [76.8807, 8.5578] } },
    { type: 'Feature', properties: { symbol: 'AMZN', drop: '0.02', logo: '/logos/amazon.svg', city: 'Chandigarh' }, geometry: { type: 'Point', coordinates: [76.8456, 30.7288] } },
    { type: 'Feature', properties: { symbol: 'AMZN', drop: '0.02', logo: '/logos/amazon.svg', city: 'Bhubaneswar' }, geometry: { type: 'Point', coordinates: [85.8031, 20.3409] } },
  ],
} as const;

// ponytail: deployed Monad-testnet self-vault tokens (symbol → address); regenerate on redeploy
const TOKENS: Record<string, `0x${string}`> = {
  AAPL: '0x8EaE182Ed5af69385f3ddcf8a15AAD7C7E0cdBE8',
  TSLA: '0x505EC53e49C24E09c9de4516CcBE022a5E8A69c1',
  NVDA: '0x6300AcE7bB674E2F5c11cc5C51EB8160399AFCEC',
  AMZN: '0x7e1Dd44913825e03930647313E7423Fb9b7aae52',
};
const CATCH_ABI = [{ type: 'function', name: 'catchStock', stateMutability: 'nonpayable', inputs: [], outputs: [] }] as const;
const MONAD_TESTNET_ID = 10143;

const STYLE = 'https://tiles.openfreemap.org/styles/bright';

export default function Globe() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const spinCtl = useRef<{ stop: () => void } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selIdx, setSelIdx] = useState<number | null>(null);
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const { openModal } = useModal();
  const { isConnected, embedded } = useAccount();
  // ponytail: ref so first-render marker closures read live connection (guest ≠ connected)
  const connectedRef = useRef(false);
  connectedRef.current = isConnected && !embedded?.isGuestMode;

  // ponytail: free catch (gas only) — MetaMask path via wagmi; embedded/Google catch needs Para's viem client
  const catchStock = async (i: number) => {
    const p = PINS.features[i].properties as { symbol: string };
    const address = TOKENS[p.symbol];
    if (!address) return;
    if (!connectedRef.current) { openModal(); return; }
    try {
      await switchChainAsync({ chainId: MONAD_TESTNET_ID }).catch(() => {});
      await writeContractAsync({ address, abi: CATCH_ABI, functionName: 'catchStock', chainId: MONAD_TESTNET_ID });
      popupRef.current?.remove();
    } catch {
      // ponytail: swallow reject; add a toast when polish lands
    }
  };

  // ponytail: single camera path for markers + menu; per-pin tween queue when battle focus lands
  const select = (i: number) => {
    const f = PINS.features[i];
    const coords = [...f.geometry.coordinates] as [number, number];
    const props = f.properties as { symbol: string; drop: string };
    setSelected(`${props.symbol} · ${props.drop}/catch`);
    setSelIdx(i);
    // ponytail: zoom in only from overview (matches spread threshold); street-level taps just recenter
    mapRef.current?.flyTo(mapRef.current.getZoom() < 8 ? { center: coords, zoom: 10, essential: true } : { center: coords, essential: true });
    if (!mapRef.current) return;
    popupRef.current?.remove();
    const node = document.createElement('div');
    const root = createRoot(node);
    // ponytail: closeOnClick false (map tap suicides card), offset clears 44px frame; smart anchors if cards clip edges
    const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 32 }).setLngLat(coords).setDOMContent(node);
    popup.on('close', () => root.unmount());
    root.render(
      <Card className="relative !p-3 text-center font-minecraft text-xs">
        <button onClick={() => popup.remove()} aria-label="Close" className="absolute right-1.5 top-1 px-1 opacity-60 hover:opacity-100">✕</button>
        <div className="mb-1 text-sm">{props.symbol}</div>
        <div className="mb-2 opacity-70">{props.drop}/catch</div>
        <div className="flex flex-col gap-1.5">
          <Button bg="#2563eb" textColor="#fff" shadow="#1e3a8a" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${coords[1]},${coords[0]}`, '_blank')}>Go to Location</Button>
          {/* ponytail: dismisses into bottom Battle card; 30m GPS gate when live location lands */}
          <Button bg="#16a34a" textColor="#fff" shadow="#14532d" onClick={() => catchStock(i)}>Catch This Stock</Button>
        </div>
      </Card>
    );
    popup.addTo(mapRef.current);
    popupRef.current = popup;
  };

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new Map({ container: ref.current, style: STYLE, center: [-98, 39.5], zoom: 3 });
    // ponytail: throwaway center, fitBounds over PINS on load takes over
    mapRef.current = map;
    map.on('style.load', () => map.setProjection({ type: 'globe' }));
    map.on('load', () => {
      // ponytail: logo frame w/ ticker-text fallback (logo file missing = text); per-ticker sprites when vault feed lands
      const marks: { outer: HTMLElement; lng: number; lat: number; badge?: HTMLElement }[] = [];
      PINS.features.forEach((f, i) => {
        const coords = [...f.geometry.coordinates] as [number, number];
        const props = f.properties as { symbol: string; drop: string; logo?: string };
        const el = document.createElement('div');
        el.className = 'px-logo font-minecraft';
        el.innerHTML = props.logo
          ? `<div class="px-logo-in"><img src="${props.logo}" alt="${props.symbol}" /></div>`
          : `<div class="px-logo-in"><span>${props.symbol.slice(0, 4)}</span></div>`;
        el.onclick = () => select(i);
        new Marker({ element: el }).setLngLat(coords).addTo(map);
        marks.push({ outer: el, lng: coords[0], lat: coords[1] });
      });
      // ponytail: badge clusters over fan-out (one real logo +n beats spaced rows); spiderfy when gestures land
      const spread = () => {
        const k = (m: { lng: number; lat: number }) => `${Math.round(m.lng * 2)}:${Math.round(m.lat * 2)}`;
        const cells: Record<string, number[]> = {};
        marks.forEach((m, idx) => { const key = k(m); (cells[key] ??= []).push(idx); });
        const far = map.getZoom() < 8;
        Object.values(cells).forEach((idxs) => {
          idxs.forEach((pinIdx, pos) => {
            const m = marks[pinIdx];
            if (far && idxs.length > 1 && pos > 0) {
              m.outer.style.display = 'none';
              m.badge?.remove();
              m.badge = undefined;
            } else {
              m.outer.style.display = '';
              if (far && idxs.length > 1) {
                if (!m.badge) {
                  const b = document.createElement('div');
                  b.className = 'px-badge font-minecraft';
                  m.outer.appendChild(b);
                  m.badge = b;
                }
                m.badge.textContent = `+${idxs.length - 1}`;
              } else {
                m.badge?.remove();
                m.badge = undefined;
              }
            }
          });
        });
      };
      map.on('moveend', spread);
      spread();
      const lngs = PINS.features.map((f) => f.geometry.coordinates[0]);
      const lats = PINS.features.map((f) => f.geometry.coordinates[1]);
      map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 60 });
      // ponytail: idle spin, dies on first real user gesture (originalEvent) or deliberate select; no resume so it never fights input
      let spinning = true;
      let raf = 0;
      const stopSpin = () => { spinning = false; cancelAnimationFrame(raf); };
      const spin = () => {
        raf = requestAnimationFrame(spin);
        if (spinning && mapRef.current) {
          const c = map.getCenter();
          map.setCenter([c.lng - 0.06, c.lat]);
        }
      };
      // ponytail: only user-driven moves carry originalEvent; spin's own setCenter + flyTo are silent, so this never self-kills
      map.on('movestart', (e) => { if ((e as { originalEvent?: unknown }).originalEvent) stopSpin(); });
      spin();
      spinCtl.current = { stop: stopSpin };
    });
    return () => {
      spinCtl.current?.stop();
      spinCtl.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

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
      <Overlay selected={selected} selIdx={selIdx} onPick={setSelected} onLocate={select} />
    </div>
  );
}
