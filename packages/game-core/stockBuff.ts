/** Deviation of spot from EMA (in %) beyond which the mood buff/drag kicks in. */
export const BUFF_THRESHOLD_PCT = 2;

export type Mood = 'bull' | 'bear' | 'flat';

/** pct = how far spot is above (+) or below (-) its EMA, in percent. */
export function stockBuff(pct: number): number {
  if (pct > BUFF_THRESHOLD_PCT) return 1.1;
  if (pct < -BUFF_THRESHOLD_PCT) return 0.9;
  return 1.0;
}

export const stockBuffFromPct = stockBuff;

export function moodOf(buff: number): Mood {
  return buff > 1 ? 'bull' : buff < 1 ? 'bear' : 'flat';
}

/**
 * Spot-vs-EMA deviation from a Pyth price + ema_price pair (same exponent, integer strings ok).
 * Mirrors BattleArena._buffBps on-chain so client, server and contract agree.
 */
export function deviationPct(spot: number, ema: number): number {
  if (!Number.isFinite(spot) || !Number.isFinite(ema) || ema <= 0) return 0;
  return ((spot - ema) / ema) * 100;
}

export function buffFromSpotEma(spot: number, ema: number): { buff: number; pct: number; mood: Mood } {
  const pct = deviationPct(spot, ema);
  const buff = stockBuff(pct);
  return { buff, pct, mood: moodOf(buff) };
}
