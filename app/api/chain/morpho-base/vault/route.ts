import { after, NextRequest, NextResponse } from "next/server";
import { loadMorphoBaseVault } from "@/lib/sources/chain/morpho-base-vault";
import { loadMorphoBaseVaultTimelineWithTail } from "@/lib/sources/chain/morpho-base-vault-timeline";
import { isMorphoBaseRosterVault } from "@/lib/morpho-base/vault-roster";
import { resolveHolder } from "@/lib/morpho-base/vault-holder";
import { fetchVaultTail, putVaultTail } from "@/lib/api/fetch-vault-tail";
import { routeHop } from "@/lib/shared/listing-ssr";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import { MORPHO_BASE_VAULT_TAIL_VERSION, type VaultHolderTimeline } from "@/lib/shared/vault-holder-timeline";

// One MetaMorpho vault on Base at one pinned block, and one holder's attributed
// slice of it.
//
// This is the CLIENT REFRESH lane. The page at /base/morpho/vaults/<vault> does
// not fetch it: that route SSRs by calling `loadMorphoBaseVault` directly, one
// hop shorter, so the first paint carries the real figures. The route exists so
// the same read is addressable — re-runnable against a stated block, quotable in
// a receipt, and available to anything that wants the numbers without the page.
//
// The roster gate is CATALOG MEMBERSHIP: every one of the censused vaults is
// served, and an address the census does not know is a 400 here and a 404 on the
// page — the same answer either way, so the two surfaces cannot disagree about
// what exists.
//
// THE HISTORY MAY COME HALF FROM THE STORE. Rows at or below the lane's own
// `finalized` block never change, so they are kept and only the head is swept;
// `timeline.history` says which of the two this response is and what the cut
// was, and the gate runs on the merged rows every time. `?tail=0` refuses BOTH
// halves — no tail is read and none is stored — so a caller can always ask for
// a reading that owes the store nothing. That is the verifier's cold path, and
// the only difference it makes to the ANSWER is how long it took.
//
// Node runtime, no edge caching: every figure is a slot read at the head.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const vault = params.get("vault");
  if (!vault) return NextResponse.json({ error: "vault is required" }, { status: 400 });
  if (!(await isMorphoBaseRosterVault(vault)))
    return NextResponse.json({ error: "this vault is not one the exposure lookup serves" }, { status: 400 });

  // A name that will not resolve is a 200 carrying the reason, not an error: the
  // vault read still succeeded and every figure about the VAULT is still true.
  // Only the holder half is missing, and the caller is told which of the two
  // reasons applies.
  const holder = await resolveHolder(params.get("holder"));
  // A transaction hash names a receipt, not an address; the page resolves it.
  if (holder.kind === "txhash")
    return NextResponse.json(
      {
        error: "a transaction hash names no holder here — that lane went with the find door (rails-ops decision 0028)",
      },
      { status: 400 },
    );
  if (holder.error)
    return NextResponse.json({
      ...(await loadMorphoBaseVault(vault)),
      holderInput: holder.typed,
      holderError: holder.error,
    });

  try {
    const data = await loadMorphoBaseVault(vault, holder.address ?? undefined);
    // The address's own events, at the SAME block the reading was taken at —
    // the loader takes the block rather than pinning one of its own, so this
    // response cannot carry two block numbers. Served here in raw units for the
    // same reason the rest of this route exists: a figure read off the page is
    // a formatted figure, and a check against formatted cents is blind to a
    // wei-level break.
    const useTail = params.get("tail") !== "0";
    // The tail proxy is this deployment's own /api, reached from the function's
    // egress address: the hop names this request's reader, signed, so the box
    // budgets the tail read and write as that reader.
    const hop = routeHop(request);
    let timeline: VaultHolderTimeline | null = null;
    if (data.holder && !data.chainStale) {
      const holderAddress = data.holder.address;
      const tail = useTail
        ? await fetchVaultTail({
            chainId: BASE_CHAIN_ID,
            vault: data.vault.address,
            holder: holderAddress,
            loaderVersion: MORPHO_BASE_VAULT_TAIL_VERSION,
            ...hop,
          })
        : null;
      const result = await loadMorphoBaseVaultTimelineWithTail(data.vault.address, holderAddress, {
        blockNumber: data.blockNumber,
        fromBlock: data.vault.createdBlock,
        shareDecimals: data.vault.decimals,
        assetDecimals: data.vault.asset.decimals,
        tail,
        useTail,
      });
      timeline = result.timeline;
      // The write is queued AFTER the response: a reader never waits on the
      // store, and a store that refuses leaves a log line and a page that
      // stores again next time.
      const store = result.store;
      // Where this request stored the first chunk of a heavy life, the
      // continuation keeps building the rest behind the response — from logs
      // already in hand, so it costs the sweep lane nothing.
      const continueBuild = result.continueBuild;
      // Also when this request's first chunk stalled and there was no `store`
      // to PUT: the continuation waits the block out and builds from there.
      if (store || continueBuild)
        after(async () => {
          if (store && !(await putVaultTail(store, hop)).ok) return;
          if (continueBuild) await continueBuild((next) => putVaultTail(next, hop));
        });
    }

    return NextResponse.json({
      ...data,
      timeline,
      holderInput: holder.typed || null,
      holderEnsName: holder.ensName,
      holderError: null,
    });
  } catch (error) {
    console.error("Error reading a Morpho Base vault:", error);
    const message = error instanceof Error ? error.message : "Failed to read the vault";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
