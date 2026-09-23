import type { NextRequest } from "next/server";
import { proxyBaseLendingPositions } from "@/lib/api/base-lending-proxy";
import { AAVE_V3_BASE_CHAIN_ID, AAVE_V3_BASE_ORACLE, AAVE_V3_BASE_POOL } from "@/lib/aave-v3-base/asset-catalog";

// The Aave V3 Base positions listing — rails-server's /api/aave-v3-base/positions,
// resolved against the Base Pool's own contracts. See lib/api/base-lending-proxy.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return proxyBaseLendingPositions(request, {
    apiPrefix: "/api/aave-v3-base",
    label: "aave-v3-base",
    deployment: { chainId: AAVE_V3_BASE_CHAIN_ID, oracle: AAVE_V3_BASE_ORACLE, pool: AAVE_V3_BASE_POOL },
  });
}
