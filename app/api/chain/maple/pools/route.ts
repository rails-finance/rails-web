import { NextResponse } from "next/server";
import { resolveMaplePoolState } from "@/lib/sources/chain/maple-pool-state";
import { MAPLE_POOLS } from "@/lib/maple/asset-catalog";

// Chain arm of the Maple protocol view — both syrup pools' own state (size,
// the liquid/fixed-term/open-term split, queue, rates) at one head block. The
// SSR page (/maple/pools) calls the reader directly; this route is the client
// retry lane. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await resolveMaplePoolState();
    const pools = MAPLE_POOLS.flatMap((p) => {
      const s = state.get(p.key);
      return s ? [s] : [];
    });
    return NextResponse.json({ pools });
  } catch (error) {
    console.error("Error loading Maple pool state from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load pools";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
