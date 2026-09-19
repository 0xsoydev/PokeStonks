'use client';

// Pokémon-style village map — ported from the reference engine in demo.html
// (meadowbrook.tmj, GBA viewport 15x10 tiles, grid-step movement, 3-layer
// render with the player sandwiched between objects and overhead layer).
// Stock pins are poké balls; walk into one (or face it + Enter) to catch.
import { useEffect, useRef, useState } from 'react';
import { parseGIF, decompressFrames } from 'gifuct-js';
import pinsData from '@/maps/data/pins.json';
import Battle from './Battle';

// --- engine constants (mirrors demo.html) ---
const TS = 16;
const VW = 15;
const VH = 10; // GBA 240x160 viewport
const WALK_MS = 210;
const RUN_MS = 120;
const RESPAWN_S = 30;
const DX = [0, -1, 1, 0] as const; // down, left, right, up
const DY = [1, 0, 0, -1] as const;
const BASE = '/maps/meadowbrook';

interface TmjTile {
  id: number;
  properties?: { name: string; value: string | boolean }[];
  animation?: { tileid: number; duration: number }[];
}
interface TmjObject {
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  properties?: { name: string; value: string }[];
}
interface Tmj {
  width: number;
  height: number;
  properties?: { name: string; value: string }[];
  tilesets: { columns: number; tiles?: TmjTile[] }[];
  layers: {
    name: string;
    type: string;
    data?: number[];
    objects?: TmjObject[];
  }[];
}
interface Pin {
  symbol: string;
  drop: string;
  x: number;
  y: number;
}

const PINS = (pinsData as { pins: Pin[] }).pins;

// --- pokeapi sprites (player is an actual pokemon) ---
// Gen-V animated gifs = real movement; fallbacks: Gen-III emerald static -> trainer sheet
const SPRITES_CDN = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const STARTERS = [
  { id: 25, name: 'Pikachu' },
  { id: 4, name: 'Charmander' },
  { id: 1, name: 'Bulbasaur' },
  { id: 7, name: 'Squirtle' },
  { id: 133, name: 'Eevee' },
];

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
  const [caughtList, setCaughtList] = useState<string[]>([]);
  const [mapName, setMapName] = useState('');
  const [banner, setBanner] = useState(false);
  const [monName, setMonName] = useState('');
  const [monId, setMonId] = useState(25);
  const [encounter, setEncounter] = useState<Pin | null>(null);
  const battleRef = useRef(false);
  const encounterRef = useRef<Pin | null>(null);
  const engineApi = useRef<{ done: (r: 'win' | 'lose' | 'flee') => void } | null>(null);

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

    let W: number;
    let H: number;
    let ground: number[];
    let objs: number[];
    let above: number[];
    let tset: { columns: number; tiles?: TmjTile[] };
    const props: Record<number, Record<string, string | boolean>> = {};
    const anims: Record<number, { tileid: number; duration: number }[]> = {};
    let warps: { name: string; type: string; tx: number; ty: number; tw: number; th: number; p: Record<string, string> }[] = [];
    let talk: typeof warps = [];

    const parseTmj = (tmj: Tmj) => {
      W = tmj.width;
      H = tmj.height;
      const layer = (n: string) => tmj.layers.find((l) => l.name === n)!;
      ground = layer('ground').data!;
      objs = layer('objects').data!;
      above = layer('above').data!;
      tset = tmj.tilesets[0];
      for (const t of tset.tiles ?? []) {
        const p: Record<string, string | boolean> = {};
        for (const q of t.properties ?? []) p[q.name] = q.value;
        props[t.id] = p;
        if (t.animation) anims[t.id] = t.animation;
      }
      const toObjs = (l: string) =>
        (layer(l).objects ?? []).map((o) => {
          const p: Record<string, string> = {};
          for (const q of o.properties ?? []) p[q.name] = q.value;
          return { name: o.name, type: o.type, tx: o.x / TS, ty: o.y / TS, tw: o.width / TS, th: o.height / TS, p };
        });
      warps = toObjs('warps');
      talk = toObjs('interactions');
    };

    // --- world state (refs — no react re-renders in the loop) ---
    const pl = {
      tx: 15,
      ty: 11,
      fx: 0,
      fy: 0,
      dir: 0 as 0 | 1 | 2 | 3, // down, left, right, up
      moving: false,
      prog: 0,
      alt: false,
    };
    const held: number[] = []; // dir stack, last pressed wins
    const moveTarget = { x: -1, y: -1 }; // click-to-move tile
    let dialog: { lines: string[]; shown: number } | null = null;
    let running = false;
    let showCol = false;
    const caught = new Set<string>();
    const respawnAt = new Map<string, number>();
    let clock = 0;
    const cam = { x: 0, y: 0 };
    let S = 3;
    let last = performance.now();

    // --- pokemon sprites (loaded async, trainer sheet is the fallback) ---
    // Chromium only paints the FIRST frame of an animated GIF via drawImage,
    // so gen-V gifs are decoded client-side (gifuct-js) and frame-cycled manually.
    interface MonFrame {
      canvas: HTMLCanvasElement;
      delay: number;
    }
    interface MonAnim {
      frames: MonFrame[];
      w: number;
      h: number;
    }
    let mon: { id: number; name: string; front: MonAnim | null; back: MonAnim | null } | null = null;
    let monIx = 0;
    const tryImage = (url: string) =>
      new Promise<HTMLImageElement | null>((res) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => res(null);
        img.src = url;
      });
    const staticAnim = (img: HTMLImageElement): MonAnim => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d')?.drawImage(img, 0, 0);
      return { frames: [{ canvas: c, delay: 100 }], w: img.width, h: img.height };
    };
    const loadGifAnim = async (url: string): Promise<MonAnim | null> => {
      try {
        const buf = await fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null));
        if (!buf) return null;
        const gif = parseGIF(buf);
        const parsed = decompressFrames(gif, true);
        if (!parsed.length) return null;
        const w = gif.lsd.width;
        const h = gif.lsd.height;
        const full = document.createElement('canvas');
        full.width = w;
        full.height = h;
        const fctx = full.getContext('2d');
        if (!fctx) return null;
        const frames: MonFrame[] = [];
        for (const f of parsed) {
          const before = fctx.getImageData(0, 0, w, h); // for disposal #3 (restore prev)
          const patch = fctx.createImageData(f.dims.width, f.dims.height);
          patch.data.set(f.patch);
          fctx.putImageData(patch, f.dims.left, f.dims.top);
          // snapshot the composed frame
          const snap = document.createElement('canvas');
          snap.width = w;
          snap.height = h;
          snap.getContext('2d')?.drawImage(full, 0, 0);
          frames.push({ canvas: snap, delay: Math.max(f.delay, 20) });
          // apply disposal for the next frame
          if (f.disposalType === 2) fctx.clearRect(f.dims.left, f.dims.top, f.dims.width, f.dims.height);
          else if (f.disposalType === 3) fctx.putImageData(before, 0, 0);
        }
        return { frames, w, h };
      } catch {
        return null;
      }
    };
    const loadMon = async (id: number, name: string) => {
      // animated gen-V gifs first, gen-III/static as fallback per direction
      const front =
        (await loadGifAnim(`${SPRITES_CDN}/versions/generation-v/black-white/animated/${id}.gif`)) ??
        (await tryImage(`${SPRITES_CDN}/versions/generation-iii/emerald/${id}.png`).then((i) =>
          i ? staticAnim(i) : null,
        ));
      const back =
        (await loadGifAnim(`${SPRITES_CDN}/versions/generation-v/black-white/animated/back/${id}.gif`)) ??
        (await tryImage(`${SPRITES_CDN}/back/${id}.png`).then((i) => (i ? staticAnim(i) : null)));
      if (cancelled) return;
      mon = { id, name, front, back };
      setMonName(name);
      setMonId(id);
    };
    const cycleMon = () => {
      monIx = (monIx + 1) % STARTERS.length;
      const s = STARTERS[monIx];
      mon = null; // trainer shows until the new sprites arrive
      setMonName('');
      void loadMon(s.id, s.name);
    };

    const solidAt = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return true;
      for (const L of [ground, objs, above]) {
        const g = L[y * W + x];
        if (g && props[g - 1] && props[g - 1].solid) return true;
      }
      return false;
    };

    const inRect = (
      o: { tx: number; ty: number; tw: number; th: number },
      x: number,
      y: number,
    ) => x >= o.tx && x < o.tx + o.tw && y >= o.ty && y < o.ty + o.th;

    const say = (text: string) => {
      dialog = { lines: text.split('\n'), shown: 0 };
      held.length = 0;
      moveTarget.x = -1;
    };

    const pinAt = (x: number, y: number) =>
      PINS.find((p) => p.x === x && p.y === y && !caught.has(p.symbol));

    // walking onto (or facing + Z) a poké ball opens the battle instead of an instant catch
    const startEncounter = (pin: Pin) => {
      held.length = 0;
      moveTarget.x = -1;
      encounterRef.current = pin;
      battleRef.current = true;
      setEncounter(pin);
    };

    const interact = () => {
      if (dialog) {
        dialog = null;
        return;
      }
      if (pl.moving) return;
      const fx = pl.tx + DX[pl.dir];
      const fy = pl.ty + DY[pl.dir];
      const o = talk.find((o) => o.type === 'sign' && inRect(o, fx, fy));
      if (o) {
        say(o.p.text ?? '…');
        return;
      }
      const pin = pinAt(fx, fy);
      if (pin) startEncounter(pin);
    };

    const arrive = () => {
      const w = warps.find((o) => inRect(o, pl.tx, pl.ty));
      if (w) {
        say(`${w.name}\n-> ${w.p.target ?? '?'} (hook up your map here)`);
        return;
      }
      const pin = pinAt(pl.tx, pl.ty);
      if (pin) startEncounter(pin);
    };

    // called by the Battle overlay when it closes
    const battleDone = (result: 'win' | 'lose' | 'flee') => {
      battleRef.current = false;
      const pin = encounterRef.current;
      encounterRef.current = null;
      if (result === 'win' && pin) {
        caught.add(pin.symbol);
        respawnAt.set(pin.symbol, clock + RESPAWN_S);
        setCaughtList((c) => [...c, pin.symbol]);
      }
      setEncounter(null);
    };
    engineApi.current = { done: battleDone };

    const step = (d: 0 | 1 | 2 | 3) => {
      pl.dir = d;
      const nx = pl.tx + DX[d];
      const ny = pl.ty + DY[d];
      if (solidAt(nx, ny)) {
        pl.moving = false; // bump
        return;
      }
      pl.moving = true;
      pl.fx = pl.tx;
      pl.fy = pl.ty;
      pl.tx = nx;
      pl.ty = ny;
    };

    const tryStart = () => {
      const d = held.length ? held[held.length - 1] : null;
      if (d === null) {
        // click-to-move: one greedy step toward the target tile
        if (moveTarget.x >= 0 && !dialog) {
          const dx = moveTarget.x - pl.tx;
          const dy = moveTarget.y - pl.ty;
          if (dx === 0 && dy === 0) {
            moveTarget.x = -1;
            return;
          }
          const steps: (0 | 1 | 2 | 3)[] =
            Math.abs(dx) >= Math.abs(dy)
              ? [dx > 0 ? 2 : 1, dy > 0 ? 0 : 3]
              : [dy > 0 ? 0 : 3, dx > 0 ? 2 : 1];
          for (const sd of steps) {
            if (!solidAt(pl.tx + DX[sd], pl.ty + DY[sd])) {
              step(sd);
              return;
            }
          }
          moveTarget.x = -1; // stuck — give up
        }
        return;
      }
      step(d as 0 | 1 | 2 | 3);
    };

    // --- input ---
    const KEYMAP: Record<string, number> = {
      ArrowDown: 0,
      ArrowLeft: 1,
      ArrowRight: 2,
      ArrowUp: 3,
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (battleRef.current) return; // battle overlay owns the keys
      const d = KEYMAP[e.key];
      if (d !== undefined) {
        e.preventDefault();
        if (!held.includes(d)) held.push(d);
        moveTarget.x = -1;
        if (dialog) dialog = null; // arrows also dismiss dialogue
      } else if (e.key === 'Shift') running = true;
      else if (e.key.toLowerCase() === 'c') showCol = !showCol;
      else if (e.key.toLowerCase() === 'p' && !e.repeat) cycleMon();
      else if (e.key === 'z' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!e.repeat) interact();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (battleRef.current) return;
      const d = KEYMAP[e.key];
      if (d !== undefined) {
        const i = held.indexOf(d);
        if (i >= 0) held.splice(i, 1);
      } else if (e.key === 'Shift') running = false;
    };
    const onPointerDown = (e: PointerEvent) => {
      if (battleRef.current) return;
      if (dialog) {
        dialog = null;
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const wx = (e.clientX - rect.left) / S + cam.x;
      const wy = (e.clientY - rect.top) / S + cam.y;
      const tx = Math.floor(wx / TS);
      const ty = Math.floor(wy / TS);
      if (tx < 0 || ty < 0 || tx >= W || ty >= H || solidAt(tx, ty)) return;
      moveTarget.x = tx;
      moveTarget.y = ty;
      held.length = 0;
    };

    // --- sizing: integer zoom, GBA aspect, centered ---
    const resize = () => {
      const rect = container.getBoundingClientRect();
      S = Math.max(1, Math.floor(Math.min(rect.width / (VW * TS), rect.height / (VH * TS))));
      canvas.width = VW * TS * S;
      canvas.height = VH * TS * S;
      canvas.style.width = `${canvas.width}px`;
      canvas.style.height = `${canvas.height}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // --- update + render (ported from demo.html) ---
    const frameOf = (g: number) => {
      if (!g) return -1;
      const id = g - 1;
      const a = anims[id];
      if (a) {
        const total = a.reduce((s, f) => s + f.duration, 0);
        let m = (clock * 1000) % total;
        for (const f of a) {
          if (m < f.duration) return f.tileid;
          m -= f.duration;
        }
      }
      return id;
    };

    const drawPin = (pin: Pin) => {
      // poké ball: red top, white bottom, black band + button
      const cx = (pin.x * TS + TS / 2 - cam.x) * S;
      const cy = (pin.y * TS + TS / 2 - cam.y) * S;
      const r = 5 * S;
      ctx.lineWidth = Math.max(1, S * 0.75);
      ctx.strokeStyle = '#111';
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e3350d';
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };

    const drawDialog = () => {
      const d = dialog!;
      const bx = 4 * S;
      const by = 108 * S;
      const bw = 232 * S;
      const bh = 48 * S;
      ctx.fillStyle = '#3a3f58';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#f8f8f8';
      ctx.fillRect(bx + 2 * S, by + 2 * S, bw - 4 * S, bh - 4 * S);
      ctx.fillStyle = '#5a6088';
      ctx.fillRect(bx + 3 * S, by + 3 * S, bw - 6 * S, S);
      ctx.fillStyle = '#20243a';
      ctx.font = `bold ${8 * S}px "Courier New", monospace`;
      ctx.textBaseline = 'top';
      let n = Math.floor(d.shown);
      d.lines.forEach((ln, i) => {
        const t = ln.slice(0, Math.max(0, n));
        n -= ln.length;
        ctx.fillText(t, bx + 10 * S, by + (10 + i * 14) * S);
      });
    };

    const update = (dt: number) => {
      clock += dt;
      for (const [sym, t] of respawnAt) {
        if (clock >= t) {
          caught.delete(sym);
          respawnAt.delete(sym);
        }
      }
      if (dialog) {
        dialog.shown += dt * 45;
        return;
      }
      const dur = (running ? RUN_MS : WALK_MS) / 1000;
      if (pl.moving) {
        pl.prog += dt / dur;
        while (pl.prog >= 1 && pl.moving) {
          pl.prog -= 1;
          pl.alt = !pl.alt;
          pl.moving = false;
          arrive();
          if (!dialog) tryStart();
        }
        if (!pl.moving) pl.prog = 0;
      } else tryStart();
    };

    const render = () => {
      const tsImg = images.get('tileset');
      const plImg = images.get('trainer');
      if (!tsImg || !plImg) return;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      let px = pl.tx * TS;
      let py = pl.ty * TS;
      if (pl.moving) {
        px = (pl.fx + (pl.tx - pl.fx) * pl.prog) * TS;
        py = (pl.fy + (pl.ty - pl.fy) * pl.prog) * TS;
      }
      px = Math.round(px);
      py = Math.round(py);
      cam.x = Math.max(0, Math.min(W * TS - VW * TS, px + TS / 2 - (VW * TS) / 2));
      cam.y = Math.max(0, Math.min(H * TS - VH * TS, py + TS / 2 - (VH * TS) / 2));
      const x0 = Math.floor(cam.x / TS);
      const y0 = Math.floor(cam.y / TS);
      const drawLayerPx = (L: number[]) => {
        for (let y = y0; y <= y0 + VH; y++)
          for (let x = x0; x <= x0 + VW; x++) {
            if (x >= W || y >= H) continue;
            const id = frameOf(L[y * W + x]);
            if (id >= 0)
              ctx.drawImage(
                tsImg,
                (id % tset.columns) * TS,
                Math.floor(id / tset.columns) * TS,
                TS,
                TS,
                Math.round((x * TS - cam.x) * S),
                Math.round((y * TS - cam.y) * S),
                TS * S,
                TS * S,
              );
          }
      };
      drawLayerPx(ground);
      drawLayerPx(objs);
      for (const p of PINS) if (!caught.has(p.symbol)) drawPin(p);
      drawPlayer(px, py, plImg);
      drawLayerPx(above);
      if (showCol) {
        ctx.fillStyle = 'rgba(255,40,40,.35)';
        for (let y = y0; y <= y0 + VH; y++)
          for (let x = x0; x <= x0 + VW; x++)
            if (solidAt(x, y))
              ctx.fillRect(
                Math.round((x * TS - cam.x) * S),
                Math.round((y * TS - cam.y) * S),
                TS * S,
                TS * S,
              );
      }
      if (dialog) drawDialog();
    };

    const drawPlayer = (px: number, py: number, plImg: HTMLImageElement) => {
      const feetSx = Math.round((px + TS / 2 - cam.x) * S); // feet-center, screen px
      const feetSy = Math.round((py + TS - 2 - cam.y) * S);
      const anim = mon ? (pl.dir === 3 ? (mon.back ?? mon.front) : mon.front) : null;
      if (anim) {
        // frame-cycle by per-frame delay (clock is in seconds)
        const total = anim.frames.reduce((s, f) => s + f.delay, 0);
        let m = (clock * 1000) % total;
        let fr = anim.frames[0];
        for (const f of anim.frames) {
          if (m < f.delay) {
            fr = f;
            break;
          }
          m -= f.delay;
        }
        // fit sprite into ~1.6 tiles, anchored feet-center
        const scale = Math.min(26 / anim.w, 26 / anim.h);
        const w = Math.round(anim.w * scale * S);
        const h = Math.round(anim.h * scale * S);
        const dx = Math.round(feetSx - w / 2);
        const dy = Math.round(feetSy - h);
        // shadow
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath();
        ctx.ellipse(feetSx, feetSy - S, Math.max(6 * S, w * 0.22), Math.max(2 * S, h * 0.05), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        if (pl.dir === 1) {
          // left = mirrored front sprite
          ctx.translate(dx + w, dy);
          ctx.scale(-1, 1);
          ctx.drawImage(fr.canvas, 0, 0, w, h);
        } else {
          ctx.drawImage(fr.canvas, dx, dy, w, h);
        }
        ctx.restore();
        return;
      }
      // fallback: trainer sheet (16x16 frames: 3 walk frames x 4 directions)
      let f = 0;
      if (pl.moving && pl.prog > 0.2 && pl.prog < 0.8) f = pl.alt ? 1 : 2;
      ctx.drawImage(
        plImg,
        f * 16,
        pl.dir * 16,
        16,
        16,
        Math.round((px - cam.x) * S),
        Math.round((py - cam.y) * S),
        16 * S,
        16 * S,
      );
    };

    const loop = (now: number) => {
      if (cancelled) return;
      const dt = Math.min(50, now - last) / 1000;
      last = now;
      update(dt);
      render();
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', onPointerDown);

    // --- async boot: fetch map + load sprites ---
    Promise.all([
      fetch(`${BASE}/meadowbrook.tmj`).then((r) => {
        if (!r.ok) throw new Error(`tmj ${r.status}`);
        return r.json() as Promise<Tmj>;
      }),
      loadImage(`${BASE}/tileset.png`),
      loadImage(`${BASE}/trainer.png`),
    ])
      .then(([tmjData, tileset, trainer]) => {
        if (cancelled) return;
        parseTmj(tmjData);
        images.set('tileset', tileset);
        images.set('trainer', trainer);
        // spawn from the tmj interactions layer
        const sp = talk.find((o) => o.type === 'spawn');
        if (sp) {
          pl.tx = sp.tx;
          pl.ty = sp.ty;
        }
        ctx.imageSmoothingEnabled = false;
        setStatus('ready');
        setMapName(tmjData.properties?.find((p) => p.name === 'name')?.value ?? '');
        setBanner(true);
        last = performance.now();
        raf = requestAnimationFrame(loop);
        const t = setTimeout(() => setBanner(false), 2600);
        cleanupTimer = () => clearTimeout(t);
        void loadMon(STARTERS[0].id, STARTERS[0].name); // Pikachu first
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setStatus('error');
      });

    let cleanupTimer: (() => void) | null = null;

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      cleanupTimer?.();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onPointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const images = useRef(new Map<string, HTMLImageElement>()).current;

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#0b1118]"
    >
      <canvas ref={canvasRef} className="touch-none" style={{ imageRendering: 'pixelated' }} />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
          loading meadowbrook…
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-red-300">
          failed to load map assets. restart `pnpm dev` so predev copies sprites to /public/maps.
        </div>
      )}
      {banner && status === 'ready' && mapName && (
        <div className="pointer-events-none absolute top-8 rounded-lg border-2 border-white/60 bg-black/80 px-6 py-2 text-lg font-bold tracking-wide text-white shadow-lg">
          {mapName}
        </div>
      )}
      {encounter && (
        <Battle
          symbol={encounter.symbol}
          drop={encounter.drop}
          playerName={monName || 'Pikachu'}
          playerId={monId}
          onDone={(r) => engineApi.current?.done(r)}
        />
      )}
      {/* HUD */}
      <div className="pointer-events-none absolute left-4 top-4 space-y-2 text-sm text-white">
        {monName && (
          <div className="rounded-lg bg-black/70 px-4 py-1.5">
            <span className="text-white/50">walking as </span>
            <span className="font-bold text-yellow-300">{monName}</span>
            <span className="text-xs text-white/40"> · P to switch</span>
          </div>
        )}
        <div className="rounded-lg bg-black/70 px-4 py-1.5">
          {caughtList.length > 0 ? (
            <>
              <span className="font-bold text-purple-300">bag:</span>{' '}
              <span className="text-white/80">{caughtList.join(', ')}</span>
            </>
          ) : (
            <span className="text-white/70">5 poké balls hidden in the village — go catch stocks</span>
          )}
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-black/60 px-4 py-1.5 text-xs text-white/70">
        arrow keys to move · shift to run · z/enter to read signs &amp; catch · p to switch pokémon · c = collision
      </div>
    </div>
  );
}
