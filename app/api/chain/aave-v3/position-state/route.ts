import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { resolveV3Tokens } from "@/lib/sources/chain/aave-v3-tokens";
import { POOL_BY_MARKET, type AaveV3MarketKey } from "@/lib/aave-v3/asset-catalog";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { AaveV3PositionState } from "@/lib/aave-v3/position-state";

// The position state of an Aave V3 Ethereum account around one transaction,
// at blocks N−1 and N (?market=core|prime|etherfi, or the hook's
// "chain:<market>"), for a row the index holds no event for, which is what a
// governance change between the account's events is: the index's answer
// (/api/aave-v3/timeline/position-state) needs an event in the transaction.
// Proxy to rails-server's `/api/at-block/aave-v3/position-state`, which keeps
// each call once at a finalized block and the receipt beside it (server migs
// 412, 413; rails-ops decisions/0056); this hop names each reserve's symbol
// and decimals. Same wire shape as the index's answer.
//
// Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

type Unnamed = Omit<AaveV3PositionState, "reserves"> & {
  reserves: Omit<AaveV3PositionState["reserves"][number], "symbol" | "decimals">[];
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
  if (!POOL_BY_MARKET[market]) {
    return NextResponse.json({ error: "unknown market", code: "bad_request" }, { status: 400 });
  }
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error", code: "proxy_error" }, { status: 500 });
  }
  try {
    const qs = new URLSearchParams({ market, wallet, block, tx });
    const response = await fetch(
      `${RAILS_API_URL}/api/at-block/aave-v3/position-state?${qs.toString()}`,
      createAuthFetchOptions(undefined, readerIpFromRequest(request)),
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { code?: string } | null;
      const code = body?.code ?? "proxy_error";
      // A refusal keeps its code (`event_not_found`); anything else is a 502.
      const status = response.status === 404 || response.status === 400 ? response.status : 502;
      return NextResponse.json({ error: status === 502 ? "Failed to read position state" : code, code }, { status });
    }
    const state = (await response.json()) as Unnamed;
    const metas = await resolveV3Tokens(
      state.reserves.map((r) => r.reserve),
      MAINNET_CHAIN_ID,
    );
    const reserves = state.reserves.map((row) => {
      const m = metas.get(row.reserve);
      return { ...row, symbol: m?.symbol ?? null, decimals: m && !m.unresolved ? m.decimals : null };
    });
    const unnamed = reserves.some((r) => r.decimals == null);
    const upstream = response.headers.get("cache-control");
    return NextResponse.json(
      { ...state, reserves },
      {
        headers: {
          "Cache-Control": unnamed
            ? "no-store"
            : upstream && /immutable/.test(upstream)
              ? "public, max-age=86400, s-maxage=604800, immutable"
              : "public, max-age=15, s-maxage=15",
        },
      },
    );
  } catch (error) {
    console.error("Error fetching Aave V3 position state from backend:", error);
    return NextResponse.json({ error: "Failed to read position state", code: "proxy_error" }, { status: 502 });
  }
}
