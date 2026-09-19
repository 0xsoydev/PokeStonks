import { HermesClient } from "@pythnetwork/hermes-client";

const HERMES_URL = process.env.NEXT_PUBLIC_HERMES_URL ?? "https://hermes.pyth.network";

export const priceClient = new HermesClient(HERMES_URL);

const FEED_MAP: Record<string, string> = {
  TSLA: process.env.NEXT_PUBLIC_TSLA_FEED!,
  AAPL: process.env.NEXT_PUBLIC_AAPL_FEED!,
};

export async function fetchLatestPrice(ticker: string): Promise<{
  price: number;
  expo: number;
  timestamp: number;
  bytes: string[];
}> {
  const feedId = FEED_MAP[ticker];
  if (!feedId) throw new Error(`No feed ID for ${ticker}`);

  const updateData = await priceClient.getLatestPriceUpdates([feedId]);
  const parsed = (updateData as any).parsed?.[0];
  if (!parsed) throw new Error(`No price data for ${ticker}`);

  return {
    price: Number(parsed.price.price),
    expo: parsed.price.expo,
    timestamp: Number(parsed.price.publishTime),
    bytes: updateData.binary.data,
  };
}

export async function fetchLatestPrices(
  tickers: string[]
): Promise<Record<string, { price: number; bytes: string[] }>> {
  const feedIds = tickers.map((t) => FEED_MAP[t]).filter(Boolean);
  if (!feedIds.length) return {};

  const updateData = await priceClient.getLatestPriceUpdates(feedIds);
  const result: Record<string, { price: number; bytes: string[] }> = {};

  for (const [ticker, feedId] of Object.entries(FEED_MAP)) {
    const parsed = (updateData as any).parsed?.find(
      (p: any) => p.id.toLowerCase() === feedId.toLowerCase()
    );
    if (parsed) {
      result[ticker] = {
        price: Number(parsed.price.price),
        bytes: updateData.binary.data,
      };
    }
  }

  return result;
}
