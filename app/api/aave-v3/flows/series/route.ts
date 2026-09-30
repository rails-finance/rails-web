import { NextRequest, NextResponse } from "next/server";
import { serveFlowBinSeries } from "@/lib/api/flow-bin-series-route";

// The Lifetime view's series for one Aave V3 position: the daily route's day
// rows binned per week or month (lib/api/flow-bin-series-route.ts; rails-ops
// reference/lifetime-flows-scrubber.md). Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  const market = request.nextUrl.searchParams.get("market") ?? "core";
  if (!wallet || !ADDRESS.test(wallet) || !/^[a-z0-9]+$/.test(market)) {
    return NextResponse.json({ error: "wallet and market are required" }, { status: 400 });
  }
  return serveFlowBinSeries(request, "aave-v3", new URLSearchParams({ wallet: wallet.toLowerCase(), market }));
}
