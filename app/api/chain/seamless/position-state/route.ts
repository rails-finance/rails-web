import { NextRequest, NextResponse } from "next/server";
import {
  PositionStateRefusal,
  loadAaveV3PositionStateAtBlock,
} from "@/lib/sources/chain/aave-v3-position-state-at-block";
import { SEAMLESS_CHAIN_ID, SEAMLESS_ORACLE, SEAMLESS_POOL } from "@/lib/seamless/asset-catalog";

// The position state of a Seamless account around one event's transaction,
// read from the chain at blocks N−1 and N through the Aave V3 Base lane's
// loader (Seamless is an Aave V3 fork on Base; its own Pool and oracle). The
// wire shape is the Aave V3 one, so the open card reads it the same way. A
// past block does not change, so an answer caches long.
//
// Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const wallet = params.get("wallet");
  const block = params.get("block");
  const tx = params.get("tx");
  if (!wallet || !ADDRESS.test(wallet) || !block || !/^\d+$/.test(block) || !tx || !TX_HASH.test(tx)) {
    return NextResponse.json({ error: "wallet, block and tx are required", code: "bad_request" }, { status: 400 });
  }
  try {
    const state = await loadAaveV3PositionStateAtBlock({
      wallet,
      pool: SEAMLESS_POOL,
      oracle: SEAMLESS_ORACLE,
      chainId: SEAMLESS_CHAIN_ID,
      block: Number(block),
      txHash: tx,
      market: "seamless",
    });
    const unnamed = state.reserves.some((r) => r.decimals == null);
    return NextResponse.json(state, {
      headers: { "Cache-Control": unnamed ? "no-store" : "public, max-age=86400, s-maxage=604800, immutable" },
    });
  } catch (error) {
    if (error instanceof PositionStateRefusal)
      return NextResponse.json({ error: error.code, code: error.code }, { status: error.status });
    console.error("Error reading Seamless position state:", error);
    return NextResponse.json({ error: "Failed to read position state", code: "proxy_error" }, { status: 502 });
  }
}
