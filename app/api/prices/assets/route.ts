import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";

const RAILS_API_URL = process.env.RAILS_API_URL;

/**
 * Proxy to the server's asset roster, `/api/prices/assets?token=&chain=`
 * (rails-ops reference/asset-key-map.md): per asset (chain + token, native ETH
 * as 0xeeee…eeee), its underlying or wrapped tokens and one line per oracle the
 * protocols read, each with the series keys `/api/prices/daily` takes.
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
    for (const k of ["token", "chain"]) {
      const v = sp.get(k);
      if (v) qs.set(k, v);
    }
    const response = await fetch(
      `${RAILS_API_URL}/api/prices/assets?${qs.toString()}`,
      createAuthFetchOptions(undefined, readerIp),
    );
    if (!response.ok) {
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const data = await response.json();
    return NextResponse.json(data, { headers: proxyCacheControl(response) });
  } catch (error) {
    console.error("Error fetching the asset roster from backend:", error);
    return NextResponse.json({ error: "Failed to fetch the asset roster" }, { status: 500 });
  }
}
