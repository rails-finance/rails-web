import { NextRequest, NextResponse } from "next/server";
import { ctokenDeployment } from "@/lib/sources/chain/ctoken-liquidity-at";
import type { CTokenLiquidityAt, CTokenProtocol } from "@/lib/api/fetch-ctoken-liquidity-at";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";

// Why a Compound V2, Moonwell or Moonwell Base account could be liquidated:
// the Comptroller's getAccountLiquidity at the block before the liquidation and
// at its block, the close factor, and the collateral market's protocol seize
// share. Each form of the route is a proxy to rails-server's at-block store,
// which answers from postgres and reads the chain once for a block it does not
// hold (server mig 412; rails-ops decisions/0056):
//
//   (plain)      /api/at-block/ctoken/liquidity; the proxy puts the catalog's
//                label on each counted market where it has one
//   ?membership= /api/at-block/ctoken/membership
//   ?factors=    /api/at-block/ctoken/factors; `tokens` names each key's
//                cToken or mToken from the catalog
//
// The backend's Cache-Control is forwarded: a year at a finalized block,
// seconds above it. A read the backend cannot answer is null, as before.

export const runtime = "nodejs";

const PROTOCOLS: CTokenProtocol[] = ["compound-v2", "moonwell", "moonwell-base"];
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const RAILS_API_URL = process.env.RAILS_API_URL;

async function fromServer<T>(
  request: NextRequest,
  path: string,
  params: URLSearchParams,
): Promise<{ body: T; cache: HeadersInit } | null> {
  if (!RAILS_API_URL) throw new Error("RAILS_API_URL environment variable is not set");
  const response = await fetch(
    `${RAILS_API_URL}/api/at-block/ctoken/${path}?${params}`,
    createAuthFetchOptions(undefined, readerIpFromRequest(request)),
  );
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return null;
  }
  return { body: (await response.json()) as T, cache: proxyCacheControl(response) };
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const protocol = q.get("protocol") as CTokenProtocol | null;
  const wallet = q.get("wallet") ?? "";
  const block = Number(q.get("block"));
  const collateral = q.get("collateral") ?? "";
  if (!protocol || !PROTOCOLS.includes(protocol) || !ADDRESS.test(wallet) || !Number.isInteger(block) || block < 2)
    return NextResponse.json({ error: "protocol, wallet and block are required" }, { status: 400 });
  try {
    // ?membership=<market>: whether that market was entered as collateral at
    // the block (a supply row's line), in place of the liquidation reads.
    // ?factors=<market,market,…>: each market's collateral factor as the
    // account's borrowing counted it at the end of the block (0 where not
    // entered), for the Lifetime flows chart's health view.
    const factors = q.get("factors");
    const d = ctokenDeployment(protocol);
    if (factors) {
      const markets = [
        ...new Set(
          factors
            .split(",")
            .map((m) => m.trim())
            .filter(Boolean),
        ),
      ].slice(0, 40);
      const params = new URLSearchParams({
        protocol,
        wallet: wallet.toLowerCase(),
        block: String(block),
        factors: markets.join(","),
        tokens: markets.map((k) => d.token(k.toLowerCase())?.toLowerCase() ?? "").join(","),
      });
      const r = await fromServer(request, "factors", params);
      if (!r) return NextResponse.json(null, { status: 502 });
      return NextResponse.json(r.body, { headers: r.cache });
    }
    const membership = q.get("membership");
    if (membership) {
      const token = d.token(membership.toLowerCase());
      if (!token) return NextResponse.json(null);
      const params = new URLSearchParams({
        protocol,
        wallet: wallet.toLowerCase(),
        block: String(block),
        market: token.toLowerCase(),
      });
      const r = await fromServer(request, "membership", params);
      return r ? NextResponse.json(r.body, { headers: r.cache }) : NextResponse.json(null);
    }
    const collToken = d.token(collateral.toLowerCase());
    const debtMarket = q.get("debtMarket");
    const debtToken = debtMarket ? d.token(debtMarket.toLowerCase()) : undefined;
    const params = new URLSearchParams({
      protocol,
      wallet: wallet.toLowerCase(),
      block: String(block),
      ...(collToken ? { collateral: collToken.toLowerCase() } : {}),
      ...(debtToken ? { debt: debtToken.toLowerCase() } : {}),
    });
    const r = await fromServer<CTokenLiquidityAt>(request, "liquidity", params);
    if (!r) return NextResponse.json(null);
    const data: CTokenLiquidityAt = {
      ...r.body,
      counted: r.body.counted?.map((m) => ({ ...m, label: d.label?.(m.market) ?? m.label })) ?? null,
    };
    return NextResponse.json(data, { headers: r.cache });
  } catch (error) {
    console.error("Error reading account liquidity at block:", error);
    return NextResponse.json(null);
  }
}
