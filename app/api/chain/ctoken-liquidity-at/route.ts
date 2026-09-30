import { NextRequest, NextResponse } from "next/server";
import { readCTokenLiquidityAt } from "@/lib/sources/chain/ctoken-liquidity-at";
import type { CTokenProtocol } from "@/lib/api/fetch-ctoken-liquidity-at";

// Why a Compound V2, Moonwell or Moonwell Base account could be liquidated:
// the Comptroller's getAccountLiquidity at the block before the liquidation and
// at its block, the close factor, and the collateral market's protocol seize
// share (lib/sources/chain/ctoken-liquidity-at.ts). A past block's answer never
// changes, so it is cached hard. Node runtime.

export const runtime = "nodejs";

const PROTOCOLS: CTokenProtocol[] = ["compound-v2", "moonwell", "moonwell-base"];
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const protocol = q.get("protocol") as CTokenProtocol | null;
  const wallet = q.get("wallet") ?? "";
  const block = Number(q.get("block"));
  const collateral = q.get("collateral") ?? "";
  if (!protocol || !PROTOCOLS.includes(protocol) || !ADDRESS.test(wallet) || !Number.isInteger(block) || block < 2)
    return NextResponse.json({ error: "protocol, wallet and block are required" }, { status: 400 });
  try {
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
