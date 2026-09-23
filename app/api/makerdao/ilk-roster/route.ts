import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl, ROSTER_CACHE_CONTROL } from "@/lib/api/proxy-cache";
import type { MakerIlkRosterEntry, MakerIlkRosterResponse } from "@/lib/api/fetch-makerdao-ilk-roster";

// Proxy to rails-server-onboarding's `/api/makerdao/ilk-roster` — every
// collateral type the vault index holds, with its vault counts. Unlike the
// Morpho market roster this needs no assembly: an ilk names itself, and the
// display symbol is a pure function of that name (ilkToCollateralSymbol),
// resolved at the render site. So the route is a shape transform and nothing
// more — snake_case rows in, the client's camelCase entries out.
//
// The membership list changes only when governance onboards a collateral type,
// so it is memoized in-process and declared cacheable for ten minutes at the
// edge — the same TTL the Morpho roster carries.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

/** In-process memo TTL, matching the edge TTL this route declares. */
const ROSTER_TTL_MS = 10 * 60 * 1000;

interface RawRosterRow {
  ilk: string;
  positions: number | string;
  open_positions: number | string;
}

interface RosterRawResponse {
  rows: RawRosterRow[];
  total: number;
}

let memo: { at: number; body: MakerIlkRosterResponse } | null = null;

function buildRoster(raw: RosterRawResponse): MakerIlkRosterResponse {
  const ilks: MakerIlkRosterEntry[] = raw.rows.map((r) => ({
    ilk: r.ilk,
    positions: Number(r.positions) || 0,
    openPositions: Number(r.open_positions) || 0,
  }));
  return { ilks, total: raw.total ?? ilks.length };
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
      `${RAILS_API_URL}/api/makerdao/ilk-roster`,
      createAuthFetchOptions(undefined, readerIp),
    );
    if (!response.ok) {
      // Includes the 404 this route answers with until the backend half is
      // deployed. The listing treats any failure as "no roster" and carries on
      // without the Collateral type chips — see the client.
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const body = buildRoster((await response.json()) as RosterRawResponse);
    memo = { at: Date.now(), body };
    return NextResponse.json(body, { headers: proxyCacheControl(response, ROSTER_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching makerdao ilk roster from backend:", error);
    return NextResponse.json({ error: "Failed to fetch ilk roster" }, { status: 500 });
  }
}
