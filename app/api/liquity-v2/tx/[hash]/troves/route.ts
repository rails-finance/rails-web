import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";
import { publicErrorMessage } from "@/lib/api/public-error";
import { TX_HASH } from "@/lib/liquity-v2/tx-troves-words";

// The Trove operations one transaction logged (rails-ops ui-jobs 751): a proxy
// to rails-server's GET /api/liquity-v2/tx/:hash/troves, answered unchanged.
// The hash is checked here first; the box answers 400 to a malformed one too.

const RAILS_API_URL = process.env.RAILS_API_URL;
const TX_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=3600";
const EMPTY_CACHE_CONTROL = "public, s-maxage=15";

export async function GET(request: NextRequest, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  if (!TX_HASH.test(hash)) return NextResponse.json({ error: "hash must be a transaction hash" }, { status: 400 });
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    const res = await fetch(`${RAILS_API_URL}/api/liquity-v2/tx/${hash.toLowerCase()}/troves`, {
      ...createAuthFetchOptions(undefined, readerIpFromRequest(request)),
      signal: request.signal,
    });
    if (!res.ok) {
      console.error(`Backend API error: ${res.status} ${res.statusText} (liquity-v2 tx troves)`);
      const body = await res.json().catch(() => ({ error: res.statusText }));
      return NextResponse.json(body, { status: res.status });
    }
    // An empty answer is kept 15 s: the index may not have reached a new transaction yet.
    const body = await res.json();
    const empty = !Array.isArray(body?.rows) || body.rows.length === 0;
    return NextResponse.json(body, { headers: proxyCacheControl(res, empty ? EMPTY_CACHE_CONTROL : TX_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching liquity-v2 tx troves from backend:", error);
    return NextResponse.json({ error: publicErrorMessage(error, "Failed to fetch") }, { status: 500 });
  }
}
