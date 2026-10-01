import { NextRequest, NextResponse } from "next/server";
import { parseAbi } from "viem";
import { chainClient } from "@/lib/sources/chain/rpc";
import { COMPOUND_DEPLOYMENT } from "@/lib/compound/asset-catalog";
import { COMPOUND_BASE_DEPLOYMENT } from "@/lib/compound-base/asset-catalog";

// A Comet market's interest rates at past blocks — what a row's interest line
// sets its average against. Comet charges and pays at the rate its
// utilisation gives at each moment, so the rate at the previous event and the
// rate just before this one bracket what a balance earned or paid between them.
//
// `?deployment=ethereum|base&market=<key>&blocks=a,b,…` (at most four)
// answers `{ rates: { [block]: { utilization, supply, borrow } } }`, yearly
// fractions: getUtilization, then getSupplyRate and getBorrowRate at it, each
// per second × 31,536,000 (Comet's SECONDS_PER_YEAR). A block whose read
// fails is absent.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BLOCKS = 4;
const ABI = parseAbi([
  "function getUtilization() view returns (uint256)",
  "function getSupplyRate(uint256 utilization) view returns (uint64)",
  "function getBorrowRate(uint256 utilization) view returns (uint64)",
]);
const SCALE = 1e18;
const SECONDS_PER_YEAR = 31_536_000;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const deployment = q.get("deployment") === "base" ? COMPOUND_BASE_DEPLOYMENT : COMPOUND_DEPLOYMENT;
  const market = deployment.markets.find((m) => m.key === (q.get("market") ?? "").toLowerCase());
  const blocks = [
    ...new Set(
      (q.get("blocks") ?? "")
        .split(",")
        .map((b) => Number(b.trim()))
        .filter((b) => Number.isInteger(b) && b > 0),
    ),
  ].slice(0, MAX_BLOCKS);
  if (!market || blocks.length === 0) {
    return NextResponse.json({ error: "deployment, market and blocks are required" }, { status: 400 });
  }
  const comet = market.comet as `0x${string}`;
  const rates: Record<number, { utilization: number; supply: number; borrow: number }> = {};
  let failed = false;
  try {
    const client = chainClient(deployment.chainId);
    await Promise.all(
      blocks.map(async (b) => {
        try {
          const blockNumber = BigInt(b);
          const u = await client.readContract({
            address: comet,
            abi: ABI,
            functionName: "getUtilization",
            blockNumber,
          });
          const [s, r] = await Promise.all([
            client.readContract({ address: comet, abi: ABI, functionName: "getSupplyRate", args: [u], blockNumber }),
            client.readContract({ address: comet, abi: ABI, functionName: "getBorrowRate", args: [u], blockNumber }),
          ]);
          rates[b] = {
            utilization: Number(u) / SCALE,
            supply: (Number(s) * SECONDS_PER_YEAR) / SCALE,
            borrow: (Number(r) * SECONDS_PER_YEAR) / SCALE,
          };
        } catch {
          failed = true;
        }
      }),
    );
  } catch (error) {
    console.error("Error reading Comet rates:", error);
    failed = true;
  }
  return NextResponse.json(
    { rates },
    // A past block's rates never change; a partial answer is not cached.
    failed ? {} : { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable" } },
  );
}
