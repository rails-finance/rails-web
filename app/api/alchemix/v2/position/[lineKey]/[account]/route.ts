import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { ALCHEMIX_V2_ACCOUNT, readAlchemixV2Position } from "@/lib/sources/api/alchemix-v2-backend";

// api arm of one Alchemix V2 account, its events inline. A thin shell: the
// backend answers in the shape the page renders and it is forwarded unchanged.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ lineKey: string; account: string }> }) {
  const { lineKey, account } = await params;
  if (!ALCHEMIX_V2_ACCOUNT.test(account)) {
    return NextResponse.json({ success: false, error: "Invalid account. Must be an address" }, { status: 400 });
  }
  const readerIp = readerIpFromRequest(request);
  try {
    const read = await readAlchemixV2Position(lineKey, account, readerIp, request.signal);
    if (!read.ok) {
      console.error(`Backend API error: ${read.status} ${read.statusText}`);
      return NextResponse.json({ success: false, error: `Backend error: ${read.statusText}` }, { status: read.status });
    }
    return NextResponse.json(read.result, { headers: proxyCacheControl(read.upstream, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching the alchemix v2 position from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch the position";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
