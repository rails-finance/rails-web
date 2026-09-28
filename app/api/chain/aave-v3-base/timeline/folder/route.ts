import { NextRequest } from "next/server";
import { AAVE_V3_BASE_CHAIN_ID, AAVE_V3_BASE_DEPLOY_BLOCK } from "@/lib/aave-v3-base/asset-catalog";
import { aaveV3BaseFolder } from "@/lib/aave-v3-base/grouped-routes";
import { readerIpFromRequest } from "@/lib/api/reader-ip";

// Opening one Aave V3 Base folder — the members behind a header on
// `/api/chain/aave-v3-base/timeline?group=1`, or on a month of it (`&from=&to=`).
// The contract the index arms answer on (`app/api/spark/timeline/folder`);
// lib/aave-v3-base/grouped-routes.ts carries it for both Aave-family Pools.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return aaveV3BaseFolder(
    {
      label: "Aave V3 Base",
      chainId: AAVE_V3_BASE_CHAIN_ID,
      apiPrefix: "/api/aave-v3-base",
      deployBlock: AAVE_V3_BASE_DEPLOY_BLOCK,
    },
    request.nextUrl.searchParams,
    readerIpFromRequest(request),
  );
}
