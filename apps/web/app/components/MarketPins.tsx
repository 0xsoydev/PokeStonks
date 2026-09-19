'use client';

import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl';
import { getSpecies } from 'game-core';
import type { SpawnFeature } from '../api/spawns/transform';
import { Portrait } from './Portrait';
import { TYPE_COLOR } from './ui';
import { audio } from '../game/audio';

type MapLibre = typeof import('maplibre-gl');

/** Two pins closer than this many CSS pixels collapse into one numbered cluster. */
const CLUSTER_PX = 46;
/** Markets further than this from the view centre are on the far side of the globe. */
const VISIBLE_DEG = 80;

type Pin =
  | { key: string; kind: 'market'; lngLat: [number, number]; feature: SpawnFeature; el: HTMLElement }
  | { key: string; kind: 'cluster'; lngLat: [number, number]; members: SpawnFeature[]; el: HTMLElement };

function angularDistanceDeg(a: { lng: number; lat: number }, b: [number, number]): number {
  const rad = Math.PI / 180;
  const cos =
    Math.sin(a.lat * rad) * Math.sin(b[1] * rad) +
    Math.cos(a.lat * rad) * Math.cos(b[1] * rad) * Math.cos((a.lng - b[0]) * rad);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / rad;
}

interface Props {
  map: MapLibreMap;
  lib: MapLibre;
  markets: SpawnFeature[];
  selectedId: string | null;
  onSelect: (marketId: string) => void;
  /** Fade the pins in (used once the camera pull has landed). */
  reveal: boolean;
}

/**
 * Type-coloured, ticker-labelled markers for the 12 markets, as real DOM buttons (focusable, >=44px)
 * positioned by MapLibre Markers. Pins within CLUSTER_PX of each other merge into a numbered cluster
 * that zooms in on click. Recomputed on move so clusters split as you zoom.
 */
export default function MarketPins({ map, lib, markets, selectedId, onSelect, reveal }: Props) {
  const [pins, setPins] = useState<Pin[]>([]);
  const cache = useRef(new Map<string, { marker: MapLibreMarker; el: HTMLElement }>());

  const compute = useEffectEvent(() => {
    const center = map.getCenter();
    const pts = markets.map((f) => ({
      f,
      p: map.project(f.geometry.coordinates),
      near: angularDistanceDeg(center, f.geometry.coordinates) < VISIBLE_DEG,
    }));

    const used = new Set<string>();
    const groups: (typeof pts)[] = [];
    for (const a of pts) {
      if (used.has(a.f.id)) continue;
      used.add(a.f.id);
      const group = [a];
      if (a.near) {
        for (const b of pts) {
          if (used.has(b.f.id) || !b.near) continue;
          if (Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y) < CLUSTER_PX) {
            used.add(b.f.id);
            group.push(b);
          }
        }
      }
      groups.push(group);
    }

    const seen = new Set<string>();
    const next: Pin[] = groups.map((g) => {
      const single = g.length === 1;
      const key = single ? `m:${g[0].f.id}` : `c:${g.map((x) => x.f.id).sort().join('+')}`;
      const lngLat: [number, number] = single
        ? g[0].f.geometry.coordinates
        : [
            g.reduce((s, x) => s + x.f.geometry.coordinates[0], 0) / g.length,
            g.reduce((s, x) => s + x.f.geometry.coordinates[1], 0) / g.length,
          ];
      let entry = cache.current.get(key);
      if (!entry) {
        const el = document.createElement('div');
        el.className = 'pin-host';
        const marker = new lib.Marker({ element: el, anchor: 'bottom', opacityWhenCovered: '0' }).setLngLat(lngLat).addTo(map);
        entry = { marker, el };
        cache.current.set(key, entry);
      }
      seen.add(key);
      return single
        ? { key, kind: 'market', lngLat, feature: g[0].f, el: entry.el }
        : { key, kind: 'cluster', lngLat, members: g.map((x) => x.f), el: entry.el };
    });

    for (const [key, entry] of cache.current) {
      if (!seen.has(key)) {
        entry.marker.remove();
        cache.current.delete(key);
      }
    }
    setPins(next);
  });

  useEffect(() => {
    let frame = 0;
    const now = () => compute();
    const onMove = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(now);
    };
    map.on('move', onMove);
    map.on('zoomend', now);
    map.on('moveend', now);
    const entries = cache.current;
    return () => {
      cancelAnimationFrame(frame);
      map.off('move', onMove);
      map.off('zoomend', now);
      map.off('moveend', now);
      for (const e of entries.values()) e.marker.remove();
      entries.clear();
    };
  }, [map, lib]);

  // New prices arrive every minute: recompute pins in place (same keys keep their DOM elements).
  useEffect(() => {
    compute();
  }, [markets, map, lib]);

  const zoomInto = useCallback(
    (members: SpawnFeature[]) => {
      audio.sfx('menu_select');
      const bounds = new lib.LngLatBounds();
      members.forEach((m) => bounds.extend(m.geometry.coordinates));
      map.fitBounds(bounds, { padding: 140, maxZoom: 12, duration: 900 });
    },
    [map, lib],
  );

  return (
    <>
      {pins.map((pin) =>
        createPortal(
          pin.kind === 'market' ? (
            <MarketPin
              feature={pin.feature}
              selected={pin.feature.id === selectedId}
              reveal={reveal}
              onSelect={() => onSelect(pin.feature.id)}
            />
          ) : (
            <ClusterPin members={pin.members} reveal={reveal} onZoom={() => zoomInto(pin.members)} />
          ),
          pin.el,
          pin.key,
        ),
      )}
    </>
  );
}

const MOOD_GLYPH = { bull: '▲', bear: '▼', flat: '' } as const;

function MarketPin({
  feature,
  selected,
  reveal,
  onSelect,
}: {
  feature: SpawnFeature;
  selected: boolean;
  reveal: boolean;
  onSelect: () => void;
}) {
  const p = feature.properties;
  const sp = getSpecies(p.speciesId);
  const glyph = p.live ? MOOD_GLYPH[p.mood] : '';
  return (
    <button
      type="button"
      className={`pin ${reveal ? 'pin-in' : 'pin-hidden'}`}
      data-selected={selected || undefined}
      aria-pressed={selected}
      aria-label={`${p.name}, ${p.symbol}, ${p.city}${p.live ? `, ${p.mood} market` : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {selected && <span className="pin-pulse" aria-hidden="true" />}
      <span className="pin-badge" style={{ ['--chip' as string]: TYPE_COLOR[sp.affinity] }}>
        <Portrait speciesId={p.speciesId} size={32} />
      </span>
      <span className="pin-tag">
        {p.symbol}
        {glyph && <b className={`pin-mood pin-mood-${p.mood}`} aria-hidden="true">{glyph}</b>}
      </span>
      <span className="pin-stem" aria-hidden="true" />
    </button>
  );
}

function ClusterPin({ members, reveal, onZoom }: { members: SpawnFeature[]; reveal: boolean; onZoom: () => void }) {
  const first = members[0].properties.symbol;
  return (
    <button
      type="button"
      className={`pin pin-cluster ${reveal ? 'pin-in' : 'pin-hidden'}`}
      aria-label={`${members.length} markets close together, starting with ${first}. Zoom in.`}
      onClick={(e) => {
        e.stopPropagation();
        onZoom();
      }}
    >
      <span className="pin-badge pin-count">{members.length}</span>
      <span className="pin-tag">
        {first} +{members.length - 1}
      </span>
      <span className="pin-stem" aria-hidden="true" />
    </button>
  );
}
