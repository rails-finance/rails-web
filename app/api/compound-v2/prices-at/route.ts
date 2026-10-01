import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";

const RAILS_API_URL = process.env.RAILS_API_URL;

/**
 * Proxy to rails-server-onboarding's stored Compound V2 prices,
 * `/api/compound-v2/prices-at?pairs=<block>:<market>,…` (rails-ops
 * reference/compound-prices-at-block.md): the oracle price for each (block, market)
 * an event row touches, raw (the ETH years with the block's USDC price), with
 * the pairs not stored yet in `missing`. The Lifetime flows panel reads it
 * before its archive read (/api/chain/compound-v2/prices-at), the rest there.
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
    for (const k of ["pairs"]) {
      const v = sp.get(k);
      if (v) qs.set(k, v);
    }
    const response = await fetch(
      `${RAILS_API_URL}/api/compound-v2/prices-at?${qs.toString()}`,
      createAuthFetchOptions(undefined, readerIp),
    );
    if (!response.ok) {
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const data = await response.json();
    return NextResponse.json(data, { headers: proxyCacheControl(response) });
  } catch (error) {
    console.error("Error fetching the stored Compound V2 prices from backend:", error);
    return NextResponse.json({ error: "Failed to fetch the stored prices" }, { status: 500 });
  }
}
