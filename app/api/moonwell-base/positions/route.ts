import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildMoonwellPositionRows, type RawMoonwellWalletRow } from "@/lib/sources/api/moonwell-positions";
import { rosterFromMarketState, type RawMoonwellBaseMarketState } from "@/lib/moonwell-base/listing-roster";
import type { BaseLendingCoverage } from "@/lib/api/fetch-aave-v3-positions";

// The Moonwell Base positions listing — rails-server's /api/moonwell-base/
// positions (mig 172: one row per wallet that ever held a position, joined to
// that wallet's chain truth at a pinned Base block) shaped by the shared
// Moonwell builder against the roster the SAME response carries. Nothing here
// touches the chain: every balance, rate and price on a row was read by the
// Base sweep at the block the row names. Asset facets arrive as mToken
// ADDRESSES and pass straight down — no symbol mapping (two markets share one).
// Returns the { success, data, pagination, coverage } envelope.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

interface PositionsRawResponse {
  rows: RawMoonwellWalletRow[];
  total: number;
  limit: number;
  offset: number;
  marketState?: RawMoonwellBaseMarketState[] | null;
  coverage?: BaseLendingCoverage | null;
}

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ success: false, error: "Server configuration error" }, { status: 500 });
  }

  const sp = request.nextUrl.searchParams;
  try {
    const qs = new URLSearchParams();
    if (sp.get("wallet")) qs.set("wallet", sp.get("wallet")!);
    if (sp.get("status")) qs.set("status", sp.get("status")!);
    if (sp.get("hasDebt")) qs.set("hasDebt", sp.get("hasDebt")!);
    if (sp.get("noDebt")) qs.set("noDebt", sp.get("noDebt")!);
    if (sp.get("hasLiquidations")) qs.set("hasLiquidations", sp.get("hasLiquidations")!);
    if (sp.get("supplyAssets")) qs.set("supplyMarkets", sp.get("supplyAssets")!.toLowerCase());
    if (sp.get("borrowAssets")) qs.set("borrowMarkets", sp.get("borrowAssets")!.toLowerCase());
    // Allowlist, like sortOrder: an unrecognised value is dropped rather than
    // forwarded verbatim, so rails-server's own default (recent) decides it —
    // same "unrecognised ⇒ default, no error" stance the route takes throughout,
    // and the same gate the Ethereum Moonwell proxy and the Compound proxy use.
    const sortBy = sp.get("sortBy");
    if (sortBy === "debt" || sortBy === "coll") qs.set("sortBy", sortBy);
    qs.set("sortOrder", sp.get("sortOrder") === "asc" ? "asc" : "desc");
    if (sp.get("limit") != null) qs.set("limit", sp.get("limit")!);
    if (sp.get("offset") != null) qs.set("offset", sp.get("offset")!);

    const url = `${RAILS_API_URL}/api/moonwell-base/positions?${qs.toString()}`;
    const response = await fetch(url, createAuthFetchOptions({ signal: request.signal }, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { success: false, error: `Backend error: ${response.statusText}` },
        { status: response.status },
      );
    }
    const raw = (await response.json()) as PositionsRawResponse;
    const data = await buildMoonwellPositionRows(raw.rows, rosterFromMarketState(raw.marketState));
    return NextResponse.json(
      {
        success: true,
        data,
        pagination: { total: raw.total, limit: raw.limit, offset: raw.offset },
        coverage: raw.coverage ?? null,
      },
      { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) },
    );
  } catch (error) {
    console.error("Error fetching moonwell-base positions from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
