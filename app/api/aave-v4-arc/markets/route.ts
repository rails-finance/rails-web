import type { NextRequest } from "next/server";
import { proxyAaveV4Base } from "@/lib/api/aave-v4-base-proxy";

// rails-server's /api/at-block/aave-v4-arc/markets (Aave V4 on Arc, read at the head), forwarded unchanged.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return proxyAaveV4Base(request, "/api/at-block/aave-v4-arc/markets");
}
