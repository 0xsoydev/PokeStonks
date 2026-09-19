/**
 * SFX dispatch: rate limiting, mute/lock guards, and the looping low-HP warning beep.
 */
import type { SfxName } from './index';
import { getEngine, hasUnlocked, isMuted } from './engine';
import { SFX } from './sfx';
import { tone } from './voices';
import { clamp } from './theory';

const lastPlayed: Partial<Record<SfxName, number>> = {};

export function playSfx(name: SfxName, opts?: { rate?: number; volume?: number }): void {
  if (isMuted() || !hasUnlocked()) return;
  const e = getEngine();
  if (!e || e.ctx.state !== 'running') return;
  const def = SFX[name];
  if (!def) return;
  const now = e.ctx.currentTime;
  const last = lastPlayed[name];
  if (last !== undefined && now - last < def.minInterval) return;
  lastPlayed[name] = now;
  const rate = clamp(Number.isFinite(opts?.rate) ? (opts?.rate as number) : 1, 0.25, 4);
  const vol = clamp(Number.isFinite(opts?.volume) ? (opts?.volume as number) : 1, 0, 2);
  try {
    def.play({ ctx: e.ctx, dest: e.sfxBus, t: now + 0.005, rate, vol });
  } catch {
    /* a broken effect must never take the game down */
  }
}

let lowHpTimer: ReturnType<typeof setInterval> | null = null;
const LOW_HP_PERIOD_MS = 1100;

function lowHpBeep(): void {
  if (isMuted() || !hasUnlocked()) return;
  const e = getEngine();
  if (!e || e.ctx.state !== 'running') return;
  const t = e.ctx.currentTime + 0.01;
  // subtle two-note "pip-pop" on the sfx bus, deliberately quiet
  tone(e.ctx, e.sfxBus, { wave: 'p25', midi: 84, t, dur: 0.06, r: 0.03, gain: 0.07 });
  tone(e.ctx, e.sfxBus, { wave: 'p25', midi: 79, t: t + 0.14, dur: 0.07, r: 0.05, gain: 0.07 });
}

export function setLowHp(on: boolean): void {
  if (on) {
    if (lowHpTimer !== null) return;
    lowHpBeep();
    lowHpTimer = setInterval(lowHpBeep, LOW_HP_PERIOD_MS);
  } else if (lowHpTimer !== null) {
    clearInterval(lowHpTimer);
    lowHpTimer = null;
  }
}

export function isLowHpOn(): boolean {
  return lowHpTimer !== null;
}
