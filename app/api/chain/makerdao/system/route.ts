// GET /api/chain/makerdao/system — MakerDAO's whole system state read live from
// its own contracts at head. The /makerdao/system page calls the loader directly
// (one less hop server-side); this route is the public/chain-proxy arm.

import { NextResponse } from "next/server";
import { loadMakerSystemFromChain } from "@/lib/sources/chain/makerdao-system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadMakerSystemFromChain());
  } catch (error) {
    console.error("Error loading MakerDAO system from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load system state";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
