import { NextRequest, NextResponse } from "next/server";
import { parseAbi } from "viem";
import { chainClient } from "@/lib/sources/chain/rpc";
import { cometDeploymentOf, compoundDeploymentParam } from "@/lib/compound/deployments";

// Each listed asset's collateral factors in a Comet's settings at the end of
// one block (an archive read of getAssetInfoByAddress), for the Lifetime flows
// chart's health view (lib/compound/flows-health.ts). Governance changes them
// at the proxy's upgrades, so the chart reads them at each day's last event.
// A past block's answer never changes, so it is cached hard.
//
// `?deployment=ethereum|base|arbitrum&market=<key>&block=<n>&assets=a,b,…`
// Answers `{ block, factors: { [asset]: { borrow, liquidate } } }` as
// fractions; an asset the Comet did not list at that block is absent.

export const runtime = "nodejs";

const ADDRESS = /^0x[0-9a-f]{40}$/;
const MAX_ASSETS = 24;
const FACTOR_SCALE = 1e18;
const ABI = parseAbi([
  "function getAssetInfoByAddress(address asset) view returns ((uint8 offset,address asset,address priceFeed,uint64 scale,uint64 borrowCollateralFactor,uint64 liquidateCollateralFactor,uint64 liquidationFactor,uint128 supplyCap))",
]);

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const deployment = cometDeploymentOf(compoundDeploymentParam(q.get("deployment")));
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
  if (!market || !Number.isInteger(block) || block < 1 || assets.length === 0)
    return NextResponse.json({ error: "deployment, market, block and assets are required" }, { status: 400 });
  try {
    const results = await chainClient(deployment.chainId).multicall({
      allowFailure: true,
      blockNumber: BigInt(block),
      contracts: assets.map(
        (a) =>
          ({
            address: market.comet as `0x${string}`,
            abi: ABI,
            functionName: "getAssetInfoByAddress",
            args: [a as `0x${string}`],
          }) as const,
      ),
    });
    const factors: Record<string, { borrow: number; liquidate: number }> = {};
    results.forEach((r, i) => {
      if (r.status !== "success") return;
      factors[assets[i]] = {
        borrow: Number(r.result.borrowCollateralFactor) / FACTOR_SCALE,
        liquidate: Number(r.result.liquidateCollateralFactor) / FACTOR_SCALE,
      };
    });
    // Every asset failing is a missed read (a gateway refusal), not an answer.
    if (Object.keys(factors).length === 0)
      return NextResponse.json({ error: "No factor was read at that block" }, { status: 502 });
    return NextResponse.json(
      { block, factors },
      { headers: { "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable" } },
    );
  } catch (error) {
    console.error("Error reading Comet factors at block:", error);
    return NextResponse.json({ error: "Failed to read the factors at that block" }, { status: 502 });
  }
}
