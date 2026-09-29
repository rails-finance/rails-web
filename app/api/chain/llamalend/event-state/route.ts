import { NextRequest, NextResponse } from "next/server";
import { readLlamalendEventState } from "@/lib/sources/chain/llamalend-event-state";
import { UnknownLlamalendMarketError } from "@/lib/sources/chain/llamalend-position";
import { normalizeAddressParam } from "@/lib/llamalend/asset-catalog";

// One LlamaLend position's state at the block before an event and at the
// event's block (lib/sources/chain/llamalend-event-state.ts): collateral,
// converted, debt, ticks, band prices, health and the stored discount. Two
// eth_calls per request, and with `start=1` (a liquidation row) the position
// at the start of the block: one block-header read and one more eth_call. A
// mined block never changes, so the answer is kept
// in process memory and cached hard at the edge. Node runtime.

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const controller = normalizeAddressParam(sp.get("controller") ?? "");
  const user = normalizeAddressParam(sp.get("user") ?? "");
  const blockParam = sp.get("block") ?? "";
  if (!controller || !user || !/^\d{1,10}$/.test(blockParam)) {
    return NextResponse.json({ error: "controller, user and block are required" }, { status: 400 });
  }
  try {
    const data = await readLlamalendEventState(controller, user, Number(blockParam), sp.get("start") === "1");
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } });
  } catch (error) {
    if (error instanceof UnknownLlamalendMarketError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Error reading the LlamaLend event state:", error);
    return NextResponse.json({ error: "Failed to read the position at that block" }, { status: 502 });
  }
}
