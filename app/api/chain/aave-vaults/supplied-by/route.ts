import { NextRequest, NextResponse } from "next/server";
import { readAaveCoreSuppliedBy } from "@/lib/vaults/supplied-by-read";

// The vaults over one Aave V3 Core reserve on Ethereum ("Supplied by vaults",
// ui-jobs 549 step 4): the static aTokens that wrap it and the Umbrella stakes
// that cover it, from the Aave vault directory's cached read
// (lib/vaults/supplied-by-read.ts). No chain read of its own. `symbol` and
// `decimals` name the reserve's asset, the unit of every amount; the reserve
// page has them from its own read.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SYMBOL = /^[\w.\-+ ]{1,24}$/;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const asset = q.get("asset") ?? "";
  const symbol = q.get("symbol") ?? "";
  const decimals = Number(q.get("decimals"));
  if (!ADDRESS.test(asset) || !SYMBOL.test(symbol) || !Number.isInteger(decimals) || decimals < 0 || decimals > 36)
    return NextResponse.json({ error: "asset, symbol and decimals are required" }, { status: 400 });
  const read = await readAaveCoreSuppliedBy({ symbol, address: asset.toLowerCase(), decimals });
  return NextResponse.json(read, { status: read.failed ? 502 : 200 });
}
