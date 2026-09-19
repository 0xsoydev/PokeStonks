import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const hex32 = z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/);
const addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

const Env = z.object({
  PORT: z.coerce.number().int().default(2567),
  ALLOWED_ORIGINS: z.string().optional(),
  RPC_URL: z.string().url().default('https://testnet-rpc.monad.xyz'),
  CHAIN_ID: z.coerce.number().int().default(10143),
  HERMES_URL: z.string().url().default('https://hermes.pyth.network'),
  PYTH_ADDRESS: addr.default('0x2880aB155794e7179c9eE2e38200202908C17B43'),
  ARENA_ADDRESS: addr.optional(),
  CLAIM_SIGNER_PRIVATE_KEY: hex32.optional(),
  RELAYER_PRIVATE_KEY: hex32.optional(),
  /** Test/ops override for the queue → bot timeout. */
  QUEUE_BOT_MS: z.coerce.number().int().min(0).optional(),
  REWARD_HUMAN_WEI: z.string().regex(/^\d+$/).default('100000000000000000'), // 0.10 sSTOCK
  REWARD_BOT_WEI: z.string().regex(/^\d+$/).default('20000000000000000'),    // 0.02 sSTOCK
  MAX_CLAIMS_PER_HOUR: z.coerce.number().int().default(12),
  /** Grace period a dropped player has to reconnect before forfeiting. */
  RECONNECT_SECONDS: z.coerce.number().int().min(1).default(30),
  /** Test-only: compress waits (intro, bot think time, animation waits). Never set in production. */
  FAST_TIMING: z.enum(['0', '1']).default('0'),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid server environment:\n', parsed.error.issues.map((i) => ` - ${i.path.join('.')}: ${i.message}`).join('\n'));
  process.exit(1);
}
const env = parsed.data;

function deployedArena(): `0x${string}` | undefined {
  if (env.ARENA_ADDRESS) return env.ARENA_ADDRESS as `0x${string}`;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const p = resolve(here, '../../../packages/contracts-abi/deployments.json');
    if (!existsSync(p)) return undefined;
    const a = JSON.parse(readFileSync(p, 'utf8'))?.arena;
    return typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a) ? (a as `0x${string}`) : undefined;
  } catch {
    return undefined;
  }
}

const norm = (k?: string) => (k ? ((k.startsWith('0x') ? k : `0x${k}`) as `0x${string}`) : undefined);

export const config = {
  port: env.PORT,
  allowedOrigins: env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [],
  rpcUrl: env.RPC_URL,
  chainId: env.CHAIN_ID,
  hermesUrl: env.HERMES_URL.replace(/\/$/, ''),
  pythAddress: env.PYTH_ADDRESS as `0x${string}`,
  arenaAddress: deployedArena(),
  signerKey: norm(env.CLAIM_SIGNER_PRIVATE_KEY),
  relayerKey: norm(env.RELAYER_PRIVATE_KEY) ?? norm(env.CLAIM_SIGNER_PRIVATE_KEY),
  queueBotMs: env.QUEUE_BOT_MS,
  rewardHumanWei: BigInt(env.REWARD_HUMAN_WEI),
  rewardBotWei: BigInt(env.REWARD_BOT_WEI),
  maxClaimsPerHour: env.MAX_CLAIMS_PER_HOUR,
  reconnectSeconds: env.RECONNECT_SECONDS,
  fastTiming: env.FAST_TIMING === '1',
};

export type Config = typeof config;
