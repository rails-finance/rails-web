import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl, ROSTER_CACHE_CONTROL } from "@/lib/api/proxy-cache";
import type { MakerRateLogResponse } from "@/lib/api/fetch-makerdao-rate-log";

// Proxy to rails-server-onboarding's `/api/makerdao/ilks/:ilk/rate-log` — every
// yearly stability fee a collateral type has run at, and the drip each was
// first evidenced by.
//
// Maker emits no rate-set log: governance files a `duty` on the Jug, and the
// spell's own block is not indexed. The backend derives the series from the
// Vat's own rate accumulator (one row per Jug.drip) and then CONFIRMS every set
// against the Jug at that set's own block, so `sets[].aprPct` is a chain read
// and `derivedAprPct` is the derivation beside it. `artefacts[]` holds the
// derived sets the chain says were never a change — the signature of the gap in
// the fold series on the busy ilks. The whole rule is argued out in
// rails-server-onboarding's api/src/services/maker-rate-log.ts and
// sql/makerdao-rate-log.sql.
//
// Like the ilk roster this is a pure forward — the backend already answers in
// the shape the client reads — so the route is the auth hop and the caching,
// nothing more. A rate log changes only when governance moves a duty, which is
// the roster TTL exactly: ten minutes at the edge, an hour of
// stale-while-revalidate.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest, { params }: { params: Promise<{ ilk: string }> }) {
  const { ilk } = await params;
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const response = await fetch(
      `${RAILS_API_URL}/api/makerdao/ilks/${encodeURIComponent(ilk)}/rate-log`,
      createAuthFetchOptions(undefined, readerIp),
    );
    if (!response.ok) {
      // Includes the 400 an unknown collateral type answers with, and the 404
      // this route answers with until the backend half is deployed. The vault
      // page treats any failure as "no rate log" and renders without notes —
      // never a note built on a guessed fee.
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const body = (await response.json()) as MakerRateLogResponse;
    return NextResponse.json(body, { headers: proxyCacheControl(response, ROSTER_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching makerdao rate log from backend:", error);
    return NextResponse.json({ error: "Failed to fetch rate log" }, { status: 500 });
  }
}
