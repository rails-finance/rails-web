import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";

const RAILS_API_URL = process.env.RAILS_API_URL;

/**
 * Proxy to rails-server's stored oracle rounds,
 * `/api/prices/rounds?chain=&oracles=0x…,0x…&from=&to=&max=` (rails-ops
 * reference/asset-key-map.md, "Rounds and the daily join"): per oracle, each
 * point its value in force changed at, traceable to its leg round, and each
 * UTC day's close. An asset page's chart joins them onto the daily stores.
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
    for (const k of ["chain", "oracles", "from", "to", "max"]) {
      const v = sp.get(k);
      if (v) qs.set(k, v);
    }
    const response = await fetch(
      `${RAILS_API_URL}/api/prices/rounds?${qs.toString()}`,
      createAuthFetchOptions(undefined, readerIp),
    );
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const data = await response.json();
    return NextResponse.json(data, { headers: proxyCacheControl(response) });
  } catch (error) {
    console.error("Error fetching the stored rounds from backend:", error);
    return NextResponse.json({ error: "Failed to fetch the stored rounds" }, { status: 500 });
  }
}
