import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildCompoundV2PositionRows, type RawCompoundV2WalletRow } from "@/lib/sources/api/compound-v2-positions";
import { COMPOUND_V2_KEYS_BY_SYMBOL } from "@/lib/compound-v2/asset-catalog";

// api arm of the Compound V2 position listing — the LIVE rails-server index.
// rails-server does the structural filter/sort/paginate over
// mv_compound_v2_wallets and returns the page slice as raw per-wallet rows
// (market keys + the three replayed lanes + scalars); we shape them against
// the fixed market catalog and layer the per-market chain state (exchange
// rate → current supply value; the protocol's own oracle → USD, with the
// fixed-price/no-feed flag) in buildCompoundV2PositionRows. Returns the
// { success, data, pagination } envelope. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

// The filter chips are underlying SYMBOLS; the rails route filters by market
// KEY. One symbol can name SEVERAL markets — WBTC is two (wbtc, wbtc2) — so
// the map is one-to-many and every matching key is sent. Raw keys pass
// through untouched.
function symbolsToMarketKeys(csvValue: string): string {
  return csvValue
    .split(",")
    .filter(Boolean)
    .flatMap((s) => COMPOUND_V2_KEYS_BY_SYMBOL[s] ?? [s.toLowerCase()])
    .filter(Boolean)
    .join(",");
}

interface PositionsRawResponse {
  rows: RawCompoundV2WalletRow[];
  total: number;
  limit: number;
  offset: number;
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
    if (sp.get("supplyAssets")) qs.set("supplyMarkets", symbolsToMarketKeys(sp.get("supplyAssets")!));
    if (sp.get("borrowAssets")) qs.set("borrowMarkets", symbolsToMarketKeys(sp.get("borrowAssets")!));
    // Allowlist, like sortOrder: an unrecognised value is dropped rather than
    // forwarded verbatim, so rails-server's own default (recent) decides it —
    // same "unrecognised ⇒ default, no error" stance the route takes throughout.
    const sortBy = sp.get("sortBy");
    if (sortBy === "debt" || sortBy === "coll") qs.set("sortBy", sortBy);
    qs.set("sortOrder", sp.get("sortOrder") === "asc" ? "asc" : "desc");
    if (sp.get("limit") != null) qs.set("limit", sp.get("limit")!);
    if (sp.get("offset") != null) qs.set("offset", sp.get("offset")!);

    const url = `${RAILS_API_URL}/api/compound-v2/positions?${qs.toString()}`;
    const response = await fetch(url, createAuthFetchOptions({ signal: request.signal }, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { success: false, error: `Backend error: ${response.statusText}` },
        { status: response.status },
      );
    }
    const raw = (await response.json()) as PositionsRawResponse;
    const data = await buildCompoundV2PositionRows(raw.rows);
    return NextResponse.json(
      {
        success: true,
        data,
        pagination: { total: raw.total, limit: raw.limit, offset: raw.offset },
      },
      { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) },
    );
  } catch (error) {
    console.error("Error fetching compound-v2 positions from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
