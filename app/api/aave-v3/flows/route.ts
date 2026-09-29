import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";
import { routeBoxHop } from "@/lib/shared/proxy-answer";

// Proxies the Lifetime flows scrubber's day rows for one Aave V3 position
// (rails-server GET /api/aave-v3/flows/daily; rails-ops
// reference/lifetime-flows-scrubber.md). The answer needs no shaping here: the
// server names every asset it sends. Cacheability is the server's call.
// Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function GET(request: NextRequest) {
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  const wallet = request.nextUrl.searchParams.get("wallet");
  const market = request.nextUrl.searchParams.get("market") ?? "core";
  if (!wallet || !ADDRESS.test(wallet) || !/^[a-z0-9]+$/.test(market)) {
    return NextResponse.json({ error: "wallet and market are required" }, { status: 400 });
  }
  try {
    const hop = routeBoxHop(RAILS_API_URL, readerIpFromRequest(request));
    const qs = new URLSearchParams({ wallet: wallet.toLowerCase(), market });
    const response = await fetch(`${hop.baseUrl}/api/aave-v3/flows/daily?${qs.toString()}`, { headers: hop.headers });
    if (!response.ok) {
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    return NextResponse.json(await response.json(), { headers: proxyCacheControl(response) });
  } catch (error) {
    console.error("Error fetching aave-v3 flow series from backend:", error);
    return NextResponse.json({ error: "Failed to fetch flow series" }, { status: 500 });
  }
}
