import { NextRequest, NextResponse } from "next/server";
import {
  PositionStateRefusal,
  loadAaveV3PositionStateAtBlock,
} from "@/lib/sources/chain/aave-v3-position-state-at-block";
import { SPARK_ADDRESSES } from "@/lib/spark/asset-catalog";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { AaveV3PositionState } from "@/lib/aave-v3/position-state";

// The position state of a SparkLend account around one event's transaction,
// read from the chain at blocks N−1 and N through the Aave V3 Base lane's
// loader (SparkLend is an Aave V3 fork; the index serves no SparkLend position
// state). A past block does not change, so an answer is kept in the process per
// (wallet, block, tx) and caches long at the edge.
//
// Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

const CACHE_MAX = 2000;
const kept = new Map<string, Promise<AaveV3PositionState>>();

function read(wallet: string, block: number, tx: string): Promise<AaveV3PositionState> {
  const key = `${wallet.toLowerCase()}:${block}:${tx.toLowerCase()}`;
  const hit = kept.get(key);
  if (hit) return hit;
  if (kept.size >= CACHE_MAX) {
    const oldest = kept.keys().next().value;
    if (oldest != null) kept.delete(oldest);
  }
  const p = loadAaveV3PositionStateAtBlock({
    wallet,
    pool: SPARK_ADDRESSES.POOL,
    oracle: SPARK_ADDRESSES.ORACLE,
    chainId: MAINNET_CHAIN_ID,
    block,
    txHash: tx,
    market: "spark",
  });
  kept.set(key, p);
  // A failed or partly named answer is asked again next time.
  p.then(
    (s) => {
      if (s.reserves.some((r) => r.decimals == null)) kept.delete(key);
    },
    () => kept.delete(key),
  );
  return p;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const wallet = params.get("wallet");
  const block = params.get("block");
  const tx = params.get("tx");
  if (!wallet || !ADDRESS.test(wallet) || !block || !/^\d+$/.test(block) || !tx || !TX_HASH.test(tx)) {
    return NextResponse.json({ error: "wallet, block and tx are required", code: "bad_request" }, { status: 400 });
  }
  try {
    const state = await read(wallet, Number(block), tx);
    const unnamed = state.reserves.some((r) => r.decimals == null);
    return NextResponse.json(state, {
      headers: { "Cache-Control": unnamed ? "no-store" : "public, max-age=86400, s-maxage=604800, immutable" },
    });
  } catch (error) {
    if (error instanceof PositionStateRefusal)
      return NextResponse.json({ error: error.code, code: error.code }, { status: error.status });
    console.error("Error reading SparkLend position state:", error);
    return NextResponse.json({ error: "Failed to read position state", code: "proxy_error" }, { status: 502 });
  }
}
