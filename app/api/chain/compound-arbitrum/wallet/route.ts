import { NextRequest, NextResponse } from "next/server";
import { loadCompoundWalletFromChain } from "@/lib/sources/chain/compound-position";
import { COMPOUND_ARBITRUM_DEPLOYMENT } from "@/lib/compound-arbitrum/asset-catalog";
import { publicErrorMessage } from "@/lib/api/public-error";

// Every Compound V3 position one wallet holds on Arbitrum: the four Comets
// asked at one pinned block, one multicall each over the stated rosters. The
// page's server half reads the same loader; this is the client's retry path.
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
    return NextResponse.json(await loadCompoundWalletFromChain(wallet, COMPOUND_ARBITRUM_DEPLOYMENT));
  } catch (error) {
    console.error("Error reading Compound V3 Arbitrum wallet:", error);
    const message = publicErrorMessage(error, "Failed to load the wallet's positions");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
