'use client';

import { useEffect, useState } from 'react';
import { getSpecies } from 'game-core';
import { loadPortraitFn } from './portraits';

const cache = new Map<string, string>();

/** Species pixel-art PNG data URL once the art module has loaded; null until then (and on failure). */
export function usePortrait(speciesId: string, size: number): string | null {
  const key = `${speciesId}:${size}`;
  const [loaded, setLoaded] = useState<{ key: string; src: string } | null>(null);

  useEffect(() => {
    if (cache.has(key)) return;
    let alive = true;
    loadPortraitFn().then((fn) => {
      if (!alive || !fn) return;
      try {
        const url = fn(speciesId, size);
        if (url) {
          cache.set(key, url);
          setLoaded({ key, src: url });
        }
      } catch {
        /* keep the placeholder */
      }
    });
    return () => {
      alive = false;
    };
  }, [key, speciesId, size]);

  return cache.get(key) ?? (loaded?.key === key ? loaded.src : null);
}

/**
 * A species portrait. Until the pixel art is ready (or if it fails) it shows a two-tone tile in the
 * species' own palette, so layout never jumps and nothing is ever blank.
 */
export function Portrait({
  speciesId,
  size = 64,
  className,
  title,
}: {
  speciesId: string;
  size?: number;
  className?: string;
  title?: string;
}) {
  const src = usePortrait(speciesId, size);
  const sp = getSpecies(speciesId);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} width={size} height={size} alt={title ?? ''} className={className} style={{ imageRendering: 'pixelated' }} draggable={false} />;
  }
  const [a, b] = sp.colors;
  return (
    <span
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${a} 0 55%, ${b} 55% 100%)`,
        color: '#fff',
        fontFamily: 'var(--font-pixel)',
        fontSize: Math.max(8, Math.round(size / 4)),
        textShadow: '2px 2px 0 #181818',
      }}
    >
      {sp.ticker.slice(0, 1)}
    </span>
  );
}
