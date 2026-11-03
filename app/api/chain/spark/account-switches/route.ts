import { NextRequest } from "next/server";
import { accountSwitchesRoute } from "@/lib/sources/chain/aave-family-account-switches";
import { proxyAccountSwitches } from "@/lib/api/aave-family-account-switches";
import { SPARK_ADDRESSES } from "@/lib/spark/asset-catalog";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// A SparkLend account's e-mode changes and the reserves it ever turned on as
// collateral, from rails-server (lib/api/aave-family-account-switches.ts: the
// mainnet Sieve's rows to its checkpoint, the chain past it); where
// rails-server cannot answer, from the Pool's logs
// (lib/sources/chain/aave-family-account-switches.ts). The index serves
// neither.
//
// Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const chainRead = accountSwitchesRoute(
  {
    pool: SPARK_ADDRESSES.POOL as `0x${string}`,
    chainId: MAINNET_CHAIN_ID,
    // Below the SparkLend Pool proxy's first block.
    fromBlock: BigInt(16_776_000),
  },
  "SparkLend",
);

export async function GET(request: NextRequest) {
  return proxyAccountSwitches(request, "spark", chainRead);
}
