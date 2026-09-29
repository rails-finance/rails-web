import { NextRequest, NextResponse } from "next/server";
import { readFrankencoinEvent } from "@/lib/sources/chain/frankencoin-event";

// One Frankencoin position event read from its receipt (lib/sources/chain/
// frankencoin-event.ts): where a mint's or a repayment's ZCHF went, a mint's
// rate at that block, a challenge's buyer or bidder and where its ZCHF went,
// a new owner's kind. `?tx=` names the transaction, `?position=` the Position
// contract, `?kind=` the row's kind, `?log=` its log index (which isolates its
// logs from another position's in the same transaction), `?owner=` an
// ownership row's new owner, `?first=` on an original's opening row the block
// of the position's first ledger row (read one block earlier). A mined transaction's receipt never changes, so
// the answer is cached hard. Node runtime.

export const runtime = "nodejs";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TX = /^0x[0-9a-fA-F]{64}$/;
const KIND = /^[a-z_]{1,40}$/;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const tx = sp.get("tx") ?? "";
  const position = sp.get("position") ?? "";
  const kind = sp.get("kind") ?? undefined;
  const log = sp.get("log");
  const owner = sp.get("owner") ?? undefined;
  const first = sp.get("first");
  if (!TX.test(tx)) return NextResponse.json({ error: "tx must be a transaction hash" }, { status: 400 });
  if (!ADDRESS.test(position)) return NextResponse.json({ error: "position must be an address" }, { status: 400 });
  if (kind != null && !KIND.test(kind))
    return NextResponse.json({ error: "kind is not an event kind" }, { status: 400 });
  if (log != null && !/^\d{1,6}$/.test(log))
    return NextResponse.json({ error: "log must be a log index" }, { status: 400 });
  if (owner != null && !ADDRESS.test(owner))
    return NextResponse.json({ error: "owner must be an address" }, { status: 400 });
  if (first != null && !/^\d{1,10}$/.test(first))
    return NextResponse.json({ error: "first must be a block number" }, { status: 400 });
  try {
    const data = await readFrankencoinEvent(tx, position.toLowerCase(), {
      kind,
      logIndex: log != null ? Number(log) : undefined,
      newOwner: owner?.toLowerCase(),
      firstBlock: first != null ? Number(first) : undefined,
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } });
  } catch (error) {
    console.error("Error reading the Frankencoin event:", error);
    return NextResponse.json({ error: "Failed to read the transaction" }, { status: 502 });
  }
}
