import { NextRequest, NextResponse } from "next/server";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { readWallet } from "@/lib/wallet/read-wallet";

// One wallet's positions across the families and chains Rails reads, with the
// head state of its open ones (rails-ops decisions/0050-one-wallet-across-
// protocols-and-chains.md, step 3). The read is lib/wallet/read-wallet.ts,
// which the wallet page calls too: rails-server's summary rows, the family's
// listing card for each, and one batched head read per family, under an 8 s
// budget. Kept 60 s per address. The address is a 0x address; the page takes
// an ENS name to one before it asks.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function GET(request: NextRequest, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!ADDRESS.test(address)) {
    return NextResponse.json({ error: "address must be a 0x address" }, { status: 400 });
  }
  const read = await readWallet(address.toLowerCase(), readerIpFromRequest(request));
  if (read.error) return NextResponse.json(read, { status: 502, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(read, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60" },
  });
}
