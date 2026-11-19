import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { publicErrorMessage } from "@/lib/api/public-error";
import { normalizeRedeemer } from "@/lib/liquity-v2/redeemer-routes";

// The UTC days a wallet redeemed on: a proxy to rails-server's GET
// /api/liquity-v2/redeemer/:address/days, answered unchanged
// (`{ address, days: [[day, operations, transactions, bold_raw], …] }`). The
// redeemer page's chart marks each day on its events row.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ address: string }> }) {
  const address = normalizeRedeemer((await params).address);
  if (!address)
    return NextResponse.json({ error: "address must be 0x followed by 40 hex characters" }, { status: 400 });
  const base = process.env.RAILS_API_URL;
  if (!base) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    const res = await fetch(`${base}/api/liquity-v2/redeemer/${address}/days`, {
      ...createAuthFetchOptions(undefined, readerIpFromRequest(request)),
      signal: request.signal,
    });
    if (!res.ok) {
      console.error(`Backend API error: ${res.status} ${res.statusText} (liquity-v2 redeemer days)`);
      const body = await res.json().catch(() => ({ error: res.statusText }));
      return NextResponse.json(body, { status: res.status });
    }
    return NextResponse.json(await res.json(), { headers: proxyCacheControl(res, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching liquity-v2 redeemer days from backend:", error);
    return NextResponse.json({ error: publicErrorMessage(error, "Failed to fetch") }, { status: 500 });
  }
}
