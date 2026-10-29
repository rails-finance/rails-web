import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";
import { FX_EVENT_STATE_MAX_BLOCKS } from "@/lib/sources/chain/fx-event-state";
import { isFxPoolKey } from "@/lib/fx/asset-catalog";

// One f(x) position at the blocks around its timeline rows
// (lib/sources/chain/fx-event-state.ts has the shape): getPosition,
// getPositionDebtRatio and the wstETH rate at block − 1 and at each block; with
// `prices` the oracle's anchor and min legs there; with `tick` (one block) the
// tick the position sits in; with `tx` (one block only) the fee schedule the
// manager's caller paid, the default beside it, a filled limit order, and the
// manager's share of a bonus. Proxy to rails-server's
// `/api/at-block/fx/event-state`, which keeps each read once at a finalized
// block (server migs 412, 413; rails-ops decisions/0056) and reads blocks past
// finality from the chain unkept. The backend's Cache-Control is forwarded.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const pool = sp.get("pool") ?? "";
  const id = sp.get("id") ?? "";
  const rawBlocks = (sp.get("blocks") ?? "").split(",").filter(Boolean);
  const blocks = rawBlocks.map((b) => (/^\d{1,10}$/.test(b) ? Number(b) : NaN));
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
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    const qs = new URLSearchParams({ pool, id, blocks: blocks.join(",") });
    if (tx) qs.set("tx", tx.toLowerCase());
    if (prices) qs.set("prices", "1");
    if (tick) qs.set("tick", "1");
    const response = await fetch(
      `${RAILS_API_URL}/api/at-block/fx/event-state?${qs.toString()}`,
      createAuthFetchOptions(undefined, readerIpFromRequest(request)),
    );
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: "Failed to read the position at those blocks" }, { status: 502 });
    }
    return NextResponse.json(await response.json(), { headers: proxyCacheControl(response) });
  } catch (error) {
    console.error("Error fetching the f(x) event state from backend:", error);
    return NextResponse.json({ error: "Failed to read the position at those blocks" }, { status: 502 });
  }
}
