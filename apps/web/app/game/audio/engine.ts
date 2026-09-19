/**
 * Audio engine core: one lazily created AudioContext, master -> compressor -> destination,
 * separate music and sfx buses, persisted mute/volumes, unlock handling, tab-visibility suspend.
 * Everything is client-only and degrades to silence: every accessor returns null when unavailable.
 */
import { clamp } from './theory';

export interface Engine {
  ctx: AudioContext;
  master: GainNode;
  compressor: DynamicsCompressorNode;
  musicBus: GainNode;
  sfxBus: GainNode;
}

interface Persisted { muted: boolean; music: number; sfx: number }

const STORAGE_KEY = 'pokestonks.audio.v1';
const DEFAULTS: Persisted = { muted: false, music: 0.5, sfx: 0.8 };

let engine: Engine | null = null;
let failed = false;
let unlocked = false;
let hidden = false;
const state: Persisted = loadState();
const changeListeners = new Set<() => void>();
const unlockListeners = new Set<() => void>();
let listenersAttached = false;

function hasWindow(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function loadState(): Persisted {
  const s = { ...DEFAULTS };
  try {
    if (typeof localStorage === 'undefined') return s;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return s;
    const p = JSON.parse(raw) as Partial<Persisted>;
    if (typeof p.muted === 'boolean') s.muted = p.muted;
    if (typeof p.music === 'number' && Number.isFinite(p.music)) s.music = clamp(p.music, 0, 1);
    if (typeof p.sfx === 'number' && Number.isFinite(p.sfx)) s.sfx = clamp(p.sfx, 0, 1);
  } catch {
    /* storage unavailable or corrupt: use defaults */
  }
  return s;
}

function saveState(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function emitChange(): void {
  for (const cb of Array.from(changeListeners)) {
    try { cb(); } catch { /* listener errors must not break audio */ }
  }
}

/** Create the context + bus graph on first use. Returns null if WebAudio is unavailable. */
export function getEngine(): Engine | null {
  if (engine) return engine;
  if (failed || !hasWindow()) return null;
  try {
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) { failed = true; return null; }
    const ctx = new Ctor({ latencyHint: 'interactive' });
    const master = ctx.createGain();
    master.gain.value = state.muted ? 0 : 1;
    const compressor = ctx.createDynamicsCompressor();
    // Gentle glue/limiter: catches the summed peaks of layered SFX + music.
    compressor.threshold.value = -14;
    compressor.knee.value = 12;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.2;
    const musicBus = ctx.createGain();
    const sfxBus = ctx.createGain();
    musicBus.gain.value = state.music;
    sfxBus.gain.value = state.sfx;
    musicBus.connect(master);
    sfxBus.connect(master);
    master.connect(compressor);
    compressor.connect(ctx.destination);
    engine = { ctx, master, compressor, musicBus, sfxBus };
    attachVisibility();
    return engine;
  } catch {
    failed = true;
    return null;
  }
}

/** The engine only if it already exists (never creates one). */
export function peekEngine(): Engine | null {
  return engine;
}

/** True once a user gesture has resumed the context at least once. */
export function isUnlocked(): boolean {
  return unlocked && engine !== null && engine.ctx.state === 'running';
}

/** True once a user gesture has ever unlocked the context (even if it is currently suspended). */
export function hasUnlocked(): boolean {
  return unlocked;
}

/** True if the context exists and is actually running right now. */
export function isRunning(): boolean {
  return engine !== null && engine.ctx.state === 'running';
}

export async function unlock(): Promise<void> {
  const e = getEngine();
  if (!e) return;
  try {
    if (!hidden && e.ctx.state !== 'running') await e.ctx.resume();
    if (e.ctx.state === 'running') {
      if (!unlocked) {
        unlocked = true;
        detachUnlockListeners();
        for (const cb of Array.from(unlockListeners)) {
          try { cb(); } catch { /* ignore */ }
        }
      }
    }
  } catch {
    /* resume can reject without a gesture; stay silent */
  }
}

/** Register a callback fired once the context first becomes usable (after a gesture). */
export function onUnlocked(cb: () => void): () => void {
  unlockListeners.add(cb);
  return () => { unlockListeners.delete(cb); };
}

function onGesture(): void {
  void unlock();
}

function detachUnlockListeners(): void {
  if (!hasWindow() || !listenersAttached) return;
  window.removeEventListener('pointerdown', onGesture, true);
  window.removeEventListener('keydown', onGesture, true);
  window.removeEventListener('touchend', onGesture, true);
  listenersAttached = false;
}

/** Attach one-time gesture listeners that unlock audio. Safe to call repeatedly. */
export function attachUnlockListeners(): void {
  if (!hasWindow() || listenersAttached || unlocked) return;
  listenersAttached = true;
  window.addEventListener('pointerdown', onGesture, true);
  window.addEventListener('keydown', onGesture, true);
  window.addEventListener('touchend', onGesture, true);
}

let visibilityAttached = false;
function attachVisibility(): void {
  if (visibilityAttached || !hasWindow()) return;
  visibilityAttached = true;
  hidden = document.hidden;
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    const e = engine;
    if (!e) return;
    try {
      if (hidden) {
        void e.ctx.suspend().catch(() => {});
      } else if (unlocked) {
        void e.ctx.resume().catch(() => {});
      }
    } catch { /* ignore */ }
  });
}

/* ---------- state: mute / volumes ---------- */

export function isMuted(): boolean {
  return state.muted;
}

export function getVolume(kind: 'music' | 'sfx'): number {
  return kind === 'music' ? state.music : state.sfx;
}

function ramp(param: AudioParam, ctx: AudioContext, value: number, tc = 0.03): void {
  try {
    param.cancelScheduledValues(ctx.currentTime);
    param.setTargetAtTime(value, ctx.currentTime, tc);
  } catch { /* ignore */ }
}

export function setMuted(m: boolean): void {
  if (state.muted === m) return;
  state.muted = m;
  saveState();
  if (engine) ramp(engine.master.gain, engine.ctx, m ? 0 : 1, 0.02);
  emitChange();
}

export function setVolume(kind: 'music' | 'sfx', v: number): void {
  const val = clamp(Number.isFinite(v) ? v : 0, 0, 1);
  if (kind === 'music') state.music = val; else state.sfx = val;
  saveState();
  if (engine) ramp((kind === 'music' ? engine.musicBus : engine.sfxBus).gain, engine.ctx, val, 0.02);
  emitChange();
}

export function onChange(cb: () => void): () => void {
  changeListeners.add(cb);
  return () => { changeListeners.delete(cb); };
}

/** Notify UI that something else changed (e.g. now-playing track). */
export function notifyChange(): void {
  emitChange();
}

/* ---------- polyphony accounting for one-shot voices ---------- */

const MAX_SFX_VOICES = 40;
let activeVoices = 0;

/** Reserve a voice slot. Returns false if the polyphony cap is hit (caller should skip the voice). */
export function acquireVoice(): boolean {
  if (activeVoices >= MAX_SFX_VOICES) return false;
  activeVoices++;
  return true;
}

/** Currently reserved one-shot voices (diagnostics / tests). */
export function getActiveVoices(): number {
  return activeVoices;
}

export function releaseVoice(): void {
  if (activeVoices > 0) activeVoices--;
}

/* ---------- shared noise buffer ---------- */

let noiseBuf: AudioBuffer | null = null;

/** ~1s of white noise, shared by every noise voice (created once per context). */
export function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const len = Math.floor(ctx.sampleRate);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // Deterministic LFSR-flavoured noise (xorshift) so every run sounds the same.
  let x = 0x1234567;
  for (let i = 0; i < len; i++) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    d[i] = ((x >>> 0) / 0xffffffff) * 2 - 1;
  }
  noiseBuf = buf;
  return buf;
}

/** Shared "metallic" short-loop noise buffer (few samples repeated = pitched, LFSR short-mode feel). */
let metalBuf: AudioBuffer | null = null;
export function getMetalNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (metalBuf && metalBuf.sampleRate === ctx.sampleRate) return metalBuf;
  const len = 93; // odd short period, like the NES 93-step LFSR mode
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let x = 0x9e3779b;
  for (let i = 0; i < len; i++) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    d[i] = (x & 1) ? 1 : -1;
  }
  metalBuf = buf;
  return buf;
}

/** Wire up gesture listeners at import time on the client. No-op on the server. */
export function initEngineListeners(): void {
  attachUnlockListeners();
}
