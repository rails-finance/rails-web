import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { publicErrorMessage } from "@/lib/api/public-error";
import { CowReadError, parseCowTradesQuery, readCowTrades } from "@/lib/sources/api/cow";

// The CoW wallet page's next page and token filter: rails-server's
// /api/cow/ethereum/wallet/:address/trades, read with the bearer token.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function GET(request: NextRequest, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!ADDRESS.test(address)) return NextResponse.json({ success: false, error: "Invalid address" }, { status: 400 });
  try {
    const page = await readCowTrades(
      address.toLowerCase(),
      parseCowTradesQuery(request.nextUrl.searchParams),
      readerIpFromRequest(request),
      request.signal,
    );
    return NextResponse.json({ success: true, ...page }, { headers: { "Cache-Control": "private, max-age=15" } });
  } catch (error) {
    const status = error instanceof CowReadError ? error.status : 500;
    const message = publicErrorMessage(error, "Failed to fetch trades");
    console.error("cow trades proxy:", message);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
