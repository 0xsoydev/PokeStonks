'use client';

/**
 * Visual QA gallery for the procedural art engine (no Phaser here: pure Canvas2D).
 * Route: /dev/art
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { SPECIES_LIST } from 'game-core';
import {
  BG_H, BG_W, CHAR_KEYS, CHAR_H, CHAR_W, CHAR_WALK_MAPPING, ROUTE_THEMES, TILE, TILE_COUNT, ATLAS_COLS, ATLAS_ROWS,
  drawBattleBg, drawCharSheet, drawMon, drawPlatform, drawTileset, renderMonGrid,
  type CharKey, type Facing, type RouteTheme,
} from '../../game/art';
import { buildExchangeInterior, buildRouteMap, validateMap } from '../../game/overworld/maps';
import { drawMapPreview } from '../../game/overworld/mapPreview';

const pixelated = { imageRendering: 'pixelated' as const };
const panel = { background: '#141a3c', border: '2px solid #d8a830', padding: 12, borderRadius: 4 };

function useCanvas(draw: (ctx: CanvasRenderingContext2D) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    draw(ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

function Mon({ id, facing, size = 128 }: { id: string; facing: Facing; size?: number }) {
  const ref = useCanvas((ctx) => drawMon(ctx, id, facing, size), [id, facing, size]);
  return <canvas ref={ref} width={size} height={size} style={{ ...pixelated, width: size * 1.5, height: size * 1.5, background: 'repeating-conic-gradient(#2a2f55 0% 25%, #232849 0% 50%) 50% / 16px 16px' }} />;
}

function SpeciesSection() {
  return (
    <section>
      <h2>BrokerMon (32x32 logical, x4 = 128px)</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 12 }}>
        {SPECIES_LIST.map((s) => (
          <div key={s.id} style={panel}>
            <div style={{ color: '#f8d858', marginBottom: 8 }}>{s.name} <span style={{ color: '#a8b8f8' }}>${s.ticker} / {s.affinity}</span></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Mon id={s.id} facing="front" />
              <Mon id={s.id} facing="back" />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
              <Swatch c={s.colors[0]} /><Swatch c={s.colors[1]} />
              <span style={{ fontSize: 10, color: '#8890c8' }}>{s.tagline}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const Swatch = ({ c }: { c: string }) => <span style={{ display: 'inline-block', width: 16, height: 16, background: c, border: '1px solid #000' }} />;

function TilesetSection() {
  const [theme, setTheme] = useState<RouteTheme>('bluechip');
  const scale = 4;
  const w = ATLAS_COLS * 16, h = ATLAS_ROWS * 16;
  const ref = useCanvas((ctx) => {
    ctx.fillStyle = '#242a58';
    ctx.fillRect(0, 0, w * scale, h * scale);
    ctx.drawImage(drawTileset(theme), 0, 0, w * scale, h * scale);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.font = '9px monospace';
    for (let i = 0; i < ATLAS_COLS * ATLAS_ROWS; i++) {
      const x = (i % ATLAS_COLS) * 16 * scale, y = Math.floor(i / ATLAS_COLS) * 16 * scale;
      ctx.strokeRect(x + 0.5, y + 0.5, 16 * scale, 16 * scale);
      if (i < TILE_COUNT) {
        ctx.fillStyle = '#000'; ctx.fillText(String(i), x + 3, y + 11);
        ctx.fillStyle = '#ffe36a'; ctx.fillText(String(i), x + 2, y + 10);
      }
    }
  }, [theme]);
  const names = useMemo(() => Object.entries(TILE).map(([k, v]) => `${v}:${k}`).join('  '), []);
  return (
    <section>
      <h2>Tileset (16px tiles, x4) - {TILE_COUNT} tiles</h2>
      <ThemeTabs value={theme} onChange={setTheme} />
      <canvas ref={ref} width={w * scale} height={h * scale} style={{ ...pixelated, maxWidth: '100%' }} />
      <p style={{ fontSize: 9, color: '#8890c8', lineHeight: 1.7, wordBreak: 'break-word' }}>{names} &nbsp; (indices past {Math.max(...Object.values(TILE))}: path blob x47, water0 blob x47, water1 blob x47)</p>
    </section>
  );
}

function ThemeTabs({ value, onChange }: { value: RouteTheme; onChange: (t: RouteTheme) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, margin: '8px 0', flexWrap: 'wrap' }}>
      {ROUTE_THEMES.map((t) => (
        <button key={t} onClick={() => onChange(t)} style={{ padding: '6px 10px', background: t === value ? '#d8a830' : '#183088', color: t === value ? '#181818' : '#f8f8d0', border: '2px solid #d8a830', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}>{t}</button>
      ))}
    </div>
  );
}

function CharPreview({ k }: { k: CharKey }) {
  const sheet = useMemo(() => drawCharSheet(k), [k]);
  const sheetRef = useCanvas((ctx) => { sheet.drawTo(ctx, 0, 0, 1); }, [sheet]);
  const walkRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = walkRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    const src = sheet.toCanvas(1);
    let raf = 0;
    const order = [CHAR_WALK_MAPPING.down, CHAR_WALK_MAPPING.left, CHAR_WALK_MAPPING.right, CHAR_WALK_MAPPING.up];
    const seq = ['leftFoot', 'standing', 'rightFoot', 'standing'] as const;
    const loop = (t: number) => {
      ctx.clearRect(0, 0, c.width, c.height);
      const step = Math.floor(t / 160) % 4;
      order.forEach((row, i) => {
        const f = row[seq[step]];
        ctx.drawImage(src, (f % 3) * CHAR_W, Math.floor(f / 3) * CHAR_H, CHAR_W, CHAR_H, i * CHAR_W * 4, 0, CHAR_W * 4, CHAR_H * 4);
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sheet]);
  return (
    <div style={panel}>
      <div style={{ color: '#f8d858', marginBottom: 6 }}>{k}</div>
      <canvas ref={sheetRef} width={48} height={96} style={{ ...pixelated, width: 48 * 5, height: 96 * 5, background: '#2a2f55' }} />
      <div style={{ fontSize: 9, color: '#8890c8', margin: '6px 0 2px' }}>walk cycle: down / left / right / up</div>
      <canvas ref={walkRef} width={CHAR_W * 16} height={CHAR_H * 4} style={{ ...pixelated, width: CHAR_W * 16, height: CHAR_H * 4, background: '#2a2f55' }} />
    </div>
  );
}

function BattleSection() {
  const [mon, setMon] = useState('tsla');
  const [foe, setFoe] = useState('gme');
  return (
    <section>
      <h2>Battle backdrops (240x160 logical, x4 = 960x640) with platforms and sprites</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 11 }}>
        <label>ally <select value={mon} onChange={(e) => setMon(e.target.value)}>{SPECIES_LIST.map((s) => <option key={s.id} value={s.id}>{s.ticker}</option>)}</select></label>
        <label>foe <select value={foe} onChange={(e) => setFoe(e.target.value)}>{SPECIES_LIST.map((s) => <option key={s.id} value={s.id}>{s.ticker}</option>)}</select></label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: 12 }}>
        {ROUTE_THEMES.map((t) => <BattlePreview key={t} theme={t} mon={mon} foe={foe} />)}
      </div>
    </section>
  );
}

function BattlePreview({ theme, mon, foe }: { theme: RouteTheme; mon: string; foe: string }) {
  const ref = useCanvas((ctx) => {
    // same layout the battle scene uses (960x640 space), drawn at half size
    ctx.save();
    ctx.scale(0.5, 0.5);
    ctx.drawImage(drawBattleBg(theme), 0, 0);
    ctx.drawImage(drawPlatform('foe', theme), 700 - 130, 190 - 30);
    ctx.drawImage(drawPlatform('ally', theme), 260 - 160, 430 - 40);
    const foeCanvas = document.createElement('canvas'); foeCanvas.width = foeCanvas.height = 128;
    drawMon(foeCanvas.getContext('2d')!, foe, 'front', 128);
    ctx.drawImage(foeCanvas, 700 - 64, 190 - 118);
    const allyCanvas = document.createElement('canvas'); allyCanvas.width = allyCanvas.height = 128;
    drawMon(allyCanvas.getContext('2d')!, mon, 'back', 128);
    ctx.drawImage(allyCanvas, 260 - 80, 430 - 130, 160, 160);
    ctx.restore();
  }, [theme, mon, foe]);
  return (
    <div style={panel}>
      <div style={{ color: '#f8d858', marginBottom: 6 }}>bg_battle_{theme}</div>
      <canvas ref={ref} width={BG_W * 2} height={BG_H * 2} style={{ ...pixelated, width: '100%' }} />
    </div>
  );
}

function MapSection() {
  const [theme, setTheme] = useState<RouteTheme>('bluechip');
  const [seed, setSeed] = useState('aapl');
  const route = useMemo(() => buildRouteMap(theme, seed, { routeName: 'Test Route' }), [theme, seed]);
  const inside = useMemo(() => buildExchangeInterior(theme), [theme]);
  const vr = useMemo(() => validateMap(route), [route]);
  const vi = useMemo(() => validateMap(inside), [inside]);
  const rref = useCanvas((ctx) => { ctx.drawImage(drawMapPreview(route, 1), 0, 0); }, [route]);
  const iref = useCanvas((ctx) => { ctx.drawImage(drawMapPreview(inside, 1), 0, 0); }, [inside]);
  return (
    <section>
      <h2>Generated maps (48x36 route + 12x9 Exchange)</h2>
      <ThemeTabs value={theme} onChange={setTheme} />
      <label style={{ fontSize: 11 }}>seed <input value={seed} onChange={(e) => setSeed(e.target.value)} style={{ fontFamily: 'inherit' }} /></label>
      <p style={{ fontSize: 10, color: vr.ok && vi.ok ? '#58d858' : '#f85858' }}>
        route: {vr.ok ? 'PASS' : 'FAIL'} ({vr.stats.reachable}/{vr.stats.walkable} walkable reachable, tall-grass patches {vr.stats.tallPatches.join('/')}, {vr.stats.trainers} trainers, {vr.stats.wanderers} wanderers)
        &nbsp; interior: {vi.ok ? 'PASS' : 'FAIL'} {[...vr.errors, ...vi.errors].join('; ')}
      </p>
      <p style={{ fontSize: 9, color: '#8890c8' }}>markers: green spawn, magenta warp, cyan exit, red trainer, white NPC, gold teller</p>
      <canvas ref={rref} width={48 * 16} height={36 * 16} style={{ ...pixelated, width: 48 * 32, maxWidth: '100%' }} />
      <div style={{ height: 12 }} />
      <canvas ref={iref} width={12 * 16} height={9 * 16} style={{ ...pixelated, width: 12 * 48 }} />
    </section>
  );
}

export default function ArtGallery() {
  return (
    <main style={{ background: '#0c1230', color: '#f8f8d0', minHeight: '100vh', padding: 24, fontFamily: '"Press Start 2P", monospace', fontSize: 12 }}>
      <h1 style={{ color: '#f8d858', fontSize: 20 }}>POKESTONKS ART GALLERY</h1>
      <p style={{ color: '#8890c8', fontSize: 10, lineHeight: 1.8 }}>Everything below is generated in code (no image assets). Deterministic: reload and it is identical.</p>
      <SpeciesSection />
      <TilesetSection />
      <section>
        <h2>Characters (16x24, 3 frames x 4 directions)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {CHAR_KEYS.map((k) => <CharPreview key={k} k={k} />)}
        </div>
      </section>
      <BattleSection />
      <MapSection />
      <div style={{ height: 40 }} />
    </main>
  );
}
void renderMonGrid;
