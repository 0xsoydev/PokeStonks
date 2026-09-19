import { formatUnits } from 'viem';

export type Address = `0x${string}`;

/** The tsconfig targets ES2017, where bigint literals (0n) are not allowed. */
export const ZERO = BigInt(0);

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ZERO_RE = /^0x0{40}$/;

/** True for a well-formed, non-zero EVM address. */
export function isRealAddress(v: unknown): v is Address {
  return typeof v === 'string' && ADDRESS_RE.test(v) && !ZERO_RE.test(v);
}

/** 0x1234...abcd */
export function shortAddress(address?: string | null, head = 4, tail = 4): string {
  if (!address) return '';
  if (address.length <= 2 + head + tail) return address;
  return `${address.slice(0, 2 + head)}…${address.slice(-tail)}`;
}

/**
 * Format an 18-decimal (or any) amount for humans: thousands separators, at most `maxFrac`
 * fractional digits, trailing zeros trimmed, tiny non-zero amounts shown as "<0.0001".
 */
export function formatAmount(value: bigint | null | undefined, decimals = 18, maxFrac = 4): string {
  if (value == null) return '–';
  if (value === ZERO) return '0';
  const raw = formatUnits(value, decimals);
  const [whole, frac = ''] = raw.split('.');
  const trimmedFrac = frac.slice(0, maxFrac).replace(/0+$/, '');
  if (whole === '0' && trimmedFrac === '') return `<${(10 ** -maxFrac).toFixed(maxFrac)}`;
  const wholeFmt = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return trimmedFrac ? `${wholeFmt}.${trimmedFrac}` : wholeFmt;
}

export const formatMon = (wei: bigint | null | undefined) => formatAmount(wei, 18, 3);

/**
 * `minted` on the claim wire is "a decimal string, 18 dp". Accept both a raw integer wei string
 * ("2500000000000000000") and an already-scaled decimal ("2.5").
 */
export function formatMintedString(minted: string | undefined | null, maxFrac = 4): string {
  if (!minted) return '0';
  const s = String(minted).trim();
  try {
    if (/^\d+$/.test(s)) return formatAmount(BigInt(s), 18, maxFrac);
    if (/^\d+\.\d+$/.test(s)) {
      const [w, f] = s.split('.');
      return formatAmount(BigInt(w + f.padEnd(18, '0').slice(0, 18)), 18, maxFrac);
    }
  } catch {
    /* fall through */
  }
  return s;
}

export function formatUsd(price: number | null | undefined): string {
  if (price == null || !Number.isFinite(price)) return '–';
  const digits = price >= 1000 ? 0 : 2;
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function formatPct(pct: number | null | undefined, digits = 1): string {
  if (pct == null || !Number.isFinite(pct)) return '–';
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sign}${Math.abs(pct).toFixed(digits)}%`;
}

/** Basis points (int16) to a signed percent string: 1000 -> "+10%", -1000 -> "−10%". */
export function formatBps(bps: number): string {
  const pct = bps / 100;
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sign}${Math.abs(pct)}%`;
}
