import { NextResponse } from "next/server";
import { loadLiquityForkBranchesFromChain } from "@/lib/sources/chain/liquity-fork-branches";
import type { LiquityForkConfig } from "@/lib/sources/chain/liquity-fork-position";
import { ASYMMETRY_BRANCHES, DEBT_SYMBOL } from "@/lib/asymmetry/asset-catalog";

// Chain arm of the Asymmetry BRANCH roster — the protocol view's source. Reads
// every branch's own TroveManager / PriceFeed (simulated fetchPrice) /
// SortedTroves at one head block: aggregates, TCR, and the rate-ordered
// redemption queue with its zombies. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CFG: LiquityForkConfig = { protocol: "asymmetry", debtSymbol: DEBT_SYMBOL, branches: ASYMMETRY_BRANCHES };

export async function GET() {
  try {
    return NextResponse.json(await loadLiquityForkBranchesFromChain(CFG));
  } catch (error) {
    console.error("Error loading Asymmetry branches from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load branches";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
