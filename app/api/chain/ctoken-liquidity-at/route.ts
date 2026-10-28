import { NextRequest, NextResponse } from "next/server";
import {
  ctokenDeployment,
  readCTokenLiquidityAt,
  readCTokenMembershipAt,
} from "@/lib/sources/chain/ctoken-liquidity-at";
import type { CTokenProtocol } from "@/lib/api/fetch-ctoken-liquidity-at";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";

// Why a Compound V2, Moonwell or Moonwell Base account could be liquidated:
// the Comptroller's getAccountLiquidity at the block before the liquidation and
// at its block, the close factor, and the collateral market's protocol seize
// share (lib/sources/chain/ctoken-liquidity-at.ts). A past block's answer never
// changes, so it is cached hard. Node runtime.
//
// `?factors=` is a proxy to rails-server's `/api/at-block/ctoken/factors`,
// which answers from its at-block store and reads the chain once for a block
// it does not hold (server mig 412; rails-ops decisions/0056); `tokens` names
// each key's cToken or mToken from the catalog. The backend's Cache-Control
// is forwarded: a year at a finalized block, seconds above it.

export const runtime = "nodejs";

const PROTOCOLS: CTokenProtocol[] = ["compound-v2", "moonwell", "moonwell-base"];
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const RAILS_API_URL = process.env.RAILS_API_URL;

async function factorsFromServer(
  request: NextRequest,
  protocol: CTokenProtocol,
  wallet: string,
  block: number,
  markets: string[],
): Promise<NextResponse> {
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  const d = ctokenDeployment(protocol);
  const params = new URLSearchParams({
    protocol,
    wallet,
    block: String(block),
    factors: markets.join(","),
    tokens: markets.map((k) => d.token(k.toLowerCase())?.toLowerCase() ?? "").join(","),
  });
  const response = await fetch(
    `${RAILS_API_URL}/api/at-block/ctoken/factors?${params}`,
    createAuthFetchOptions(undefined, readerIpFromRequest(request)),
  );
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return NextResponse.json(null, { status: 502 });
  }
  return NextResponse.json(await response.json(), { headers: proxyCacheControl(response) });
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
    if (factors) {
      const markets = [
        ...new Set(
          factors
            .split(",")
            .map((m) => m.trim())
            .filter(Boolean),
        ),
      ].slice(0, 40);
      return await factorsFromServer(request, protocol, wallet.toLowerCase(), block, markets);
    }
    const membership = q.get("membership");
    if (membership) {
      const m = await readCTokenMembershipAt(protocol, wallet.toLowerCase(), block, membership);
      return NextResponse.json(m, {
        headers: m ? { "cache-control": "public, max-age=86400, s-maxage=31536000, immutable" } : {},
      });
    }
    const data = await readCTokenLiquidityAt(
      protocol,
      wallet.toLowerCase(),
      block,
      collateral,
      q.get("debtMarket") ?? undefined,
    );
    return NextResponse.json(data, {
      headers: data ? { "cache-control": "public, max-age=86400, s-maxage=31536000, immutable" } : {},
    });
  } catch (error) {
    console.error("Error reading account liquidity at block:", error);
    return NextResponse.json(null);
  }
}
