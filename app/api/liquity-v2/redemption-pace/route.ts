import { NextRequest } from "next/server";
import { proxyRedemptionPace } from "@/lib/api/redemption-pace-proxy";
import { paceBranch } from "@/lib/liquity-v2/redemption-pace";

// Proxy to rails-server's `/api/liquity-v2/redemption-pace?branch=&from=&to=`:
// BOLD redeemed on a branch per UTC day (lib/api/redemption-pace-proxy.ts).
// The Trove page's protocol activity chart reads it
// (lib/liquity-v2/redemption-pace.ts).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return proxyRedemptionPace(
    request,
    "/api/liquity-v2/redemption-pace",
    paceBranch(request.nextUrl.searchParams.get("branch")),
    "WETH, rETH, wstETH",
  );
}
