import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildMakerTimeline, type RawMakerTimelineResponse } from "@/lib/sources/api/makerdao-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// Proxies a single MakerDAO vault's timeline from the live rails-server index.
// rails returns the raw frob/grab deltas + vault meta; we replay the running
// ink/art and shape the BaseActivityEvent[] (buildMakerTimeline). `vaultId` is
// the CdpManager id (a urn address also resolves).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest, context: { params: Promise<{ vaultId: string }> }) {
  const readerIp = readerIpFromRequest(request);
  const { vaultId } = await context.params;
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    // Passed straight through, validated upstream: rails-server owns the shape
    // of `recent` and answers a bad one with its own 400.
    const recent = request.nextUrl.searchParams.get("recent");
    const recentQs = recent ? `?recent=${encodeURIComponent(recent)}` : "";
    const url = `${RAILS_API_URL}/api/makerdao/vault/${encodeURIComponent(vaultId)}/timeline${recentQs}`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const raw = (await response.json()) as RawMakerTimelineResponse;
    const result = { ...buildMakerTimeline(raw), cutoffBlock: raw.cutoffBlock ?? null };
    return NextResponse.json(toTimelineWire(result, MAINNET_CHAIN_ID), {
      headers: proxyCacheControl(response, LISTING_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Error fetching makerdao vault timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch timeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
