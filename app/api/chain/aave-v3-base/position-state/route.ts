import { NextRequest } from "next/server";
import { proxyAaveV3PositionState } from "@/lib/api/aave-v3-position-state-proxy";
import { AAVE_V3_BASE_CHAIN_ID } from "@/lib/aave-v3-base/asset-catalog";

// The position state of an Aave V3 Base account around one event's
// transaction, at blocks N−1 and N: a proxy to rails-server's at-block store
// (lib/api/aave-v3-position-state-proxy). The Ethereum twin is
// /api/aave-v3/timeline/position-state, which the index answers; the wire
// shape is the same, so the open card reads either.
//
// Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return proxyAaveV3PositionState(request, "base", AAVE_V3_BASE_CHAIN_ID);
}
