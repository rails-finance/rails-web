import type { NextRequest } from "next/server";
import { proxyBaseLendingCoverage } from "@/lib/api/base-lending-proxy";
import { readerIpFromRequest } from "@/lib/api/reader-ip";

// How complete the Moonwell Base listing lane is. See lib/api/base-lending-proxy.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return proxyBaseLendingCoverage("/api/moonwell-base", readerIpFromRequest(request));
}
