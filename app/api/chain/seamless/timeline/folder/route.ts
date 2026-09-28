import { NextRequest } from "next/server";
import { SEAMLESS_CHAIN_ID, SEAMLESS_DEPLOY_BLOCK } from "@/lib/seamless/asset-catalog";
import { aaveV3BaseFolder } from "@/lib/aave-v3-base/grouped-routes";
import { readerIpFromRequest } from "@/lib/api/reader-ip";

// Opening one Seamless folder — the members behind a header on
// `/api/chain/seamless/timeline?group=1`, or on a month of it (`&from=&to=`).
// The contract the index arms answer on (`app/api/spark/timeline/folder`);
// lib/aave-v3-base/grouped-routes.ts carries it for both Aave-family Pools.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return aaveV3BaseFolder(
    { label: "Seamless", chainId: SEAMLESS_CHAIN_ID, apiPrefix: "/api/seamless", deployBlock: SEAMLESS_DEPLOY_BLOCK },
    request.nextUrl.searchParams,
    readerIpFromRequest(request),
  );
}
