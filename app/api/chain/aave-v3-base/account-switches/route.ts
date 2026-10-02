import { NextRequest } from "next/server";
import { accountSwitchesRoute } from "@/lib/sources/chain/aave-family-account-switches";
import { AAVE_V3_BASE_CHAIN_ID, AAVE_V3_BASE_DEPLOY_BLOCK, AAVE_V3_BASE_POOL } from "@/lib/aave-v3-base/asset-catalog";

// An Aave V3 Base account's e-mode changes and the reserves it ever turned on
// as collateral, from the Pool's logs (lib/sources/chain/aave-family-account-
// switches.ts); the timeline route's rows carry neither.
//
// Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const answer = accountSwitchesRoute(
  { pool: AAVE_V3_BASE_POOL, chainId: AAVE_V3_BASE_CHAIN_ID, fromBlock: BigInt(AAVE_V3_BASE_DEPLOY_BLOCK) },
  "Aave V3 Base",
);

export async function GET(request: NextRequest) {
  return answer(request.nextUrl.searchParams.get("wallet"));
}
