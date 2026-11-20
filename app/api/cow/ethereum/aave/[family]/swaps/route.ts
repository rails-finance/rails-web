import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { publicErrorMessage } from "@/lib/api/public-error";
import { CowReadError, readCowAaveSwaps } from "@/lib/sources/api/cow";
import { COW_AAVE_FAMILIES, parseCowSwapsQuery, type CowAaveFamily } from "@/lib/cow/aave-totals";

// The listing behind a CoW figure (/ethereum/<family>/cow-swaps): rails-server's
// /api/cow/ethereum/aave/:family/swaps, read with the bearer token.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_MAX = 200;

export async function GET(request: NextRequest, { params }: { params: Promise<{ family: string }> }) {
  const { family } = await params;
  const sp = request.nextUrl.searchParams;
  const offset = Number(sp.get("offset") ?? "0");
  const limit = Number(sp.get("limit") ?? "50");
  if (
    !COW_AAVE_FAMILIES.includes(family as CowAaveFamily) ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1
  ) {
    return NextResponse.json({ success: false, error: "Invalid family, offset or limit" }, { status: 400 });
  }
  try {
    const page = await readCowAaveSwaps(
      family as CowAaveFamily,
      { ...parseCowSwapsQuery(sp), offset, limit: Math.min(limit, PAGE_MAX) },
      readerIpFromRequest(request),
      request.signal,
    );
    return NextResponse.json({ success: true, ...page }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    const status = timedOut ? 504 : error instanceof CowReadError ? error.status : 500;
    const message = publicErrorMessage(error, "Failed to fetch the CoW swaps");
    console.error("cow aave swaps proxy:", message);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
