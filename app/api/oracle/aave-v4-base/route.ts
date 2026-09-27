import type { NextRequest } from "next/server";
import { proxyAaveV4Base } from "@/lib/api/aave-v4-base-proxy";

// rails-server's /api/oracle/aave-v4-base: the Mag7 spoke oracle's price for
// every reserve at head (or ?block=N), with the Chainlink round and updatedAt
// behind each. Forwarded unchanged; a pinned block's answer carries the
// backend's immutable Cache-Control.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return proxyAaveV4Base(request, "/api/oracle/aave-v4-base");
}
