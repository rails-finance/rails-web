import { NextRequest } from "next/server";
import { proxyAaveV3PositionState } from "@/lib/api/aave-v3-position-state-proxy";
import { SEAMLESS_CHAIN_ID } from "@/lib/seamless/asset-catalog";

// The position state of a Seamless account around one event's transaction,
// at blocks N−1 and N: a proxy to rails-server's at-block store
// (lib/api/aave-v3-position-state-proxy). Seamless is an Aave V3 fork on Base;
// the wire shape is the Aave V3 one, so the open card reads it the same way.
//
// Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return proxyAaveV3PositionState(request, "seamless", SEAMLESS_CHAIN_ID);
}
