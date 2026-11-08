import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { outsideTokenMeta, readPendleMarket } from "@/lib/sources/api/pendle";

// A Pendle market page's next router events: the market read at `block` (the
// oldest block the page holds) gives the 50 events at or before it, with the
// outside tokens' symbols and decimals.

export const runtime = "nodejs";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function GET(request: NextRequest, { params }: { params: Promise<{ market: string }> }) {
  const { market } = await params;
  const block = Number(request.nextUrl.searchParams.get("block"));
  if (!ADDRESS.test(market) || !Number.isSafeInteger(block) || block < 1)
    return NextResponse.json({ success: false, error: "market and block are required" }, { status: 400 });
  const read = await readPendleMarket(market, readerIpFromRequest(request), block);
  if (!read.ok) return NextResponse.json({ success: false, code: read.code }, { status: read.status });
  const meta = await outsideTokenMeta(read.data);
  return NextResponse.json(
    { success: true, recent: read.data.recent, meta },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
