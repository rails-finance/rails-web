import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";
import { resolveErc20Meta } from "@/lib/sources/chain/erc20-meta";
import type { AaveV3PositionState } from "@/lib/aave-v3/position-state";

// The position state of an Aave V3 Ethereum account around one event's
// transaction (rails-ops TO-DO-ui-jobs §19): each reserve's exact balance before
// and after, the collateral flags and eMode, the prices and settings at the
// block, and the account figures derived from them. rails-server computes all
// of it; this hop names the reserves the index has no symbol or decimals for,
// and passes the answer on. A refusal keeps its `code` (`event_not_found`,
// `not_settled`) so the card can say which.
//
// Cacheability is the server's call — long only when the answer is complete —
// so the upstream header is forwarded and no fallback is invented here.
// Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const params = request.nextUrl.searchParams;
  const wallet = params.get("wallet");
  const market = params.get("market");
  const block = params.get("block");
  const tx = params.get("tx");
  if (!wallet || !ADDRESS.test(wallet) || !market || !block || !/^\d+$/.test(block) || !tx || !TX_HASH.test(tx)) {
    return NextResponse.json(
      { error: "wallet, market, block and tx are required", code: "bad_request" },
      { status: 400 },
    );
  }

  try {
    const qs = new URLSearchParams({ wallet, market, block, tx });
    const url = `${RAILS_API_URL}/api/aave-v3/timeline/position-state?${qs.toString()}`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        code?: string;
        error?: string;
        message?: string;
      } | null;
      return NextResponse.json(
        {
          error: body?.error ?? response.statusText,
          code: body?.code ?? "upstream_error",
          ...(body?.message ? { message: body.message } : {}),
        },
        { status: response.status },
      );
    }
    const state = (await response.json()) as AaveV3PositionState;
    // The index names most reserves; a new listing it has not named yet is
    // resolved from the token itself. Decimals are filled only from a token that
    // answered: the resolver's fallback is a guess, and a balance scaled by a
    // guess would read as a real figure.
    const unnamed = state.reserves.filter((r) => r.symbol == null || r.decimals == null).map((r) => r.reserve);
    if (unnamed.length > 0) {
      const metas = await resolveErc20Meta(unnamed);
      state.reserves = state.reserves.map((r) => {
        const meta = metas.get(r.reserve.toLowerCase());
        if (!meta) return r;
        return {
          ...r,
          symbol: r.symbol ?? meta.symbol,
          decimals: r.decimals ?? (meta.named === false ? null : meta.decimals),
        };
      });
    }
    return NextResponse.json(state, { headers: proxyCacheControl(response) });
  } catch (error) {
    console.error("Error reading aave-v3 position state:", error);
    const message = error instanceof Error ? error.message : "Failed to read position state";
    return NextResponse.json({ error: message, code: "proxy_error" }, { status: 500 });
  }
}
