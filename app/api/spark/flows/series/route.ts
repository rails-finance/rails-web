import { NextRequest, NextResponse } from "next/server";
import { serveFlowBinSeries } from "@/lib/api/flow-bin-series-route";

// The Lifetime view's series for one SparkLend position: the daily route's
// day rows binned per day, week or month (lib/api/flow-bin-series-route.ts;
// rails-ops reference/lifetime-flows-scrubber.md). Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet || !ADDRESS.test(wallet)) {
    return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  }
  return serveFlowBinSeries(request, "spark", new URLSearchParams({ wallet: wallet.toLowerCase() }));
}
