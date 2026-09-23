import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { resolveEnsAddress } from "@/lib/ens/resolve-ens";
import { buildAaveV3PositionRows, type RawV3WalletRow } from "@/lib/sources/api/aave-v3-positions";
import { AAVE_V3_CATALOG } from "@/lib/aave-v3/asset-catalog";

// Proxies the Aave V3 positions listing from the live rails-server index.
// rails-server does the structural filter/sort/paginate over
// mv_aave_v3_positions and returns the page slice as raw per-wallet rows; we
// resolve symbols + assemble the card shape (buildAaveV3PositionRows) and
// return a { rows, total, limit, offset } envelope. HF / oracle USD are null
// here (no chain snapshot on this index yet — the V3 slice-2 gap). Node
// runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

interface PositionsRawResponse {
  rows: RawV3WalletRow[];
  total: number;
  limit: number;
  offset: number;
}

// The filter chips are asset SYMBOLS; the rails route filters by token ADDRESS.
// Map here off the same catalog the chips are populated from (a symbol can map to
// more than one address across the listed/delisted long-tail — keep them all).
const SYMBOL_TO_ADDRESSES = new Map<string, string[]>();
for (const a of AAVE_V3_CATALOG) {
  const list = SYMBOL_TO_ADDRESSES.get(a.symbol) ?? [];
  list.push(a.address.toLowerCase());
  SYMBOL_TO_ADDRESSES.set(a.symbol, list);
}

const csv = (v: string | null): string[] => (v ?? "").split(",").filter(Boolean);

function symbolsToAddresses(symbols: string[]): string[] {
  const out = new Set<string>();
  for (const s of symbols) for (const addr of SYMBOL_TO_ADDRESSES.get(s) ?? []) out.add(addr);
  return [...out];
}

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const sp = request.nextUrl.searchParams;
  try {
    let wallet = sp.get("wallet") ?? undefined;
    const ownerEns = sp.get("ownerEns");
    if (ownerEns && !wallet) {
      const resolved = await resolveEnsAddress(ownerEns);
      if (resolved) wallet = resolved;
    }

    const qs = new URLSearchParams();
    if (wallet) qs.set("wallet", wallet);
    if (sp.get("hasDebt") === "true") qs.set("hasDebt", "true");
    if (sp.get("noDebt") === "true") qs.set("noDebt", "true");
    if (sp.get("hasLiquidations") === "true") qs.set("hasLiquidations", "true");
    if (sp.get("hasLiquidations") === "false") qs.set("hasLiquidations", "false");
    if (sp.get("market")) qs.set("market", sp.get("market")!);
    // Lifecycle Status facet — rails-server filters mv_aave_v3_wallet_markets.status
    // (mig 105; whole-lifecycle). Absent = the whole lifecycle (a cleared chip).
    if (sp.get("status")) qs.set("status", sp.get("status")!);
    const supplyAddrs = symbolsToAddresses(csv(sp.get("supplyAssets")));
    const borrowAddrs = symbolsToAddresses(csv(sp.get("borrowAssets")));
    if (supplyAddrs.length) qs.set("supplyAssets", supplyAddrs.join(","));
    if (borrowAddrs.length) qs.set("borrowAssets", borrowAddrs.join(","));
    // Allowlist, like sortOrder: an unrecognised value is dropped rather than
    // forwarded verbatim, so rails-server's own default (recent) decides it —
    // same "unrecognised ⇒ default, no error" stance the route takes throughout.
    const sortBy = sp.get("sortBy");
    if (sortBy === "debt" || sortBy === "coll") qs.set("sortBy", sortBy);
    qs.set("sortOrder", sp.get("sortOrder") === "asc" ? "asc" : "desc");
    if (sp.get("limit") != null) qs.set("limit", sp.get("limit")!);
    if (sp.get("offset") != null) qs.set("offset", sp.get("offset")!);

    const url = `${RAILS_API_URL}/api/aave-v3/positions?${qs.toString()}`;
    const response = await fetch(url, createAuthFetchOptions({ signal: request.signal }, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const raw = (await response.json()) as PositionsRawResponse;
    const rows = await buildAaveV3PositionRows(raw.rows);
    return NextResponse.json(
      { rows, total: raw.total, limit: raw.limit, offset: raw.offset },
      { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) },
    );
  } catch (error) {
    console.error("Error fetching aave-v3 positions from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
