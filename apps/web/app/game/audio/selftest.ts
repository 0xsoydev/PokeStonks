/**
 * Node smoke test for the audio module (no browser, no real audio).
 * Run: /home/arch-nitro/PokeStonks/apps/server/node_modules/.bin/tsx apps/web/app/game/audio/selftest.ts
 *
 * Part 1: pure helpers (midiToFreq, parseNote, expandPattern, expandDrums, arpeggio).
 * Part 2: data integrity (every SfxName defined, every BgmName has a track, channel loop lengths equal,
 *         loop durations in spec, note ranges).
 * Part 3: SSR safety (import + calls with no window never throw).
 * Part 4: a mock AudioContext drives every SFX and every track through the real engine/voices/scheduler
 *         and checks automation sanity (gain peaks <= 0.25, start/end at 0, valid exponential ramps),
 *         node cleanup (everything stopped gets disconnected, voice counter returns to 0), seamless loop
 *         scheduling, one-shot end, crossfade and deferred (pre-unlock) bgm.
 */
import { arpeggio, expandDrums, expandPattern, midiToFreq, parseNote } from './theory';
import { BGM_NAMES, TRACK_DEFS, getTrack } from './tracks';
import { SFX, SFX_NAMES } from './sfx';

let checks = 0;
const failures: string[] = [];
function ok(cond: unknown, msg: string): void {
  checks++;
  if (!cond) { failures.push(msg); console.error('FAIL: ' + msg); }
}
function eq<T>(a: T, b: T, msg: string): void {
  ok(a === b, `${msg} (got ${String(a)}, expected ${String(b)})`);
}
function near(a: number, b: number, eps: number, msg: string): void {
  ok(Math.abs(a - b) <= eps, `${msg} (got ${a}, expected ${b})`);
}

const EXPECTED_SFX = [
  'menu_move', 'menu_select', 'menu_back', 'tap_tick', 'tap_perfect', 'tap_good', 'tap_miss',
  'hit', 'hit_super', 'hit_resist', 'crit', 'miss', 'stat_up', 'stat_down', 'faint', 'levelup',
  'encounter', 'step_grass', 'heal', 'win', 'lose', 'claim', 'error', 'bump', 'door', 'dialog_blip',
] as const;
const EXPECTED_BGM = ['title', 'overworld', 'battle', 'victory', 'defeat'] as const;

/* ------------------------------------------------------------------ 1. pure helpers */
function testPure(): void {
  near(midiToFreq(69), 440, 1e-9, 'A4 = 440Hz');
  near(midiToFreq(57), 220, 1e-9, 'A3 = 220Hz');
  near(midiToFreq(81), 880, 1e-9, 'A5 = 880Hz');
  near(midiToFreq(60), 261.6256, 1e-3, 'C4 ~ 261.63Hz');
  near(midiToFreq(0), 8.1758, 1e-3, 'MIDI 0 ~ 8.18Hz');

  eq(parseNote('A4'), 69, 'parse A4');
  eq(parseNote('C4'), 60, 'parse C4');
  eq(parseNote('C#4'), 61, 'parse C#4');
  eq(parseNote('Db4'), 61, 'parse Db4');
  eq(parseNote('c4'), 60, 'parse lowercase');
  eq(parseNote(' E4 '), 64, 'parse trims whitespace');
  eq(parseNote('B#3'), 60, 'parse B#3 = C4');
  eq(parseNote('Cb4'), 59, 'parse Cb4 = B3');
  eq(parseNote('C-1'), 0, 'parse C-1 = MIDI 0');
  eq(parseNote('G9'), 127, 'parse G9 = MIDI 127');
  eq(parseNote('G#9'), null, 'parse out of range high');
  eq(parseNote('B-2'), null, 'parse out of range low');
  eq(parseNote('-'), null, 'rest "-"');
  eq(parseNote('.'), null, 'rest "."');
  eq(parseNote(''), null, 'empty string');
  eq(parseNote('H4'), null, 'invalid letter');
  eq(parseNote('E'), null, 'missing octave');
  eq(parseNote('E4:2'), null, 'duration suffix is not part of a note');
  eq(parseNote('C##4'), null, 'double sharp unsupported');

  const p = expandPattern('C4:2 - D4 = E4! F4~ -:2', 0.25);
  eq(p.events.length, 4, 'pattern event count');
  eq(p.beats, 0.25 * 9, 'pattern total beats (9 steps)');
  eq(p.events[0].midi, 60, 'pattern note 0');
  near(p.events[0].len, 0.5, 1e-9, 'C4:2 lasts 2 steps');
  near(p.events[1].beat, 0.25 * 3, 1e-9, 'D4 starts after 2-step note + rest');
  near(p.events[1].len, 0.5, 1e-9, 'tie extends D4 by one step');
  eq(p.events[2].vel, 1, 'accent vel');
  eq(p.events[3].vel, 0.6, 'soft vel');
  near(p.events[2].beat, 0.25 * 5, 1e-9, 'E4 after tie');
  const empty = expandPattern('', 0.25);
  eq(empty.events.length + empty.beats, 0, 'empty pattern');
  const ties = expandPattern('= C4', 0.5);
  eq(ties.events.length, 1, 'leading tie is ignored, not thrown');
  eq(expandPattern('X9 C4', 0.5).events.length, 1, 'unparseable token acts as a rest');

  const d = expandDrums('k.h.|s.h.', 0.25);
  eq(d.beats, 2, '8 drum steps = 2 beats');
  eq(d.events.map((e) => e.hit).join(''), 'khsh', 'drum hits parsed');
  near(d.events[2].beat, 1, 1e-9, 'snare on step 4');

  const a = arpeggio(60, [0, 4, 7], 5);
  eq(a.join(','), '60,64,67,72,76', 'arpeggio wraps up an octave');
}

/* ------------------------------------------------------------------ 2. data integrity */
function testData(): void {
  eq(SFX_NAMES.length, 26, 'exactly 26 sfx');
  for (const n of EXPECTED_SFX) {
    const def = SFX[n];
    ok(def && typeof def.play === 'function', `sfx "${n}" has a definition`);
    ok(def && def.minInterval > 0 && def.minInterval < 1, `sfx "${n}" has a sane minInterval`);
  }
  for (const n of BGM_NAMES) ok((EXPECTED_BGM as readonly string[]).includes(n), `unexpected bgm "${n}"`);
  for (const n of EXPECTED_BGM) {
    ok(TRACK_DEFS[n] !== undefined, `bgm "${n}" has a track`);
    const t = getTrack(n);
    const cb = t.channelBeats;
    ok(cb.lead > 0, `${n}: lead has length`);
    eq(cb.harm, cb.lead, `${n}: harm loop length equals lead`);
    eq(cb.bass, cb.lead, `${n}: bass loop length equals lead`);
    eq(cb.drums, cb.lead, `${n}: drums loop length equals lead`);
    eq(t.loopBeats % 4, 0, `${n}: loop is a whole number of 4/4 bars`);
    for (const ch of ['lead', 'harm', 'bass'] as const) {
      ok(t[ch].length > 0, `${n}: ${ch} has notes`);
      for (const ev of t[ch]) {
        ok(ev.midi >= 24 && ev.midi <= 96, `${n}: ${ch} note ${ev.midi} in playable range`);
        ok(ev.beat >= 0 && ev.beat + ev.len <= t.loopBeats + 1e-9, `${n}: ${ch} note fits inside the loop`);
      }
    }
    for (const ev of t.drums) ok(ev.beat >= 0 && ev.beat < t.loopBeats, `${n}: drum inside loop`);
    // lead/harm/bass must not overlap themselves (monophonic channels)
    for (const ch of ['lead', 'harm', 'bass'] as const) {
      const evs = t[ch];
      for (let i = 1; i < evs.length; i++) ok(evs[i].beat >= evs[i - 1].beat + evs[i - 1].len - 1e-9, `${n}: ${ch} monophonic at note ${i}`);
    }
  }
  const secs = (n: (typeof EXPECTED_BGM)[number]) => getTrack(n).loopSeconds;
  for (const n of ['title', 'overworld', 'battle'] as const) {
    ok(secs(n) >= 20 && secs(n) <= 40, `${n} loop is 20-40s (${secs(n).toFixed(1)}s)`);
    ok(TRACK_DEFS[n].loop, `${n} loops by default`);
  }
  ok(secs('victory') >= 6 && secs('victory') <= 8, `victory is 6-8s (${secs('victory').toFixed(1)}s)`);
  ok(secs('defeat') >= 4.5 && secs('defeat') <= 6, `defeat is ~5s (${secs('defeat').toFixed(1)}s)`);
  ok(!TRACK_DEFS.victory.loop && !TRACK_DEFS.defeat.loop, 'victory/defeat are one-shots by default');
  eq(TRACK_DEFS.overworld.bpm, 112, 'overworld 112 bpm');
  eq(TRACK_DEFS.battle.bpm, 152, 'battle 152 bpm');
  // every voice gain in the mixes is within the per-voice cap
  for (const n of EXPECTED_BGM) {
    const m = TRACK_DEFS[n].mix;
    ok(m.leadGain <= 0.25 && m.harmGain <= 0.25 && m.bassGain <= 0.25, `${n}: mix gains <= 0.25`);
  }
}

/* ------------------------------------------------------------------ mock WebAudio */
interface Ev { kind: string; v: number; t: number }
class MockParam {
  events: Ev[] = [];
  value: number;
  last = 0;
  constructor(v = 0) { this.value = v; this.last = v; }
  private check(kind: string, v: number, t: number): void {
    if (!Number.isFinite(v)) throw new TypeError(`${kind}: non-finite value`);
    if (!Number.isFinite(t) || t < 0) throw new RangeError(`${kind}: bad time ${t}`);
  }
  setValueAtTime(v: number, t: number): this { this.check('set', v, t); this.events.push({ kind: 'set', v, t }); this.last = v; return this; }
  linearRampToValueAtTime(v: number, t: number): this { this.check('lin', v, t); this.events.push({ kind: 'lin', v, t }); this.last = v; return this; }
  exponentialRampToValueAtTime(v: number, t: number): this {
    this.check('exp', v, t);
    if (v <= 0) throw new RangeError('exponentialRamp to non-positive value');
    if (this.events.length === 0 ? this.value <= 0 : this.last <= 0) throw new RangeError('exponentialRamp from zero');
    this.events.push({ kind: 'exp', v, t }); this.last = v; return this;
  }
  setTargetAtTime(v: number, t: number): this { this.check('target', v, t); this.events.push({ kind: 'target', v, t }); this.last = v; return this; }
  cancelScheduledValues(): this { return this; }
}
class MockNode {
  targets: MockNode[] = [];
  disconnected = false;
  connect(n: MockNode): MockNode { this.targets.push(n); return n; }
  disconnect(): void { this.disconnected = true; }
}
class MockGain extends MockNode { gain = new MockParam(1); }
class MockSource extends MockNode {
  stopAt: number | null = null;
  startedAt: number | null = null;
  onended: (() => void) | null = null;
  fired = false;
  start(t: number): void { if (this.startedAt !== null) throw new Error('start called twice'); this.startedAt = t; }
  stop(t: number): void { this.stopAt = t; }
}
class MockOsc extends MockSource {
  frequency = new MockParam(440);
  detune = new MockParam(0);
  type = 'sine';
  wave: unknown = null;
  setPeriodicWave(w: unknown): void { this.wave = w; }
}
class MockBufSrc extends MockSource {
  buffer: { length: number } | null = null;
  loop = false;
  playbackRate = new MockParam(1);
  override start(t: number, offset?: number): void {
    if (offset !== undefined && (offset < 0 || !Number.isFinite(offset))) throw new RangeError('bad offset');
    super.start(t);
  }
}
class MockBiquad extends MockNode { frequency = new MockParam(350); Q = new MockParam(1); type = 'lowpass'; }

const allGains: MockGain[] = [];
const allSources: MockSource[] = [];
const allOscs: MockOsc[] = [];

class MockCtx {
  currentTime = 1;
  sampleRate = 48000;
  state = 'suspended';
  destination = new MockNode();
  createGain(): MockGain { const g = new MockGain(); allGains.push(g); return g; }
  createOscillator(): MockOsc { const o = new MockOsc(); allSources.push(o); allOscs.push(o); return o; }
  createBufferSource(): MockBufSrc { const b = new MockBufSrc(); allSources.push(b); return b; }
  createBiquadFilter(): MockBiquad { return new MockBiquad(); }
  createBuffer(_c: number, len: number): { length: number; getChannelData: () => Float32Array } { return { length: len, getChannelData: () => new Float32Array(len) }; }
  createPeriodicWave(re: Float32Array, im: Float32Array): object {
    if (re.length !== im.length || re.length < 2) throw new Error('bad periodic wave');
    return { re };
  }
  createDynamicsCompressor(): MockNode & Record<string, { value: number }> {
    const n = new MockNode() as MockNode & Record<string, { value: number }>;
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = { value: 0 };
    return n;
  }
  async resume(): Promise<void> { this.state = 'running'; }
  async suspend(): Promise<void> { this.state = 'suspended'; }
}

/** Advance the mock clock, firing onended for sources whose stop time has passed. */
function advance(ctx: MockCtx, to: number): void {
  ctx.currentTime = to;
  for (const s of allSources) {
    if (!s.fired && s.stopAt !== null && s.stopAt <= to) { s.fired = true; s.onended?.(); }
  }
}

function checkGainEnvelope(g: MockGain, label: string): void {
  const ev = g.gain.events;
  if (ev.length === 0) return;
  ok(ev[0].kind === 'set' && ev[0].v === 0, `${label}: gain starts at 0 (click-free)`);
  const peak = Math.max(...ev.map((e) => e.v));
  ok(peak <= 0.25 + 1e-9, `${label}: voice gain peak ${peak.toFixed(3)} <= 0.25`);
  ok(ev[ev.length - 1].v === 0, `${label}: gain ends at 0 (click-free)`);
  let t = -1;
  for (const e of ev) { ok(e.t >= t - 1e-9 || e.kind === 'set', `${label}: automation times non-decreasing`); t = Math.max(t, e.t); }
}

/* ------------------------------------------------------------------ 3 + 4. SSR, engine, scheduler */
async function testEngine(): Promise<void> {
  // ---- SSR: no window / document / AudioContext
  const g = globalThis as Record<string, unknown>;
  ok(typeof g.window === 'undefined', 'test starts in a window-less (SSR-like) environment');
  const mod = await import('./index');
  const { audio } = mod;
  audio.sfx('hit');
  audio.lowHp(true);
  audio.lowHp(false);
  audio.setVolume('music', 0.5);
  eq(audio.isMuted(), false, 'default not muted');
  audio.setMuted(true);
  eq(audio.isMuted(), true, 'setMuted(true) sticks with no window');
  audio.setMuted(false);
  let notified = 0;
  const off = audio.onChange(() => { notified++; });
  audio.setMuted(true);
  audio.setMuted(false);
  eq(notified, 2, 'onChange fires for each mute change');
  off();
  audio.setMuted(true);
  eq(notified, 2, 'unsubscribed listener no longer fires');
  audio.setMuted(false);
  await audio.unlock();
  eq(mod.getAudioState(), 'unavailable', 'no WebAudio in node => unavailable');
  audio.bgm('battle'); // deferred: applies once unlocked
  audio.bgm('battle'); // duplicate is a no-op

  // ---- install mocks
  const listeners: Record<string, Array<() => void>> = {};
  const store = new Map<string, string>();
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
  g.document = { hidden: false, addEventListener: (ev: string, cb: () => void) => { (listeners[ev] ??= []).push(cb); } };
  const created: MockCtx[] = [];
  g.window = {
    AudioContext: function () { const c = new MockCtx(); created.push(c); return c; },
    addEventListener: () => {}, removeEventListener: () => {},
  };
  const engine = await import('./engine');
  const music = await import('./music');

  await audio.unlock();
  eq(created.length, 1, 'exactly one AudioContext is created');
  await audio.unlock();
  eq(created.length, 1, 'unlock() twice still one AudioContext');
  const ctx = created[0];
  eq(ctx.state, 'running', 'unlock resumes the context');
  eq(mod.getAudioState(), 'running', 'state reports running');
  eq(mod.getNowPlaying(), 'battle', 'pre-unlock bgm request is applied after unlock');
  const e = engine.getEngine()!;
  ok(e.master.gain !== undefined, 'engine graph exists');
  audio.setVolume('sfx', 0.8);
  eq(store.has('pokestonks.audio.v1'), true, 'settings persisted to localStorage');
  eq(JSON.parse(store.get('pokestonks.audio.v1') as string).sfx, 0.8, 'persisted sfx volume value');

  // visibility: hiding suspends, showing resumes
  (g.document as { hidden: boolean }).hidden = true;
  listeners['visibilitychange']?.forEach((cb) => cb());
  await Promise.resolve();
  eq(ctx.state, 'suspended', 'hidden tab suspends the context');
  (g.document as { hidden: boolean }).hidden = false;
  listeners['visibilitychange']?.forEach((cb) => cb());
  await Promise.resolve();
  eq(ctx.state, 'running', 'visible tab resumes the context');

  // ---- music scheduling on the mock clock (battle already started deferred)
  const t0 = ctx.currentTime;
  const battle = getTrack('battle');
  const loopSec = battle.loopSeconds;
  const startedBefore = allOscs.length;
  ok(startedBefore > 0, 'battle scheduled its first notes on start');
  let now = t0;
  const endT = t0 + loopSec * 2 + 1;
  while (now < endT) { now += 0.025; advance(ctx, now); music._tickForTest(); }
  const starts = allSources.map((s) => s.startedAt).filter((x): x is number => x !== null);
  const first = Math.min(...starts);
  const inWin = (a: number, b: number) => starts.filter((s) => s >= a - 1e-9 && s < b - 1e-9).length;
  const l1 = inWin(first, first + loopSec);
  const l2 = inWin(first + loopSec, first + 2 * loopSec);
  ok(l1 > 500, `battle schedules many voices per loop (${l1})`);
  eq(l2, l1, 'loop 2 schedules exactly as many voices as loop 1 (seamless loop)');
  // note timing is exact against beat grid
  const spb = 60 / battle.bpm;
  const grid = starts.filter((s) => s < first + loopSec).every((s) => {
    const beats = (s - first) / spb;
    return Math.abs(beats * 4 - Math.round(beats * 4)) < 1e-6;
  });
  ok(grid, 'battle voices start exactly on the 16th-note grid');
  eq(mod.getNowPlaying(), 'battle', 'battle still playing');

  // requesting same track is a no-op (no new player bus)
  const gainsBefore = allGains.length;
  audio.bgm('battle');
  eq(allGains.length, gainsBefore, 'bgm(current) is a no-op');

  // ---- crossfade to overworld
  const oscBefore = allOscs.length;
  audio.bgm('overworld', { fadeMs: 400 });
  eq(mod.getNowPlaying(), 'overworld', 'crossfade switches now-playing immediately');
  ok(allOscs.length > oscBefore, 'new track schedules right away');
  const stopTarget = now + 0.4;
  while (now < stopTarget + 1) { now += 0.025; advance(ctx, now); music._tickForTest(); }
  const busGains = allGains.filter((gn) => gn.targets.includes(e.musicBus as unknown as MockNode));
  ok(busGains.length >= 2, 'per-track buses exist');
  const battleBus = busGains[0];
  eq(battleBus.disconnected, true, 'faded-out track bus is disconnected');
  eq(battleBus.gain.events[battleBus.gain.events.length - 1].v, 0, 'faded-out bus ramps to 0');

  // ---- one-shot victory ends by itself and clears now-playing
  audio.bgm('victory');
  eq(mod.getNowPlaying(), 'victory', 'victory starts');
  const vStart = now;
  const vic = getTrack('victory');
  let sawEnd = false;
  while (now < vStart + vic.loopSeconds + 3) {
    now += 0.025; advance(ctx, now); music._tickForTest();
    if (mod.getNowPlaying() === null) { sawEnd = true; break; }
  }
  ok(sawEnd, 'victory ends and now-playing returns to null');
  ok(now - vStart >= vic.loopSeconds, 'victory does not end before its last bar');
  ok(now - vStart < vic.loopSeconds + 2, 'victory ends shortly after its last note');
  // victory with loop:true loops instead
  audio.bgm('defeat', { loop: true });
  const dStart = now;
  while (now < dStart + getTrack('defeat').loopSeconds * 2 + 0.5) { now += 0.025; advance(ctx, now); music._tickForTest(); }
  eq(mod.getNowPlaying(), 'defeat', 'defeat with loop:true keeps playing past one pass');

  // ---- bgm(null) fades out
  audio.bgm(null, { fadeMs: 200 });
  eq(mod.getNowPlaying(), null, 'bgm(null) clears now-playing');
  const stopAt = now + 0.2 + 0.5;
  while (now < stopAt) { now += 0.025; advance(ctx, now); music._tickForTest(); }

  // every track: run one full loop on the mock, checking envelopes
  for (const name of EXPECTED_BGM) {
    const before = allGains.length;
    audio.bgm(name, { fadeMs: 20 });
    const t = getTrack(name);
    const until = now + t.loopSeconds + 1.5;
    while (now < until) { now += 0.025; advance(ctx, now); music._tickForTest(); }
    audio.bgm(null, { fadeMs: 20 });
    for (let i = 0; i < 40; i++) { now += 0.025; advance(ctx, now); music._tickForTest(); }
    const voiceGains = allGains.slice(before).filter((gn) => gn.targets.some((tg) => tg instanceof MockGain && tg.targets.includes(e.musicBus as unknown as MockNode)));
    ok(voiceGains.length > 20, `${name}: scheduled voices (${voiceGains.length})`);
    let bad = 0;
    for (const vg of voiceGains) {
      const ev = vg.gain.events;
      const peak = Math.max(...ev.map((x) => x.v));
      if (!(ev[0].v === 0 && ev[ev.length - 1].v === 0 && peak <= 0.25 + 1e-9)) bad++;
    }
    eq(bad, 0, `${name}: every music voice starts/ends at 0 and peaks <= 0.25`);
  }

  // ---- SFX: every effect on the real voices with the mock context
  const sfxBus = e.sfxBus as unknown as MockNode;
  for (const name of EXPECTED_SFX) {
    now += 1;
    advance(ctx, now);
    const gBefore = allGains.length;
    const srcBefore = allSources.length;
    audio.sfx(name);
    const newGains = allGains.slice(gBefore);
    const newSrc = allSources.slice(srcBefore);
    ok(newSrc.length >= 1, `sfx ${name} produced at least one voice`);
    ok(newSrc.every((s) => s.startedAt !== null && s.stopAt !== null && s.stopAt > s.startedAt), `sfx ${name}: every source is started and stopped`);
    // voice gains feed the sfx bus; the only other gains are vibrato LFO depth nodes (they feed an AudioParam)
    const voiceGains = newGains.filter((vg) => vg.targets.includes(sfxBus));
    const lfoGains = newGains.filter((vg) => !vg.targets.includes(sfxBus));
    ok(voiceGains.length >= 1, `sfx ${name}: has voices routed to the sfx bus`);
    ok(lfoGains.every((vg) => vg.targets.every((tg) => tg instanceof MockParam)), `sfx ${name}: non-bus gains are only LFO depth nodes`);
    for (const vg of voiceGains) checkGainEnvelope(vg, `sfx ${name}`);
    const lastStop = Math.max(...newSrc.map((s) => s.stopAt as number));
    ok(lastStop - now < 2.0, `sfx ${name}: total length ${(lastStop - now).toFixed(2)}s is reasonable`);
    // rate + volume variants must not throw and must scale
    audio.sfx(name, { rate: 1.5, volume: 0.5 });
    audio.sfx(name, { rate: 0.5 });
  }
  now += 10; advance(ctx, now);
  eq(engine.getActiveVoices(), 0, 'all sfx voices released their polyphony slots after ending');
  ok(allSources.filter((s) => s.stopAt !== null && s.stopAt <= now).every((s) => s.disconnected), 'every finished source was disconnected');

  // rate limiting: identical sfx inside minInterval is dropped
  now += 1; advance(ctx, now);
  const c0 = allSources.length;
  audio.sfx('dialog_blip'); audio.sfx('dialog_blip');
  const c1 = allSources.length;
  eq(c1 - c0, 1, 'dialog_blip: second call inside minInterval is dropped (1 voice)');
  now += 0.03; advance(ctx, now);
  audio.sfx('dialog_blip');
  eq(allSources.length - c1, 1, 'dialog_blip plays again after minInterval');
  // dialog_blip pitch varies call to call
  const freqs = new Set<number>();
  for (let i = 0; i < 12; i++) { now += 0.05; advance(ctx, now); audio.sfx('dialog_blip'); freqs.add(allOscs[allOscs.length - 1].frequency.events[0].v); }
  ok(freqs.size >= 4, `dialog_blip pitch varies (${freqs.size} distinct pitches in 12 calls)`);

  // polyphony cap: spam a big effect without letting time pass
  now += 5; advance(ctx, now);
  const before = allSources.length;
  for (let i = 0; i < 200; i++) { audio.sfx('encounter'); engine.acquireVoice(); }
  ok(engine.getActiveVoices() <= 40, `polyphony is capped (${engine.getActiveVoices()} <= 40)`);
  for (let i = 0; i < 60; i++) engine.releaseVoice();
  now += 20; advance(ctx, now);
  ok(allSources.length >= before, 'spamming did not throw');
  // drain the manual reservations (the loop above reserved slots directly)
  while (engine.getActiveVoices() > 0) engine.releaseVoice();

  // muted => no new voices
  audio.setMuted(true);
  now += 1; advance(ctx, now);
  const m0 = allSources.length;
  audio.sfx('hit');
  eq(allSources.length, m0, 'muted: sfx schedules nothing');
  audio.setMuted(false);

  // mute persisted + volume clamp persisted
  audio.setVolume('sfx', 5);
  eq(mod.getVolume('sfx'), 1, 'volume clamps to 1');
  audio.setVolume('music', -3);
  eq(mod.getVolume('music'), 0, 'volume clamps to 0');
  audio.setVolume('music', 0.5);
  audio.setVolume('sfx', 0.8);

  // lowHp: beeps immediately, repeats, and stops
  now += 1; advance(ctx, now);
  const h0 = allOscs.length;
  audio.lowHp(true);
  eq(allOscs.length - h0, 2, 'lowHp(true) beeps a two-note warning immediately');
  audio.lowHp(true);
  eq(allOscs.length - h0, 2, 'lowHp(true) twice does not double up');
  eq(mod.isLowHp(), true, 'lowHp active flag');
  audio.lowHp(false);
  eq(mod.isLowHp(), false, 'lowHp off');
}

async function main(): Promise<void> {
  testPure();
  testData();
  await testEngine();
  if (failures.length) {
    console.error(`\n${failures.length} FAILED of ${checks} checks`);
    process.exit(1);
  }
  console.log(`audio selftest OK: ${checks} checks passed`);
  console.log(`  sfx defined: ${SFX_NAMES.length}, tracks: ${BGM_NAMES.map((n) => `${n} ${getTrack(n).loopBeats}b/${getTrack(n).loopSeconds.toFixed(1)}s`).join(', ')}`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
