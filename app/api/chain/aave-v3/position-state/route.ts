import { NextRequest, NextResponse } from "next/server";
import {
  PositionStateRefusal,
  loadAaveV3PositionStateAtBlock,
} from "@/lib/sources/chain/aave-v3-position-state-at-block";
import { POOL_BY_MARKET, type AaveV3MarketKey } from "@/lib/aave-v3/asset-catalog";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// The position state of an Aave V3 Ethereum account around one transaction,
// read from the chain at blocks N−1 and N (?market=core|prime|etherfi, or the
// hook's "chain:<market>"). For a row the index holds no event for, which is
// what an e-mode change is: the index's own answer
// (/api/aave-v3/timeline/position-state) needs an event in the transaction.
// Same wire shape. A past block does not change, so an answer caches long.
//
// Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

/** Each market's AaveOracle, as its PoolAddressesProvider names it
 *  (getPriceOracle, read 2 Oct 2026). */
const ORACLE: Record<AaveV3MarketKey, `0x${string}`> = {
  core: "0x54586be62e3c3580375ae3723c145253060ca0c2",
  prime: "0xe3c061981870c0c7b1f3c4f4bb36b95f1f260be6",
  etherfi: "0x43b64f28a678944e0655404b0b98e443851cc34f",
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const wallet = params.get("wallet");
  const block = params.get("block");
  const tx = params.get("tx");
  const market = (params.get("market") ?? "core").replace(/^chain:/, "") as AaveV3MarketKey;
  if (!wallet || !ADDRESS.test(wallet) || !block || !/^\d+$/.test(block) || !tx || !TX_HASH.test(tx)) {
    return NextResponse.json({ error: "wallet, block and tx are required", code: "bad_request" }, { status: 400 });
  }
  if (!ORACLE[market] || !POOL_BY_MARKET[market]) {
    return NextResponse.json({ error: "unknown market", code: "bad_request" }, { status: 400 });
  }
  try {
    const state = await loadAaveV3PositionStateAtBlock({
      wallet,
      pool: POOL_BY_MARKET[market] as `0x${string}`,
      oracle: ORACLE[market],
      chainId: MAINNET_CHAIN_ID,
      block: Number(block),
      txHash: tx,
      market,
    });
    const unnamed = state.reserves.some((r) => r.decimals == null);
    return NextResponse.json(state, {
      headers: { "Cache-Control": unnamed ? "no-store" : "public, max-age=86400, s-maxage=604800, immutable" },
    });
  } catch (error) {
    if (error instanceof PositionStateRefusal)
      return NextResponse.json({ error: error.code, code: error.code }, { status: error.status });
    console.error("Error reading Aave V3 position state:", error);
    return NextResponse.json({ error: "Failed to read position state", code: "proxy_error" }, { status: 502 });
  }
}
