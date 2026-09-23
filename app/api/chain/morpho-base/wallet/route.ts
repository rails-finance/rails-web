import { NextRequest, NextResponse } from "next/server";
import { loadMorphoWalletFromChain } from "@/lib/sources/chain/morpho-wallet";
import { MORPHO_BASE_DEPLOYMENT } from "@/lib/sources/chain/morpho-deployments";

// Every Morpho Blue position one wallet holds on Base.
//
// There is no Ethereum twin of this route, and that is not an omission: on
// Ethereum the question is answered by the index, which knows a wallet's
// positions because it replayed every event. Here it is answered by asking the
// singleton about every market in the censused roster at once — 4,306 slots in
// eleven batched calls, about a second. See lib/sources/chain/morpho-wallet.ts
// for why brute force over a known roster is the right shape rather than a
// fallback.
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
    return NextResponse.json(await loadMorphoWalletFromChain(wallet, MORPHO_BASE_DEPLOYMENT));
  } catch (error) {
    console.error("Error sweeping Morpho Base wallet:", error);
    const message = error instanceof Error ? error.message : "Failed to load the wallet's positions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
