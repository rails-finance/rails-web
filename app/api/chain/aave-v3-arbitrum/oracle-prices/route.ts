import type { NextRequest } from "next/server";
import { aaveOraclePricesResponse } from "@/lib/sources/api/aave-oracle-prices-route";
import { AAVE_V3_ARBITRUM_CHAIN_ID, AAVE_V3_ARBITRUM_ORACLE } from "@/lib/aave-v3-arbitrum/asset-catalog";

// On-chain USD for Arbitrum reserve addresses — the Arbitrum Pool's IAaveOracle
// at the latest block, through rails-server; the twin of the Base route. An asset the
// oracle cannot price is absent from the response.
//
// Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return aaveOraclePricesResponse(request, AAVE_V3_ARBITRUM_ORACLE, AAVE_V3_ARBITRUM_CHAIN_ID, "Aave V3 Arbitrum");
}
