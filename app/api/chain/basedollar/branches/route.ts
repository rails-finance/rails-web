import { NextResponse } from "next/server";
import { loadLiquityForkBranchesFromChain } from "@/lib/sources/chain/liquity-fork-branches";
import type { LiquityForkConfig } from "@/lib/sources/chain/liquity-fork-position";
import { BASEDOLLAR_BRANCHES, DEBT_SYMBOL } from "@/lib/basedollar/asset-catalog";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";

// Chain arm of the Basedollar BRANCH roster — the protocol view's source. Reads
// every branch's own TroveManager / PriceFeed (simulated fetchPrice) /
// SortedTroves at one head block: aggregates, TCR, and the rate-ordered
// redemption queue with its zombies. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// chainId is the load-bearing field here: these branch addresses exist on Base,
// and without it the loader would read Ethereum at the same addresses and
// return plausible nonsense rather than an error.
const CFG: LiquityForkConfig = {
  protocol: "basedollar",
  debtSymbol: DEBT_SYMBOL,
  branches: BASEDOLLAR_BRANCHES,
  chainId: BASE_CHAIN_ID,
};

export async function GET() {
  try {
    return NextResponse.json(await loadLiquityForkBranchesFromChain(CFG));
  } catch (error) {
    console.error("Error loading Basedollar branches from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load branches";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
