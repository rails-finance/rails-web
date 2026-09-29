import { NextRequest, NextResponse } from "next/server";
import { readFrankencoinEvent } from "@/lib/sources/chain/frankencoin-event";

// One Frankencoin position event read from its receipt (lib/sources/chain/
// frankencoin-event.ts): the ZCHF a mint paid out and sent to the reserve, the
// interest it reported, and what a repayment burned and got back from the
// reserve. `?tx=` names the transaction, `?position=` the Position contract.
// A mined transaction's receipt never changes, so the answer is cached hard.
// Node runtime.

export const runtime = "nodejs";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TX = /^0x[0-9a-fA-F]{64}$/;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const tx = sp.get("tx") ?? "";
  const position = sp.get("position") ?? "";
  if (!TX.test(tx)) return NextResponse.json({ error: "tx must be a transaction hash" }, { status: 400 });
  if (!ADDRESS.test(position)) return NextResponse.json({ error: "position must be an address" }, { status: 400 });
  try {
    const data = await readFrankencoinEvent(tx, position.toLowerCase());
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } });
  } catch (error) {
    console.error("Error reading the Frankencoin event:", error);
    return NextResponse.json({ error: "Failed to read the transaction" }, { status: 502 });
  }
}
