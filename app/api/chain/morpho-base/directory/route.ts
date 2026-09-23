import { NextResponse } from "next/server";
import { loadMorphoBaseVaultDirectory } from "@/lib/sources/chain/morpho-base-vault-directory";

// Every MetaMorpho vault the catalogue knows on Base, at one pinned block —
// the roster, addressable.
//
// THE LISTING'S DISCLOSURE LANE. /base/morpho/vaults is the roster, and the
// roster is what a reader opens beside it. The roster is a Multicall3 wave over
// all 511 catalogued vaults — `name()`, `totalAssets()`, `totalSupply()`,
// `convertToAssets(10^18)`, `curator()` and `owner()` on each, at one block —
// and the listing's own path is a store read plus one overlay batch. Putting
// the wave on the listing's first paint would cost every page-load a panel most
// readers never open; taking the figures from the census instead would put a
// day-old number where a live one is stated everywhere else in this section. So
// it is read from the browser when the drawer is opened.
//
// The loader caches its reading for five minutes and refuses to cache a failed
// one (lib/sources/chain/morpho-base-vault-directory.ts), so a drawer opened
// twice in a minute costs one wave and a bad minute on the RPC is answered as
// `chainStale: true` with no figures rather than as stale numbers.
//
// Node runtime; the loader owns the caching, so nothing is cached at the edge.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await loadMorphoBaseVaultDirectory();
    return NextResponse.json(data);
  } catch (error) {
    console.error("The MetaMorpho Base vault roster did not answer:", error);
    return NextResponse.json({ error: "the roster could not be read from chain just now" }, { status: 502 });
  }
}
