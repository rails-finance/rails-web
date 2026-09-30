import { NextRequest, NextResponse } from "next/server";
import { serveFlowBinSeries } from "@/lib/api/flow-bin-series-route";

// The Lifetime view's series for one Aave V4 spoke position: the daily
// route's day rows binned per week or month (lib/api/flow-bin-series-route.ts;
// rails-ops reference/lifetime-flows-scrubber.md). Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  const spoke = request.nextUrl.searchParams.get("spoke");
  if (!wallet || !ADDRESS.test(wallet) || !spoke || !/^[A-Za-z0-9_ -]{1,40}$/.test(spoke)) {
    return NextResponse.json({ error: "wallet and spoke are required" }, { status: 400 });
  }
  return serveFlowBinSeries(request, "aave-v4", new URLSearchParams({ wallet: wallet.toLowerCase(), spoke }));
}
