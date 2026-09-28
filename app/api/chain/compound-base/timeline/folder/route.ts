import { NextRequest } from "next/server";
import { compoundBaseFolder } from "@/lib/compound-base/grouped-routes";
import { readerIpFromRequest } from "@/lib/api/reader-ip";

// Opening one Compound V3 Base folder — the members behind a header on
// `/api/chain/compound-base/timeline?group=1`, or on a month of one market
// (`&market=&from=&to=`). The contract the index arms answer on
// (`app/api/spark/timeline/folder`); lib/compound-base/grouped-routes.ts
// carries it.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return compoundBaseFolder(request.nextUrl.searchParams, readerIpFromRequest(request));
}
