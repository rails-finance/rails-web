import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { withRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { buildPwnTimeline, type MvRow } from "@/lib/sources/api/pwn-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// api arm of a PWN wallet's timeline — the LIVE rails-server index.
// rails-server returns the raw mv_pwn_events rows (loan lifecycle, LEFT JOINed to
// decoded terms); we run the chain-state presentation transform (buildPwnTimeline:
// ERC20/721 symbols + amounts + per-viewer signing) → BaseActivityEvent[]. Each
// event is discrete (no running-balance fold). No USD / no HF. Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

interface TimelineRowsResponse {
  wallet: string;
  rows: MvRow[];
  totalEvents: number;
  /** The index's row ceiling cut this query, so `rows` is short of
   *  `totalEvents`. Optional — a backend that predates the field means the
   *  fetch was not capped, and the page reads exactly as it did before. */
  truncated?: boolean;
  /** Where `?recent=N` drew the line: `rows` holds every event from this block
   *  onward and everything below it is the opening balance, fetched from the
   *  /summary twin with THIS number. Null (or absent, on a backend that
   *  predates it) means `rows` IS the whole history. */
  cutoffBlock?: number | null;
}

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  // Passed straight through, validated upstream: rails-server owns the shape of
  // `recent` and answers a bad one with its own 400. Re-validating it here would
  // be a second opinion about the same parameter, and the two would drift.
  const recent = request.nextUrl.searchParams.get("recent");

  try {
    const recentQs = recent ? `&recent=${encodeURIComponent(recent)}` : "";
    const url = `${RAILS_API_URL}/api/pwn/timeline?wallet=${encodeURIComponent(wallet)}${recentQs}`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const { rows, totalEvents, truncated, cutoffBlock } = (await response.json()) as TimelineRowsResponse;
    const data = await buildPwnTimeline(rows, wallet);
    // The ceiling and the window are different claims and both can be absent. A
    // windowed fetch is never truncated — it asked for a window and got one —
    // so `withRowCeiling` stays exactly as it was and simply never fires.
    const windowed = { ...withRowCeiling(data, { totalEvents, truncated }), cutoffBlock: cutoffBlock ?? null };
    return NextResponse.json(toTimelineWire(windowed, MAINNET_CHAIN_ID), {
      headers: proxyCacheControl(response, LISTING_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Error fetching pwn timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch timeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
