import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";

const RAILS_API_URL = process.env.RAILS_API_URL;

/**
 * Proxy to rails-server-onboarding's stored Compound V3 prices,
 * `/api/compound/prices-at?chain=&comet=&blocks=` (rails-ops
 * reference/compound-prices-at-block.md): each Comet's oracle price for every
 * listed asset at each event block, raw, with the blocks not stored yet in
 * `missing`. The Lifetime flows panel reads it before its archive read
 * (/api/chain/compound/prices-at-block) and reads the archive for the rest.
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
    for (const k of ["chain", "comet", "blocks"]) {
      const v = sp.get(k);
      if (v) qs.set(k, v);
    }
    const response = await fetch(
      `${RAILS_API_URL}/api/compound/prices-at?${qs.toString()}`,
      createAuthFetchOptions(undefined, readerIp),
    );
    if (!response.ok) {
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const data = await response.json();
    return NextResponse.json(data, { headers: proxyCacheControl(response) });
  } catch (error) {
    console.error("Error fetching the stored Compound prices from backend:", error);
    return NextResponse.json({ error: "Failed to fetch the stored prices" }, { status: 500 });
  }
}
