import { NextRequest, NextResponse } from "next/server";
import { loadLiquityForkTroveFromChain, type LiquityForkConfig } from "@/lib/sources/chain/liquity-fork-position";
import { BASEDOLLAR_BRANCHES, DEBT_SYMBOL, resolveBranch } from "@/lib/basedollar/asset-catalog";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";

// Chain arm of the Basedollar trove read — the exact live-head detail for ONE
// (branch, troveId). Needs `?branch=` (key or display symbol) and `?troveId=`;
// the shared Liquity-fork loader reads the branch's own TroveManager /
// PriceFeed (simulated fetchPrice) / SortedTroves. Node runtime, no edge
// caching.

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

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const branch = resolveBranch(sp.get("branch"));
  const troveId = sp.get("troveId");
  if (!branch) return NextResponse.json({ error: "branch must name a Basedollar branch" }, { status: 400 });
  if (!troveId || !/^\d+$/.test(troveId))
    return NextResponse.json({ error: "troveId must be a uint256 string" }, { status: 400 });
  try {
    const data = await loadLiquityForkTroveFromChain(CFG, branch.key, troveId);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error loading Basedollar trove from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load chain position";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
