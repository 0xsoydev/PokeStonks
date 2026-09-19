export function stockBuff(dailyPercentChange: number): number {
  if (dailyPercentChange > 2) return 1.1;
  if (dailyPercentChange < -2) return 0.9;
  return 1.0;
}
