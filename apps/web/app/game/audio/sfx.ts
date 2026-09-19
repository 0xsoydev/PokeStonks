/**
 * The 26 hand-crafted synthesised sound effects. Each definition schedules a handful of voices
 * relative to `env.t`. `rate` scales pitch and speed together; `vol` scales every voice gain.
 * Individual voice gains stay <= 0.25 (tone()/noise() clamp) and the master compressor glues layers.
 */
import type { SfxName } from './index';
import { crash, kick, noise, tone, type NoiseOpts, type ToneOpts } from './voices';
import { midiToFreq } from './theory';

export interface SfxEnv {
  ctx: AudioContext;
  dest: AudioNode;
  /** absolute start time */
  t: number;
  rate: number;
  vol: number;
}

export interface SfxDef {
  play: (e: SfxEnv) => void;
  /** minimum seconds between two plays of this same effect (rate limit) */
  minInterval: number;
}

/** Pitched voice at relative time `at` (seconds, pre-rate). */
function tn(e: SfxEnv, at: number, o: Omit<ToneOpts, 't'>): void {
  const r = e.rate;
  const f = o.freq ?? (o.midi !== undefined ? midiToFreq(o.midi) : 440);
  tone(e.ctx, e.dest, {
    ...o,
    midi: undefined,
    freq: f * r,
    slideTo: o.slideTo ? o.slideTo * r : undefined,
    slideTime: o.slideTime ? o.slideTime / r : undefined,
    arp: o.arp?.map((x) => x * r),
    arpStep: o.arpStep ? o.arpStep / r : undefined,
    dur: o.dur / r,
    a: o.a ? o.a / r : undefined,
    d: o.d ? o.d / r : undefined,
    r: o.r ? o.r / r : undefined,
    vibRate: o.vibRate ? o.vibRate * r : undefined,
    t: e.t + at / r,
    gain: (o.gain ?? 0.15) * e.vol,
  });
}

/** Noise voice at relative time `at`. */
function nz(e: SfxEnv, at: number, o: Omit<NoiseOpts, 't'>): void {
  const r = e.rate;
  noise(e.ctx, e.dest, {
    ...o,
    cutoff: o.cutoff ? o.cutoff * r : undefined,
    cutoffTo: o.cutoffTo ? o.cutoffTo * r : undefined,
    dur: o.dur / r,
    a: o.a ? o.a / r : undefined,
    r: o.r ? o.r / r : undefined,
    t: e.t + at / r,
    gain: (o.gain ?? 0.15) * e.vol,
  });
}

/** Punchy impact used by hit / crit: noise crack + low thump. `size` scales weight. */
function impact(e: SfxEnv, at: number, size: number): void {
  tn(e, at, { wave: 'sine', freq: 170 * size, slideTo: 45, slideTime: 0.11, dur: 0.11, r: 0.05, gain: 0.24 });
  nz(e, at, { dur: 0.09, r: 0.04, gain: 0.17, filter: 'bandpass', cutoff: 2200, cutoffTo: 700, q: 0.7 });
  tn(e, at, { wave: 'tri', freq: 320, slideTo: 110, slideTime: 0.05, dur: 0.05, r: 0.02, gain: 0.1 });
}

const M = (n: number) => n; // readability: MIDI numbers below

export const SFX: Record<SfxName, SfxDef> = {
  /* ------------- UI ------------- */
  menu_move: {
    minInterval: 0.035,
    play: (e) => {
      tn(e, 0, { wave: 'p25', freq: 1320, slideTo: 1480, slideTime: 0.03, dur: 0.028, r: 0.02, gain: 0.09 });
    },
  },
  menu_select: {
    minInterval: 0.06,
    play: (e) => {
      tn(e, 0, { wave: 'p25', midi: M(76), dur: 0.05, r: 0.015, gain: 0.12 });
      tn(e, 0.06, { wave: 'p25', midi: M(83), dur: 0.09, s: 0.35, d: 0.1, r: 0.06, gain: 0.13 });
      tn(e, 0.06, { wave: 'tri', midi: M(71), dur: 0.09, r: 0.05, gain: 0.1 });
    },
  },
  menu_back: {
    minInterval: 0.06,
    play: (e) => {
      tn(e, 0, { wave: 'p25', midi: M(76), dur: 0.05, r: 0.015, gain: 0.11 });
      tn(e, 0.055, { wave: 'p25', midi: M(67), slideTo: midiToFreq(64), slideTime: 0.09, dur: 0.09, s: 0.4, d: 0.09, r: 0.05, gain: 0.11 });
    },
  },

  /* ------------- timing minigame ------------- */
  tap_tick: {
    minInterval: 0.025,
    play: (e) => {
      // very short and quiet so it can repeat while the needle sweeps
      tn(e, 0, { wave: 'tri', freq: 1760, dur: 0.008, r: 0.012, gain: 0.07 });
    },
  },
  tap_perfect: {
    minInterval: 0.08,
    play: (e) => {
      const notes = [84, 88, 91, 96, 100];
      notes.forEach((n, i) => {
        const last = i === notes.length - 1;
        tn(e, i * 0.04, { wave: 'p25', midi: n, dur: last ? 0.14 : 0.035, s: last ? 0.3 : 1, d: 0.14, r: last ? 0.16 : 0.02, gain: 0.1 });
      });
      // shimmer: detuned sine an octave above the top note
      tn(e, 0.16, { wave: 'sine', midi: 112, dur: 0.16, r: 0.2, gain: 0.06, detune: 9 });
      tn(e, 0.16, { wave: 'sine', midi: 112, dur: 0.16, r: 0.2, gain: 0.06, detune: -9 });
    },
  },
  tap_good: {
    minInterval: 0.08,
    play: (e) => {
      tn(e, 0, { wave: 'p25', midi: 81, slideTo: midiToFreq(81) * 1.03, slideTime: 0.08, dur: 0.08, s: 0.5, d: 0.08, r: 0.06, gain: 0.12 });
      tn(e, 0, { wave: 'tri', midi: 69, dur: 0.08, r: 0.05, gain: 0.1 });
    },
  },
  tap_miss: {
    minInterval: 0.1,
    play: (e) => {
      tn(e, 0, { wave: 'saw', freq: 230, slideTo: 85, slideTime: 0.24, dur: 0.24, r: 0.06, gain: 0.16, s: 0.7, d: 0.24 });
      tn(e, 0, { wave: 'p50', freq: 115, slideTo: 60, slideTime: 0.24, dur: 0.24, r: 0.06, gain: 0.1 });
      nz(e, 0, { dur: 0.16, r: 0.05, gain: 0.05, filter: 'lowpass', cutoff: 600 });
    },
  },

  /* ------------- combat ------------- */
  hit: {
    minInterval: 0.05,
    play: (e) => impact(e, 0, 1),
  },
  hit_super: {
    minInterval: 0.08,
    play: (e) => {
      tn(e, 0, { wave: 'sine', freq: 220, slideTo: 38, slideTime: 0.2, dur: 0.2, r: 0.08, gain: 0.25 });
      nz(e, 0, { dur: 0.2, r: 0.08, gain: 0.17, filter: 'highpass', cutoff: 900, q: 0.6 });
      tn(e, 0, { wave: 'saw', freq: 300, slideTo: 90, slideTime: 0.08, dur: 0.08, r: 0.03, gain: 0.12 });
      // rising ping = "it's super effective"
      tn(e, 0.05, { wave: 'p25', midi: 88, slideTo: midiToFreq(100), slideTime: 0.12, dur: 0.16, s: 0.4, d: 0.16, r: 0.12, gain: 0.1 });
      tn(e, 0.12, { wave: 'p125', midi: 95, dur: 0.14, s: 0.3, d: 0.14, r: 0.16, gain: 0.09 });
      nz(e, 0.02, { dur: 0.26, r: 0.1, gain: 0.05, filter: 'highpass', cutoff: 5000 });
    },
  },
  hit_resist: {
    minInterval: 0.06,
    play: (e) => {
      nz(e, 0, { dur: 0.09, r: 0.04, gain: 0.13, filter: 'lowpass', cutoff: 520, q: 0.5 });
      tn(e, 0, { wave: 'sine', freq: 115, slideTo: 60, slideTime: 0.1, dur: 0.1, r: 0.05, gain: 0.15 });
      tn(e, 0.02, { wave: 'p50', midi: 55, slideTo: midiToFreq(52), slideTime: 0.07, dur: 0.07, r: 0.04, gain: 0.05 });
    },
  },
  crit: {
    minInterval: 0.1,
    play: (e) => {
      impact(e, 0, 1.15);
      // sharp star chime layered on top
      const chime = [93, 100, 105];
      chime.forEach((n, i) => {
        const last = i === chime.length - 1;
        tn(e, 0.03 + i * 0.055, { wave: 'p125', midi: n, dur: last ? 0.12 : 0.045, s: last ? 0.3 : 1, d: 0.12, r: last ? 0.2 : 0.02, gain: 0.1 });
        tn(e, 0.03 + i * 0.055, { wave: 'sine', midi: n + 12, dur: last ? 0.12 : 0.045, r: last ? 0.2 : 0.02, gain: 0.05, detune: 6 });
      });
      nz(e, 0.03, { dur: 0.22, r: 0.1, gain: 0.04, filter: 'highpass', cutoff: 7000 });
    },
  },
  miss: {
    minInterval: 0.08,
    play: (e) => {
      nz(e, 0, { dur: 0.22, r: 0.08, a: 0.09, gain: 0.13, filter: 'bandpass', cutoff: 700, cutoffTo: 3200, q: 1.6, s: 0.5 });
    },
  },
  stat_up: {
    minInterval: 0.1,
    play: (e) => {
      [72, 76, 79, 84].forEach((n, i) => {
        tn(e, i * 0.055, { wave: 'p25', midi: n, dur: i === 3 ? 0.14 : 0.045, s: i === 3 ? 0.4 : 1, d: 0.14, r: i === 3 ? 0.1 : 0.015, gain: 0.11 });
      });
      tn(e, 0.165, { wave: 'sine', midi: 96, dur: 0.1, r: 0.14, gain: 0.06 });
    },
  },
  stat_down: {
    minInterval: 0.1,
    play: (e) => {
      [76, 71, 66, 60].forEach((n, i) => {
        const last = i === 3;
        tn(e, i * 0.06, {
          wave: 'p50', midi: n, dur: last ? 0.16 : 0.05, r: last ? 0.1 : 0.015, gain: 0.11,
          slideTo: last ? midiToFreq(54) : undefined, slideTime: 0.16,
        });
      });
      tn(e, 0.18, { wave: 'tri', midi: 48, slideTo: midiToFreq(42), slideTime: 0.16, dur: 0.16, r: 0.1, gain: 0.12 });
    },
  },
  faint: {
    minInterval: 0.3,
    play: (e) => {
      tn(e, 0, { wave: 'p50', freq: 520, slideTo: 55, slideTime: 0.95, dur: 0.95, r: 0.2, gain: 0.16, s: 0.35, d: 0.9, vibCents: 30, vibRate: 7, vibDelay: 0.1 });
      tn(e, 0, { wave: 'tri', freq: 260, slideTo: 38, slideTime: 0.95, dur: 0.95, r: 0.2, gain: 0.14, s: 0.4, d: 0.9 });
      nz(e, 0, { dur: 0.5, r: 0.2, gain: 0.04, filter: 'lowpass', cutoff: 900, cutoffTo: 200 });
    },
  },
  levelup: {
    minInterval: 0.3,
    play: (e) => {
      [72, 76, 79].forEach((n, i) => tn(e, i * 0.075, { wave: 'p25', midi: n, dur: 0.06, r: 0.02, gain: 0.12 }));
      tn(e, 0.24, { wave: 'p25', midi: 84, dur: 0.34, s: 0.6, d: 0.3, r: 0.18, gain: 0.13, vibCents: 18, vibDelay: 0.12 });
      tn(e, 0.24, { wave: 'p50', midi: 76, dur: 0.34, s: 0.6, d: 0.3, r: 0.18, gain: 0.09 });
      tn(e, 0.24, { wave: 'tri', midi: 48, dur: 0.38, r: 0.15, gain: 0.16 });
      tn(e, 0.42, { wave: 'p125', midi: 91, dur: 0.14, s: 0.3, d: 0.14, r: 0.2, gain: 0.08 });
    },
  },
  encounter: {
    minInterval: 0.5,
    play: (e) => {
      // three rising alarm stabs (0, .3, .6s) then a heavy low hit at .9s
      const starts = [300, 400, 520];
      const ends = [700, 950, 1250];
      for (let i = 0; i < 3; i++) {
        const at = i * 0.3;
        tn(e, at, { wave: 'p25', freq: starts[i], slideTo: ends[i], slideTime: 0.24, dur: 0.24, s: 0.5, d: 0.24, r: 0.05, gain: 0.15 });
        tn(e, at, { wave: 'saw', freq: starts[i] / 2, slideTo: ends[i] / 2, slideTime: 0.24, dur: 0.24, s: 0.5, d: 0.24, r: 0.05, gain: 0.13, detune: 12 });
        nz(e, at, { dur: 0.05, r: 0.02, gain: 0.08, filter: 'highpass', cutoff: 3000 });
      }
      tn(e, 0.9, { wave: 'sine', freq: 130, slideTo: 40, slideTime: 0.16, dur: 0.16, r: 0.1, gain: 0.25 });
      tn(e, 0.9, { wave: 'saw', freq: 220, slideTo: 110, slideTime: 0.14, dur: 0.14, r: 0.06, gain: 0.14 });
      nz(e, 0.9, { dur: 0.2, r: 0.1, gain: 0.14, filter: 'lowpass', cutoff: 3000, cutoffTo: 500 });
    },
  },

  /* ------------- world ------------- */
  step_grass: {
    minInterval: 0.09,
    play: (e) => {
      const j = 0.8 + Math.random() * 0.5;
      nz(e, 0, { dur: 0.05, r: 0.03, a: 0.01, gain: 0.05, filter: 'bandpass', cutoff: 3200 * j, q: 0.6, rate: 1.2 });
      nz(e, 0.045, { dur: 0.03, r: 0.02, a: 0.006, gain: 0.03, filter: 'bandpass', cutoff: 4400 * j, q: 0.7, rate: 1.5 });
    },
  },
  heal: {
    minInterval: 0.3,
    play: (e) => {
      [72, 76, 79, 84, 88, 91].forEach((n, i) => {
        const last = i === 5;
        tn(e, i * 0.075, { wave: 'sine', midi: n, dur: 0.06, s: 0.4, d: 0.1, r: last ? 0.35 : 0.2, gain: 0.1 });
        tn(e, i * 0.075, { wave: 'tri', midi: n + 12, dur: 0.04, r: 0.15, gain: 0.04 });
      });
      tn(e, 0.45, { wave: 'p50', midi: 79, dur: 0.2, s: 0.3, d: 0.2, r: 0.3, gain: 0.05 });
    },
  },
  win: {
    minInterval: 0.5,
    play: (e) => {
      const lead: Array<[number, number, number]> = [[76, 0, 0.07], [76, 0.1, 0.07], [79, 0.2, 0.07], [81, 0.3, 0.07], [83, 0.4, 0.34], [79, 0.78, 0.08], [83, 0.9, 0.5]];
      for (const [n, at, d] of lead) tn(e, at, { wave: 'p25', midi: n, dur: d, s: d > 0.2 ? 0.6 : 1, d: 0.3, r: 0.04, gain: 0.12, vibCents: d > 0.3 ? 16 : 0, vibDelay: 0.15 });
      const harm: Array<[number, number, number]> = [[64, 0, 0.07], [64, 0.1, 0.07], [67, 0.2, 0.07], [69, 0.3, 0.07], [71, 0.4, 0.34], [67, 0.78, 0.08], [71, 0.9, 0.5]];
      for (const [n, at, d] of harm) tn(e, at, { wave: 'p50', midi: n, dur: d, r: 0.04, gain: 0.08 });
      const bass: Array<[number, number, number]> = [[52, 0, 0.2], [57, 0.2, 0.2], [59, 0.4, 0.34], [55, 0.78, 0.1], [47, 0.9, 0.55]];
      for (const [n, at, d] of bass) tn(e, at, { wave: 'tri', midi: n, dur: d, r: 0.05, gain: 0.16 });
      kick(e.ctx, e.dest, e.t, 0.8 * e.vol);
      kick(e.ctx, e.dest, e.t + 0.4 / e.rate, 0.8 * e.vol);
      crash(e.ctx, e.dest, e.t + 0.9 / e.rate, 0.6 * e.vol);
    },
  },
  lose: {
    minInterval: 0.5,
    play: (e) => {
      [[72, 0, 0.22], [71, 0.25, 0.22], [69, 0.5, 0.22]].forEach(([n, at, d]) =>
        tn(e, at, { wave: 'p50', midi: n, dur: d, s: 0.6, d: 0.2, r: 0.05, gain: 0.12 }));
      tn(e, 0.75, { wave: 'p50', midi: 64, slideTo: midiToFreq(62), slideTime: 0.6, dur: 0.6, s: 0.5, d: 0.5, r: 0.25, gain: 0.12, vibCents: 22, vibDelay: 0.15 });
      tn(e, 0, { wave: 'tri', midi: 45, dur: 0.7, r: 0.05, gain: 0.16 });
      tn(e, 0.75, { wave: 'tri', midi: 40, slideTo: midiToFreq(38), slideTime: 0.6, dur: 0.6, r: 0.25, gain: 0.16 });
    },
  },
  claim: {
    minInterval: 0.1,
    play: (e) => {
      tn(e, 0, { wave: 'p25', midi: 83, dur: 0.05, r: 0.015, gain: 0.11 });
      tn(e, 0.06, { wave: 'p25', midi: 88, dur: 0.14, s: 0.35, d: 0.2, r: 0.2, gain: 0.12 });
      // shimmer sparkle: detuned sines twinkling at the top
      [100, 105, 108, 112].forEach((n, i) => {
        tn(e, 0.12 + i * 0.045, { wave: 'sine', midi: n, dur: 0.04, r: 0.14, gain: 0.05, detune: 8 });
        tn(e, 0.12 + i * 0.045, { wave: 'sine', midi: n, dur: 0.04, r: 0.14, gain: 0.05, detune: -8 });
      });
    },
  },
  error: {
    minInterval: 0.15,
    play: (e) => {
      for (let i = 0; i < 2; i++) {
        tn(e, i * 0.13, { wave: 'p50', freq: 132, slideTo: 108, slideTime: 0.09, dur: 0.09, r: 0.02, gain: 0.15 });
        tn(e, i * 0.13, { wave: 'saw', freq: 66, dur: 0.09, r: 0.02, gain: 0.1 });
      }
    },
  },
  bump: {
    minInterval: 0.12,
    play: (e) => {
      tn(e, 0, { wave: 'sine', freq: 125, slideTo: 68, slideTime: 0.06, dur: 0.06, r: 0.03, gain: 0.2 });
      nz(e, 0, { dur: 0.035, r: 0.02, gain: 0.07, filter: 'lowpass', cutoff: 420 });
    },
  },
  door: {
    minInterval: 0.2,
    play: (e) => {
      nz(e, 0, { dur: 0.2, r: 0.06, a: 0.07, gain: 0.08, filter: 'bandpass', cutoff: 1300, cutoffTo: 300, q: 1.0, s: 0.4 });
      nz(e, 0.2, { dur: 0.015, r: 0.015, gain: 0.1, filter: 'highpass', cutoff: 2200 });
      tn(e, 0.2, { wave: 'tri', freq: 420, slideTo: 200, slideTime: 0.03, dur: 0.03, r: 0.02, gain: 0.1 });
    },
  },
  dialog_blip: {
    minInterval: 0.02,
    play: (e) => {
      // one cheap voice; pitch wanders over a pentatonic set + tiny detune so text sounds alive
      const set = [76, 79, 81, 84, 86];
      const n = set[Math.floor(Math.random() * set.length)];
      const f = midiToFreq(n) * (0.985 + Math.random() * 0.03);
      tn(e, 0, { wave: 'p50', freq: f, dur: 0.018, r: 0.012, gain: 0.055 });
    },
  },
};

export const SFX_NAMES = Object.keys(SFX) as SfxName[];
