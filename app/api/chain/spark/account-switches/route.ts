import { NextRequest } from "next/server";
import { accountSwitchesRoute } from "@/lib/sources/chain/aave-family-account-switches";
import { SPARK_ADDRESSES } from "@/lib/spark/asset-catalog";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// A SparkLend account's e-mode changes and the reserves it ever turned on as
// collateral, from the Pool's logs (lib/sources/chain/aave-family-account-
// switches.ts); the index serves neither.
//
// Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const answer = accountSwitchesRoute(
  {
    pool: SPARK_ADDRESSES.POOL as `0x${string}`,
    chainId: MAINNET_CHAIN_ID,
    // Below the SparkLend Pool proxy's first block.
    fromBlock: BigInt(16_776_000),
  },
  "SparkLend",
);

export async function GET(request: NextRequest) {
  return answer(request.nextUrl.searchParams.get("wallet"));
}
