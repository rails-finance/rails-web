// The Lifetime view's series routes (app/api/{aave-v3,spark,aave-v4}/flows/
// series/route.ts): read the index's day rows for one position (rails-server
// GET /api/<family>/flows/daily, the replay and daily price reads the
// scrubber's route serves) and answer with them binned per week or month
// (lib/shared/flows-series.ts), about 52 points a year per side. Cacheability
// is the daily route's, forwarded as that route's hop forwards it.

import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";
import { routeBoxHop } from "@/lib/shared/proxy-answer";
import type { FlowSeries } from "@/lib/api/fetch-aave-v3-flow-series";
import { binInputFromWire, binSeries, type SeriesBin } from "@/lib/shared/flows-series";

export async function serveFlowBinSeries(
  request: NextRequest,
  family: "aave-v3" | "spark" | "aave-v4",
  qs: URLSearchParams,
): Promise<NextResponse> {
  const RAILS_API_URL = process.env.RAILS_API_URL;
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  const binParam = request.nextUrl.searchParams.get("bin") ?? "week";
  if (binParam !== "week" && binParam !== "month") {
    return NextResponse.json({ error: "bin is week or month" }, { status: 400 });
  }
  const bin: SeriesBin = binParam;
  const t0 = Date.now();
  try {
    const hop = routeBoxHop(RAILS_API_URL, readerIpFromRequest(request));
    const response = await fetch(`${hop.baseUrl}/api/${family}/flows/daily?${qs.toString()}`, {
      headers: hop.headers,
    });
    if (!response.ok) {
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const daily = (await response.json()) as FlowSeries;
    const upstreamMs = Date.now() - t0;
    const series = binSeries(binInputFromWire(daily), bin);
    return NextResponse.json(
      {
        wallet: daily.wallet,
        market: daily.market,
        ...(series ?? { bin, first: null, today: daily.today, window: null, points: [], gaps: [] }),
        stats: { ms: Date.now() - t0, upstreamMs, activeDays: daily.days.length },
      },
      { headers: proxyCacheControl(response) },
    );
  } catch (error) {
    console.error(`Error building the ${family} flow bin series:`, error);
    return NextResponse.json({ error: "Failed to build the flow series" }, { status: 500 });
  }
}
