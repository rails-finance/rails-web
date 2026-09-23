import { NextResponse } from "next/server";
import { loadYearnEthereumVaultDirectory } from "@/lib/sources/chain/yearn-ethereum-vault-directory";

// Every vault the Yearn V3 factories made on Ethereum, at one pinned block —
// the roster, addressable, the way the Morpho Base and Aave vault rosters are.
//
// The same reading /ethereum/yearn/vaults renders, one hop shorter: the page
// calls the loader directly, and this route is for anything that wants the
// numbers without the page — a verifier re-deriving the roster, or a reader
// checking one vault's totals against the block the response names.
//
// The loader caches its reading for five minutes and refuses to cache a failed
// one (lib/sources/chain/yearn-ethereum-vault-directory.ts), so a bad minute on
// the RPC is answered as `chainStale: true` with no figures rather than as stale
// numbers.
//
// Node runtime; the loader owns the caching, so nothing is cached at the edge.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await loadYearnEthereumVaultDirectory();
    return NextResponse.json(data);
  } catch (error) {
    console.error("The Yearn vault roster did not answer:", error);
    return NextResponse.json({ error: "the roster could not be read from chain just now" }, { status: 502 });
  }
}
