import { NextResponse } from "next/server";
import { loadAaveEthereumVaultDirectory } from "@/lib/sources/chain/aave-ethereum-vault-directory";

// Every vault Aave's own enumerators name on Ethereum, at one pinned block —
// the roster, addressable.
//
// THE LISTING'S DISCLOSURE LANE. /ethereum/aave/vaults is the roster, and
// the roster is what a reader opens beside it (the "eighteen vaults" drawer).
// The roster is a Multicall3 wave over every catalogued vault — about a second
// — and the listing's own path is a store read plus one overlay batch, so the
// roster is fetched from the browser when the drawer is opened rather than
// made part of every page-load's first paint. The reading is the same one the
// section has always drawn: `getStataTokens()`, `getStkTokens()`, the address
// Aave's book names for sGHO, and `totalAssets()`, `totalSupply()`,
// `convertToAssets(10 ** decimals)` and each family's own mechanic on every
// address they returned, all at one block the response states.
//
// The loader caches its reading for five minutes and refuses to cache a failed
// one (lib/sources/chain/aave-ethereum-vault-directory.ts), so a drawer opened
// twice in a minute costs one wave and a bad minute on the RPC is answered as
// `chainStale: true` with no figures rather than as stale numbers.
//
// Node runtime; the loader owns the caching, so nothing is cached at the edge.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await loadAaveEthereumVaultDirectory();
    return NextResponse.json(data);
  } catch (error) {
    console.error("The Aave vault roster did not answer:", error);
    return NextResponse.json({ error: "the roster could not be read from chain just now" }, { status: 502 });
  }
}
