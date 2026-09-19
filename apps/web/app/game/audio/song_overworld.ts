/**
 * "Meadow Road" - original overworld theme. C major, 112 bpm, 4/4, 16 bars = 64 beats (~34.3 s).
 * A (bars 1-8): sing-along hook over I vi IV V | I iii IV V with oom-pah offbeat comping.
 * B (bars 9-16): higher, wider melody over IV V iii vi | IV V I I with 16th-note arpeggio harmony.
 * Steps are sixteenths (16 tokens per bar).
 */
import type { TrackDef } from './tracks';

const comp = (a: string, b: string) => `-:2 ${a}:2 -:2 ${b}:2 -:2 ${a}:2 -:2 ${b}:2`;
const arp = (a: string, b: string, c: string) => `${a} ${b} ${c} ${b} ${a} ${b} ${c} ${b} ${a} ${b} ${c} ${b} ${a} ${b} ${c} ${b}`;
const walk = (r: string, f: string) => `${r}:2 -:2 ${f}:2 -:2 ${r}:2 -:2 ${f}:2 -:2`;
const eighths = (r: string, f: string) => `${r}:2 ${r}:2 ${f}:2 ${r}:2 ${r}:2 ${r}:2 ${f}:2 ${r}:2`;

export const OVERWORLD: TrackDef = {
  bpm: 112,
  stepBeats: 0.25,
  loop: true,
  mix: {
    leadWave: 'p25', leadGain: 0.12, leadGate: 0.92, leadVibCents: 12,
    harmWave: 'p50', harmGain: 0.08, harmGate: 0.85,
    bassWave: 'tri', bassGain: 0.16, bassGate: 0.9,
    drumGain: 0.8,
  },
  lead: {
    defs: {
      A1: 'E5:2 G5:2 A5:3 G5:1 E5:2 D5:2 C5:2 D5:2',
      A2: 'E5:2 A5:2 C6:3 B5:1 A5:2 G5:2 E5:4',
      A3: 'A5:2 A5:2 G5:2 F5:2 E5:3 F5:1 G5:2 A5:2',
      A4: 'B5:4 A5:2 G5:2 D5:4 -:2 G5:2',
      A5: 'E5:2 G5:2 A5:3 G5:1 C6:4 B5:2 A5:2',
      A6: 'G5:2 B5:2 B5:3 A5:1 G5:2 E5:2 G5:4',
      A7: 'A5:2 C6:2 A5:2 F5:2 A5:3 G5:1 F5:4',
      A8: 'D5:2 G5:2 B5:2 D6:2 C6:4 B5:2 -:2',
      B1: 'C6:4 A5:4 F5:4 A5:4',
      B2: 'D6:4 B5:4 G5:4 B5:2 D6:2',
      B3: 'E6:3 D6:1 C6:2 B5:2 G5:4 B5:4',
      B4: 'A5:2 C6:2 E6:4 D6:2 C6:2 A5:4',
      B5: 'F6:3 E6:1 D6:2 C6:2 A5:2 C6:2 F5:4',
      B6: 'G5:2 B5:2 D6:2 G6:2 F6:3 E6:1 D6:4',
      B7: 'E6:2 G6:2 E6:2 C6:2 G5:4 E5:4',
      B8: 'C6:3 B5:1 A5:2 G5:2 D5:2 F5:2 D5:2 -:2',
    },
    seq: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8'],
  },
  harm: {
    defs: {
      Cc: comp('E4', 'G4'),
      Ca: comp('E4', 'A4'),
      Cf: comp('F4', 'A4'),
      Cg: comp('D4', 'G4'),
      Ce: comp('G4', 'B4'),
      Af: arp('F4', 'A4', 'C5'),
      Ag: arp('G4', 'B4', 'D5'),
      Ae: arp('E4', 'G4', 'B4'),
      Aa: arp('E4', 'A4', 'C5'),
      Ac: arp('E4', 'G4', 'C5'),
    },
    seq: ['Cc', 'Ca', 'Cf', 'Cg', 'Cc', 'Ce', 'Cf', 'Cg', 'Af', 'Ag', 'Ae', 'Aa', 'Af', 'Ag', 'Ac', 'Ac'],
  },
  bass: {
    defs: {
      C: walk('C3', 'G3'),
      Am: walk('A2', 'E3'),
      F: walk('F2', 'C3'),
      G: walk('G2', 'D3'),
      Em: walk('E3', 'B2'),
      xF: eighths('F2', 'C3'),
      xG: eighths('G2', 'D3'),
      xEm: eighths('E3', 'B2'),
      xAm: eighths('A2', 'E3'),
      xC: eighths('C3', 'G3'),
    },
    seq: ['C', 'Am', 'F', 'G', 'C', 'Em', 'F', 'G', 'xF', 'xG', 'xEm', 'xAm', 'xF', 'xG', 'xC', 'xC'],
  },
  drums: {
    defs: {
      d1: 'k.h.s.h.k.h.s.h.',
      d2: 'k.h.s.h.k.h.s.tt',
      d3: 'k.h.s.hkk.h.s.h.',
      d4: 'k.h.s.h.k.hkssss',
    },
    seq: ['d1', 'd1', 'd1', 'd2', 'd1', 'd1', 'd1', 'd2', 'd3', 'd3', 'd3', 'd2', 'd3', 'd3', 'd3', 'd4'],
  },
};
