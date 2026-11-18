import type { NextRequest } from "next/server";
import { aaveOraclePricesResponse } from "@/lib/sources/api/aave-oracle-prices-route";
import { ORACLE_BY_MARKET, asV3Market } from "@/lib/aave-v3/asset-catalog";

// On-chain oracle USD for arbitrary V3 reserve addresses in one market
// (`?market=core|prime|etherfi`, Core when absent) — the market's IAaveOracle
// getAssetPrice at `?block=` (the card's block) or else the latest block,
// named in the answer, read through rails-server
// (lib/sources/chain/aave-oracle-prices.ts). The position page prices its card
// here at the card's block, and its lifetime-flow lines: the listing row's priceByAddress covers only the
// reserves the account still holds, so exited/liquidated reserves arrive
// unpriced and the economics tower degrades to the gated token list. An asset
// the oracle can't price is simply absent from the response — callers keep
// treating it as unpriced (never assert a partial total). Node runtime, no
// edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const oracle = ORACLE_BY_MARKET[asV3Market(request.nextUrl.searchParams.get("market"))];
  return aaveOraclePricesResponse(request, oracle, undefined, "Aave V3");
}
