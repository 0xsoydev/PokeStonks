'use client';

import { useEffect, useRef, useState } from 'react';
import mapData from '@/maps/data/village-map.json';

interface Solid {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface MapObject {
  img: string;
  x: number; // feet-center, world px
  y: number; // feet-center, world px
  w: number;
  h: number;
  solid?: Solid;
}
interface Pin {
  symbol: string;
  drop: string;
  x: number;
  y: number;
  pad: string;
}
interface VillageMapData {
  tile: number;
  cols: number;
  rows: number;
  worldW: number;
  worldH: number;
  tileBase: string;
  groundTiles: string[];
  ground: number[][];
  objects: MapObject[];
  pins: Pin[];
  spawn: { x: number; y: number };
}

const MAP = mapData as VillageMapData;
const PIN_COLOR = '#a855f7'; // matches globe pins in app/components/Globe.tsx
const PLAYER_R = 10;
const SPEED = 175; // px/s

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

export default function VillageMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selected, setSelected] = useState<Pin | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    let cancelled = false;
    let raf = 0;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setStatus('error');
      return;
    }

    // Collect every sprite URL (ground palette + objects + pin pads).
    const urls = new Set<string>();
    for (const t of MAP.groundTiles) urls.add(`${MAP.tileBase}/${t}`);
    for (const o of MAP.objects) urls.add(`${MAP.tileBase}/${o.img}`);
    for (const p of MAP.pins) urls.add(`${MAP.tileBase}/${p.pad}`);

    // Mutable game state (refs — no react re-renders in the loop).
    const player = { x: MAP.spawn.x, y: MAP.spawn.y, fx: 0, fy: 1 };
    const keys = new Set<string>();
    const moveTarget = { active: false, x: 0, y: 0 };
    const cam = { x: 0, y: 0 };
    const zoom = { v: 2 };
    let downPos: { x: number; y: number } | null = null;

    const solids: Solid[] = MAP.objects.flatMap((o) => (o.solid ? [o.solid] : []));
    // Static objects pre-sorted by feet-y for top-down depth.
    const sorted = [...MAP.objects].sort((a, b) => a.y - b.y);

    const screenToWorld = (sx: number, sy: number) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (sx - rect.left) / zoom.v + cam.x,
        y: (sy - rect.top) / zoom.v + cam.y,
      };
    };

    const hitsSolid = (x: number, y: number) => {
      if (x < 40 || y < 40 || x > MAP.worldW - 40 || y > MAP.worldH - 40) return true;
      for (const s of solids) {
        const nx = Math.max(s.x, Math.min(x, s.x + s.w));
        const ny = Math.max(s.y, Math.min(y, s.y + s.h));
        if ((x - nx) ** 2 + (y - ny) ** 2 < PLAYER_R * PLAYER_R) return true;
      }
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
        keys.add(k);
        moveTarget.active = false; // keys override click-to-move
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom.v = Math.min(3.5, Math.max(1, zoom.v - e.deltaY * 0.002));
    };
    const onPointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      downPos = { x: e.clientX, y: e.clientY };
      const w = screenToWorld(e.clientX, e.clientY);
      moveTarget.active = true;
      moveTarget.x = w.x;
      moveTarget.y = w.y;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.buttons !== 1) return;
      const w = screenToWorld(e.clientX, e.clientY);
      moveTarget.active = true;
      moveTarget.x = w.x;
      moveTarget.y = w.y;
    };
    const onPointerUp = (e: PointerEvent) => {
      // Tap (not drag) on a pin opens it.
      if (downPos && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) < 8) {
        const w = screenToWorld(e.clientX, e.clientY);
        const pin = MAP.pins.find((p) => Math.hypot(p.x - w.x, p.y - w.y) < 34);
        setSelected(pin ?? null);
        if (pin) moveTarget.active = false;
      }
      downPos = null;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const drawPlayer = (c: CanvasRenderingContext2D) => {
      // shadow
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.beginPath();
      c.ellipse(player.x, player.y, 10, 4, 0, 0, Math.PI * 2);
      c.fill();
      // cloak body
      c.fillStyle = '#0ea5e9';
      c.beginPath();
      c.arc(player.x, player.y - 12, 9, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#0369a1';
      c.fillRect(player.x - 9, player.y - 12, 18, 10);
      // head
      c.fillStyle = '#fcd9b8';
      c.beginPath();
      c.arc(player.x, player.y - 24, 6, 0, Math.PI * 2);
      c.fill();
      // facing nose
      c.fillStyle = '#0c4a6e';
      c.beginPath();
      c.arc(player.x + player.fx * 8, player.y - 14 + player.fy * 6, 2.5, 0, Math.PI * 2);
      c.fill();
    };

    const drawPin = (c: CanvasRenderingContext2D, img: HTMLImageElement, p: Pin, t: number, i: number) => {
      c.drawImage(img, p.x - img.width / 2, p.y - img.height / 2);
      // pulsing ring
      const r = 26 + 6 * Math.sin(t * 3 + i * 1.3);
      c.strokeStyle = PIN_COLOR;
      c.lineWidth = 3;
      c.globalAlpha = 0.9;
      c.beginPath();
      c.arc(p.x, p.y, r, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 0.3;
      c.beginPath();
      c.arc(p.x, p.y, r + 8, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 1;
      // label pill
      c.font = 'bold 12px monospace';
      const label = `${p.symbol} · ${p.drop}`;
      const tw = c.measureText(label).width;
      const bx = p.x - tw / 2 - 6;
      const by = p.y - img.height / 2 - 26;
      c.fillStyle = 'rgba(0,0,0,0.75)';
      c.beginPath();
      c.roundRect(bx, by, tw + 12, 20, 5);
      c.fill();
      c.fillStyle = '#fff';
      c.fillText(label, bx + 6, by + 14);
    };

    let last = performance.now();
    const frame = (now: number) => {
      if (cancelled) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;

      // --- movement ---
      let dx = 0;
      let dy = 0;
      if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
      if (keys.has('d') || keys.has('arrowright')) dx += 1;
      if (keys.has('w') || keys.has('arrowup')) dy -= 1;
      if (keys.has('s') || keys.has('arrowdown')) dy += 1;
      if (dx === 0 && dy === 0 && moveTarget.active) {
        const vx = moveTarget.x - player.x;
        const vy = moveTarget.y - player.y;
        const d = Math.hypot(vx, vy);
        if (d < 5) {
          moveTarget.active = false;
        } else {
          dx = vx / d;
          dy = vy / d;
        }
      }
      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy);
        dx /= len;
        dy /= len;
        player.fx = dx;
        player.fy = dy;
        const step = SPEED * dt;
        const nx = player.x + dx * step;
        if (!hitsSolid(nx, player.y)) player.x = nx;
        const ny = player.y + dy * step;
        if (!hitsSolid(player.x, ny)) player.y = ny;
      }

      // --- camera (follow + clamp, center if world smaller than view) ---
      const rect = canvas.getBoundingClientRect();
      const viewW = rect.width / zoom.v;
      const viewH = rect.height / zoom.v;
      cam.x =
        MAP.worldW <= viewW
          ? (MAP.worldW - viewW) / 2
          : Math.min(Math.max(player.x - viewW / 2, 0), MAP.worldW - viewW);
      cam.y =
        MAP.worldH <= viewH
          ? (MAP.worldH - viewH) / 2
          : Math.min(Math.max(player.y - viewH / 2, 0), MAP.worldH - viewH);

      // --- render ---
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr * zoom.v, 0, 0, dpr * zoom.v, -cam.x * dpr * zoom.v, -cam.y * dpr * zoom.v);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(cam.x, cam.y, viewW, viewH);
      ctx.fillStyle = '#1a2b1a';
      ctx.fillRect(cam.x, cam.y, viewW, viewH);

      // ground (visible tiles only)
      const x0 = Math.max(0, Math.floor(cam.x / MAP.tile));
      const y0 = Math.max(0, Math.floor(cam.y / MAP.tile));
      const x1 = Math.min(MAP.cols - 1, Math.ceil((cam.x + viewW) / MAP.tile));
      const y1 = Math.min(MAP.rows - 1, Math.ceil((cam.y + viewH) / MAP.tile));
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const img = images.get(`${MAP.tileBase}/${MAP.groundTiles[MAP.ground[ty][tx]]}`);
          if (img) ctx.drawImage(img, tx * MAP.tile, ty * MAP.tile);
        }
      }

      // y-sorted draw list: static objects + pads + player
      let oi = 0;
      const pinOrder = [...MAP.pins].sort((a, b) => a.y - b.y);
      let pi = 0;
      const flushPins = (uptoY: number) => {
        while (pi < pinOrder.length && pinOrder[pi].y <= uptoY) {
          const p = pinOrder[pi];
          const img = images.get(`${MAP.tileBase}/${p.pad}`);
          if (img) drawPin(ctx, img, p, t, pi);
          pi++;
        }
      };
      let playerDrawn = false;
      while (oi < sorted.length) {
        const o = sorted[oi];
        flushPins(o.y);
        if (!playerDrawn && player.y <= o.y) {
          drawPlayer(ctx);
          playerDrawn = true;
        }
        const img = images.get(`${MAP.tileBase}/${o.img}`);
        if (img) ctx.drawImage(img, o.x - o.w / 2, o.y - o.h);
        oi++;
      }
      flushPins(Number.POSITIVE_INFINITY);
      if (!playerDrawn) drawPlayer(ctx);

      raf = requestAnimationFrame(frame);
    };

    // Image cache declared after frame (hoisted via closure at call time).
    const images = new Map<string, HTMLImageElement>();
    Promise.all([...urls].map(async (u) => images.set(u, await loadImage(encodeURI(u)))))
      .then(() => {
        if (cancelled) return;
        setStatus('ready');
        last = performance.now();
        raf = requestAnimationFrame(frame);
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-[#1a2b1a]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
          loading village…
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-red-300">
          failed to load map sprites. restart `pnpm dev` so predev copies assets to /public/maps.
        </div>
      )}
      {/* HUD */}
      <div className="pointer-events-none absolute left-4 top-4 rounded-lg bg-black/70 px-4 py-2 text-sm text-white">
        {selected ? (
          <>
            <span className="font-bold text-purple-300">{selected.symbol}</span>
            <span className="text-white/70"> · {selected.drop}/catch</span>
            <span className="ml-2 text-xs text-white/50">battle coming soon</span>
          </>
        ) : (
          <span className="text-white/70">tap a glowing pin to inspect · click ground to walk</span>
        )}
      </div>
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-black/60 px-4 py-1.5 text-xs text-white/70">
        WASD / arrows to move · drag to walk · scroll to zoom
      </div>
    </div>
  );
}
