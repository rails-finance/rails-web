import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { readPendleRoster } from "@/lib/sources/api/pendle";

// Each Pendle PT's market, from the roster's tokens: what a PT chip's asset
// panel links to (lib/pendle/pt-markets.ts). Kept ten minutes, as the roster is.

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const read = await readPendleRoster(readerIpFromRequest(request));
  if (!read.ok) return NextResponse.json({ success: false, markets: {} }, { status: read.status === 503 ? 503 : 502 });
  const markets: Record<string, { market: string; name: string | null }> = {};
  for (const m of read.data.markets)
    markets[m.tokens.pt.address] = { market: m.tokens.market.address, name: m.tokens.pt.symbol };
  return NextResponse.json(
    { success: true, markets },
    { headers: { "Cache-Control": "public, max-age=600, s-maxage=600" } },
  );
}
