import {
  createPublicClient, createWalletClient, http, defineChain, keccak256, toBytes, parseEventLogs,
  type Address, type Hex, type PublicClient, type WalletClient,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { nonceManager } from 'viem/nonce';
import { arenaAbi, arenaEip712Domain, claimEip712Types, claimEip712PrimaryType, tickerToBytes32 } from 'contracts-abi';
import type { ClaimStatus } from 'game-core';
import { config } from '../config.ts';
import type { PriceService } from './prices.ts';

export interface ClaimRequest {
  roomId: string;
  /** Stable per-room nonce so a restart can't reuse a room id. */
  roomStamp: number;
  winner: Address;
  loser?: Address;
  /** Prize ticker (the loser's stock), e.g. "TSLA". */
  ticker: string;
  /** Species id of the prize (drives the Pyth feed for the on-chain buff). */
  prizeSpeciesId: string;
  /** Human-vs-human wins pay full and capture an NFT; bot wins pay a token amount only. */
  humanFoe: boolean;
  /** BrokerMonNFT species number to mint for the winner (0 = none). */
  captureSpeciesNum: number;
  level: number;
}

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
});

const pythAbi = [
  { type: 'function', name: 'getUpdateFee', stateMutability: 'view', inputs: [{ name: 'updateData', type: 'bytes[]' }], outputs: [{ name: 'feeAmount', type: 'uint256' }] },
] as const;

/**
 * Relays reward vouchers on-chain so players never sign or pay gas.
 *  1. server signs an EIP-712 `Claim` voucher (the contract trusts only this signer),
 *  2. server fetches a fresh signed Pyth blob and submits `BattleArena.claim` from its relayer,
 *  3. streams status back. Idempotent per room; rate-limited per wallet.
 */
export class ClaimService {
  readonly enabled: boolean;
  private readonly pub?: PublicClient;
  private readonly wallet?: WalletClient;
  private readonly signer?: PrivateKeyAccount;
  private readonly relayer?: PrivateKeyAccount;
  private readonly arena?: Address;
  private readonly inflight = new Map<string, Promise<ClaimStatus>>();
  private readonly history = new Map<string, number[]>();

  constructor(private readonly prices: PriceService) {
    const { signerKey, relayerKey, arenaAddress } = config;
    this.enabled = Boolean(signerKey && relayerKey && arenaAddress);
    if (!this.enabled) return;
    const chain = { ...monadTestnet, id: config.chainId, rpcUrls: { default: { http: [config.rpcUrl] } } };
    this.signer = privateKeyToAccount(signerKey!);
    this.relayer = privateKeyToAccount(relayerKey!, { nonceManager });
    this.arena = arenaAddress;
    this.pub = createPublicClient({ chain, transport: http(config.rpcUrl, { timeout: 15_000, retryCount: 2 }) });
    this.wallet = createWalletClient({ account: this.relayer, chain, transport: http(config.rpcUrl, { timeout: 15_000, retryCount: 2 }) });
  }

  private allowed(wallet: string): boolean {
    const now = Date.now();
    const list = (this.history.get(wallet.toLowerCase()) ?? []).filter((t) => now - t < 3_600_000);
    if (list.length >= config.maxClaimsPerHour) { this.history.set(wallet.toLowerCase(), list); return false; }
    list.push(now);
    this.history.set(wallet.toLowerCase(), list);
    return true;
  }

  /** Runs (or joins) the claim for a room. Never throws; resolves with the terminal status. */
  claim(req: ClaimRequest, onStatus: (s: ClaimStatus) => void): Promise<ClaimStatus> {
    const existing = this.inflight.get(req.roomId);
    if (existing) { existing.then(onStatus); return existing; }
    const p = this.run(req, onStatus).catch((e): ClaimStatus => {
      const s: ClaimStatus = { state: 'failed', error: shortError(e) };
      onStatus(s);
      return s;
    });
    this.inflight.set(req.roomId, p);
    return p;
  }

  private async run(req: ClaimRequest, onStatus: (s: ClaimStatus) => void): Promise<ClaimStatus> {
    if (!this.enabled || !this.pub || !this.wallet || !this.signer || !this.relayer || !this.arena) {
      const s: ClaimStatus = { state: 'ineligible', error: 'Rewards are not live on this server yet. Your win still counts on the leaderboard.' };
      onStatus(s);
      return s;
    }
    if (!this.allowed(req.winner)) {
      const s: ClaimStatus = { state: 'ineligible', error: 'Reward limit reached for this wallet. Try again in an hour.' };
      onStatus(s);
      return s;
    }
    onStatus({ state: 'signing' });

    const roomId = keccak256(toBytes(`${req.roomId}:${req.roomStamp}`));
    const ticker = tickerToBytes32(req.ticker);
    const claim = {
      winner: req.winner,
      loser: req.loser ?? ('0x0000000000000000000000000000000000000000' as Address),
      roomId,
      ticker,
      baseAmount: req.humanFoe ? config.rewardHumanWei : config.rewardBotWei,
      captureSpeciesId: req.humanFoe ? req.captureSpeciesNum : 0,
      captureLevel: req.level,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
    } as const;

    const sig = await this.signer.signTypedData({
      domain: arenaEip712Domain(config.chainId, this.arena),
      types: claimEip712Types,
      primaryType: claimEip712PrimaryType,
      message: claim,
    });

    const priceUpdate = await this.prices.updateData(req.prizeSpeciesId);
    let value = 0n;
    if (priceUpdate.length > 0) {
      try {
        value = await this.pub.readContract({ address: config.pythAddress, abi: pythAbi, functionName: 'getUpdateFee', args: [priceUpdate] });
      } catch { value = 0n; }
    }

    const args = [claim, sig, priceUpdate] as const;
    // Monad charges on gasLimit, not gas used: estimate precisely and add a small margin.
    let gas: bigint;
    try {
      gas = await this.pub.estimateContractGas({ address: this.arena, abi: arenaAbi, functionName: 'claim', args, value, account: this.relayer.address });
    } catch (e) {
      // Retry the simulation without the Pyth update: a bad blob must not block the reward.
      if (priceUpdate.length === 0) throw e;
      gas = await this.pub.estimateContractGas({ address: this.arena, abi: arenaAbi, functionName: 'claim', args: [claim, sig, []], value: 0n, account: this.relayer.address });
      return this.submit(claim, sig, [], 0n, gas, onStatus);
    }
    return this.submit(claim, sig, priceUpdate, value, gas, onStatus);
  }

  private async submit(
    claim: { winner: Address; loser: Address; roomId: Hex; ticker: Hex; baseAmount: bigint; captureSpeciesId: number; captureLevel: number; deadline: bigint },
    sig: Hex, priceUpdate: readonly Hex[], value: bigint, gas: bigint, onStatus: (s: ClaimStatus) => void,
  ): Promise<ClaimStatus> {
    const hash = await this.wallet!.writeContract({
      address: this.arena!, abi: arenaAbi, functionName: 'claim', args: [claim, sig, priceUpdate as Hex[]],
      value, gas: (gas * 125n) / 100n, account: this.relayer!, chain: this.wallet!.chain,
    });
    onStatus({ state: 'submitted', txHash: hash });
    const receipt = await this.pub!.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== 'success') {
      const s: ClaimStatus = { state: 'failed', txHash: hash, error: 'The reward transaction reverted on-chain.' };
      onStatus(s);
      return s;
    }
    const logs = parseEventLogs({ abi: arenaAbi, logs: receipt.logs, eventName: 'Claimed' });
    const ev = logs[0]?.args as { minted?: bigint; buffBps?: number; nftId?: bigint } | undefined;
    const s: ClaimStatus = {
      state: 'confirmed',
      txHash: hash,
      minted: ev?.minted?.toString(),
      buffBps: ev?.buffBps !== undefined ? Number(ev.buffBps) : undefined,
      nftId: ev?.nftId && ev.nftId > 0n ? ev.nftId.toString() : undefined,
    };
    onStatus(s);
    return s;
  }
}

function shortError(e: unknown): string {
  const msg = e instanceof Error ? (('shortMessage' in e && typeof (e as any).shortMessage === 'string') ? (e as any).shortMessage : e.message) : String(e);
  return msg.replace(/\s+/g, ' ').slice(0, 180);
}
