import { NextRequest, NextResponse } from "next/server";
import { loadLiquityV2SpDepth } from "@/lib/sources/chain/liquity-v2-sp-depth";

// The Stability Pool's depth per branch (ui-jobs 748): each branch pool's
// getTotalBoldDeposits() and each TroveManager's getEntireBranchDebt() at head,
// or at `block`. The pages read the loader directly; this route is the source
// their receipts cite.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("block");
  const block = raw == null ? undefined : Number(raw);
  if (block != null && (!Number.isSafeInteger(block) || block <= 0)) {
    return NextResponse.json({ error: "block must be a positive integer" }, { status: 400 });
  }
  const depth = await loadLiquityV2SpDepth(block);
  if (!depth) return NextResponse.json({ error: "the Stability Pool read failed" }, { status: 502 });
  return NextResponse.json(depth);
}
