import { NextResponse } from "next/server";
import { loadLiquityForkBranchesFromChain } from "@/lib/sources/chain/liquity-fork-branches";
import type { LiquityForkConfig, LiquityForkBranchConfig } from "@/lib/sources/chain/liquity-fork-position";
import { LIQUITY_V2_BRANCHES, DEBT_SYMBOL } from "@/lib/liquity/asset-catalog";

// Chain arm of the Liquity V2 BRANCH roster — the reference deployment's
// protocol view source, the sibling of /api/chain/{ebisu,asymmetry}/branches
// on the same shared reader. Reads each branch's own TroveManager / PriceFeed
// (simulated fetchPrice) / SortedTroves at one head block: aggregates, TCR, and
// the rate-ordered redemption queue with its zombies. The branches page reads
// the loader directly; this route is the named canonical source provenance
// receipts cite. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CFG: LiquityForkConfig = {
  protocol: "liquity-v2",
  debtSymbol: DEBT_SYMBOL,
  branches: LIQUITY_V2_BRANCHES as Record<string, LiquityForkBranchConfig>,
};

export async function GET() {
  try {
    return NextResponse.json(await loadLiquityForkBranchesFromChain(CFG));
  } catch (error) {
    console.error("Error loading Liquity V2 branches from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load branches";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
