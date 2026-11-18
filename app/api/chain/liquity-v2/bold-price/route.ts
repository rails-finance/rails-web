import { NextRequest, NextResponse } from "next/server";
import { loadBoldPrice, NO_POOL } from "@/lib/sources/chain/liquity-v2-bold-price";

// BOLD's price from the Curve BOLD/USDC pool (ui-jobs 746): the pool's
// last_price(0), price_oracle(0) and get_dy at head, or at `block`. A head read
// is cached at the edge for 15 s, a read at a block for good; a block before
// the pool answers 404 (cached for good too), a failed read 502.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEAD_CACHE = "public, s-maxage=15, stale-while-revalidate=30";
const BLOCK_CACHE = "public, s-maxage=31536000, immutable";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("block");
  const block = raw == null ? undefined : Number(raw);
  if (block != null && (!Number.isSafeInteger(block) || block <= 0)) {
    return NextResponse.json({ error: "block must be a positive integer" }, { status: 400 });
  }
  const read = await loadBoldPrice(block);
  if (read === NO_POOL) {
    return NextResponse.json(
      { error: "the Curve BOLD/USDC pool did not exist at this block", noPool: true },
      { status: 404, headers: { "Cache-Control": BLOCK_CACHE } },
    );
  }
  if (!read) {
    return NextResponse.json(
      { error: "the read of the Curve BOLD/USDC pool failed" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(read, { headers: { "Cache-Control": block == null ? HEAD_CACHE : BLOCK_CACHE } });
}
