// ABIs + deployment address book for the PokeStonks on-chain layer (Monad testnet).
// `abis.ts` and `deployments.json` are produced by `contracts/script/export-abi.mjs` (and the deploy script).
// Importing `deployments.json` requires `resolveJsonModule` in the consumer's tsconfig.

import deploymentsJson from "./deployments.json";

export { arenaAbi, brokerMonAbi, syntheticStockAbi } from "./abis";

export type Address = `0x${string}`;

export interface Deployments {
  chainId: number;
  /** BattleArena. `null` until deployed. */
  arena: Address | null;
  /** BrokerMonNFT. `null` until deployed. */
  brokerMon: Address | null;
  pyth?: Address;
  /** EIP-712 voucher signer configured at deploy time. */
  signer?: Address;
  deployer?: Address;
  deployBlock?: number;
  /** ticker symbol (e.g. "TSLA") -> SyntheticStock (sTSLA) address. */
  tokens: Record<string, Address>;
}

export const deployments = deploymentsJson as unknown as Deployments;

/** Deployment with the mandatory addresses guaranteed present; throws if contracts are not deployed yet. */
export function requireDeployments(): Deployments & { arena: Address; brokerMon: Address } {
  const { arena, brokerMon } = deployments;
  if (!arena || !brokerMon) {
    throw new Error("contracts-abi: contracts not deployed yet (deployments.json has null addresses)");
  }
  return { ...deployments, arena, brokerMon };
}

export const MONAD_TESTNET_CHAIN_ID = 10143;

/** EIP-712 domain of BattleArena: name "PokeStonks", version "1". */
export function arenaEip712Domain(chainId: number, verifyingContract: Address) {
  return { name: "PokeStonks", version: "1", chainId, verifyingContract } as const;
}

/**
 * EIP-712 types of the reward voucher. Must match BattleArena.CLAIM_TYPEHASH exactly:
 * Claim(address winner,address loser,bytes32 roomId,bytes32 ticker,uint256 baseAmount,uint16 captureSpeciesId,uint8 captureLevel,uint64 deadline)
 * (viem: pass as `types` with `primaryType: "Claim"`; ethers: pass `claimEip712Types` as-is.)
 */
export const claimEip712Types = {
  Claim: [
    { name: "winner", type: "address" },
    { name: "loser", type: "address" },
    { name: "roomId", type: "bytes32" },
    { name: "ticker", type: "bytes32" },
    { name: "baseAmount", type: "uint256" },
    { name: "captureSpeciesId", type: "uint16" },
    { name: "captureLevel", type: "uint8" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

export const claimEip712PrimaryType = "Claim" as const;

/** Left-aligned bytes32 ticker as used by BattleArena, e.g. tickerToBytes32("TSLA") == bytes32("TSLA"). */
export function tickerToBytes32(symbol: string): Address {
  if (!/^[\x21-\x7e]{1,32}$/.test(symbol)) throw new Error(`invalid ticker: ${symbol}`);
  let hex = "";
  for (let i = 0; i < symbol.length; i++) hex += symbol.charCodeAt(i).toString(16).padStart(2, "0");
  return `0x${hex.padEnd(64, "0")}`;
}
