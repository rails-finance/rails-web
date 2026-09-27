import type { NextRequest } from "next/server";
import { proxyAaveV4Base } from "@/lib/api/aave-v4-base-proxy";

// rails-server's /api/aave-v4-base/spoke-positions, forwarded unchanged.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return proxyAaveV4Base(request, "/api/aave-v4-base/spoke-positions");
}
