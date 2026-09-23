import type { NextRequest } from "next/server";
import { proxyCompoundPositions } from "@/lib/api/compound-positions-proxy";
import { COMPOUND_BASE_DEPLOYMENT } from "@/lib/compound-base/asset-catalog";

// The Compound V3 Base positions listing — rails-server's
// /api/compound-base/positions (mig 171: one row per (Comet, account) pair,
// joined to that pair's chain truth at a pinned Base block), resolved against
// the Base roster. sortBy=debt|coll orders on this route's own USD sort keys
// (NULLS LAST), same allowlist stance as the Ethereum route. See
// lib/api/compound-positions-proxy.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return proxyCompoundPositions(request, {
    apiPrefix: "/api/compound-base",
    label: "compound-base",
    deployment: COMPOUND_BASE_DEPLOYMENT,
    supportsSort: true,
  });
}
