import { NextRequest } from "next/server";
import { morphoBaseFolder } from "@/lib/morpho-base/grouped-routes";
import { readerIpFromRequest } from "@/lib/api/reader-ip";

// Opening one Morpho Blue Base folder — the members behind a header on
// `/api/chain/morpho-base/timeline?group=1&market=`, or on a month of it
// (`&from=&to=`). The contract the index arms answer on
// (`app/api/spark/timeline/folder`); lib/morpho-base/grouped-routes.ts
// carries it.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return morphoBaseFolder(request.nextUrl.searchParams, readerIpFromRequest(request));
}
