import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl, ROSTER_CACHE_CONTROL } from "@/lib/api/proxy-cache";
import type { DolomiteMarketRosterEntry, DolomiteMarketRosterResponse } from "@/lib/api/fetch-dolomite-market-roster";

// Proxy to rails-server's `/api/dolomite/market-roster`: every market the core
// holds, with its account counts. A shape transform (snake_case rows in, the
// client's camelCase entries out); the symbol and market id come from the
// server's dolomite_markets table. The list changes only when governance adds a
// market, so it is memoized in-process and declared cacheable for ten minutes
// at the edge, the TTL the MakerDAO and Morpho rosters carry.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

/** In-process memo TTL, matching the edge TTL this route declares. */
const ROSTER_TTL_MS = 10 * 60 * 1000;

interface RawRosterRow {
  market_id: string | number;
  symbol: string;
  token: string;
  positions: number | string;
  open_positions: number | string;
  supply_open: number | string;
  borrow_open: number | string;
}

interface RosterRawResponse {
  rows: RawRosterRow[];
  total: number;
}

let memo: { at: number; body: DolomiteMarketRosterResponse } | null = null;

function buildRoster(raw: RosterRawResponse): DolomiteMarketRosterResponse {
  const markets: DolomiteMarketRosterEntry[] = raw.rows.map((r) => ({
    marketId: String(r.market_id),
    symbol: r.symbol,
    token: r.token,
    positions: Number(r.positions) || 0,
    openPositions: Number(r.open_positions) || 0,
    supplyOpen: Number(r.supply_open) || 0,
    borrowOpen: Number(r.borrow_open) || 0,
  }));
  return { markets, total: raw.total ?? markets.length };
}

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  if (memo && Date.now() - memo.at < ROSTER_TTL_MS) {
    return NextResponse.json(memo.body, { headers: { "Cache-Control": ROSTER_CACHE_CONTROL } });
  }

  try {
    const response = await fetch(
      `${RAILS_API_URL}/api/dolomite/market-roster`,
      createAuthFetchOptions(undefined, readerIp),
    );
    if (!response.ok) {
      // The listing treats any failure as "no roster" and carries on without
      // the asset chips.
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const body = buildRoster((await response.json()) as RosterRawResponse);
    memo = { at: Date.now(), body };
    return NextResponse.json(body, { headers: proxyCacheControl(response, ROSTER_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching dolomite market roster from backend:", error);
    return NextResponse.json({ error: "Failed to fetch market roster" }, { status: 500 });
  }
}
