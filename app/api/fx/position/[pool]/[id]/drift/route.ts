import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";
import { isFxPoolKey } from "@/lib/fx/asset-catalog";

// api arm of one f(x) position's PER-INTERVAL socialized drift — the LIVE
// rails-server index reads the pool's own getPosition at the position's event
// boundaries (archive eth_calls, cached server-side once a block has passed)
// and ends the last interval at its settled sweep row. Passed through whole:
// the shape is lib/sources/api/fx-drift.ts's FxDriftResult, and a 502 carries
// the server's one-word reason for the panel to show.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

const DRIFT_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";

export async function GET(request: NextRequest, { params }: { params: Promise<{ pool: string; id: string }> }) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  const { pool, id } = await params;
  if (!isFxPoolKey(pool) || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Invalid position" }, { status: 400 });
  }
  try {
    const response = await fetch(
      `${RAILS_API_URL}/api/fx/position/${pool}/${id}/drift`,
      createAuthFetchOptions(undefined, readerIp),
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { reason?: unknown } | null;
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        {
          error: "Boundary reads failed",
          ...(typeof body?.reason === "string" ? { reason: body.reason } : {}),
        },
        { status: response.status === 404 ? 404 : 502 },
      );
    }
    const raw = await response.json();
    return NextResponse.json(raw, { headers: proxyCacheControl(response, DRIFT_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching fx drift from backend:", error);
    return NextResponse.json({ error: "Boundary reads failed", reason: "the index did not answer" }, { status: 502 });
  }
}
