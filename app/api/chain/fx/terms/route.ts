import { NextRequest, NextResponse } from "next/server";
import { readFxPoolTerms } from "@/lib/sources/chain/fx-terms";
import { isFxPoolKey } from "@/lib/fx/asset-catalog";

// One f(x) pool's terms at head (lib/sources/chain/fx-terms.ts): the rebalance
// and liquidation lines, the borrow ceiling, funding, the default fee schedule,
// the manager's share of a bonus and the redemption gate. Two eth_calls, kept
// ten minutes in process and at the edge. Node runtime.

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const pool = request.nextUrl.searchParams.get("pool") ?? "";
  if (!isFxPoolKey(pool)) return NextResponse.json({ error: "pool is required" }, { status: 400 });
  try {
    const data = await readFxPoolTerms(pool);
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=300, s-maxage=600" } });
  } catch (error) {
    console.error("Error reading the f(x) pool terms:", error);
    return NextResponse.json({ error: "Failed to read the pool's terms" }, { status: 502 });
  }
}
