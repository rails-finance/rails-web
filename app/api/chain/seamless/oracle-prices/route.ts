import type { NextRequest } from "next/server";
import { aaveOraclePricesResponse } from "@/lib/sources/api/aave-oracle-prices-route";
import { SEAMLESS_CHAIN_ID, SEAMLESS_ORACLE } from "@/lib/seamless/asset-catalog";

// On-chain USD for arbitrary Seamless reserve addresses — this market's OWN
// IAaveOracle at the latest block, through rails-server (lib/sources/chain/aave-oracle-prices.ts). Its own, not Aave's: the two
// markets price through different oracle deployments, and the economics tower
// values lifetime flows on reserves a wallet has fully exited, which nothing
// else on the page prices. An asset the oracle can't price is simply absent —
// the tower treats an absent price as unpriced and degrades the whole panel to
// the token-only list rather than assert a partial USD total.
//
// Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return aaveOraclePricesResponse(request, SEAMLESS_ORACLE, SEAMLESS_CHAIN_ID, "Seamless");
}
