import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildSparkPositionRows, type RawSparkWalletRow } from "@/lib/sources/api/spark-positions";
import { SPARK_ADDR_BY_SYMBOL } from "@/lib/spark/asset-catalog";

// api arm of the SparkLend position listing — the LIVE rails-server index.
// rails-server does the structural filter/sort/paginate over mv_spark_positions
// and returns the page slice as raw per-wallet rows (token addresses + replayed
// balances + scalars); we resolve symbols + split each wallet's supplies/borrows
// (buildSparkPositionRows). Chain-state tier — no HF/USD overlay. Returns the
// { success, data, pagination } envelope. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

// The filter chips are asset SYMBOLS; the rails route filters by token ADDRESS.
// Map here off the same catalog the chips are populated from; raw 0x addresses
// pass through untouched.
function symbolsToAddresses(csvValue: string): string {
  return csvValue
    .split(",")
    .filter(Boolean)
    .map((s) => (s.startsWith("0x") ? s.toLowerCase() : (SPARK_ADDR_BY_SYMBOL[s] ?? "")))
    .filter(Boolean)
    .join(",");
}

interface PositionsRawResponse {
  rows: RawSparkWalletRow[];
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
    if (sp.get("supplyAssets")) qs.set("supplyAssets", symbolsToAddresses(sp.get("supplyAssets")!));
    if (sp.get("borrowAssets")) qs.set("borrowAssets", symbolsToAddresses(sp.get("borrowAssets")!));
    // Allowlist, like sortOrder: an unrecognised value is dropped rather than
    // forwarded verbatim, so rails-server's own default (recent) decides it —
    // same "unrecognised ⇒ default, no error" stance the route takes throughout.
    const sortBy = sp.get("sortBy");
    if (sortBy === "debt" || sortBy === "coll") qs.set("sortBy", sortBy);
    qs.set("sortOrder", sp.get("sortOrder") === "asc" ? "asc" : "desc");
    if (sp.get("limit") != null) qs.set("limit", sp.get("limit")!);
    if (sp.get("offset") != null) qs.set("offset", sp.get("offset")!);

    const url = `${RAILS_API_URL}/api/spark/positions?${qs.toString()}`;
    const response = await fetch(url, createAuthFetchOptions({ signal: request.signal }, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { success: false, error: `Backend error: ${response.statusText}` },
        { status: response.status },
      );
    }
    const raw = (await response.json()) as PositionsRawResponse;
    const data = await buildSparkPositionRows(raw.rows);
    return NextResponse.json(
      {
        success: true,
        data,
        pagination: { total: raw.total, limit: raw.limit, offset: raw.offset },
      },
      { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) },
    );
  } catch (error) {
    console.error("Error fetching spark positions from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
