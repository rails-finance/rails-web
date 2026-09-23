import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";

const RAILS_API_URL = process.env.RAILS_API_URL;

// Proxy to rails-server's /api/oracle/aave-v4 — the on-chain oracle price map
// (asset address → USD) read from the same Chainlink feeds Aave's risk engine
// uses. Lets On-chain-values value collateral/debt as chain-derived instead of
// DefiLlama. Sibling of the liquity-v2 oracle proxy.
//
// `?block=N` asks for the same read PINNED to a past block — the feeds' own
// state then, which the market note's earlier end is read from. That answer
// cannot change, so the backend's immutable Cache-Control is passed straight
// through rather than being replaced by this route's default.
export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ success: false, error: "Server configuration error" }, { status: 500 });
  }

  const block = request.nextUrl.searchParams.get("block");
  if (block !== null && !/^\d+$/.test(block)) {
    return NextResponse.json({ success: false, error: "block must be a whole block number" }, { status: 400 });
  }

  try {
    const url = `${RAILS_API_URL}/api/oracle/aave-v4${block !== null ? `?block=${block}` : ""}`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));

    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { success: false, error: `Backend error: ${response.statusText}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    const cacheControl = response.headers.get("cache-control");
    return NextResponse.json(data, {
      ...(data?.pinned === true && cacheControl ? { headers: { "Cache-Control": cacheControl } } : {}),
    });
  } catch (error) {
    console.error("Error fetching aave-v4 oracle prices from backend:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch aave-v4 oracle prices" }, { status: 500 });
  }
}
