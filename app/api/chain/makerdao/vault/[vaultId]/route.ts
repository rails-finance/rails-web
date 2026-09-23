import { NextRequest, NextResponse } from "next/server";
import { loadMakerVaultStateFromChain } from "@/lib/sources/chain/makerdao-position";

// chain arm of a single MakerDAO vault's live state — a direct read of the Vat
// urn slots (ink, art) + the per-ilk rate/price, via eth_call, at the CHAIN
// HEAD. The head is resolved first and pins every read that follows, so the
// answer's `atBlock` and `blockTimestamp` name the one instant all of it came
// from — the vault page's live rate-step note reads its later end from exactly
// those two fields. (The frozen block T this route was built around is retired:
// rails-ops decision 0006.) SERVER-ONLY (ALCHEMY_URL).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ vaultId: string }> }) {
  const { vaultId } = await context.params;
  try {
    // No named block: the loader resolves the head itself and pins to it.
    const state = await loadMakerVaultStateFromChain(vaultId);
    if (!state) return NextResponse.json({ state: null }, { status: 404 });
    return NextResponse.json({ state });
  } catch (err) {
    console.error("[api/chain/makerdao/vault]", err);
    return NextResponse.json({ error: "Failed to read vault state from chain" }, { status: 500 });
  }
}
