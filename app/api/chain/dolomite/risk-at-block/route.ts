import { NextRequest, NextResponse } from "next/server";
import { readDolomiteRiskAt } from "@/lib/sources/chain/dolomite-risk-at";
import { normalizeAccountNumber } from "@/lib/dolomite/asset-catalog";

// One Dolomite account's risk figures at the end of one block (an archive
// multicall: the global margin ratio, the account's override and the core's
// ratio for it, each named market's margin premium), for the Lifetime flows
// chart's margin-ratio line (lib/dolomite/flows-health.ts, ui-jobs 328 step 8).
// A past block's answer never changes, so it is cached hard.
//
// `?owner=<address>&accountNumber=<uint256>&block=<n>&markets=0,6`

export const runtime = "nodejs";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MAX_MARKETS = 40;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const owner = q.get("owner") ?? "";
  const accountNumber = normalizeAccountNumber(q.get("accountNumber") ?? "");
  const block = Number(q.get("block"));
  const markets = [
    ...new Set(
      (q.get("markets") ?? "")
        .split(",")
        .map((m) => Number(m.trim()))
        .filter((m) => Number.isInteger(m) && m >= 0),
    ),
  ].slice(0, MAX_MARKETS);
  if (!ADDRESS.test(owner) || accountNumber == null || !Number.isInteger(block) || block < 1)
    return NextResponse.json({ error: "owner, accountNumber and block are required" }, { status: 400 });
  try {
    const r = await readDolomiteRiskAt(owner, accountNumber, block, markets);
    if (!r) return NextResponse.json({ error: "No risk figures were read at that block" }, { status: 502 });
    return NextResponse.json(r, {
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable" },
    });
  } catch (error) {
    console.error("Error reading Dolomite risk at block:", error);
    return NextResponse.json({ error: "Failed to read the risk figures at that block" }, { status: 502 });
  }
}
