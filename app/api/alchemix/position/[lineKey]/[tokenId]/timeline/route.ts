import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { ALCHEMIX_TOKEN_ID, readAlchemixTimeline } from "@/lib/sources/api/alchemix-position-backend";

// api arm of one Alchemist position's timeline — ten event kinds that name the
// token id, and three that name no position at all and are windowed to the
// position's life because they are what moved its figures.
//
// WINDOWED ON `limit`/`offset`, forwarded as given. `recent` is a different
// feed's idiom and the backend does not take it; a route that accepted one and
// dropped it would serve the whole history under a name that promised a slice.
// Only the two window parameters are forwarded, so a stale link carrying
// anything else still reads the same rows.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const num = (raw: string | null): number | undefined => {
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ lineKey: string; tokenId: string }> }) {
  const { lineKey, tokenId } = await params;
  if (!ALCHEMIX_TOKEN_ID.test(tokenId)) {
    return NextResponse.json({ success: false, error: "Invalid tokenId. Must be a positive integer" }, { status: 400 });
  }
  const sp = request.nextUrl.searchParams;
  const readerIp = readerIpFromRequest(request);
  try {
    const read = await readAlchemixTimeline(
      lineKey,
      tokenId,
      { limit: num(sp.get("limit")), offset: num(sp.get("offset")) },
      readerIp,
      request.signal,
    );
    if (!read.ok) {
      console.error(`Backend API error: ${read.status} ${read.statusText}`);
      return NextResponse.json({ success: false, error: `Backend error: ${read.statusText}` }, { status: read.status });
    }
    return NextResponse.json(read.result, { headers: proxyCacheControl(read.upstream, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching the alchemix position timeline from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch the timeline";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
