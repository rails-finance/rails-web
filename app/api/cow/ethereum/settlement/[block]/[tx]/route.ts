import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { publicErrorMessage } from "@/lib/api/public-error";
import { CowReadError, readCowSettlement } from "@/lib/sources/api/cow";

// The CoW trade card's settlement panel: rails-server's
// /api/cow/ethereum/settlement/:block/:tx, read with the bearer token when the card opens.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ block: string; tx: string }> }) {
  const { block, tx } = await params;
  if (!/^\d{1,10}$/.test(block) || !/^0x[0-9a-fA-F]{64}$/.test(tx)) {
    return NextResponse.json({ success: false, error: "Invalid block or hash" }, { status: 400 });
  }
  try {
    const s = await readCowSettlement(Number(block), tx, readerIpFromRequest(request), request.signal);
    return NextResponse.json({ success: true, ...s }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    const status = error instanceof CowReadError ? error.status : 500;
    const message = publicErrorMessage(error, "Failed to fetch the settlement");
    console.error("cow settlement proxy:", message);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
