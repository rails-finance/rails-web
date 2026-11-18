import { NextRequest, NextResponse } from "next/server";
import { loadBoldPrice } from "@/lib/sources/chain/liquity-v2-bold-price";

// BOLD's price from the Curve BOLD/USDC pool (ui-jobs 746): the pool's
// last_price(0), price_oracle(0) and get_dy at head, or at `block`. A failed
// read answers 502, and the page states the price as unavailable.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("block");
  const block = raw == null ? undefined : Number(raw);
  if (block != null && (!Number.isSafeInteger(block) || block <= 0)) {
    return NextResponse.json({ error: "block must be a positive integer" }, { status: 400 });
  }
  const read = await loadBoldPrice(block);
  if (!read) return NextResponse.json({ error: "the Curve BOLD/USDC pool did not answer" }, { status: 502 });
  return NextResponse.json(read);
}
