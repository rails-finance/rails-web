import type { NextRequest } from "next/server";
import { proxyBaseLendingPositions } from "@/lib/api/base-lending-proxy";
import { SEAMLESS_CHAIN_ID, SEAMLESS_ORACLE, SEAMLESS_POOL } from "@/lib/seamless/asset-catalog";

// The Seamless positions listing — rails-server's /api/seamless/positions,
// resolved against Seamless's own Base contracts. See lib/api/base-lending-proxy.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return proxyBaseLendingPositions(request, {
    apiPrefix: "/api/seamless",
    label: "seamless",
    deployment: { chainId: SEAMLESS_CHAIN_ID, oracle: SEAMLESS_ORACLE, pool: SEAMLESS_POOL },
  });
}
