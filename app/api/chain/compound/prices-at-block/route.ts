import { NextRequest, NextResponse } from "next/server";
import { cometPricesAtBlock } from "@/lib/sources/chain/compound-prices";
import { cometDeploymentOf, compoundDeploymentParam } from "@/lib/compound/deployments";

// A Comet's oracle prices at one block, in dollars: the base's and each listed
// asset's `getPrice` on the feed the Comet named at that block (an archive
// read), an ETH-quoted Comet's converted with Comet's WETH/USD at the same
// block. The Lifetime flows panel values each event's flows at them
// (lib/compound/flows.ts). A past block's answer never changes, so it is
// cached hard.
//
// `?deployment=ethereum|base|arbitrum&market=<key>&block=<n>&assets=a,b,…`
// Answers `{ block, prices: { [token]: usd } }`, the base under its token
// address; an asset the Comet did not list at that block is absent.

export const runtime = "nodejs";

const ADDRESS = /^0x[0-9a-f]{40}$/;
const MAX_ASSETS = 24;
const RETRY_BACKOFF_MS = 500;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const key = compoundDeploymentParam(q.get("deployment"));
  const deployment = cometDeploymentOf(key);
  const arbitrum = key === "arbitrum";
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
    let prices = await cometPricesAtBlock(deployment, market, assets, block).catch((e: unknown) => {
      if (!arbitrum) throw e;
      return {} as Record<string, number>;
    });
    // The keyless Arbitrum gateway refuses a burst now and then: one more
    // read after a short back-off.
    if (arbitrum && Object.keys(prices).length === 0) {
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
      prices = await cometPricesAtBlock(deployment, market, assets, block);
    }
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
