import { NextRequest, NextResponse } from "next/server";
import { blockTimestamps } from "@/lib/sources/chain/block-timestamps";
import {
  ARBITRUM_CHAIN_ID,
  ARC_CHAIN_ID,
  BASE_CHAIN_ID,
  MAINNET_CHAIN_ID,
  OPTIMISM_CHAIN_ID,
  ROBINHOOD_CHAIN_ID,
  SEPOLIA_CHAIN_ID,
  type ChainId,
} from "@/lib/shared/chains";

// One block's timestamp, for a position card's read stamp when a live answer
// names its block but not the block's time (components/shared/position-read.tsx).
// A block's time never changes, so an answer is cached for a day. Node runtime.

export const runtime = "nodejs";

const CHAINS: ChainId[] = [
  MAINNET_CHAIN_ID,
  BASE_CHAIN_ID,
  ARBITRUM_CHAIN_ID,
  OPTIMISM_CHAIN_ID,
  ARC_CHAIN_ID,
  ROBINHOOD_CHAIN_ID,
  SEPOLIA_CHAIN_ID,
];

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const chain = Number(q.get("chain")) as ChainId;
  const block = Number(q.get("block"));
  if (!CHAINS.includes(chain) || !Number.isSafeInteger(block) || block <= 0)
    return NextResponse.json(
      { error: "a chain of 1, 10, 4663, 5042, 8453, 42161 or 11155111 and a block are required" },
      { status: 400 },
    );
  const at = (await blockTimestamps(chain, [block])).get(block);
  if (at == null) return NextResponse.json({ error: "block time unavailable" }, { status: 502 });
  return NextResponse.json(
    { blockNumber: block, blockTimestamp: at },
    { headers: { "cache-control": "public, max-age=86400, s-maxage=86400, immutable" } },
  );
}
