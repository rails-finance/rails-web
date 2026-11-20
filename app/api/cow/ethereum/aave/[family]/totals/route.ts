import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { publicErrorMessage } from "@/lib/api/public-error";
import { CowReadError, readCowAaveTotals } from "@/lib/sources/api/cow";
import { COW_AAVE_FAMILIES, type CowAaveFamily } from "@/lib/cow/aave-totals";

// The CoW figures block on the Aave V3 and V4 info pages: rails-server's
// /api/cow/ethereum/aave/:family/totals, read with the bearer token. A read
// past its budget answers 504; the block keeps its loading line.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ family: string }> }) {
  const { family } = await params;
  if (!COW_AAVE_FAMILIES.includes(family as CowAaveFamily)) {
    return NextResponse.json({ success: false, error: "Unknown family" }, { status: 400 });
  }
  try {
    const t = await readCowAaveTotals(family as CowAaveFamily, readerIpFromRequest(request), request.signal);
    return NextResponse.json({ success: true, ...t }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    const status = timedOut ? 504 : error instanceof CowReadError ? error.status : 500;
    const message = publicErrorMessage(error, "Failed to fetch the CoW figures");
    console.error("cow aave totals proxy:", message);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
