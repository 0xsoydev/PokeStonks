import { createPublicClient, http, type PublicClient } from 'viem';
import { monadTestnet, RPC_URL } from './chains';

let client: PublicClient | null = null;

/**
 * Shared read-only client. Lazy so nothing is constructed during SSR unless a read actually runs.
 * Requests batch through Multicall3 (deployed on Monad testnet) and fail fast: 8s timeout, 2 retries.
 */
export function getPublicClient(): PublicClient {
  if (!client) {
    client = createPublicClient({
      chain: monadTestnet,
      transport: http(RPC_URL, { timeout: 8_000, retryCount: 2, retryDelay: 400 }),
      batch: { multicall: { wait: 16 } },
    }) as PublicClient;
  }
  return client;
}
