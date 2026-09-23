import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildMaplePositionRows, type RawMapleWalletRow } from "@/lib/sources/api/maple-positions";
import { MAPLE_KEY_BY_SYMBOL } from "@/lib/maple/asset-catalog";

// api arm of the Maple position listing — the LIVE rails-server index.
// rails-server does the structural filter/sort/paginate over mv_maple_wallets
// and returns the page slice as raw per-wallet rows (pool keys + the replayed
// lanes + scalars); we shape them against the fixed pool catalog and layer
// the per-pool chain state (exit/NAV rates + the liquid/deployed split) in
// buildMaplePositionRows. The pool-state map rides the response too — the
// listing's access band and the detail page read it from the same fetch.
// Returns the { success, data, poolState, pagination } envelope. Node
// runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

// The filter chips are share-token SYMBOLS; the rails route filters by pool
// KEY. Map off the same catalog the chips are populated from; raw keys pass
// through untouched.
function symbolsToPoolKeys(csvValue: string): string {
  return csvValue
    .split(",")
    .filter(Boolean)
    .map((s) => MAPLE_KEY_BY_SYMBOL[s] ?? s.toLowerCase())
    .filter(Boolean)
    .join(",");
}

interface PositionsRawResponse {
  rows: RawMapleWalletRow[];
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
    if (sp.get("inQueue")) qs.set("inQueue", sp.get("inQueue")!);
    if (sp.get("pools")) qs.set("pools", symbolsToPoolKeys(sp.get("pools")!));
    // Allowlist, like sortOrder: an unrecognised value is dropped rather than
    // forwarded verbatim, so rails-server's own default (recent) decides it.
    // No "debt" — a Maple lender position has no debt side.
    const sortBy = sp.get("sortBy");
    if (sortBy === "coll") qs.set("sortBy", sortBy);
    qs.set("sortOrder", sp.get("sortOrder") === "asc" ? "asc" : "desc");
    if (sp.get("limit") != null) qs.set("limit", sp.get("limit")!);
    if (sp.get("offset") != null) qs.set("offset", sp.get("offset")!);

    const url = `${RAILS_API_URL}/api/maple/positions?${qs.toString()}`;
    const response = await fetch(url, createAuthFetchOptions({ signal: request.signal }, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { success: false, error: `Backend error: ${response.statusText}` },
        { status: response.status },
      );
    }
    const raw = (await response.json()) as PositionsRawResponse;
    const { rows, poolState } = await buildMaplePositionRows(raw.rows);
    return NextResponse.json(
      {
        success: true,
        data: rows,
        poolState,
        // The browse listing's total already leaves out the known contracts
        // (server mig 227's list, the same one the row builder filters by), so
        // nothing is dropped there. A `?wallet=` lookup is exempt server-side:
        // when the builder drops that one row, the total drops with it.
        pagination: { total: raw.total - (raw.rows.length - rows.length), limit: raw.limit, offset: raw.offset },
      },
      { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) },
    );
  } catch (error) {
    console.error("Error fetching maple positions from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
