import type { NextRequest } from "next/server";
import { proxyCompoundPositions } from "@/lib/api/compound-positions-proxy";
import { COMPOUND_ETHEREUM_POSITIONS } from "@/lib/compound/proxy-reads";

// api arm of the Compound V3 (Ethereum) position listing — the LIVE rails-server
// index over mv_compound_v3_positions. See lib/api/compound-positions-proxy.ts.
// sortBy=debt|coll is live here (mig 185) and on the Base route (its own
// backend column), each gated by its own supportsSort: true.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return proxyCompoundPositions(request, COMPOUND_ETHEREUM_POSITIONS);
}
