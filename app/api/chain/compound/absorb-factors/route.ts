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
//
// With `&prev=<block of the account's previous event>` it also answers what
// moved between that event and the absorb: each asset's and the base's oracle
// price at `prev` (`prevPrices`, keyed by asset, the base under "base"), and
// the market's borrow rate at `prev` and at `readBlock` (`borrowRate`, yearly
// fractions, getBorrowRate at getUtilization).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-f]{40}$/;
const MAX_ASSETS = 20;
const ABI = parseAbi([
  "function getAssetInfoByAddress(address asset) view returns ((uint8 offset,address asset,address priceFeed,uint64 scale,uint64 borrowCollateralFactor,uint64 liquidateCollateralFactor,uint64 liquidationFactor,uint128 supplyCap))",
  "function getPrice(address priceFeed) view returns (uint256)",
  "function baseTokenPriceFeed() view returns (address)",
  "function getUtilization() view returns (uint256)",
  "function getBorrowRate(uint256 utilization) view returns (uint64)",
]);
const FACTOR_SCALE = 1e18;
const PRICE_SCALE = 1e8;
const SECONDS_PER_YEAR = 31_536_000;

type Client = ReturnType<typeof chainClient>;

/** getBorrowRate at getUtilization, as a yearly fraction, at one block. */
async function borrowRateAt(client: Client, comet: `0x${string}`, block: bigint): Promise<number | null> {
  try {
    const u = await client.readContract({
      address: comet,
      abi: ABI,
      functionName: "getUtilization",
      blockNumber: block,
    });
    const r = await client.readContract({
      address: comet,
      abi: ABI,
      functionName: "getBorrowRate",
      args: [u],
      blockNumber: block,
    });
    return (Number(r) * SECONDS_PER_YEAR) / FACTOR_SCALE;
  } catch {
    return null;
  }
}

/** Each asset's oracle price, and the base's, at one block. */
async function pricesAt(
  client: Client,
  comet: `0x${string}`,
  feeds: Record<string, `0x${string}`>,
  block: bigint,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  try {
    const baseFeed = await client.readContract({
      address: comet,
      abi: ABI,
      functionName: "baseTokenPriceFeed",
      blockNumber: block,
    });
    const all: Record<string, `0x${string}`> = { ...feeds, base: baseFeed };
    const keys = Object.keys(all);
    const res = await client.multicall({
      allowFailure: true,
      blockNumber: block,
      contracts: keys.map((k) => ({ address: comet, abi: ABI, functionName: "getPrice", args: [all[k]] }) as const),
    });
    res.forEach((r, i) => {
      if (r.status === "success") out[keys[i]] = Number(r.result) / PRICE_SCALE;
    });
  } catch {
    // No prices: the row leaves the line out.
  }
  return out;
}

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
  const prevRaw = Number(q.get("prev"));
  const prev = Number.isInteger(prevRaw) && prevRaw > 0 && prevRaw < block ? prevRaw : null;
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
    const feeds: Record<string, `0x${string}`> = {};
    results.forEach((r, i) => {
      if (r.status !== "success") return;
      const info = r.result;
      feeds[assets[i]] = info.priceFeed;
      factors[assets[i]] = {
        borrow: Number(info.borrowCollateralFactor) / FACTOR_SCALE,
        liquidate: Number(info.liquidateCollateralFactor) / FACTOR_SCALE,
        liquidation: Number(info.liquidationFactor) / FACTOR_SCALE,
      };
    });
    const comet = market.comet as `0x${string}`;
    const extra =
      prev != null
        ? await Promise.all([
            pricesAt(client, comet, feeds, BigInt(prev)),
            borrowRateAt(client, comet, BigInt(prev)),
            borrowRateAt(client, comet, BigInt(readBlock)),
          ]).then(([prevPrices, atPrev, atRead]) => ({
            prevBlock: prev,
            prevPrices,
            borrowRate: { prev: atPrev, read: atRead },
          }))
        : {};
    return NextResponse.json(
      { readBlock, factors, ...extra },
      // A past block's settings never change.
      { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable" } },
    );
  } catch (error) {
    console.error("Error reading Comet factors at an absorb:", error);
    return NextResponse.json({ readBlock, factors: {} });
  }
}
