import { NextRequest } from "next/server";
import { proxyAaveV3PositionState } from "@/lib/api/aave-v3-position-state-proxy";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// The position state of a SparkLend account around one event's transaction,
// at blocks N−1 and N: a proxy to rails-server's at-block store
// (lib/api/aave-v3-position-state-proxy). SparkLend is an Aave V3 fork; the
// index serves no SparkLend position state.
//
// Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return proxyAaveV3PositionState(request, "spark", MAINNET_CHAIN_ID);
}
