import { NextRequest } from "next/server";
import { accountSwitchesRoute } from "@/lib/sources/chain/aave-family-account-switches";
import { SEAMLESS_CHAIN_ID, SEAMLESS_DEPLOY_BLOCK, SEAMLESS_POOL } from "@/lib/seamless/asset-catalog";

// A Seamless account's e-mode changes and the reserves it ever turned on as
// collateral, from the Pool's logs (lib/sources/chain/aave-family-account-
// switches.ts); the timeline route's sweep carries neither.
//
// Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const answer = accountSwitchesRoute(
  { pool: SEAMLESS_POOL, chainId: SEAMLESS_CHAIN_ID, fromBlock: BigInt(SEAMLESS_DEPLOY_BLOCK) },
  "Seamless",
);

export async function GET(request: NextRequest) {
  return answer(request.nextUrl.searchParams.get("wallet"));
}
