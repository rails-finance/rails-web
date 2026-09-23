import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";

// POST pass-through to the live rails-server index — the reserve's own rate
// read AROUND a position's own transactions, for the Aave V3 market notes
// (lib/aave-v3/market-notes.ts). The upstream service is
// api/src/services/aave-family-reserve-rates.ts, which is where the two as-of
// predicates are argued out; nothing here reshapes the answer.
//
// POST rather than GET because the question IS a list of chain coordinates —
// a deep position asks about a dozen reserves at several hundred points each,
// which is a body, not a query string. The busiest Aave V3 Core wallet's own
// request is ~412KB (measured 2026-09-06) and its answer ~2.75MB before gzip.
//
// The upstream's own validation is the only validation: it owns the caps
// (≤ 20 reserves, ≤ 2,000 points a list) and the market vocabulary, and
// re-checking either here would be a second opinion about the same rule that
// could drift from it. A bad request comes back as the upstream's own 400,
// body and all. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function POST(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const body = await request.text();
    const response = await fetch(
      `${RAILS_API_URL}/api/aave-v3/reserve-rates`,
      createAuthFetchOptions({ method: "POST", body, headers: { "content-type": "application/json" } }, readerIp),
    );
    // The upstream's status and body both travel: a 400 here is the service's
    // own validation error, with the field that was wrong named in it.
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: {
        "content-type": "application/json",
        "cache-control": response.headers.get("cache-control") ?? "private, max-age=60",
      },
    });
  } catch (error) {
    console.error("Error fetching aave-v3 reserve rates from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch reserve rates";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
