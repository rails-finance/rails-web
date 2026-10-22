import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { readWalletCounts } from "@/lib/wallet/read-wallet";

// One wallet's positions as counts and ids (lib/wallet/summary-counts.ts),
// from rails-server's summary rows with no head read: what the line under
// every explorer's wallet row reads (rails-ops decisions/0050 point 10,
// decisions/0051 step 3). Kept 60 s per address, as /api/chain/wallet/<address>.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function GET(request: NextRequest, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!ADDRESS.test(address)) {
    return NextResponse.json({ error: "address must be a 0x address" }, { status: 400 });
  }
  const counts = await readWalletCounts(address.toLowerCase(), readerIpFromRequest(request));
  if (counts.error) return NextResponse.json(counts, { status: 502, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(counts, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60" },
  });
}
