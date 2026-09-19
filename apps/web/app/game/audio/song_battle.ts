/**
 * "Spark Duel" - original battle theme. A minor, 152 bpm, 4/4, 16 bars = 64 beats (~25.3 s).
 * A (bars 1-8): Am Am F G | Am Am F E - short riff phrases with rests, tresillo (3-3-2) bass.
 * B (bars 9-16): Dm Dm Am E | F G Am E - a longer, rising melody, crash on bar 9, fills at 8 and 16.
 * Fatigue control: lead stays mostly in C4-A5 on a 25% pulse (not the piercing 12.5%), phrases breathe with
 * rests, hats are quiet, and the backbeat snare/kick carry the drive rather than a wall of 16th leads.
 */
import type { TrackDef } from './tracks';

const bassLine = (r: string, third: string, fifth: string) => `${r}:3 ${r}:3 ${r}:2 ${r}:2 -:1 ${r}:1 ${third}:2 ${fifth}:2`;
const stab = (x: string, y: string) => `${x}:2 -:1 ${x}:2 -:1 ${x}:2 -:2 ${y}:2 -:1 ${y}:1 -:2`;

export const BATTLE: TrackDef = {
  bpm: 152,
  stepBeats: 0.25,
  loop: true,
  mix: {
    leadWave: 'p25', leadGain: 0.1, leadGate: 0.85, leadVibCents: 8,
    harmWave: 'p50', harmGain: 0.06, harmGate: 0.7,
    bassWave: 'tri', bassGain: 0.17, bassGate: 0.88,
    drumGain: 0.85,
  },
  lead: {
    defs: {
      L1: 'A4:2 -:1 A4:1 C5:2 E5:2 -:2 D5:2 C5:2 -:2',
      L2: 'E5:3 D5:1 C5:2 B4:2 A4:4 -:4',
      L3: 'F5:2 -:1 F5:1 A5:2 G5:2 F5:2 E5:2 C5:2 -:2',
      L4: 'D5:2 -:1 D5:1 G5:2 B4:2 D5:4 -:4',
      L5: 'A4:2 -:1 A4:1 C5:2 E5:2 -:2 G5:2 E5:2 -:2',
      L6: 'A5:3 G5:1 E5:2 C5:2 E5:4 -:4',
      L7: 'F5:2 A5:2 C6:2 A5:2 G5:2 F5:2 E5:2 C5:2',
      L8: 'B4:2 -:2 E5:2 G#5:2 B5:4 -:2 G#5:2',
      L9: 'D5:4 F5:2 A5:2 G5:2 F5:2 D5:2 -:2',
      L10: 'D5:2 -:1 D5:1 F5:2 A5:2 C6:4 A5:2 F5:2',
      L11: 'C5:2 E5:2 A5:4 G5:2 E5:2 C5:4',
      L12: 'B4:4 G#4:2 B4:2 E5:4 -:4',
      L13: 'A5:3 G5:1 F5:2 E5:2 F5:4 C5:4',
      L14: 'B5:3 A5:1 G5:2 F5:2 G5:4 D5:4',
      L15: 'A5:2 E5:2 C5:2 E5:2 A4:4 -:4',
      L16: 'E5:2 -:1 E5:1 G#5:2 B5:2 G#5:4 -:4',
    },
    seq: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11', 'L12', 'L13', 'L14', 'L15', 'L16'],
  },
  harm: {
    defs: {
      Am: stab('C5', 'E5'),
      F: stab('A4', 'C5'),
      G: stab('B4', 'D5'),
      E: stab('G#4', 'B4'),
      Dm: stab('A4', 'D5'),
    },
    seq: ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'F', 'E', 'Dm', 'Dm', 'Am', 'E', 'F', 'G', 'Am', 'E'],
  },
  bass: {
    defs: {
      Am: bassLine('A2', 'C3', 'E3'),
      F: bassLine('F2', 'A2', 'C3'),
      G: bassLine('G2', 'B2', 'D3'),
      E: bassLine('E2', 'G#2', 'B2'),
      Dm: bassLine('D3', 'F3', 'A3'),
    },
    seq: ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'F', 'E', 'Dm', 'Dm', 'Am', 'E', 'F', 'G', 'Am', 'E'],
  },
  drums: {
    defs: {
      b1: 'K.h.S.hkh.k.S.h.',
      b2: 'K.h.S.hkh.k.S.ss',
      b3: 'K.h.S.hkh.k.S.hH',
      f1: 'K.h.S.hkt.t.tSsS',
      c1: 'X.h.S.hkh.k.S.h.',
    },
    seq: ['b1', 'b1', 'b1', 'b2', 'b1', 'b1', 'b3', 'f1', 'c1', 'b3', 'b1', 'b2', 'b1', 'b3', 'b1', 'f1'],
  },
};
