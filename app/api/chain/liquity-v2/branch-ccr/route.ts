import { NextResponse } from "next/server";
import { loadLiquityV2BranchCcr } from "@/lib/sources/chain/liquity-v2-branch-ccr";

// Liquity V2's three branches against their critical ratio at the head block
// (rails-ops TO-DO-ui-jobs 747): each branch's collateral, debt, price, CCR,
// SCR, MCR and shutdown flag as raw integers, with the block they were read at
// (lib/sources/chain/liquity-v2-branch-ccr.ts). Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await loadLiquityV2BranchCcr());
}
