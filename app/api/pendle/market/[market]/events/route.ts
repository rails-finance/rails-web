import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { outsideTokenMeta, readPendleMarket } from "@/lib/sources/api/pendle";

// A Pendle market page's next router events: the 50 below the cursor `before`
// (the last page's `next`), the cursor after them, and the outside tokens'
// symbols and decimals.

export const runtime = "nodejs";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const CURSOR = /^\d+-\d+-\d+$/;

export async function GET(request: NextRequest, { params }: { params: Promise<{ market: string }> }) {
  const { market } = await params;
  const before = request.nextUrl.searchParams.get("before") ?? "";
  if (!ADDRESS.test(market) || !CURSOR.test(before))
    return NextResponse.json({ success: false, error: "market and before are required" }, { status: 400 });
  const read = await readPendleMarket(market, readerIpFromRequest(request), before);
  if (!read.ok) return NextResponse.json({ success: false, code: read.code }, { status: read.status });
  const meta = await outsideTokenMeta(read.data);
  return NextResponse.json(
    { success: true, recent: read.data.recent, next: read.data.next, meta },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
