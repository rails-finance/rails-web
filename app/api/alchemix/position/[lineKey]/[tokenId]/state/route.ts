import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";
import { ALCHEMIX_TOKEN_ID, readAlchemixState } from "@/lib/sources/api/alchemix-position-backend";

// api arm of one Alchemist position's CURRENT figures.
//
// What this proxies is a chain read: rails-server calls getCDP for the token id
// and convertToAssets for the share price, both pinned to the block it reads
// first, behind the same 30s fresh / 60s stale-while-revalidate cache the
// Liquity V2 trove state sits behind. Debt, collateral and earmarked therefore
// arrive as one reading at one block, which is the only condition under which
// earmarked may stand beside debt: it accrues on every block, so a stored
// figure is true at its own block and at no other.
//
// No fallback TTL. The backend declares its own, and a failure here is a
// refusal (503) rather than a zero position — getCDP answers (0,0,0) for a
// token id that does not exist, so a throttled read served as a value would be
// indistinguishable from a closed position.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ lineKey: string; tokenId: string }> }) {
  const { lineKey, tokenId } = await params;
  if (!ALCHEMIX_TOKEN_ID.test(tokenId)) {
    return NextResponse.json({ success: false, error: "Invalid tokenId. Must be a positive integer" }, { status: 400 });
  }
  const readerIp = readerIpFromRequest(request);
  try {
    const read = await readAlchemixState(lineKey, tokenId, readerIp, request.signal);
    if (!read.ok) {
      console.error(`Backend API error: ${read.status} ${read.statusText}`);
      return NextResponse.json({ success: false, error: `Backend error: ${read.statusText}` }, { status: read.status });
    }
    return NextResponse.json(read.result, { headers: proxyCacheControl(read.upstream) });
  } catch (error) {
    console.error("Error reading the alchemix position state from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to read the position state";
    return NextResponse.json({ success: false, error: message }, { status: 503 });
  }
}
