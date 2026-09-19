import { SPECIES_LIST } from 'game-core';
import { arenaAbi, brokerMonAbi, syntheticStockAbi, deployments, tickerToBytes32 } from 'contracts-abi';
import { getPublicClient } from './client';
import { isRealAddress, ZERO, type Address } from './format';

/**
 * Typed, failure-tolerant chain reads. Every helper accepts missing (undeployed) addresses and RPC
 * errors: the "nothing there" answer is an empty value, never a throw, unless documented otherwise.
 */

export const TICKERS: string[] = SPECIES_LIST.map((s) => s.ticker);

export interface ChainAddresses {
  arena: Address | null;
  brokerMon: Address | null;
  /** ticker -> sTICKER token address (only the deployed ones). */
  tokens: Record<string, Address>;
}

export function getAddresses(): ChainAddresses {
  const envArena = process.env.NEXT_PUBLIC_ARENA_ADDRESS;
  const envMon = process.env.NEXT_PUBLIC_BROKERMON_ADDRESS;
  const tokens: Record<string, Address> = {};
  for (const [sym, addr] of Object.entries(deployments.tokens ?? {})) {
    if (isRealAddress(addr)) tokens[sym.toUpperCase()] = addr;
  }
  return {
    arena: isRealAddress(envArena) ? envArena : isRealAddress(deployments.arena) ? deployments.arena : null,
    brokerMon: isRealAddress(envMon) ? envMon : isRealAddress(deployments.brokerMon) ? deployments.brokerMon : null,
    tokens,
  };
}

/** True when at least the NFT contract or one token contract is configured. */
export function contractsConfigured(): boolean {
  const a = getAddresses();
  return !!(a.arena || a.brokerMon || Object.keys(a.tokens).length);
}

export type WalletPart = 'mon' | 'sstock' | 'nfts';

export interface WalletData {
  /** Native MON balance in wei. */
  mon: bigint;
  /** ticker -> sTICKER balance (18 dp). Every one of the 12 tickers is present. */
  sstock: Record<string, bigint>;
  /** Token ids of owned BrokerMon, newest first. */
  nftIds: bigint[];
  /** Parts whose read failed. Their values above are placeholders; callers should keep old data. */
  failed: WalletPart[];
}

const MAX_NFTS = 60;
const nftIdCache = new Map<string, { balance: bigint; ids: bigint[] }>();

async function readMon(address: Address): Promise<bigint> {
  return getPublicClient().getBalance({ address });
}

async function readSstock(address: Address): Promise<Record<string, bigint>> {
  const { tokens } = getAddresses();
  const out: Record<string, bigint> = Object.fromEntries(TICKERS.map((t) => [t, ZERO]));
  const entries = Object.entries(tokens).filter(([sym]) => sym in out);
  if (!entries.length) return out;
  const res = await getPublicClient().multicall({
    allowFailure: true,
    contracts: entries.map(([, token]) => ({
      address: token,
      abi: syntheticStockAbi,
      functionName: 'balanceOf' as const,
      args: [address] as const,
    })),
  });
  const failures = res.filter((r) => r.status === 'failure').length;
  if (failures === res.length) throw new Error('sSTOCK balance reads failed');
  res.forEach((r, i) => {
    if (r.status === 'success') out[entries[i][0]] = r.result as bigint;
  });
  return out;
}

async function readNftIds(owner: Address): Promise<bigint[]> {
  const { brokerMon } = getAddresses();
  if (!brokerMon) return [];
  const client = getPublicClient();
  const balance = await client.readContract({
    address: brokerMon,
    abi: brokerMonAbi,
    functionName: 'balanceOf',
    args: [owner],
  });
  const cacheKey = `${brokerMon}:${owner}`;
  const cached = nftIdCache.get(cacheKey);
  if (cached && cached.balance === balance) return cached.ids;
  const n = Math.min(Number(balance), MAX_NFTS);
  if (n === 0) {
    nftIdCache.set(cacheKey, { balance, ids: [] });
    return [];
  }
  const res = await client.multicall({
    allowFailure: true,
    contracts: Array.from({ length: n }, (_, i) => ({
      address: brokerMon,
      abi: brokerMonAbi,
      functionName: 'tokenOfOwnerByIndex' as const,
      args: [owner, BigInt(i)] as const,
    })),
  });
  const ids = res
    .flatMap((r) => (r.status === 'success' ? [r.result as bigint] : []))
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  if (ids.length === n) nftIdCache.set(cacheKey, { balance, ids });
  return ids;
}

/** MON + sSTOCK balances + owned BrokerMon ids. Never throws: failed parts are listed in `failed`. */
export async function readWalletData(address: Address): Promise<WalletData> {
  const [mon, sstock, nfts] = await Promise.allSettled([readMon(address), readSstock(address), readNftIds(address)]);
  const failed: WalletPart[] = [];
  if (mon.status === 'rejected') failed.push('mon');
  if (sstock.status === 'rejected') failed.push('sstock');
  if (nfts.status === 'rejected') failed.push('nfts');
  return {
    mon: mon.status === 'fulfilled' ? mon.value : ZERO,
    sstock: sstock.status === 'fulfilled' ? sstock.value : Object.fromEntries(TICKERS.map((t) => [t, ZERO])),
    nftIds: nfts.status === 'fulfilled' ? nfts.value : [],
    failed,
  };
}

/* ------------------------------------------------------------------ NFTs */

export interface NftAttribute {
  trait: string;
  value: string;
}

export interface NftView {
  id: bigint;
  name: string;
  description: string;
  /** A `data:image/...` URL that is safe to use as <img src>, or null when absent/unsupported. */
  image: string | null;
  attributes: NftAttribute[];
}

const nftCache = new Map<string, NftView>();
const nftInflight = new Map<string, Promise<NftView | null>>();

function base64ToUtf8(b64: string): string {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Decode a `data:<mime>[;base64],<payload>` URI into text. Returns null for anything else. */
export function decodeDataUri(uri: string): { mime: string; text: string } | null {
  const m = /^data:([^;,]+)((?:;[^,]*)?),([\s\S]*)$/.exec(uri.trim());
  if (!m) return null;
  const [, mime, params, payload] = m;
  try {
    const text = params.includes('base64') ? base64ToUtf8(payload) : decodeURIComponent(payload);
    return { mime: mime.toLowerCase(), text };
  } catch {
    return null;
  }
}

const SAFE_IMAGE_RE = /^data:image\/(svg\+xml|png|webp|gif|jpeg)[;,]/i;

/** Parse the on-chain tokenURI document. Exported for tests. */
export function parseTokenUri(id: bigint, uri: string): NftView | null {
  const doc = decodeDataUri(uri);
  if (!doc) return null;
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(doc.text) as Record<string, unknown>;
  } catch {
    return null;
  }
  const rawImage = typeof json.image === 'string' ? json.image : typeof json.image_data === 'string' ? json.image_data : '';
  let image: string | null = null;
  if (SAFE_IMAGE_RE.test(rawImage)) image = rawImage;
  else if (/^\s*<svg[\s>]/i.test(rawImage)) image = `data:image/svg+xml;utf8,${encodeURIComponent(rawImage)}`;
  const attrs = Array.isArray(json.attributes) ? (json.attributes as Array<Record<string, unknown>>) : [];
  return {
    id,
    name: typeof json.name === 'string' ? json.name : `BrokerMon #${id}`,
    description: typeof json.description === 'string' ? json.description : '',
    image,
    attributes: attrs
      .filter((a) => a && (typeof a.trait_type === 'string' || typeof a.trait_type === 'number'))
      .map((a) => ({ trait: String(a.trait_type), value: String(a.value ?? '') })),
  };
}

/** Read and decode one BrokerMon. Returns null if the contract is undeployed or the read fails. */
export function readNft(id: bigint | string | number): Promise<NftView | null> {
  const tokenId = BigInt(id);
  const key = tokenId.toString();
  const hit = nftCache.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = nftInflight.get(key);
  if (pending) return pending;
  const { brokerMon } = getAddresses();
  if (!brokerMon) return Promise.resolve(null);
  const p = (async () => {
    try {
      const uri = await getPublicClient().readContract({
        address: brokerMon,
        abi: brokerMonAbi,
        functionName: 'tokenURI',
        args: [tokenId],
      });
      const view = parseTokenUri(tokenId, uri);
      if (view) nftCache.set(key, view);
      return view;
    } catch {
      return null;
    } finally {
      nftInflight.delete(key);
    }
  })();
  nftInflight.set(key, p);
  return p;
}

/* ------------------------------------------------------------ Arena reads */

export interface OnchainRecord {
  wins: bigint;
  losses: bigint;
  totalMinted: bigint;
}

/** BattleArena W/L record and lifetime minted amount. Null when the arena is undeployed or unreachable. */
export async function readRecord(address: Address): Promise<OnchainRecord | null> {
  const { arena } = getAddresses();
  if (!arena) return null;
  try {
    const [wins, losses, totalMinted] = await getPublicClient().multicall({
      allowFailure: false,
      contracts: [
        { address: arena, abi: arenaAbi, functionName: 'wins', args: [address] },
        { address: arena, abi: arenaAbi, functionName: 'losses', args: [address] },
        { address: arena, abi: arenaAbi, functionName: 'totalMinted', args: [address] },
      ] as const,
    });
    return { wins: BigInt(wins), losses: BigInt(losses), totalMinted: BigInt(totalMinted) };
  } catch {
    return null;
  }
}

export interface BuffPreview {
  /** Signed basis points: +1000 bull, -1000 bear, 0 flat. */
  buffBps: number;
  /** True when the on-chain Pyth price is too old to apply a buff. */
  stale: boolean;
}

/** BattleArena.previewBuff for a ticker. Null when the arena is undeployed or unreachable. */
export async function previewBuff(symbol: string): Promise<BuffPreview | null> {
  const { arena } = getAddresses();
  if (!arena) return null;
  try {
    const [buffBps, stale] = await getPublicClient().readContract({
      address: arena,
      abi: arenaAbi,
      functionName: 'previewBuff',
      args: [tickerToBytes32(symbol)],
    });
    return { buffBps: Number(buffBps), stale };
  } catch {
    return null;
  }
}
