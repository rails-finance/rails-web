import { NextRequest } from "next/server";
import { accountSwitchesRoute } from "@/lib/sources/chain/aave-family-account-switches";
import {
  AAVE_V3_ARBITRUM_CHAIN_ID,
  AAVE_V3_ARBITRUM_DEPLOY_BLOCK,
  AAVE_V3_ARBITRUM_POOL,
} from "@/lib/aave-v3-arbitrum/asset-catalog";

// An Aave V3 Arbitrum account's e-mode changes and the reserves it ever turned
// on as collateral, from the Pool's logs (lib/sources/chain/aave-family-account-
// switches.ts): two wallet-filtered getLogs over the Pool's life through
// ARBITRUM_LOGS_RPC_URL. The history rows carry neither.
//
// Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const answer = accountSwitchesRoute(
  {
    pool: AAVE_V3_ARBITRUM_POOL,
    chainId: AAVE_V3_ARBITRUM_CHAIN_ID,
    fromBlock: BigInt(AAVE_V3_ARBITRUM_DEPLOY_BLOCK),
  },
  "Aave V3 Arbitrum",
);

export async function GET(request: NextRequest) {
  return answer(request.nextUrl.searchParams.get("wallet"));
}
