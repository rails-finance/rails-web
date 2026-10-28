import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";
import { normalizeAccountNumber } from "@/lib/dolomite/asset-catalog";

// One Dolomite account's risk figures at the end of one block (the global
// margin ratio, the account's override and the core's ratio for it, each
// named market's margin premium), for the Lifetime flows chart's margin-ratio
// line (lib/dolomite/flows-health.ts). Proxy to rails-server's
// `/api/at-block/dolomite/risk`, which answers from its at-block store and
// reads the chain once for a block it does not hold (server mig 412; rails-ops
// decisions/0056). The backend's Cache-Control is forwarded.
//
// `?owner=<address>&accountNumber=<uint256>&block=<n>&markets=0,6`

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;
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
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    const qs = new URLSearchParams({ owner, accountNumber, block: String(block), markets: markets.join(",") });
    const response = await fetch(
      `${RAILS_API_URL}/api/at-block/dolomite/risk?${qs}`,
      createAuthFetchOptions(undefined, readerIpFromRequest(request)),
    );
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: "No risk figures were read at that block" }, { status: 502 });
    }
    return NextResponse.json(await response.json(), { headers: proxyCacheControl(response) });
  } catch (error) {
    console.error("Error fetching Dolomite risk at block from backend:", error);
    return NextResponse.json({ error: "Failed to read the risk figures at that block" }, { status: 502 });
  }
}
