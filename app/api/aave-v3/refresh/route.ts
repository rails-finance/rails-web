import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";

// The refresh the Aave V3 listing reads from (ui-jobs 806). The listing's rows
// come from mv_aave_v3_wallet_markets and mv_aave_v3_positions, which mv-update
// refreshes about hourly, while the event tail is at the head. The newest
// row's last event is the newest block the refresh holds: rails-server's
// positions route, asked for one row in its default order (most recent
// activity first) and no filter, answers it.
//
// The answer is kept for a minute in this server's memory, so a listing's
// stamp costs rails-server one count per minute at most.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;
const KEEP_MS = 60_000;

/** The newest event block the listing's rows hold, and its time in seconds. */
let kept: { value: { block: number; at: number }; until: number } | null = null;

export async function GET(request: NextRequest) {
  if (kept && kept.until > Date.now()) return NextResponse.json(kept.value);
  if (!RAILS_API_URL) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  try {
    const res = await fetch(
      `${RAILS_API_URL}/api/aave-v3/positions?limit=1`,
      createAuthFetchOptions({ signal: request.signal }, readerIpFromRequest(request)),
    );
    if (!res.ok) return NextResponse.json({ error: `Backend error: ${res.status}` }, { status: 502 });
    const body = (await res.json()) as { rows?: { lastBlockNumber?: number; lastActivityAt?: number }[] };
    const row = body.rows?.[0];
    if (typeof row?.lastBlockNumber !== "number" || typeof row.lastActivityAt !== "number")
      return NextResponse.json({ error: "No rows" }, { status: 502 });
    const value = { block: row.lastBlockNumber, at: row.lastActivityAt };
    kept = { value, until: Date.now() + KEEP_MS };
    return NextResponse.json(value);
  } catch (error) {
    console.error("Error reading the Aave V3 listing's refresh:", error);
    return NextResponse.json({ error: "Failed to read the refresh" }, { status: 502 });
  }
}
