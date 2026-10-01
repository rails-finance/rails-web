import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";

const RAILS_API_URL = process.env.RAILS_API_URL;

/**
 * Proxy to rails-server-onboarding's shared daily price store,
 * `/api/prices/daily?chain=&series=k1,k2&from=&to=` (rails-ops
 * reference/daily-prices.md): one price per series and completed UTC day,
 * `{ series: { "<key>": { unit, scale, obs: [[day, price_raw, block], …] } } }`.
 * The Lifetime flows panel values a quiet asset between its events at it.
 */
export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    const sp = request.nextUrl.searchParams;
    const qs = new URLSearchParams();
    for (const k of ["chain", "series", "from", "to"]) {
      const v = sp.get(k);
      if (v) qs.set(k, v);
    }
    const response = await fetch(
      `${RAILS_API_URL}/api/prices/daily?${qs.toString()}`,
      createAuthFetchOptions(undefined, readerIp),
    );
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const data = await response.json();
    return NextResponse.json(data, { headers: proxyCacheControl(response) });
  } catch (error) {
    console.error("Error fetching the daily prices from backend:", error);
    return NextResponse.json({ error: "Failed to fetch the daily prices" }, { status: 500 });
  }
}
