import { getAccount, readContract, switchChain, waitForTransactionReceipt, writeContract } from 'wagmi/actions';
import { parseEventLogs, BaseError, UserRejectedRequestError, type Hex } from 'viem';
import { arenaAbi } from 'contracts-abi';
import type { ClaimStatus, ClaimVoucher } from 'game-core';
import { wagmiConfig } from './wagmi';
import { requireWallet } from './connectDialog';

const pythFeeAbi = [
  { type: 'function', name: 'getUpdateFee', stateMutability: 'view', inputs: [{ name: 'updateData', type: 'bytes[]' }], outputs: [{ name: 'feeAmount', type: 'uint256' }] },
] as const;

export interface VoucherSource {
  voucherFor(to: string): Promise<{ voucher: ClaimVoucher } | { error: string }>;
}

function explain(e: unknown): string {
  if (e instanceof BaseError && e.walk((x) => x instanceof UserRejectedRequestError)) {
    return 'You closed the wallet request. Press Claim to try again.';
  }
  const m = e instanceof BaseError ? `${e.shortMessage} ${e.details ?? ''}` : e instanceof Error ? e.message : String(e);
  if (/user rejected|user denied|rejected the request/i.test(m)) return 'You closed the wallet request. Press Claim to try again.';
  if (/insufficient funds|exceeds the balance|gas required exceeds/i.test(m)) {
    return 'Your wallet needs a little MON on Monad testnet to pay the network fee. Get some at faucet.monad.xyz.';
  }
  if (/AlreadyClaimed/.test(m)) return 'This reward was already claimed.';
  if (/VoucherExpired/.test(m)) return 'This reward voucher expired. Win another battle to earn a new one.';
  if (/chain|network/i.test(m) && /switch|unrecognized|not configured|mismatch/i.test(m)) {
    return 'Switch your wallet to Monad Testnet (chain 10143) and press Claim again.';
  }
  return (e instanceof BaseError ? e.shortMessage : m).slice(0, 180);
}

/**
 * Claim a battle reward with the player's own wallet:
 * connect (if needed) → server signs a voucher for this wallet → switch to Monad testnet →
 * wallet popup for BattleArena.claim (player pays gas in MON) → wait for the receipt.
 * Streams progress to `onStatus`; never throws.
 */
export async function claimWithWallet(source: VoucherSource, onStatus: (s: ClaimStatus) => void): Promise<ClaimStatus> {
  const finish = (s: ClaimStatus) => { onStatus(s); return s; };
  try {
    const to = await requireWallet('Connect the wallet that should receive your reward. It needs a little MON for the network fee.');
    if (!to) return finish({ state: 'failed', error: 'Connect a wallet to claim your reward.' });

    onStatus({ state: 'signing' });
    const r = await source.voucherFor(to);
    if ('error' in r) return finish({ state: 'ineligible', error: r.error });
    const v = r.voucher;

    if (getAccount(wagmiConfig).chainId !== v.chainId) {
      await switchChain(wagmiConfig, { chainId: v.chainId as typeof wagmiConfig.chains[number]['id'] });
    }

    // Push the fresh Pyth price with the claim when we can pay for it; otherwise claim without it
    // (the arena then uses whatever price Pyth already stores, or no bonus).
    let priceUpdate = v.priceUpdate as Hex[];
    let value = BigInt(0);
    if (priceUpdate.length) {
      try {
        value = await readContract(wagmiConfig, { address: v.pyth as Hex, abi: pythFeeAbi, functionName: 'getUpdateFee', args: [priceUpdate] });
      } catch {
        priceUpdate = [];
      }
    }

    const c = v.claim;
    onStatus({ state: 'wallet' });
    const hash = await writeContract(wagmiConfig, {
      address: v.arena as Hex,
      abi: arenaAbi,
      functionName: 'claim',
      chainId: v.chainId as typeof wagmiConfig.chains[number]['id'],
      value,
      args: [
        {
          winner: c.winner as Hex,
          loser: c.loser as Hex,
          roomId: c.roomId as Hex,
          ticker: c.ticker as Hex,
          baseAmount: BigInt(c.baseAmount),
          captureSpeciesId: c.captureSpeciesId,
          captureLevel: c.captureLevel,
          deadline: BigInt(c.deadline),
        },
        v.sig as Hex,
        priceUpdate,
      ],
    });
    onStatus({ state: 'submitted', txHash: hash });

    const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: v.chainId as typeof wagmiConfig.chains[number]['id'], timeout: 90_000 });
    if (receipt.status !== 'success') return finish({ state: 'failed', txHash: hash, error: 'The claim transaction reverted on-chain.' });
    const ev = parseEventLogs({ abi: arenaAbi, logs: receipt.logs, eventName: 'Claimed' })[0]?.args as
      | { minted?: bigint; buffBps?: number; nftId?: bigint }
      | undefined;
    return finish({
      state: 'confirmed',
      txHash: hash,
      minted: ev?.minted?.toString(),
      buffBps: ev?.buffBps !== undefined ? Number(ev.buffBps) : undefined,
      nftId: ev?.nftId && ev.nftId > BigInt(0) ? ev.nftId.toString() : undefined,
    });
  } catch (e) {
    return finish({ state: 'failed', error: explain(e) });
  }
}
