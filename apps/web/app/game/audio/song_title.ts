/**
 * "First Light" - original title theme. D minor lifting to F major, 96 bpm, 4/4, 12 bars = 48 beats (30 s).
 * Bars 1-4: sparse held melody over slow 8th-note arpeggios and a kick heartbeat (anticipation).
 * Bars 5-8: fuller 16th arpeggios, busier lead and bass, full groove.
 * Bars 9-12: the payoff in F major (crash on the downbeat) ending on an A dominant that pulls back to bar 1.
 */
import type { TrackDef } from './tracks';

const arp16 = (a: string, b: string, c: string, d: string) => `${a} ${b} ${c} ${d} `.repeat(4).trim();
const arp8 = (a: string, b: string, c: string, d: string) => `${a}:2 ${b}:2 ${c}:2 ${d}:2 `.repeat(2).trim();
const pedal = (r: string, f: string) => `${r}:6 -:2 ${r}:4 ${f}:4`;
const eighths = (r: string, f: string, g: string) => `${r}:2 ${r}:2 ${f}:2 ${r}:2 ${r}:2 ${r}:2 ${f}:2 ${g}:2`;

export const TITLE: TrackDef = {
  bpm: 96,
  stepBeats: 0.25,
  loop: true,
  mix: {
    leadWave: 'p25', leadGain: 0.11, leadGate: 0.95, leadVibCents: 22,
    harmWave: 'p50', harmGain: 0.075, harmGate: 0.8,
    bassWave: 'tri', bassGain: 0.15, bassGate: 0.92,
    drumGain: 0.75,
  },
  lead: {
    defs: {
      T1: '-:8 A4:4 D5:4',
      T2: 'F5:6 E5:2 D5:8',
      T3: 'D5:4 F5:4 Bb5:8',
      T4: 'A5:6 G5:2 E5:8',
      T5: 'D5:2 F5:2 A5:4 D6:4 C6:2 A5:2',
      T6: 'Bb5:3 A5:1 F5:4 A5:4 G5:2 F5:2',
      T7: 'D6:4 F6:4 E6:2 D6:2 C6:2 Bb5:2',
      T8: 'C6:4 G5:4 E5:4 G5:2 C6:2',
      T9: 'A5:2 C6:2 F6:4 E6:2 D6:2 C6:4',
      T10: 'G5:2 C6:2 E6:4 D6:2 C6:2 G5:4',
      T11: 'D6:4 F6:4 A6:4 G6:2 F6:2',
      T12: 'E6:3 D6:1 C#6:4 E6:4 A5:4',
    },
    seq: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'],
  },
  harm: {
    defs: {
      s1: arp8('D4', 'F4', 'A4', 'D5'),
      s3: arp8('Bb3', 'D4', 'F4', 'Bb4'),
      s4: arp8('C4', 'E4', 'G4', 'C5'),
      m1: arp16('D4', 'F4', 'A4', 'D5'),
      m3: arp16('Bb3', 'D4', 'F4', 'Bb4'),
      m4: arp16('C4', 'E4', 'G4', 'C5'),
      f1: arp16('F4', 'A4', 'C5', 'F5'),
      a1: arp16('A3', 'C#4', 'E4', 'A4'),
    },
    seq: ['s1', 's1', 's3', 's4', 'm1', 'm1', 'm3', 'm4', 'f1', 'm4', 'm3', 'a1'],
  },
  bass: {
    defs: {
      pD: pedal('D3', 'A2'),
      pB: pedal('Bb2', 'F3'),
      pC: pedal('C3', 'G2'),
      pF: pedal('F2', 'C3'),
      pA: pedal('A2', 'E3'),
      eD: eighths('D3', 'A3', 'F3'),
      eB: eighths('Bb2', 'F3', 'D3'),
      eC: eighths('C3', 'G3', 'E3'),
    },
    seq: ['pD', 'pD', 'pB', 'pC', 'eD', 'eD', 'eB', 'eC', 'pF', 'pC', 'pB', 'pA'],
  },
  drums: {
    defs: {
      h1: 'k.......k.......',
      h2: 'k.......k.s.s.ss',
      g1: 'k.h.s.h.k.h.s.h.',
      g2: 'k.h.s.h.k.h.s.tt',
      p1: 'x.h.s.h.k.h.s.h.',
      p2: 'k.hks.h.k.hks.h.',
      p3: 'k.h.s.h.k.ssssss',
    },
    seq: ['h1', 'h1', 'h1', 'h2', 'g1', 'g1', 'g1', 'g2', 'p1', 'p2', 'p1', 'p3'],
  },
};
