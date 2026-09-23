import { NextRequest, NextResponse } from "next/server";
import { loadLlamalendPositionFromChain, UnknownLlamalendMarketError } from "@/lib/sources/chain/llamalend-position";
import { normalizeAddressParam } from "@/lib/llamalend/asset-catalog";

// Chain arm of the LlamaLend position read — the live soft-liquidation
// surface for one POSITION, keyed exactly as the protocol keys it:
// (controller, user). Both params are required — a user alone is not a risk
// unit (controllers are isolated markets liquidated independently), so there
// is no user-only read here by design. ONE multicall per position:
// user_state + read_user_tick_numbers + get_sum_xy + A + get_base_price +
// price_oracle. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const controller = normalizeAddressParam(request.nextUrl.searchParams.get("controller") ?? "");
  const user = normalizeAddressParam(request.nextUrl.searchParams.get("user") ?? "");
  if (!controller || !user) {
    return NextResponse.json({ error: "controller and user are required" }, { status: 400 });
  }
  try {
    const data = await loadLlamalendPositionFromChain(controller, user);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof UnknownLlamalendMarketError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Error loading LlamaLend position from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load chain position";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
