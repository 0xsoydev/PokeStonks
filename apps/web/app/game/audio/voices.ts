/**
 * Chiptune voice helpers: pulse (12.5/25/50% via PeriodicWave), triangle, sine, saw, and noise.
 * Every voice is a fire-and-forget one-shot scheduled at absolute AudioContext time `t`.
 * Envelopes always start and end at gain 0 (no clicks) and nodes are disconnected on end.
 */
import { acquireVoice, getMetalNoiseBuffer, getNoiseBuffer, releaseVoice } from './engine';
import { midiToFreq } from './theory';

export type WaveKind = 'p125' | 'p25' | 'p50' | 'tri' | 'sine' | 'saw';

const DUTY: Record<'p125' | 'p25' | 'p50', number> = { p125: 0.125, p25: 0.25, p50: 0.5 };
/** Loudness compensation: thin pulses have far less energy than a 50% square at equal peak. */
const WAVE_LEVEL: Record<WaveKind, number> = { p125: 1.0, p25: 0.85, p50: 0.65, tri: 1.0, sine: 1.0, saw: 0.55 };

const waveCache = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();

/** Band-limited pulse wave with the given duty cycle (0..1). Cached per context. */
export function getPulseWave(ctx: BaseAudioContext, duty: number): PeriodicWave {
  let m = waveCache.get(ctx);
  if (!m) { m = new Map(); waveCache.set(ctx, m); }
  const key = duty.toFixed(3);
  const hit = m.get(key);
  if (hit) return hit;
  const N = 40;
  const real = new Float32Array(N + 1);
  const imag = new Float32Array(N + 1);
  for (let n = 1; n <= N; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  const w = ctx.createPeriodicWave(real, imag);
  m.set(key, w);
  return w;
}

export interface ToneOpts {
  wave: WaveKind;
  /** start frequency in Hz (or use midi) */
  freq?: number;
  midi?: number;
  /** absolute AudioContext start time */
  t: number;
  /** held length in seconds (release comes after) */
  dur: number;
  /** peak gain, clamped to 0.25 */
  gain?: number;
  /** attack seconds (min 3ms) */
  a?: number;
  /** decay seconds to sustain level */
  d?: number;
  /** sustain level as a fraction of peak (default 1 = no decay) */
  s?: number;
  /** release seconds after dur (min 4ms) */
  r?: number;
  /** slide target Hz reached at t+slideTime (exponential) */
  slideTo?: number;
  slideTime?: number;
  /** discrete chip arpeggio: cycle through these Hz values every `arpStep` seconds (overrides slide) */
  arp?: number[];
  arpStep?: number;
  /** vibrato depth in cents, rate in Hz, delay seconds before it fades in */
  vibCents?: number;
  vibRate?: number;
  vibDelay?: number;
  detune?: number;
  /** if false this voice does not count against the sfx polyphony cap (music voices) */
  counted?: boolean;
}

/** Schedule one pitched note. Returns false if it was skipped (polyphony cap / bad args). */
export function tone(ctx: AudioContext, dest: AudioNode, o: ToneOpts): boolean {
  const counted = o.counted !== false;
  if (counted && !acquireVoice()) return false;
  try {
    const f0 = o.freq ?? (o.midi !== undefined ? midiToFreq(o.midi) : 440);
    const t = Math.max(o.t, ctx.currentTime);
    const dur = Math.max(0.01, o.dur);
    const peak = Math.min(0.25, o.gain ?? 0.15) * WAVE_LEVEL[o.wave];
    const a = Math.max(0.003, o.a ?? 0.004);
    const r = Math.max(0.004, o.r ?? 0.03);
    const end = t + dur + r;

    const osc = ctx.createOscillator();
    if (o.wave === 'p125' || o.wave === 'p25' || o.wave === 'p50') osc.setPeriodicWave(getPulseWave(ctx, DUTY[o.wave]));
    else osc.type = o.wave === 'tri' ? 'triangle' : o.wave === 'saw' ? 'sawtooth' : 'sine';

    osc.frequency.setValueAtTime(f0, t);
    if (o.arp && o.arp.length > 0) {
      const step = Math.max(0.008, o.arpStep ?? 0.03);
      let i = 0;
      for (let tt = t; tt < t + dur; tt += step, i++) osc.frequency.setValueAtTime(o.arp[i % o.arp.length], tt);
    } else if (o.slideTo !== undefined && o.slideTo > 0) {
      const st = Math.max(0.005, o.slideTime ?? dur);
      osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + st);
    }
    if (o.detune) osc.detune.setValueAtTime(o.detune, t);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(a, dur));
    const sus = o.s === undefined ? 1 : Math.max(0, Math.min(1, o.s));
    let level = peak;
    if (sus < 1 && dur > a) {
      const d = Math.max(0.005, o.d ?? 0.1);
      level = peak * sus;
      g.gain.linearRampToValueAtTime(level, t + Math.min(a + d, dur));
    }
    // hold, then release to exactly 0 at `end` (level matches the ramp above, so no jump)
    g.gain.setValueAtTime(level, t + dur);
    g.gain.linearRampToValueAtTime(0, end);

    osc.connect(g);
    g.connect(dest);

    let lfo: OscillatorNode | null = null;
    let lfoGain: GainNode | null = null;
    if (o.vibCents && o.vibCents > 0 && dur > 0.12) {
      lfo = ctx.createOscillator();
      lfoGain = ctx.createGain();
      lfo.frequency.value = o.vibRate ?? 5.5;
      const delay = Math.min(o.vibDelay ?? 0.08, dur * 0.6);
      lfoGain.gain.setValueAtTime(0, t);
      lfoGain.gain.setValueAtTime(0, t + delay);
      lfoGain.gain.linearRampToValueAtTime(o.vibCents, t + delay + 0.12);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.detune);
      lfo.start(t);
      lfo.stop(end + 0.02);
    }

    osc.start(t);
    osc.stop(end + 0.02);
    osc.onended = () => {
      try { osc.disconnect(); g.disconnect(); lfo?.disconnect(); lfoGain?.disconnect(); } catch { /* ignore */ }
      if (counted) releaseVoice();
    };
    return true;
  } catch {
    if (counted) releaseVoice();
    return false;
  }
}

export interface NoiseOpts {
  t: number;
  dur: number;
  gain?: number;
  a?: number;
  r?: number;
  /** decay shape: gain ramps to `s * peak` by end of dur (default 0 = pure decay hit) */
  s?: number;
  filter?: 'lowpass' | 'highpass' | 'bandpass';
  cutoff?: number;
  /** filter cutoff sweep target (exponential over dur) */
  cutoffTo?: number;
  q?: number;
  /** pitched short-loop "metallic" noise at this base frequency in Hz (NES LFSR short mode) */
  metalFreq?: number;
  /** playback rate of white noise (higher = brighter/faster), default 1 */
  rate?: number;
  counted?: boolean;
}

/** Schedule one filtered noise burst. */
export function noise(ctx: AudioContext, dest: AudioNode, o: NoiseOpts): boolean {
  const counted = o.counted !== false;
  if (counted && !acquireVoice()) return false;
  try {
    const t = Math.max(o.t, ctx.currentTime);
    const dur = Math.max(0.01, o.dur);
    const peak = Math.min(0.25, o.gain ?? 0.15);
    const a = Math.max(0.002, o.a ?? 0.002);
    const r = Math.max(0.006, o.r ?? 0.02);
    const end = t + dur + r;
    const src = ctx.createBufferSource();
    if (o.metalFreq) {
      src.buffer = getMetalNoiseBuffer(ctx);
      src.playbackRate.value = (o.metalFreq * src.buffer.length) / ctx.sampleRate;
    } else {
      src.buffer = getNoiseBuffer(ctx);
      src.playbackRate.value = o.rate ?? 1;
    }
    src.loop = true;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(a, dur));
    const sus = Math.max(0, Math.min(1, o.s ?? 0));
    // exponential-ish decay: to sus*peak (never exactly 0 for expo), then release to 0
    g.gain.exponentialRampToValueAtTime(Math.max(0.0005, peak * Math.max(sus, 0.02)), t + dur);
    g.gain.linearRampToValueAtTime(0, end);

    let filt: BiquadFilterNode | null = null;
    if (o.filter) {
      filt = ctx.createBiquadFilter();
      filt.type = o.filter;
      const c0 = o.cutoff ?? 2000;
      filt.frequency.setValueAtTime(c0, t);
      if (o.cutoffTo && o.cutoffTo > 0) filt.frequency.exponentialRampToValueAtTime(o.cutoffTo, t + dur);
      filt.Q.value = o.q ?? 0.8;
      src.connect(filt);
      filt.connect(g);
    } else {
      src.connect(g);
    }
    g.connect(dest);
    // random offset: identical bursts don't sound machine-gun identical
    src.start(t, o.metalFreq ? 0 : Math.random() * 0.5);
    src.stop(end + 0.02);
    src.onended = () => {
      try { src.disconnect(); filt?.disconnect(); g.disconnect(); } catch { /* ignore */ }
      if (counted) releaseVoice();
    };
    return true;
  } catch {
    if (counted) releaseVoice();
    return false;
  }
}

/** Quick arpeggio of separate notes: schedules each MIDI note `step` seconds apart. */
export function arpeggioNotes(
  ctx: AudioContext, dest: AudioNode, midis: number[], t: number, step: number,
  base: Omit<ToneOpts, 't' | 'midi' | 'freq'>,
): void {
  for (let i = 0; i < midis.length; i++) {
    tone(ctx, dest, { ...base, midi: midis[i], t: t + i * step });
  }
}

/* ---------------- drum voices (used by music and sfx) ---------------- */

export function kick(ctx: AudioContext, dest: AudioNode, t: number, vel = 1, counted = true): void {
  tone(ctx, dest, { wave: 'sine', freq: 150, slideTo: 42, slideTime: 0.11, t, dur: 0.12, r: 0.04, a: 0.003, gain: 0.24 * vel, counted });
  noise(ctx, dest, { t, dur: 0.012, r: 0.01, gain: 0.05 * vel, filter: 'lowpass', cutoff: 1800, counted });
}

export function snare(ctx: AudioContext, dest: AudioNode, t: number, vel = 1, counted = true): void {
  noise(ctx, dest, { t, dur: 0.11, r: 0.05, gain: 0.13 * vel, filter: 'highpass', cutoff: 1500, q: 0.5, counted });
  tone(ctx, dest, { wave: 'tri', freq: 230, slideTo: 150, slideTime: 0.07, t, dur: 0.06, r: 0.03, gain: 0.11 * vel, counted });
}

export function hat(ctx: AudioContext, dest: AudioNode, t: number, vel = 1, open = false, counted = true): void {
  noise(ctx, dest, {
    t, dur: open ? 0.13 : 0.03, r: open ? 0.06 : 0.015, gain: (open ? 0.05 : 0.04) * vel,
    filter: 'highpass', cutoff: 7500, q: 0.7, metalFreq: 6000, counted,
  });
}

export function tom(ctx: AudioContext, dest: AudioNode, t: number, vel = 1, counted = true): void {
  tone(ctx, dest, { wave: 'tri', freq: 190, slideTo: 95, slideTime: 0.14, t, dur: 0.14, r: 0.05, gain: 0.2 * vel, counted });
}

export function crash(ctx: AudioContext, dest: AudioNode, t: number, vel = 1, counted = true): void {
  noise(ctx, dest, { t, dur: 0.6, r: 0.2, gain: 0.08 * vel, filter: 'highpass', cutoff: 4500, q: 0.6, counted });
}
