import { NextRequest, NextResponse } from "next/server";
import { proxyAaveV3PositionState } from "@/lib/api/aave-v3-position-state-proxy";
import { POOL_BY_MARKET, type AaveV3MarketKey } from "@/lib/aave-v3/asset-catalog";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// The position state of an Aave V3 Ethereum account around one transaction,
// at blocks N−1 and N (?market=core|prime|etherfi, or the hook's
// "chain:<market>"), for a row the index holds no event for, which is what a
// governance change between the account's events is: the index's answer
// (/api/aave-v3/timeline/position-state) needs an event in the transaction.
// Proxy to rails-server's at-block store (lib/api/aave-v3-position-state-proxy).
// Same wire shape as the index's answer.
//
// Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const market = (request.nextUrl.searchParams.get("market") ?? "core").replace(/^chain:/, "") as AaveV3MarketKey;
  if (!POOL_BY_MARKET[market]) {
    return NextResponse.json({ error: "unknown market", code: "bad_request" }, { status: 400 });
  }
  return proxyAaveV3PositionState(request, market, MAINNET_CHAIN_ID);
}
