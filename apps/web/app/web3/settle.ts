import { encodeFunctionData, type Hex } from "viem";
import { fetchLatestPrice } from "./hermes";

const ARENA_ABI = [
  {
    name: "settleAndClaim",
    type: "function",
    inputs: [
      { name: "claim", type: "bytes32" },
      { name: "sig", type: "bytes" },
      { name: "priceUpdate", type: "bytes[]" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
] as const;

export async function buildSettleCalldata(
  claim: Hex,
  sig: Hex,
  ticker: string
): Promise<{ data: Hex; value: bigint }> {
  const { bytes: priceUpdate } = await fetchLatestPrice(ticker);
  const pythFee = BigInt(1); // placeholder: fetch getUpdateFee from contract in production

  const data = encodeFunctionData({
    abi: ARENA_ABI,
    functionName: "settleAndClaim",
    args: [claim, sig, priceUpdate as Hex[]],
  });

  return { data, value: pythFee };
}
