import { NextRequest, NextResponse } from "next/server";
import { readLiquityV1Event } from "@/lib/sources/chain/liquity-v1-event";

// One Liquity V1 Trove event read from its receipt (lib/sources/chain/
// liquity-v1-event.ts): the borrowing fee, the reserve, what a close burned,
// where a liquidation's debt and ETH went, and the PriceFeed price at the
// event's block. `?tx=` names the transaction, `?wallet=` the Trove's owner.
// A mined transaction's receipt never changes, so the answer is cached hard.
// Node runtime.

export const runtime = "nodejs";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TX = /^0x[0-9a-fA-F]{64}$/;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const tx = sp.get("tx") ?? "";
  const wallet = sp.get("wallet") ?? "";
  if (!TX.test(tx)) return NextResponse.json({ error: "tx must be a transaction hash" }, { status: 400 });
  if (!ADDRESS.test(wallet)) return NextResponse.json({ error: "wallet must be an address" }, { status: 400 });
  try {
    const data = await readLiquityV1Event(tx, wallet.toLowerCase());
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } });
  } catch (error) {
    console.error("Error reading the Liquity V1 event:", error);
    return NextResponse.json({ error: "Failed to read the transaction" }, { status: 502 });
  }
}
