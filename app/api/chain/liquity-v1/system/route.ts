import { NextResponse } from "next/server";
import { loadLiquityV1SystemFromChain } from "@/lib/sources/chain/liquity-v1-system";

// Chain arm of the Liquity V1 SYSTEM read — the protocol view's source. One
// head-block read of the singleton contracts: the protocol's own price
// (simulated fetchPrice), TCR / recovery mode, the base rate and the fees that
// decay from it, the Stability Pool's depth, and the CR-ordered redemption
// queue from one MultiTroveGetter sweep. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadLiquityV1SystemFromChain());
  } catch (error) {
    console.error("Error loading Liquity V1 system from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load system state";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
