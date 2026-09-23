// GET /api/chain/fx/pools — f(x) V2's whole pool/tick system state read live
// from the pools' own contracts at one head block. The /fx/pools page calls
// the loader directly (one less hop server-side); this route is the
// public/chain-proxy arm. SERVER-ONLY (ALCHEMY_URL).

import { NextResponse } from "next/server";
import { loadFxSystemFromChain } from "@/lib/sources/chain/fx-system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadFxSystemFromChain());
  } catch (error) {
    console.error("Error loading f(x) system from chain:", error);
    const message = error instanceof Error ? error.message : "Failed to load pool state";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
