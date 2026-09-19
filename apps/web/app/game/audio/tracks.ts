/**
 * Track data model + pure compiler. Song content lives in song_*.ts (all original compositions);
 * this file only defines the shape, expands patterns into absolute-beat events and exposes the
 * registry. No browser APIs here, so it is unit-testable in node.
 */
import type { BgmName } from './index';
import { expandDrums, expandPattern, type DrumEvent, type NoteEvent } from './theory';
import type { WaveKind } from './voices';
import { OVERWORLD } from './song_overworld';
import { TITLE } from './song_title';
import { BATTLE } from './song_battle';
import { VICTORY, DEFEAT } from './song_jingles';

/** A channel is a dictionary of named bar/phrase patterns plus the order they are played in. */
export interface ChannelDef {
  defs: Record<string, string>;
  seq: string[];
}

export interface TrackMix {
  leadWave: WaveKind;
  leadGain: number;
  /** 0..1 fraction of note length actually held (articulation) */
  leadGate?: number;
  leadVibCents?: number;
  harmWave: WaveKind;
  harmGain: number;
  harmGate?: number;
  bassWave: WaveKind;
  bassGain: number;
  bassGate?: number;
  drumGain?: number;
}

export interface TrackDef {
  bpm: number;
  /** beats per pattern step (0.25 = sixteenth notes) */
  stepBeats: number;
  /** default looping behaviour; bgm(name, {loop}) overrides */
  loop: boolean;
  mix: TrackMix;
  lead: ChannelDef;
  harm: ChannelDef;
  bass: ChannelDef;
  drums: ChannelDef;
}

export interface CompiledTrack {
  def: TrackDef;
  bpm: number;
  lead: NoteEvent[];
  harm: NoteEvent[];
  bass: NoteEvent[];
  drums: DrumEvent[];
  /** per-channel length in beats (must all be equal for a seamless loop) */
  channelBeats: { lead: number; harm: number; bass: number; drums: number };
  loopBeats: number;
  loopSeconds: number;
}

function compileNotes(ch: ChannelDef, step: number): { events: NoteEvent[]; beats: number } {
  const events: NoteEvent[] = [];
  let offset = 0;
  for (const key of ch.seq) {
    const pat = ch.defs[key];
    if (pat === undefined) throw new Error(`unknown pattern "${key}"`);
    const r = expandPattern(pat, step);
    for (const ev of r.events) events.push({ ...ev, beat: ev.beat + offset });
    offset += r.beats;
  }
  return { events, beats: offset };
}

function compileDrums(ch: ChannelDef, step: number): { events: DrumEvent[]; beats: number } {
  const events: DrumEvent[] = [];
  let offset = 0;
  for (const key of ch.seq) {
    const pat = ch.defs[key];
    if (pat === undefined) throw new Error(`unknown drum pattern "${key}"`);
    const r = expandDrums(pat, step);
    for (const ev of r.events) events.push({ ...ev, beat: ev.beat + offset });
    offset += r.beats;
  }
  return { events, beats: offset };
}

export function compileTrack(def: TrackDef): CompiledTrack {
  const lead = compileNotes(def.lead, def.stepBeats);
  const harm = compileNotes(def.harm, def.stepBeats);
  const bass = compileNotes(def.bass, def.stepBeats);
  const drums = compileDrums(def.drums, def.stepBeats);
  const loopBeats = Math.max(lead.beats, harm.beats, bass.beats, drums.beats);
  return {
    def,
    bpm: def.bpm,
    lead: lead.events,
    harm: harm.events,
    bass: bass.events,
    drums: drums.events,
    channelBeats: { lead: lead.beats, harm: harm.beats, bass: bass.beats, drums: drums.beats },
    loopBeats,
    loopSeconds: (loopBeats * 60) / def.bpm,
  };
}

export const TRACK_DEFS: Record<BgmName, TrackDef> = {
  title: TITLE,
  overworld: OVERWORLD,
  battle: BATTLE,
  victory: VICTORY,
  defeat: DEFEAT,
};

export const BGM_NAMES = Object.keys(TRACK_DEFS) as BgmName[];

const compiled = new Map<BgmName, CompiledTrack>();
export function getTrack(name: BgmName): CompiledTrack {
  let c = compiled.get(name);
  if (!c) { c = compileTrack(TRACK_DEFS[name]); compiled.set(name, c); }
  return c;
}
