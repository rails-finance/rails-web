// The body of every Aave V3-family /oracle-prices route: one oracle's
// getAssetPrice for up to 40 reserves, at `?block=` where the page names one
// (the block its card's balances were read at), else at the latest block, with
// the block the prices were read at. An asset the oracle does not price is
// absent; every asset is absent, with a null block, when the read fails.
// SERVER-ONLY.

import { NextResponse, type NextRequest } from "next/server";
import {
  resolveAaveOraclePrices,
  aaveOraclePriceOf,
  aaveOraclePriceBlockOf,
} from "@/lib/sources/chain/aave-oracle-prices";
import type { ChainId } from "@/lib/shared/chains";

const MAX_ASSETS = 40;

export async function aaveOraclePricesResponse(
  request: NextRequest,
  oracle: string,
  chainId: ChainId | undefined,
  name: string,
): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const assets = (params.get("assets") ?? "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter((a) => /^0x[0-9a-f]{40}$/.test(a))
    .slice(0, MAX_ASSETS);
  const blockParam = Number(params.get("block"));
  const block = Number.isInteger(blockParam) && blockParam > 0 ? blockParam : undefined;
  if (assets.length === 0) return NextResponse.json({ prices: {}, block: null });
  try {
    const map = await resolveAaveOraclePrices([{ oracle, assets }], chainId, block);
    const prices: Record<string, number> = {};
    for (const a of assets) {
      const p = aaveOraclePriceOf(map, oracle, a);
      if (p != null && p > 0) prices[a] = p;
    }
    return NextResponse.json({ prices, block: aaveOraclePriceBlockOf(map, oracle) ?? null });
  } catch (error) {
    console.error(`Error reading ${name} oracle prices:`, error);
    return NextResponse.json({ prices: {}, block: null });
  }
}
