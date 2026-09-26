import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { ALCHEMIX_TOKEN_ID } from "@/lib/sources/api/alchemix-position-backend";
import { readAlchemixTransmuterPosition } from "@/lib/sources/api/alchemix-transmuter-backend";

// api arm of one Transmuter position, its events inline. A thin shell: the
// backend answers in the shape the page renders and it is forwarded unchanged.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ lineKey: string; nftId: string }> }) {
  const { lineKey, nftId } = await params;
  if (!ALCHEMIX_TOKEN_ID.test(nftId)) {
    return NextResponse.json({ success: false, error: "Invalid nftId. Must be a positive integer" }, { status: 400 });
  }
  const readerIp = readerIpFromRequest(request);
  try {
    const read = await readAlchemixTransmuterPosition(lineKey, nftId, readerIp, request.signal);
    if (!read.ok) {
      console.error(`Backend API error: ${read.status} ${read.statusText}`);
      return NextResponse.json({ success: false, error: `Backend error: ${read.statusText}` }, { status: read.status });
    }
    return NextResponse.json(read.result, { headers: proxyCacheControl(read.upstream, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching the alchemix transmuter position from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch the position";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
