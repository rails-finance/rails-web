import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";

// api arm of the f(x) V2 per-pool aggregates (fx_pool_state + roster counts) —
// the listing header cards. Values are the worker sweep's settled reads
// (getTotalRawCollaterals / getTotalRawDebts / getNextPositionId at one head
// block) plus the latest indexed oracle price with the block it was read at.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export interface FxPoolStats {
  pool_key: string;
  total_raw_colls: string | null;
  total_raw_debts: string | null;
  next_position_id: number | null;
  oracle_price: string | null;
  price_block: string | null;
  block_number: string;
  refreshed_at: string;
  n_positions: number | null;
  n_open: number | null;
}

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ success: false, error: "Server configuration error" }, { status: 500 });
  }
  try {
    const response = await fetch(`${RAILS_API_URL}/api/fx/stats`, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `Backend error: ${response.statusText}` },
        { status: response.status },
      );
    }
    const raw = (await response.json()) as { pools: FxPoolStats[] };
    return NextResponse.json(
      { success: true, pools: raw.pools },
      { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) },
    );
  } catch (error) {
    console.error("Error fetching fx stats from backend:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch stats" }, { status: 500 });
  }
}
