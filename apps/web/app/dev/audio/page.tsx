'use client';

/**
 * /dev/audio - audition page for the synthesised audio engine.
 * Big "Unlock audio" button, one button per SFX and per track, mute + volume sliders,
 * low-HP toggle, rate/volume scaling for SFX and a live now-playing indicator.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { audio, getAudioState, getNowPlaying, getVolume, isLowHp, type BgmName, type SfxName } from '../../game/audio';
import { SFX_NAMES } from '../../game/audio/sfx';
import { BGM_NAMES, getTrack } from '../../game/audio/tracks';

const SFX_GROUPS: Array<{ title: string; names: SfxName[] }> = [
  { title: 'Menu / UI', names: ['menu_move', 'menu_select', 'menu_back', 'error', 'claim'] },
  { title: 'Timing minigame', names: ['tap_tick', 'tap_perfect', 'tap_good', 'tap_miss'] },
  { title: 'Combat', names: ['hit', 'hit_super', 'hit_resist', 'crit', 'miss', 'stat_up', 'stat_down', 'faint', 'levelup'] },
  { title: 'World', names: ['encounter', 'step_grass', 'bump', 'door', 'heal', 'dialog_blip'] },
  { title: 'Jingles', names: ['win', 'lose'] },
];

const TRACK_BLURB: Record<BgmName, string> = {
  title: 'D minor to F major, anticipatory build',
  overworld: 'C major, cheerful adventure hook',
  battle: 'A minor, driving syncopation',
  victory: 'G major fanfare, plays once',
  defeat: 'E minor, melancholic, plays once',
};

const box: React.CSSProperties = { border: '1px solid #2c3a55', borderRadius: 10, padding: 16, marginBottom: 16, background: '#111a2b' };
const btn: React.CSSProperties = {
  background: '#1c2b48', color: '#e8eefc', border: '1px solid #35507f', borderRadius: 8,
  padding: '8px 12px', margin: '0 8px 8px 0', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit',
};

export default function AudioDevPage() {
  const [, force] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [engineState, setEngineState] = useState<'unavailable' | 'locked' | 'running'>('locked');
  const [playing, setPlaying] = useState<BgmName | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [rate, setRate] = useState(1);
  const [sfxVol, setSfxVol] = useState(1);
  const [fadeMs, setFadeMs] = useState(400);
  const [oneShotLoop, setOneShotLoop] = useState(false);
  const [lastSfx, setLastSfx] = useState<SfxName | null>(null);
  const startedAt = useRef<number>(0);
  const seqTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    setMounted(true);
    const sync = () => {
      const np = getNowPlaying();
      setPlaying((prev) => {
        if (prev !== np) startedAt.current = performance.now();
        return np;
      });
      setEngineState(getAudioState());
      force((n) => n + 1);
    };
    sync();
    const off = audio.onChange(sync);
    const poll = setInterval(() => {
      setEngineState(getAudioState());
      setElapsed(startedAt.current ? (performance.now() - startedAt.current) / 1000 : 0);
    }, 200);
    return () => { off(); clearInterval(poll); seqTimers.current.forEach(clearTimeout); };
  }, []);

  const unlock = useCallback(async () => {
    await audio.unlock();
    setEngineState(getAudioState());
  }, []);

  const playSfx = useCallback((n: SfxName) => {
    void audio.unlock();
    audio.sfx(n, { rate, volume: sfxVol });
    setLastSfx(n);
  }, [rate, sfxVol]);

  const playTrack = useCallback((n: BgmName) => {
    void audio.unlock();
    const oneShot = n === 'victory' || n === 'defeat';
    audio.bgm(n, { fadeMs, loop: oneShot ? oneShotLoop : true });
  }, [fadeMs, oneShotLoop]);

  const playAll = useCallback(() => {
    void audio.unlock();
    seqTimers.current.forEach(clearTimeout);
    seqTimers.current = SFX_NAMES.map((n, i) => setTimeout(() => { audio.sfx(n, { rate, volume: sfxVol }); setLastSfx(n); }, i * 1400));
  }, [rate, sfxVol]);

  // persisted volumes/mute come from localStorage, so render the real UI only after mount (no hydration mismatch)
  if (!mounted) return <main style={{ padding: 24, color: '#8fa3c7', background: '#0b1220', minHeight: '100vh' }}>Loading audio lab...</main>;

  const muted = audio.isMuted();
  const running = engineState === 'running';

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 24, color: '#e8eefc', background: '#0b1220', minHeight: '100vh', fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}>
      <h1 style={{ margin: '0 0 4px' }}>PokeStonks audio lab</h1>
      <p style={{ margin: '0 0 16px', color: '#8fa3c7' }}>Everything here is synthesised live with the Web Audio API. No samples, no network.</p>

      <div style={box}>
        <button
          onClick={unlock}
          style={{ ...btn, fontSize: 22, padding: '18px 28px', background: running ? '#1d4d2f' : '#5a2d0c', borderColor: running ? '#3f9a62' : '#d98a3d' }}
        >
          {running ? 'Audio unlocked (click to re-check)' : 'Unlock audio'}
        </button>
        <span style={{ marginLeft: 8 }}>context: <b>{engineState}</b></span>
        {engineState === 'unavailable' && <p style={{ color: '#ff8a8a' }}>Web Audio is not available in this browser. The game will run silently.</p>}
      </div>

      <div style={box}>
        <h2 style={{ marginTop: 0 }}>Now playing</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 14, height: 14, borderRadius: 7, background: playing ? '#5cf28d' : '#3a4560', boxShadow: playing ? '0 0 10px #5cf28d' : 'none' }} />
          <b style={{ fontSize: 18 }}>{playing ?? 'silence'}</b>
          {playing && <span style={{ color: '#8fa3c7' }}>{elapsed.toFixed(1)}s / loop {getTrack(playing).loopSeconds.toFixed(1)}s @ {getTrack(playing).bpm} bpm</span>}
          <span style={{ marginLeft: 'auto', color: '#8fa3c7' }}>last sfx: {lastSfx ?? '-'}</span>
        </div>
      </div>

      <div style={box}>
        <h2 style={{ marginTop: 0 }}>Mixer</h2>
        <label style={{ display: 'block', marginBottom: 8 }}>
          <input type="checkbox" checked={muted} onChange={(e) => audio.setMuted(e.target.checked)} /> Muted
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          Music volume {getVolume('music').toFixed(2)}{' '}
          <input type="range" min={0} max={1} step={0.01} value={getVolume('music')} onChange={(e) => audio.setVolume('music', parseFloat(e.target.value))} />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          SFX volume {getVolume('sfx').toFixed(2)}{' '}
          <input type="range" min={0} max={1} step={0.01} value={getVolume('sfx')} onChange={(e) => audio.setVolume('sfx', parseFloat(e.target.value))} />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          SFX rate {rate.toFixed(2)}x{' '}
          <input type="range" min={0.5} max={2} step={0.05} value={rate} onChange={(e) => setRate(parseFloat(e.target.value))} />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          SFX per-call volume {sfxVol.toFixed(2)}{' '}
          <input type="range" min={0} max={1.5} step={0.05} value={sfxVol} onChange={(e) => setSfxVol(parseFloat(e.target.value))} />
        </label>
        <button style={btn} onClick={() => { audio.lowHp(!isLowHp()); force((n) => n + 1); }}>
          Low-HP warning: {isLowHp() ? 'ON (click to stop)' : 'off (click to start)'}
        </button>
      </div>

      <div style={box}>
        <h2 style={{ marginTop: 0 }}>Music</h2>
        <div style={{ marginBottom: 10, color: '#8fa3c7' }}>
          <label>Crossfade ms{' '}
            <input type="number" min={0} max={3000} step={50} value={fadeMs} onChange={(e) => setFadeMs(Math.max(0, parseInt(e.target.value || '0', 10)))} style={{ width: 70 }} />
          </label>{' '}
          <label><input type="checkbox" checked={oneShotLoop} onChange={(e) => setOneShotLoop(e.target.checked)} /> loop victory/defeat</label>
        </div>
        {BGM_NAMES.map((n) => (
          <div key={n} style={{ marginBottom: 6 }}>
            <button style={{ ...btn, minWidth: 120, background: playing === n ? '#1d4d2f' : btn.background }} onClick={() => playTrack(n)}>
              {playing === n ? '▶ ' : ''}{n}
            </button>
            <span style={{ color: '#8fa3c7' }}>{TRACK_BLURB[n]} ({getTrack(n).bpm} bpm, {getTrack(n).loopSeconds.toFixed(1)}s)</span>
          </div>
        ))}
        <button style={{ ...btn, marginTop: 8 }} onClick={() => audio.bgm(null, { fadeMs })}>Stop music (fade)</button>
      </div>

      <div style={box}>
        <h2 style={{ marginTop: 0 }}>Sound effects ({SFX_NAMES.length})</h2>
        <button style={{ ...btn, background: '#3a2a55' }} onClick={playAll}>Play all in sequence</button>
        <button style={btn} onClick={() => { seqTimers.current.forEach(clearTimeout); seqTimers.current = []; }}>Cancel sequence</button>
        {SFX_GROUPS.map((g) => (
          <div key={g.title} style={{ marginTop: 12 }}>
            <div style={{ color: '#8fa3c7', marginBottom: 6 }}>{g.title}</div>
            {g.names.map((n) => (
              <button key={n} style={btn} onClick={() => playSfx(n)}>{n}</button>
            ))}
          </div>
        ))}
        <div style={{ marginTop: 12 }}>
          <div style={{ color: '#8fa3c7', marginBottom: 6 }}>Stress tests</div>
          <button style={btn} onClick={() => { void audio.unlock(); for (let i = 0; i < 20; i++) setTimeout(() => audio.sfx('dialog_blip', { volume: sfxVol }), i * 30); }}>dialog_blip x20 @ 30ms</button>
          <button style={btn} onClick={() => { void audio.unlock(); for (let i = 0; i < 12; i++) setTimeout(() => audio.sfx('tap_tick', { rate: 1 + i * 0.06, volume: sfxVol }), i * 60); }}>tap_tick sweep x12</button>
          <button style={btn} onClick={() => { void audio.unlock(); for (let i = 0; i < 6; i++) setTimeout(() => audio.sfx('step_grass', { volume: sfxVol }), i * 260); }}>step_grass x6</button>
          <button style={btn} onClick={() => { void audio.unlock(); (['hit', 'hit_super', 'crit', 'hit', 'faint'] as SfxName[]).forEach((n, i) => setTimeout(() => audio.sfx(n, { volume: sfxVol }), i * 180)); }}>combat burst</button>
        </div>
      </div>
    </main>
  );
}
