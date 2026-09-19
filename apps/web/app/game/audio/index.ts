/**
 * Public audio API: a WebAudio chiptune engine, fully synthesised (no samples, no network).
 * Everything is client-only; importing this module during SSR is safe (no window access at import
 * time beyond typeof guards) and every call degrades to silence if audio is unavailable/locked.
 *
 * Internals: engine.ts (context/buses/unlock), voices.ts (pulse/tri/noise voices), sfx.ts (26 effects),
 * sfxplayer.ts (dispatch + low-HP beep), music.ts (lookahead scheduler), tracks.ts + song_*.ts (data),
 * theory.ts (pure helpers).
 */
import {
  getEngine, getVolume as engineGetVolume, initEngineListeners, isMuted as engineIsMuted,
  onChange as engineOnChange, setMuted as engineSetMuted, setVolume as engineSetVolume, unlock as engineUnlock,
} from './engine';
import { getNowPlaying as musicNowPlaying, playBgm } from './music';
import { isLowHpOn, playSfx, setLowHp } from './sfxplayer';

export type SfxName =
  | 'menu_move' | 'menu_select' | 'menu_back' | 'tap_tick' | 'tap_perfect' | 'tap_good' | 'tap_miss'
  | 'hit' | 'hit_super' | 'hit_resist' | 'crit' | 'miss' | 'stat_up' | 'stat_down' | 'faint' | 'levelup'
  | 'encounter' | 'step_grass' | 'heal' | 'win' | 'lose' | 'claim' | 'error' | 'bump' | 'door' | 'dialog_blip';

export type BgmName = 'title' | 'overworld' | 'battle' | 'victory' | 'defeat';

export interface AudioApi {
  /** Call from a user gesture (first click/tap/key). Safe to call repeatedly. */
  unlock(): Promise<void>;
  sfx(name: SfxName, opts?: { rate?: number; volume?: number }): void;
  /** Crossfades to the named loop; null stops music. Re-requesting the current track is a no-op. */
  bgm(name: BgmName | null, opts?: { fadeMs?: number; loop?: boolean }): void;
  /** Looping low-HP warning beep. */
  lowHp(on: boolean): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  setVolume(kind: 'music' | 'sfx', v: number): void;
  onChange(cb: () => void): () => void;
}

// One-time auto-unlock listeners (pointerdown / keydown / touchend). No-op on the server.
initEngineListeners();

export const audio: AudioApi = {
  unlock: () => engineUnlock(),
  sfx: (name, opts) => playSfx(name, opts),
  bgm: (name, opts) => playBgm(name, opts),
  lowHp: (on) => setLowHp(on),
  setMuted: (m) => engineSetMuted(m),
  isMuted: () => engineIsMuted(),
  setVolume: (kind, v) => engineSetVolume(kind, v),
  onChange: (cb) => engineOnChange(cb),
};

/* ---- extras beyond the contract (used by /dev/audio; safe for the HUD too) ---- */

/** Current music track name, or null when silent / finished. */
export function getNowPlaying(): BgmName | null {
  return musicNowPlaying();
}

export function getVolume(kind: 'music' | 'sfx'): number {
  return engineGetVolume(kind);
}

export function isLowHp(): boolean {
  return isLowHpOn();
}

/** 'unavailable' (no WebAudio), 'locked' (no gesture yet / suspended) or 'running'. */
export function getAudioState(): 'unavailable' | 'locked' | 'running' {
  if (typeof window === 'undefined') return 'unavailable';
  const e = getEngine();
  if (!e) return 'unavailable';
  return e.ctx.state === 'running' ? 'running' : 'locked';
}
