import { NextRequest } from "next/server";
import { proxyAaveV3PositionState } from "@/lib/api/aave-v3-position-state-proxy";
import { AAVE_V3_ARBITRUM_CHAIN_ID } from "@/lib/aave-v3-arbitrum/asset-catalog";

// The position state of an Aave V3 Arbitrum account around one event's
// transaction, at blocks N−1 and N: a proxy to rails-server's at-block store
// (lib/api/aave-v3-position-state-proxy); the Base route's twin and wire shape.
//
// Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return proxyAaveV3PositionState(request, "arbitrum", AAVE_V3_ARBITRUM_CHAIN_ID);
}
