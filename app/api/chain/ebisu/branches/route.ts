import { NextResponse } from "next/server";
import { loadLiquityForkBranchesFromChain } from "@/lib/sources/chain/liquity-fork-branches";
import type { LiquityForkConfig } from "@/lib/sources/chain/liquity-fork-position";
import { EBISU_BRANCHES, DEBT_SYMBOL } from "@/lib/ebisu/asset-catalog";
import { publicErrorMessage } from "@/lib/api/public-error";

// Chain arm of the Ebisu BRANCH roster — the protocol view's source. Reads
// every branch's own TroveManager / PriceFeed (simulated fetchPrice) /
// SortedTroves at one head block: aggregates, TCR, and the rate-ordered
// redemption queue with its zombies. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CFG: LiquityForkConfig = { protocol: "ebisu", debtSymbol: DEBT_SYMBOL, branches: EBISU_BRANCHES };

export async function GET() {
  try {
    return NextResponse.json(await loadLiquityForkBranchesFromChain(CFG));
  } catch (error) {
    console.error("Error loading Ebisu branches from chain:", error);
    const message = publicErrorMessage(error, "Failed to load branches");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
