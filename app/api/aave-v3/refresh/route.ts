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
// Each server instance keeps an answer for a minute and a failure for fifteen
// seconds, and concurrent stamps share one request in flight. The request is
// the listing's own page query for one row, count included.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;
const KEEP_MS = 60_000;

const KEEP_FAILED_MS = 15_000;

type Refresh = { block: number; at: number } | null;
/** The newest event block the listing's rows hold and its time in seconds; null when the read failed. */
let kept: { value: Refresh; until: number } | null = null;
let inFlight: Promise<Refresh> | null = null;

async function readRefresh(readerIp: string | undefined): Promise<Refresh> {
  if (!RAILS_API_URL) return null;
  try {
    const res = await fetch(`${RAILS_API_URL}/api/aave-v3/positions?limit=1`, createAuthFetchOptions({}, readerIp));
    if (!res.ok) return null;
    const body = (await res.json()) as { rows?: { lastBlockNumber?: number; lastActivityAt?: number }[] };
    const row = body.rows?.[0];
    if (typeof row?.lastBlockNumber !== "number" || typeof row.lastActivityAt !== "number") return null;
    return { block: row.lastBlockNumber, at: row.lastActivityAt };
  } catch (error) {
    console.error("Error reading the Aave V3 listing's refresh:", error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!kept || kept.until <= Date.now()) {
    inFlight ??= readRefresh(readerIpFromRequest(request)).finally(() => {
      inFlight = null;
    });
    const value = await inFlight;
    kept = { value, until: Date.now() + (value ? KEEP_MS : KEEP_FAILED_MS) };
  }
  return kept.value
    ? NextResponse.json(kept.value)
    : NextResponse.json({ error: "The refresh could not be read" }, { status: 502 });
}
