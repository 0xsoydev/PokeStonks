import { keccak256, toBytes, isAddress, getAddress, type Address } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { arenaEip712Domain, claimEip712Types, claimEip712PrimaryType, tickerToBytes32 } from 'contracts-abi';
import type { ClaimVoucher } from 'game-core';
import { config } from '../config.ts';
import type { PriceService } from './prices.ts';

export interface VoucherRequest {
  roomId: string;
  /** Stable per-room nonce so a restart can't reuse a room id. */
  roomStamp: number;
  /** Wallet that receives the reward (and submits the voucher). */
  to: string;
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

export type VoucherResult = { ok: true; voucher: ClaimVoucher } | { ok: false; error: string };

const ZERO = '0x0000000000000000000000000000000000000000' as Address;

/**
 * Signs EIP-712 reward vouchers. The server holds no gas money and sends no transactions: the winner's
 * own wallet submits the voucher to `BattleArena.claim` and pays the network fee in MON. The contract
 * trusts only this signer, marks each room claimed once, and pays out to `winner` whoever submits.
 */
export class VoucherService {
  readonly enabled: boolean;
  private readonly signer?: PrivateKeyAccount;
  private readonly arena?: Address;
  private readonly issued = new Map<string, ClaimVoucher>();
  private readonly history = new Map<string, number[]>();

  constructor(private readonly prices: PriceService) {
    this.enabled = Boolean(config.signerKey && config.arenaAddress);
    if (!this.enabled) return;
    this.signer = privateKeyToAccount(config.signerKey!);
    this.arena = config.arenaAddress;
  }

  private allowed(wallet: string): boolean {
    const now = Date.now();
    const key = wallet.toLowerCase();
    const list = (this.history.get(key) ?? []).filter((t) => now - t < 3_600_000);
    if (list.length >= config.maxClaimsPerHour) { this.history.set(key, list); return false; }
    list.push(now);
    this.history.set(key, list);
    return true;
  }

  /** Never throws. Re-requesting the same room returns the same voucher (the chain still pays once). */
  async issue(req: VoucherRequest): Promise<VoucherResult> {
    if (!this.enabled || !this.signer || !this.arena) {
      return { ok: false, error: 'Rewards are not live on this server yet. Your win still counts.' };
    }
    if (!isAddress(req.to)) return { ok: false, error: 'Connect a wallet to receive your reward.' };
    const to = getAddress(req.to);
    const prior = this.issued.get(req.roomId);
    if (prior) {
      return prior.claim.winner === to ? { ok: true, voucher: prior } : { ok: false, error: 'This reward was already issued to another wallet.' };
    }
    if (req.loser && to === getAddress(req.loser)) return { ok: false, error: 'You cannot claim a reward to your opponent\'s wallet.' };
    if (!this.allowed(to)) return { ok: false, error: 'Reward limit reached for this wallet. Try again in an hour.' };

    try {
      const claim = {
        winner: to,
        loser: req.loser ?? ZERO,
        roomId: keccak256(toBytes(`${req.roomId}:${req.roomStamp}`)),
        ticker: tickerToBytes32(req.ticker),
        baseAmount: req.humanFoe ? config.rewardHumanWei : config.rewardBotWei,
        captureSpeciesId: req.humanFoe ? req.captureSpeciesNum : 0,
        captureLevel: req.level,
        // Long enough to sit through a wallet prompt, a chain switch and a retry.
        deadline: BigInt(Math.floor(Date.now() / 1000) + 30 * 60),
      } as const;
      const sig = await this.signer.signTypedData({
        domain: arenaEip712Domain(config.chainId, this.arena),
        types: claimEip712Types,
        primaryType: claimEip712PrimaryType,
        message: claim,
      });
      const voucher: ClaimVoucher = {
        chainId: config.chainId,
        arena: this.arena,
        pyth: config.pythAddress,
        claim: {
          ...claim,
          baseAmount: claim.baseAmount.toString(),
          deadline: claim.deadline.toString(),
        },
        sig,
        priceUpdate: await this.prices.updateData(req.prizeSpeciesId),
      };
      this.issued.set(req.roomId, voucher);
      return { ok: true, voucher };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message.slice(0, 160) : 'Could not sign the reward.' };
    }
  }
}
