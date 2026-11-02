import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl, ROSTER_CACHE_CONTROL } from "@/lib/api/proxy-cache";
import type {
  FrankencoinCollateralRosterEntry,
  FrankencoinCollateralRosterResponse,
} from "@/lib/api/fetch-frankencoin-collateral-roster";

// Proxy to rails-server's `/api/frankencoin/collateral-roster`: every collateral
// token the index has seen, with its position counts. A shape transform
// (snake_case rows in, the client's camelCase entries out). The list changes
// only when someone opens a position on a new token, so it is memoized
// in-process and declared cacheable for ten minutes at the edge, the TTL the
// MakerDAO and Morpho rosters carry.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

/** In-process memo TTL, matching the edge TTL this route declares. */
const ROSTER_TTL_MS = 10 * 60 * 1000;

interface RawRosterRow {
  collateral_token: string;
  collateral_symbol: string;
  positions: number | string;
  open_positions: number | string;
}

interface RosterRawResponse {
  rows: RawRosterRow[];
  total: number;
}

let memo: { at: number; body: FrankencoinCollateralRosterResponse } | null = null;

function buildRoster(raw: RosterRawResponse): FrankencoinCollateralRosterResponse {
  const tokens: FrankencoinCollateralRosterEntry[] = raw.rows.map((r) => ({
    token: r.collateral_token.toLowerCase(),
    symbol: r.collateral_symbol || `${r.collateral_token.slice(0, 6)}…${r.collateral_token.slice(-4)}`,
    positions: Number(r.positions) || 0,
    openPositions: Number(r.open_positions) || 0,
  }));
  return { tokens, total: raw.total ?? tokens.length };
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
      `${RAILS_API_URL}/api/frankencoin/collateral-roster`,
      createAuthFetchOptions(undefined, readerIp),
    );
    if (!response.ok) {
      // The listing treats any failure as "no roster" and carries on without
      // the collateral chips.
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const body = buildRoster((await response.json()) as RosterRawResponse);
    memo = { at: Date.now(), body };
    return NextResponse.json(body, { headers: proxyCacheControl(response, ROSTER_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching frankencoin collateral roster from backend:", error);
    return NextResponse.json({ error: "Failed to fetch collateral roster" }, { status: 500 });
  }
}
