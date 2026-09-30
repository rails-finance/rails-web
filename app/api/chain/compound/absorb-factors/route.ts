import { NextRequest, NextResponse } from "next/server";
import { parseAbi } from "viem";
import { chainClient } from "@/lib/sources/chain/rpc";
import { COMPOUND_DEPLOYMENT } from "@/lib/compound/asset-catalog";
import { COMPOUND_BASE_DEPLOYMENT } from "@/lib/compound-base/asset-catalog";

// The collateral factors a Comet held just before an absorb — what the
// liquidation row needs to show the line the account crossed and the credit
// it was given. Comet emits neither: each asset's liquidate factor and
// liquidation factor live in its asset settings, which governance can change,
// so they are read at the block BEFORE the absorb (an archive read), not now.
//
// `?deployment=ethereum|base&market=<key>&block=<absorb block>&assets=a,b,…`
// Answers `{ readBlock, factors: { [asset]: { borrow, liquidate, liquidation } } }`
// as fractions (0.85 = 85%); an asset the Comet does not list is absent.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-f]{40}$/;
const MAX_ASSETS = 20;
const ABI = parseAbi([
  "function getAssetInfoByAddress(address asset) view returns ((uint8 offset,address asset,address priceFeed,uint64 scale,uint64 borrowCollateralFactor,uint64 liquidateCollateralFactor,uint64 liquidationFactor,uint128 supplyCap))",
]);
const FACTOR_SCALE = 1e18;

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
  if (!market || !Number.isInteger(block) || block < 2 || assets.length === 0) {
    return NextResponse.json({ error: "deployment, market, block and assets are required" }, { status: 400 });
  }
  const readBlock = block - 1;
  try {
    const client = chainClient(deployment.chainId);
    const results = await client.multicall({
      allowFailure: true,
      blockNumber: BigInt(readBlock),
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
    const factors: Record<string, { borrow: number; liquidate: number; liquidation: number }> = {};
    results.forEach((r, i) => {
      if (r.status !== "success") return;
      const info = r.result;
      factors[assets[i]] = {
        borrow: Number(info.borrowCollateralFactor) / FACTOR_SCALE,
        liquidate: Number(info.liquidateCollateralFactor) / FACTOR_SCALE,
        liquidation: Number(info.liquidationFactor) / FACTOR_SCALE,
      };
    });
    return NextResponse.json(
      { readBlock, factors },
      // A past block's settings never change.
      { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable" } },
    );
  } catch (error) {
    console.error("Error reading Comet factors at an absorb:", error);
    return NextResponse.json({ readBlock, factors: {} });
  }
}
