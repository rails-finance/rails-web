import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";

// POST pass-through to the live rails-server index — the reserve's own rate
// read AROUND a position's own transactions, for the SparkLend market notes.
// The Aave V3 twin of this file, and the same shared upstream service
// (api/src/services/aave-family-reserve-rates.ts); SparkLend is a single
// mainnet Pool, so nothing here or upstream carries a market axis.
//
// POST rather than GET because the question IS a list of chain coordinates.
// The upstream's own validation is the only validation — see the Aave V3
// route's header. Node runtime, no edge caching.

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
      `${RAILS_API_URL}/api/spark/reserve-rates`,
      createAuthFetchOptions({ method: "POST", body, headers: { "content-type": "application/json" } }, readerIp),
    );
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: {
        "content-type": "application/json",
        "cache-control": response.headers.get("cache-control") ?? "private, max-age=60",
      },
    });
  } catch (error) {
    console.error("Error fetching spark reserve rates from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch reserve rates";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
