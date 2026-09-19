/**
 * Pure, browser-free music helpers. Nothing in here touches window/AudioContext so it can be
 * unit-tested from node (see selftest.ts).
 */

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** MIDI note number -> frequency in Hz (A4 = 69 = 440Hz). */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Parse a note string like "C4", "C#4", "Db3", "A-1" into a MIDI number (C4 = 60).
 * Returns null for rests ("-", "_", ".", "r", "R", "") and for anything unparseable.
 */
export function parseNote(s: string): number | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (t === '' || t === '-' || t === '_' || t === '.' || t === 'r' || t === 'R') return null;
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(t);
  if (!m) return null;
  const base = NOTE_INDEX[m[1].toUpperCase()];
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const oct = parseInt(m[3], 10);
  const midi = (oct + 1) * 12 + base + acc;
  if (midi < 0 || midi > 127) return null;
  return midi;
}

export interface NoteEvent {
  /** start position in beats from pattern start */
  beat: number;
  /** length in beats */
  len: number;
  /** MIDI note (null for a rest, which is never emitted by expandPattern) */
  midi: number;
  /** 0..1 relative velocity */
  vel: number;
}

/**
 * Pattern mini-language. Whitespace separated tokens, each token is one step of `stepBeats` beats:
 *   "C4"     note that lasts one step
 *   "C4:2"   note lasting 2 steps (the token consumes 2 steps)
 *   "C4:2!"  trailing "!" = accent (velocity 1.0), trailing "~" = soft (0.6); default 0.85
 *   "-"      rest for one step      "-:3" rest for three steps
 *   "="      tie: extend previous note by one step
 * Returns note events plus the total length in beats.
 */
export function expandPattern(pattern: string, stepBeats: number): { events: NoteEvent[]; beats: number } {
  const events: NoteEvent[] = [];
  let step = 0;
  let last: NoteEvent | null = null;
  for (const raw of pattern.split(/\s+/)) {
    if (!raw) continue;
    if (raw === '=') {
      if (last) last.len += stepBeats;
      step += 1;
      continue;
    }
    let tok = raw;
    let vel = 0.85;
    if (tok.endsWith('!')) { vel = 1; tok = tok.slice(0, -1); }
    else if (tok.endsWith('~')) { vel = 0.6; tok = tok.slice(0, -1); }
    let steps = 1;
    const colon = tok.lastIndexOf(':');
    if (colon > 0) {
      const n = parseInt(tok.slice(colon + 1), 10);
      if (Number.isFinite(n) && n > 0) steps = n;
      tok = tok.slice(0, colon);
    }
    const midi = parseNote(tok);
    if (midi === null) {
      last = null;
    } else {
      last = { beat: step * stepBeats, len: steps * stepBeats, midi, vel };
      events.push(last);
    }
    step += steps;
  }
  return { events, beats: step * stepBeats };
}

/**
 * Expand a drum pattern: one char per step. k=kick s=snare h=hat H=open hat t=tom x=crash,
 * combos K=kick+hat S=snare+hat X=kick+crash, '.'=rest, spaces and '|' ignored.
 */
export type DrumHit = 'k' | 's' | 'h' | 'H' | 't' | 'x' | 'K' | 'S' | 'X';
export interface DrumEvent { beat: number; hit: DrumHit; vel: number }

export function expandDrums(pattern: string, stepBeats: number): { events: DrumEvent[]; beats: number } {
  const events: DrumEvent[] = [];
  let step = 0;
  for (const ch of pattern) {
    if (ch === ' ' || ch === '|') continue;
    if ('kshHtxKSX'.includes(ch)) {
      events.push({ beat: step * stepBeats, hit: ch as DrumHit, vel: 0.9 });
    }
    step += 1;
  }
  return { events, beats: step * stepBeats };
}

/** Build a major/minor arpeggio (semitone offsets from root) as MIDI numbers. */
export function arpeggio(rootMidi: number, offsets: number[], count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const oct = Math.floor(i / offsets.length);
    out.push(rootMidi + offsets[i % offsets.length] + 12 * oct);
  }
  return out;
}

/** Clamp helper. */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
