import { NextRequest, NextResponse } from "next/server";
import { cometPricesAtBlock } from "@/lib/sources/chain/compound-prices";
import { COMPOUND_DEPLOYMENT } from "@/lib/compound/asset-catalog";
import { COMPOUND_BASE_DEPLOYMENT } from "@/lib/compound-base/asset-catalog";

// A Comet's oracle prices at one block, in dollars: the base's and each listed
// asset's `getPrice` on the feed the Comet named at that block (an archive
// read), an ETH-quoted Comet's converted with Comet's WETH/USD at the same
// block. The Lifetime flows panel values each event's flows at them
// (lib/compound/flows.ts). A past block's answer never changes, so it is
// cached hard.
//
// `?deployment=ethereum|base&market=<key>&block=<n>&assets=a,b,…`
// Answers `{ block, prices: { [token]: usd } }`, the base under its token
// address; an asset the Comet did not list at that block is absent.

export const runtime = "nodejs";

const ADDRESS = /^0x[0-9a-f]{40}$/;
const MAX_ASSETS = 24;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const deployment = q.get("deployment") === "base" ? COMPOUND_BASE_DEPLOYMENT : COMPOUND_DEPLOYMENT;
  const market = deployment.markets.find((m) => m.key === (q.get("market") ?? "").toLowerCase());
  const block = Number(q.get("block"));
  const assets = [
    ...new Set(
      (q.get("assets") ?? "")
        .toLowerCase()
        .split(",")
        .map((a) => a.trim())
        .filter((a) => ADDRESS.test(a)),
    ),
  ].slice(0, MAX_ASSETS);
  if (!market || !Number.isInteger(block) || block < 1)
    return NextResponse.json({ error: "deployment, market and block are required" }, { status: 400 });
  try {
    const prices = await cometPricesAtBlock(deployment, market, assets, block);
    if (Object.keys(prices).length === 0)
      return NextResponse.json({ error: "No price was read at that block" }, { status: 502 });
    return NextResponse.json(
      { block, prices },
      { headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } },
    );
  } catch (error) {
    console.error("Error reading Comet prices at block:", error);
    return NextResponse.json({ error: "Failed to read the prices at that block" }, { status: 502 });
  }
}
