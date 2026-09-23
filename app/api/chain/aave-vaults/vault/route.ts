import { after, NextRequest, NextResponse } from "next/server";
import { loadAaveEthereumVault } from "@/lib/sources/chain/aave-ethereum-vault";
import { loadAaveEthereumVaultTimelineWithTail } from "@/lib/sources/chain/aave-ethereum-vault-timeline";
import { resolveAaveVaultHolder } from "@/lib/aave-vaults/vault-holder";
import { fetchVaultTail, putVaultTail } from "@/lib/api/fetch-vault-tail";
import { routeHop } from "@/lib/shared/listing-ssr";
import { AAVE_VAULT_TAIL_VERSION, type VaultHolderTimeline } from "@/lib/shared/vault-holder-timeline";
import { chainMeta, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// One Aave vault on Ethereum at one pinned block, and one address's reading of
// it.
//
// This is the CLIENT REFRESH lane. The page at /ethereum/aave/vaults/<vault> does
// NOT fetch it: that route SSRs by calling `loadAaveEthereumVault` directly, one
// hop shorter, so the first paint carries the real figures. The route exists so
// the same read is addressable — re-runnable against a stated block, quotable in
// a receipt, and available to anything that wants the numbers without the page.
//
// The roster gate is CATALOGUE MEMBERSHIP, and the loader decides it from the
// chain: an address the enumerators did not name at the read block is a 400
// here and a 404 on the page, so the two surfaces cannot disagree about what
// exists. The distinction the loader keeps is kept here too — `served: false`
// is a chain ANSWER and a 400, while a read that FAILED comes back 200 with
// `chainStale: true` and no figures, because a bad minute on the RPC has not
// established that an address is not a vault.
//
// THE HISTORY MAY COME HALF FROM THE STORE. Rows at or below the lane's own
// `finalized` block never change, so they are kept and only the head is swept;
// `timeline.history` says which of the two this response is and what the cut
// was, and the gate runs on the merged rows every time. `?tail=0` refuses BOTH
// halves — no tail is read and none is stored — so a caller can always ask for
// a reading that owes the store nothing. On a life long enough to need building
// across requests that is not merely slower: with no store to build into there
// is nothing to build, so `?tail=0` answers such a life with the count and no
// rows, which is what this route answered for it before the build existed.
//
// A LONG HISTORY IS SERVED IN TWO PIECES OF NEWS. `timeline.history.building`
// says a life is being read into the store and how far it has got, with no rows
// yet; `timeline.coverage.drawn` says the rows are a WINDOW over a life that
// was read and gated whole, and states both figures. Neither is an error and
// neither is a withholding — `coverage.withheldAbove` is still the only field
// that means rows were refused.
//
// Node runtime, no edge caching: every figure is a call at the head.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const vault = params.get("vault");
  if (!vault) return NextResponse.json({ error: "vault is required" }, { status: 400 });
  if (!ADDRESS.test(vault)) return NextResponse.json({ error: "vault must be a 20-byte address" }, { status: 400 });

  // A name that will not resolve is a 200 carrying the reason, not an error:
  // the vault read still succeeded and every figure about the VAULT is still
  // true. Only the holder half is missing, and the caller is told why.
  const holder = await resolveAaveVaultHolder(params.get("holder"));

  try {
    const data = await loadAaveEthereumVault(vault, holder.address ?? undefined);
    if (!data.served && !data.chainStale)
      return NextResponse.json(
        { error: "Aave's own catalogue does not name this address as one of its vaults on Ethereum" },
        { status: 400 },
      );
    // The holder's own events, at the SAME block the reading was taken at —
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
    if (data.holder && !data.chainStale && data.vault.shareDecimals != null) {
      const holderAddress = data.holder.address;
      const tail = useTail
        ? await fetchVaultTail({
            chainId: MAINNET_CHAIN_ID,
            vault: data.vault.address,
            holder: holderAddress,
            loaderVersion: AAVE_VAULT_TAIL_VERSION,
            ...hop,
          })
        : null;
      const result = await loadAaveEthereumVaultTimelineWithTail(data.vault.address, holderAddress, {
        blockNumber: data.blockNumber,
        family: data.vault.family,
        shareDecimals: data.vault.shareDecimals,
        assetDecimals: data.vault.asset.decimals,
        tail,
        useTail,
      });
      timeline = result.timeline;
      // The write is queued AFTER the response: a reader never waits on the
      // store, and a store that refuses leaves a log line and a page that
      // stores again next time. Where this request is building a heavy life
      // (its first chunk stored, or stalled on a block that would not answer),
      // the continuation keeps building the rest behind the
      // response — from logs already in hand, so it costs the sweep lane
      // nothing — until the head is built or its budget is spent.
      const store = result.store;
      const continueBuild = result.continueBuild;
      if (store || continueBuild)
        after(async () => {
          if (store && !(await putVaultTail(store, hop)).ok) return;
          if (continueBuild) await continueBuild((next) => putVaultTail(next, hop));
        });
    }

    return NextResponse.json({
      ...data,
      timeline,
      // Which lane the timeline's sweeps run on, BY NAME, and whether the
      // wide-range lane is configured on this deployment at all. A boolean
      // about configuration and never a value. Moving chain 1's sweeps onto
      // that lane was measured and declined (2026-09-08): it would buy one
      // sentence on holders above the horizon and bring a gateway that has
      // answered a whole-life query with an empty array and a 200. The
      // statement stays so a future reader can see which lane drew the page.
      lanes: {
        ethereumLogs: {
          serving: chainMeta(MAINNET_CHAIN_ID).logsRpcEnv,
          wideLaneVar: "ETHEREUM_LOGS_RPC_URL",
          wideLaneConfigured: Boolean(process.env.ETHEREUM_LOGS_RPC_URL),
        },
      },
      holderInput: holder.typed || null,
      holderEnsName: holder.ensName,
      holderError: holder.error,
    });
  } catch (error) {
    console.error("Error reading an Aave Ethereum vault:", error);
    const message = error instanceof Error ? error.message : "Failed to read the vault";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
