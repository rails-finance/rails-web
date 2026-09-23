import { NextRequest, NextResponse } from "next/server";
import { loadCompoundWalletFromChain } from "@/lib/sources/chain/compound-position";
import { COMPOUND_BASE_DEPLOYMENT } from "@/lib/compound-base/asset-catalog";

// Every Compound V3 position one wallet holds on Base.
//
// There is no Ethereum twin of this route: there, the index knows which markets
// a wallet has touched, and the explorer links to one (market, wallet) pair at a
// time. Here the roster answers it instead — every Comet is asked about the
// account, in three batched calls, so the sweep is exhaustive rather than a
// sample.
//
// Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  if (!ADDRESS.test(wallet)) return NextResponse.json({ error: "wallet must be a 20-byte address" }, { status: 400 });
  try {
    return NextResponse.json(await loadCompoundWalletFromChain(wallet, COMPOUND_BASE_DEPLOYMENT));
  } catch (error) {
    console.error("Error sweeping Compound V3 Base wallet:", error);
    const message = error instanceof Error ? error.message : "Failed to load the wallet's positions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
