/**
 * One-shot jingles (both non-looping by default).
 *  - VICTORY "Bright Finish": G major, 132 bpm, 4 bars = 16 beats (~7.3 s). Rising fanfare, secondary
 *    dominant (D7) in bar 3, sustained G major chord with vibrato and a crash on the last bar.
 *  - DEFEAT "Long Walk Home": E minor, 90 bpm, 2 bars = 8 beats (~5.3 s). Falling melody with slow vibrato,
 *    heartbeat kick and a bVI (C) colour before settling on E.
 */
import type { TrackDef } from './tracks';

export const VICTORY: TrackDef = {
  bpm: 132,
  stepBeats: 0.25,
  loop: false,
  mix: {
    leadWave: 'p25', leadGain: 0.12, leadGate: 0.95, leadVibCents: 20,
    harmWave: 'p50', harmGain: 0.08, harmGate: 0.9,
    bassWave: 'tri', bassGain: 0.16, bassGate: 0.95,
    drumGain: 0.8,
  },
  lead: {
    defs: {
      V1: 'D5:2 G5:2 B5:4 A5:2 B5:2 D6:4',
      V2: 'C6:3 B5:1 A5:4 E5:4 A5:4',
      V3: 'F#5:2 A5:2 C6:4 B5:2 A5:2 F#5:4',
      V4: 'B5:2 D6:2 G6:12',
    },
    seq: ['V1', 'V2', 'V3', 'V4'],
  },
  harm: {
    defs: {
      H1: 'G4:2 B4:2 D5:4 C5:2 D5:2 G5:4',
      H2: 'E5:3 D5:1 C5:4 G4:4 C5:4',
      H3: 'D5:2 F#4:2 A4:4 G4:2 F#4:2 D5:4',
      H4: 'G4:2 B4:2 D5:12',
    },
    seq: ['H1', 'H2', 'H3', 'H4'],
  },
  bass: {
    defs: {
      B1: 'G2:4 D3:4 G2:4 D3:4',
      B2: 'C3:4 G3:4 A2:4 E3:4',
      B3: 'D3:4 A2:4 D3:4 F#3:4',
      B4: 'G2:4 D3:4 G2:8',
    },
    seq: ['B1', 'B2', 'B3', 'B4'],
  },
  drums: {
    defs: {
      v1: 'X.h.S.h.K.h.S.SS',
      v2: 'K.h.S.h.K.h.S.h.',
      v3: 'K.h.S.h.K.SSSSt.',
      v4: 'X...............',
    },
    seq: ['v1', 'v2', 'v3', 'v4'],
  },
};

export const DEFEAT: TrackDef = {
  bpm: 90,
  stepBeats: 0.25,
  loop: false,
  mix: {
    leadWave: 'p50', leadGain: 0.13, leadGate: 0.97, leadVibCents: 26,
    harmWave: 'p25', harmGain: 0.08, harmGate: 0.95,
    bassWave: 'tri', bassGain: 0.16, bassGate: 0.97,
    drumGain: 0.55,
  },
  lead: {
    defs: {
      D1: 'E5:4 D5:4 B4:6 -:2',
      D2: 'C5:4 B4:4 A4:2 G4:2 E4:4',
    },
    seq: ['D1', 'D2'],
  },
  harm: {
    defs: {
      H1: 'G4:4 F#4:4 E4:6 -:2',
      H2: 'E4:4 D4:4 C4:2 B3:2 G3:4',
    },
    seq: ['H1', 'H2'],
  },
  bass: {
    defs: {
      B1: 'E3:8 B2:8',
      B2: 'C3:6 -:2 E3:8',
    },
    seq: ['B1', 'B2'],
  },
  drums: {
    defs: {
      d1: 'k.......t.......',
      d2: 'k.......k.......',
    },
    seq: ['d1', 'd2'],
  },
};
