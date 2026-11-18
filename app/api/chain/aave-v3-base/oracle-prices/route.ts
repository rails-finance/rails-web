import type { NextRequest } from "next/server";
import { aaveOraclePricesResponse } from "@/lib/sources/api/aave-oracle-prices-route";
import { AAVE_V3_BASE_CHAIN_ID, AAVE_V3_BASE_ORACLE } from "@/lib/aave-v3-base/asset-catalog";

// On-chain USD for arbitrary Base reserve addresses — the Base Pool's OWN
// IAaveOracle at the latest block, through rails-server (lib/sources/chain/aave-oracle-prices.ts). The Ethereum twin of this
// route exists for the same reason: the economics tower values lifetime flows,
// and a reserve the wallet has fully exited is priced by nothing else on the
// page. An asset the oracle can't price is simply absent from the response —
// the tower treats an absent price as unpriced and degrades the whole panel to
// the token-only list rather than assert a partial USD total.
//
// Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return aaveOraclePricesResponse(request, AAVE_V3_BASE_ORACLE, AAVE_V3_BASE_CHAIN_ID, "Aave V3 Base");
}
