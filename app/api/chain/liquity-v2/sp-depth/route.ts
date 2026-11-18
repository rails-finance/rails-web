import { NextRequest, NextResponse } from "next/server";
import { BEFORE_DEPLOY, PAST_HEAD, loadLiquityV2SpDepthAt } from "@/lib/sources/chain/liquity-v2-sp-depth";

// The Stability Pool's depth per branch (ui-jobs 748): each branch pool's
// getTotalBoldDeposits() and each TroveManager's getEntireBranchDebt() at head,
// or at `block`. The pages read the loader directly; this route is the source
// their receipts cite. A head read is cached at the edge for 15 s, a read at a
// block for good; a block before Liquity V2 or past the head answers 404, a
// failed read 502.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEAD_CACHE = "public, s-maxage=15, stale-while-revalidate=30";
const BLOCK_CACHE = "public, s-maxage=31536000, immutable";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("block");
  if (raw != null && !/^\d+$/.test(raw)) {
    return NextResponse.json({ error: "block must be a whole number" }, { status: 400 });
  }
  const block = raw == null ? undefined : Number(raw);
  // Digits past the largest safe integer name no block this chain will reach soon.
  if (block != null && !Number.isSafeInteger(block)) {
    return NextResponse.json(
      { error: "this block is past the chain's head" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  const depth = await loadLiquityV2SpDepthAt(block);
  if (depth === BEFORE_DEPLOY) {
    return NextResponse.json(
      { error: "Liquity V2 was not deployed at this block" },
      { status: 404, headers: { "Cache-Control": BLOCK_CACHE } },
    );
  }
  if (depth === PAST_HEAD) {
    return NextResponse.json(
      { error: "this block is past the chain's head" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!depth) {
    return NextResponse.json(
      { error: "the Stability Pool read failed" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(depth, { headers: { "Cache-Control": block == null ? HEAD_CACHE : BLOCK_CACHE } });
}
