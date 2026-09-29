import { NextRequest, NextResponse } from "next/server";
import { FX_EVENT_STATE_MAX_BLOCKS, readFxEventState } from "@/lib/sources/chain/fx-event-state";
import { isFxPoolKey } from "@/lib/fx/asset-catalog";

// One f(x) position at the blocks around its timeline rows
// (lib/sources/chain/fx-event-state.ts): getPosition, getPositionDebtRatio and
// the wstETH rate at block − 1 and at each block; with `prices` the oracle's
// anchor and min legs there; with `tick` (one block) the tick the position
// sits in; with `tx` (one block only) the fee schedule the
// manager's caller paid, the default beside it, a filled limit order, and the
// manager's share of a bonus. A mined block never changes, so the answer is kept in process memory
// and cached hard at the edge. Node runtime.

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const pool = sp.get("pool") ?? "";
  const id = sp.get("id") ?? "";
  const blocks = (sp.get("blocks") ?? "")
    .split(",")
    .filter(Boolean)
    .map((b) => (/^\d{1,10}$/.test(b) ? Number(b) : NaN));
  const tx = sp.get("tx") ?? "";
  const prices = sp.get("prices") === "1";
  const tick = sp.get("tick") === "1";
  if (
    !isFxPoolKey(pool) ||
    !/^\d{1,10}$/.test(id) ||
    blocks.length === 0 ||
    blocks.length > FX_EVENT_STATE_MAX_BLOCKS ||
    blocks.some((b) => !Number.isFinite(b) || b < 1) ||
    (tx !== "" && (!/^0x[0-9a-fA-F]{64}$/.test(tx) || blocks.length !== 1)) ||
    (tick && blocks.length !== 1)
  ) {
    return NextResponse.json(
      { error: `pool, id and 1–${FX_EVENT_STATE_MAX_BLOCKS} blocks are required; tx and tick go with one block` },
      { status: 400 },
    );
  }
  try {
    const data = await readFxEventState(
      pool,
      id,
      blocks,
      tx ? (tx.toLowerCase() as `0x${string}`) : undefined,
      prices,
      tick,
    );
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } });
  } catch (error) {
    console.error("Error reading the f(x) event state:", error);
    return NextResponse.json({ error: "Failed to read the position at those blocks" }, { status: 502 });
  }
}
