import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { readPendleRoster } from "@/lib/sources/api/pendle";
import { pendleNotIndexed } from "@/lib/pendle/read-state";

// Each Pendle PT's market, from the roster's tokens: what a PT chip's asset
// panel links to (lib/pendle/pt-markets.ts). Kept ten minutes, as the roster is.

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const read = await readPendleRoster(readerIpFromRequest(request));
  // An api with no Pendle routes, or tables still filling, is an empty map: the
  // asset panel then draws no market row, and the browser logs no failed request.
  if (!read.ok)
    return NextResponse.json(
      { success: false, markets: {} },
      { status: pendleNotIndexed(read) ? 200 : 502, headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
    );
  const markets: Record<string, { market: string; name: string | null }> = {};
  for (const m of read.data.markets)
    markets[m.tokens.pt.address] = { market: m.tokens.market.address, name: m.tokens.pt.symbol };
  return NextResponse.json(
    { success: true, markets },
    { headers: { "Cache-Control": "public, max-age=600, s-maxage=600" } },
  );
}
