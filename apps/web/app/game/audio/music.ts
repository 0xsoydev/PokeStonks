/**
 * Music player: sample-accurate lookahead scheduler. A setInterval (25 ms) schedules every note
 * that falls inside the next 120 ms of AudioContext time, so timing never depends on the timer's
 * jitter. Each playing track owns a gain "bus" for crossfades. Loops are seamless because every
 * channel of a track has exactly the same beat length (verified by selftest.ts).
 */
import type { BgmName } from './index';
import { getEngine, hasUnlocked, notifyChange, onUnlocked } from './engine';
import { getTrack, type CompiledTrack } from './tracks';
import { crash, hat, kick, snare, tom, tone } from './voices';

const TICK_MS = 25;
const LOOKAHEAD_S = 0.12;
/** Events that are already this far in the past (timer stall) are dropped, not played in a burst. */
const LATE_DROP_S = 0.04;

interface Cursor { i: number; loop: number }

interface Player {
  name: BgmName;
  track: CompiledTrack;
  loop: boolean;
  bus: GainNode;
  start: number;
  spb: number;
  loopSec: number;
  cur: { lead: Cursor; harm: Cursor; bass: Cursor; drums: Cursor };
  /** when set, no more notes are scheduled at or after this time and the bus is torn down shortly after */
  stopAt: number | null;
  /** one-shot tracks: time after which the player is finished */
  endAt: number;
  fading: boolean;
}

const players: Player[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let current: Player | null = null;
let pending: { name: BgmName; opts?: { fadeMs?: number; loop?: boolean } } | null = null;
let pendingHooked = false;

export function getNowPlaying(): BgmName | null {
  return current && !current.fading ? current.name : null;
}

function defaultLoop(name: BgmName): boolean {
  return getTrack(name).def.loop;
}

function scheduleNote(p: Player, ctx: AudioContext, ch: 'lead' | 'harm' | 'bass', ev: { beat: number; len: number; midi: number; vel: number }, t: number): void {
  const m = p.track.def.mix;
  const dur = Math.max(0.02, ev.len * p.spb * ((ch === 'lead' ? m.leadGate : ch === 'harm' ? m.harmGate : m.bassGate) ?? 0.9));
  if (ch === 'lead') {
    tone(ctx, p.bus, {
      wave: m.leadWave, midi: ev.midi, t, dur, gain: m.leadGain * (0.75 + 0.25 * ev.vel),
      a: 0.006, s: 0.78, d: 0.14, r: 0.045,
      vibCents: dur > 0.3 ? m.leadVibCents : 0, vibRate: 5.2, vibDelay: 0.12, counted: false,
    });
  } else if (ch === 'harm') {
    tone(ctx, p.bus, {
      wave: m.harmWave, midi: ev.midi, t, dur, gain: m.harmGain * (0.8 + 0.2 * ev.vel),
      a: 0.005, s: 0.8, d: 0.1, r: 0.04, counted: false,
    });
  } else {
    tone(ctx, p.bus, {
      wave: m.bassWave, midi: ev.midi, t, dur, gain: m.bassGain * (0.85 + 0.15 * ev.vel),
      a: 0.005, r: 0.035, counted: false,
    });
  }
}

function scheduleDrum(p: Player, ctx: AudioContext, hit: string, vel: number, t: number): void {
  const v = vel * (p.track.def.mix.drumGain ?? 0.8);
  switch (hit) {
    case 'k': kick(ctx, p.bus, t, v, false); break;
    case 's': snare(ctx, p.bus, t, v, false); break;
    case 'h': hat(ctx, p.bus, t, v * 0.8, false, false); break;
    case 'H': hat(ctx, p.bus, t, v * 0.8, true, false); break;
    case 't': tom(ctx, p.bus, t, v, false); break;
    case 'x': crash(ctx, p.bus, t, v, false); break;
    case 'K': kick(ctx, p.bus, t, v, false); hat(ctx, p.bus, t, v * 0.6, false, false); break;
    case 'S': snare(ctx, p.bus, t, v, false); hat(ctx, p.bus, t, v * 0.6, false, false); break;
    case 'X': kick(ctx, p.bus, t, v, false); crash(ctx, p.bus, t, v, false); break;
    default: break;
  }
}

/** Schedule everything that falls before `horizon` for one channel. Returns true if the channel is exhausted. */
function pump<E extends { beat: number }>(
  p: Player, ctx: AudioContext, events: E[], cur: Cursor, horizon: number, now: number,
  emit: (ev: E, t: number) => void,
): boolean {
  if (events.length === 0) return true;
  for (let guard = 0; guard < 4096; guard++) {
    if (!p.loop && cur.loop >= 1) return true;
    const ev = events[cur.i];
    const t = p.start + (cur.loop * p.track.loopBeats + ev.beat) * p.spb;
    if (t >= horizon) return false;
    if (p.stopAt !== null && t >= p.stopAt) return true;
    if (t >= now - LATE_DROP_S) emit(ev, t);
    cur.i++;
    if (cur.i >= events.length) { cur.i = 0; cur.loop++; }
  }
  return false;
}

function destroy(p: Player): void {
  try { p.bus.disconnect(); } catch { /* ignore */ }
  const i = players.indexOf(p);
  if (i >= 0) players.splice(i, 1);
  if (current === p) { current = null; notifyChange(); }
}

function tick(): void {
  const e = getEngine();
  if (!e) return;
  const ctx = e.ctx;
  const now = ctx.currentTime;
  const horizon = now + LOOKAHEAD_S;
  for (const p of players.slice()) {
    if (p.stopAt !== null && now >= p.stopAt + 0.25) { destroy(p); continue; }
    if (p.stopAt === null && !p.loop && now >= p.endAt) { destroy(p); continue; }
    pump(p, ctx, p.track.lead, p.cur.lead, horizon, now, (ev, t) => scheduleNote(p, ctx, 'lead', ev, t));
    pump(p, ctx, p.track.harm, p.cur.harm, horizon, now, (ev, t) => scheduleNote(p, ctx, 'harm', ev, t));
    pump(p, ctx, p.track.bass, p.cur.bass, horizon, now, (ev, t) => scheduleNote(p, ctx, 'bass', ev, t));
    pump(p, ctx, p.track.drums, p.cur.drums, horizon, now, (ev, t) => scheduleDrum(p, ctx, ev.hit, ev.vel, t));
  }
  if (players.length === 0 && timer !== null) { clearInterval(timer); timer = null; }
}

function ensureTimer(): void {
  if (timer === null) timer = setInterval(tick, TICK_MS);
}

function fadeOut(p: Player, ctx: AudioContext, fadeS: number): void {
  if (p.fading) return;
  p.fading = true;
  const now = ctx.currentTime;
  const g = p.bus.gain;
  try {
    const anyG = g as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
    if (typeof anyG.cancelAndHoldAtTime === 'function') anyG.cancelAndHoldAtTime(now);
    else { const v = g.value; g.cancelScheduledValues(now); g.setValueAtTime(v, now); }
    g.linearRampToValueAtTime(0, now + Math.max(0.02, fadeS));
  } catch { /* ignore */ }
  p.stopAt = now + Math.max(0.02, fadeS);
}

function startNow(name: BgmName, opts?: { fadeMs?: number; loop?: boolean }): void {
  const e = getEngine();
  if (!e) return;
  const ctx = e.ctx;
  const track = getTrack(name);
  const loop = opts?.loop ?? defaultLoop(name);
  const oneShot = !loop;
  const fadeMs = opts?.fadeMs ?? 400;
  // fanfares should hit immediately, so they fade in quickly unless the caller says otherwise
  const fadeInS = Math.max(0.01, (oneShot && opts?.fadeMs === undefined ? 30 : fadeMs) / 1000);
  const fadeOutS = Math.max(0.02, fadeMs / 1000);

  for (const old of players) if (!old.fading) fadeOut(old, ctx, fadeOutS);

  const bus = ctx.createGain();
  const now = ctx.currentTime;
  bus.gain.setValueAtTime(0, now);
  bus.gain.linearRampToValueAtTime(1, now + fadeInS);
  bus.connect(e.musicBus);
  const spb = 60 / track.bpm;
  const start = now + 0.06;
  const p: Player = {
    name, track, loop, bus, start, spb,
    loopSec: track.loopBeats * spb,
    cur: { lead: { i: 0, loop: 0 }, harm: { i: 0, loop: 0 }, bass: { i: 0, loop: 0 }, drums: { i: 0, loop: 0 } },
    stopAt: null,
    endAt: start + track.loopBeats * spb + 0.9,
    fading: false,
  };
  players.push(p);
  current = p;
  ensureTimer();
  tick();
  notifyChange();
}

/** Public entry: start/crossfade/stop music. Safe to call before unlock (it is deferred). */
export function playBgm(name: BgmName | null, opts?: { fadeMs?: number; loop?: boolean }): void {
  if (name === null) {
    pending = null;
    const e = getEngine();
    if (!e) return;
    const fadeS = Math.max(0.02, (opts?.fadeMs ?? 400) / 1000);
    for (const p of players) fadeOut(p, e.ctx, fadeS);
    notifyChange();
    return;
  }
  // requesting the already-playing track is a no-op
  if (getNowPlaying() === name) return;
  if (pending && pending.name === name) return;

  if (!hasUnlocked()) {
    pending = { name, opts };
    if (!pendingHooked) {
      pendingHooked = true;
      onUnlocked(() => {
        pendingHooked = false;
        const pd = pending;
        pending = null;
        if (pd) startNow(pd.name, pd.opts);
      });
    }
    return;
  }
  startNow(name, opts);
}

/** Test hook: run one scheduler tick synchronously (selftest drives a mock clock with this). */
export function _tickForTest(): void {
  tick();
}
