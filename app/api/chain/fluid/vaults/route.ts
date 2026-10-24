import { NextResponse } from "next/server";
import { loadFluidVaultsFromChain } from "@/lib/sources/chain/fluid-vaults";
import { publicErrorMessage } from "@/lib/api/public-error";

// Chain arm of the Fluid VAULT roster — the protocol view's source. One
// getVaultsEntireData() call against the VaultResolver at head returns every
// vault the factory has minted, with each one's own ladder (collateralFactor /
// liquidationThreshold / liquidationMaxLimit), penalty floor, oracle and totals.
// Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadFluidVaultsFromChain());
  } catch (error) {
    console.error("Error loading Fluid vaults from chain:", error);
    const message = publicErrorMessage(error, "Failed to load vaults");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
