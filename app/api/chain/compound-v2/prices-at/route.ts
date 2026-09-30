import { NextRequest, NextResponse } from "next/server";
import { compoundV2PricesAt } from "@/lib/sources/chain/compound-v2-prices-at";

// Compound V2's own oracle price at past blocks, for the flows panel: each
// deposit, withdrawal, borrow, repayment, transfer and seizure valued at the
// price of the block it happened in (lib/sources/chain/compound-v2-prices-at.ts).
//
// POST { pairs: ["<block>:<marketKey>", …] } → { prices: { "<block>:<marketKey>": usd } }.
// At most MAX_PAIRS pairs; a wallet with more is answered at today's prices by
// the page. Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PAIRS = 400;

export async function POST(request: NextRequest) {
  let pairs: unknown;
  try {
    pairs = ((await request.json()) as { pairs?: unknown }).pairs;
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  if (!Array.isArray(pairs) || pairs.some((p) => typeof p !== "string"))
    return NextResponse.json({ error: "pairs must be an array of strings" }, { status: 400 });
  if (pairs.length > MAX_PAIRS) return NextResponse.json({ error: "too many pairs" }, { status: 413 });
  try {
    const prices = await compoundV2PricesAt(pairs as string[]);
    return NextResponse.json({ prices });
  } catch (error) {
    console.error("Error reading Compound V2 prices at blocks:", error);
    return NextResponse.json({ prices: {} });
  }
}
