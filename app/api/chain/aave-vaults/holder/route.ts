import { NextRequest, NextResponse } from "next/server";
import { loadAaveEthereumHolderSweep } from "@/lib/sources/chain/aave-ethereum-holder-sweep";
import { resolveAaveVaultHolder } from "@/lib/aave-vaults/vault-holder";

// One address across every vault Aave publishes on Ethereum, at one pinned
// block: which of them it holds, how much of each, and what those shares convert
// to.
//
// This is the CLIENT REFRESH lane. The page at /ethereum/aave/vaults does NOT fetch
// it: that route SSRs by calling `loadAaveEthereumHolderSweep` directly, one hop
// shorter, so the first paint carries the real figures. The route exists so the
// same read is addressable — re-runnable against a stated block, quotable in a
// receipt, and available to anything that wants the numbers without the page.
// It is also where a WEI-EXACT check reads from: the page prints an amount to
// the asset's own decimals, and a difference below that is invisible in its DOM.
//
// NO ROSTER GATE, unlike /api/chain/aave-vaults/vault. That route refuses every
// address the catalogue does not name; here the subject is the ADDRESS, and
// every address has an answer — including one holding nothing, which is a
// reading and not an error, and including one that is ITSELF a catalogued vault.
// The page redirects that second case to the vault's own page because a reader
// who typed a vault's address wants the vault; this route does not, because a
// caller asking for a holder reading of an address asked for exactly that, and
// the answer (`catalogued`, beside the rows) is a true and useful one.
//
// A TRANSACTION HASH is refused: it names a receipt, not an address, and its
// logs may name none, one or several. The page resolves it
// hash; this route answers questions about ONE
// address and says so rather than reading nothing.
//
// Node runtime, no edge caching: every figure is a call at the head.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const typed = request.nextUrl.searchParams.get("holder");
  if (!typed) return NextResponse.json({ error: "holder is required" }, { status: 400 });

  const holder = await resolveAaveVaultHolder(typed, { acceptsTransaction: true });
  // Neither accepted form: a fact about the input, and nothing was looked up.
  if (holder.error === "invalid")
    return NextResponse.json({ error: "holder must be a 20-byte address or a .eth name" }, { status: 400 });
  if (holder.kind === "txhash")
    return NextResponse.json(
      {
        error: "a transaction hash names no holder here — that lane went with the find door (rails-ops decision 0028)",
      },
      { status: 400 },
    );
  // A well-formed name mainnet has no address for is a 200 carrying the reason,
  // not an error: the read that failed is the registry's, the request was well
  // formed, and the caller is told which applies.
  if (holder.error) return NextResponse.json({ holderInput: holder.typed, holderError: holder.error });
  if (!holder.address) return NextResponse.json({ error: "holder is required" }, { status: 400 });

  try {
    return NextResponse.json({
      ...(await loadAaveEthereumHolderSweep(holder.address)),
      holderInput: holder.typed || null,
      holderEnsName: holder.ensName,
      holderError: null,
    });
  } catch (error) {
    console.error("Error reading an Aave Ethereum holder sweep:", error);
    const message = error instanceof Error ? error.message : "Failed to read the holder's vaults";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
