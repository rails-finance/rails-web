import { NextRequest } from "next/server";
import { proxyRedemptionPace } from "@/lib/api/redemption-pace-proxy";
import { ASYMMETRY_BRANCHES, resolveBranch } from "@/lib/asymmetry/asset-catalog";

// Proxy to rails-server's `/api/asymmetry/redemption-pace?branch=&from=&to=`:
// USDaf redeemed on a Asymmetry branch per UTC day (lib/api/redemption-pace-proxy.ts).
// The Trove page's protocol activity chart reads it
// (lib/liquity-v2/redemption-pace.ts, `forkPaceSource`).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return proxyRedemptionPace(
    request,
    "/api/asymmetry/redemption-pace",
    resolveBranch(request.nextUrl.searchParams.get("branch"))?.symbol ?? null,
    Object.values(ASYMMETRY_BRANCHES)
      .map((b) => b.symbol)
      .join(", "),
  );
}
