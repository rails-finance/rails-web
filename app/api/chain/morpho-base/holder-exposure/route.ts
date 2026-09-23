import { NextRequest, NextResponse } from "next/server";
import {
  loadMorphoBaseHolderExposure,
  loadMorphoBaseHolderSummary,
} from "@/lib/sources/chain/morpho-base-holder-exposure";
import { resolveHolder } from "@/lib/morpho-base/vault-holder";

// One address across every catalogued MetaMorpho vault on Base, at one pinned
// block: the vaults it holds, and its attributed slice of each of their markets.
//
// This is the CLIENT REFRESH lane. The page at /base/morpho/vaults does not
// fetch it: that route SSRs by calling `loadMorphoBaseHolderExposure` directly,
// one hop shorter, so the first paint carries the real figures. The route exists
// so the same read is addressable — re-runnable against a stated block, quotable
// in a receipt, and available to anything that wants the numbers without the
// page. It is also where a wei-exact check reads from: the page prints cents,
// and an error below a cent is invisible in its DOM.
//
// NO ROSTER GATE, unlike /api/chain/morpho-base/vault. That route refuses every
// vault address outside the catalog; here the subject is the ADDRESS, and every
// address has an answer — including an address holding nothing, which is a
// reading and not an error.
//
// `?summary=1` — the SECOND caller, and the only one this route serves that is
// NOT a vault page. The Morpho wallet page's vault-holdings note
// (components/protocol/morpho-base/vault-holdings-note.tsx) fetches this from
// the BROWSER, on every ordinary wallet-page view, so it has to be the cheap
// read: `loadMorphoBaseHolderSummary` runs the balance sweep alone (two
// Multicall3 requests) and nothing past it — no per-vault legs, no
// holder-shape read. Same input handling as the full lookup below; only the
// loader called, and the shape returned, differ.
//
// Node runtime, no edge caching: every figure is a slot read at the head.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const typed = params.get("holder");
  if (!typed) return NextResponse.json({ error: "holder is required" }, { status: 400 });
  const summary = params.get("summary") === "1";

  const holder = await resolveHolder(typed);
  // Neither accepted form: a fact about the input, and nothing was looked up.
  if (holder.error === "invalid")
    return NextResponse.json({ error: "holder must be a 20-byte address or a .eth name" }, { status: 400 });
  // A transaction hash names a receipt, not an address; the page resolves it
  // hash. This route answers questions about ONE
  // address and refuses rather than reading nothing.
  if (holder.kind === "txhash")
    return NextResponse.json(
      {
        error: "a transaction hash names no holder here — that lane went with the find door (rails-ops decision 0028)",
      },
      { status: 400 },
    );
  // A well-formed name that no registry has an address for is a 200 carrying
  // the reason, not an error: the read that failed is the registry's (mainnet
  // ENS, or Basenames on Base), the request was well formed, and the caller is
  // told which applies rather than one "not found".
  if (holder.error) return NextResponse.json({ holderInput: holder.typed, holderError: holder.error });
  if (!holder.address) return NextResponse.json({ error: "holder is required" }, { status: 400 });

  try {
    return NextResponse.json({
      ...(await (summary ? loadMorphoBaseHolderSummary(holder.address) : loadMorphoBaseHolderExposure(holder.address))),
      holderInput: holder.typed || null,
      holderEnsName: holder.ensName,
      holderError: null,
    });
  } catch (error) {
    console.error("Error reading Morpho Base holder exposure:", error);
    const message = error instanceof Error ? error.message : "Failed to read the holder's exposure";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
