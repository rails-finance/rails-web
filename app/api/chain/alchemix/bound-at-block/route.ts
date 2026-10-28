import { NextRequest, NextResponse } from "next/server";
import { parseAbi } from "viem";
import { chainClient } from "@/lib/sources/chain/rpc";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// An Alchemist V3's collateralizationLowerBound at the end of one block (an
// archive eth_call), for the Lifetime flows chart's collateralisation line
// (lib/alchemix/flows-health.ts, ui-jobs 328 step 8). The Alchemist's admin
// can set the bound, and no rails-server table keeps it, so the chart reads it
// at each picked event's block. A past block's answer never changes, so it is
// cached hard.
//
// `?chain=1|8453&alchemist=<address>&block=<n>` answers `{ block, lowerBound }`,
// the bound as a fraction (1.0526 is 105.26 %).

export const runtime = "nodejs";

const ADDRESS = /^0x[0-9a-f]{40}$/;
const CHAINS = [MAINNET_CHAIN_ID, BASE_CHAIN_ID] as const;
const ABI = parseAbi(["function collateralizationLowerBound() view returns (uint256)"]);

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const chain = Number(q.get("chain"));
  const alchemist = (q.get("alchemist") ?? "").toLowerCase();
  const block = Number(q.get("block"));
  if (
    !CHAINS.includes(chain as (typeof CHAINS)[number]) ||
    !ADDRESS.test(alchemist) ||
    !Number.isInteger(block) ||
    block < 1
  )
    return NextResponse.json({ error: "chain, alchemist and block are required" }, { status: 400 });
  try {
    const raw = await chainClient(chain as (typeof CHAINS)[number]).readContract({
      address: alchemist as `0x${string}`,
      abi: ABI,
      functionName: "collateralizationLowerBound",
      blockNumber: BigInt(block),
    });
    const lowerBound = Number(raw) / 1e18;
    if (!(lowerBound > 0)) return NextResponse.json({ error: "No lower bound at that block" }, { status: 502 });
    return NextResponse.json(
      { block, lowerBound, lowerBoundRaw: raw.toString() },
      { headers: { "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable" } },
    );
  } catch (error) {
    console.error("Error reading the Alchemist's lower bound at block:", error);
    return NextResponse.json({ error: "Failed to read the lower bound at that block" }, { status: 502 });
  }
}
