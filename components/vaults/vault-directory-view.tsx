"use client";

// The roster: every catalogued MetaMorpho vault on one chain, at one block.
// ----------------------------------------------------------------------------
// What /base/morpho/vaults and /ethereum/morpho/vaults show — the Vaults tab of
// the Morpho Blue rail on each chain (ui-jobs 486).
// One table row (V6) per catalogued vault, through the shared roster
// (components/vaults/vault-roster.tsx; ui-jobs 605). What the family supplies:
// its receipts, its Family facet (the two factory releases, also the Kind
// cell). Above the rows the read stamp alone (ui-jobs 771): the census and the
// family's words are on the vaults info page. Compare ticks as on /vaults
// (E2, E3).
//
// SHARE PRICE is `convertToAssets(10^18)` — one whole share, in the vault's
// own asset. No USD.

import type { ServerRead } from "@/lib/shared/server-head-read";
import { ProvSection } from "@/components/shared/section-menu";
import { ROSTER_SCOPE, VaultRoster, type VaultRosterFacet } from "@/components/vaults/vault-roster";
import { CompareBar } from "@/components/vaults/compare-selection";
import { metaMorphoVaultHref, metaMorphoVaultsListingHref, type MetaMorphoRouteChain } from "@/lib/vaults/routes";
import { vaultDirectoryEmptyCountProv, type MorphoVaultCoords } from "@/lib/morpho-base/vault-provenance";
import { releaseLabel } from "@/lib/vaults/families";
import { metaMorphoRowReceipts } from "@/lib/vaults/row-receipts";
import type { VaultSummary } from "@/lib/vaults/summary";
import type { VaultYield } from "@/lib/vaults/yield";

const FACETS: VaultRosterFacet[] = [
  {
    id: "family",
    label: "Family",
    valueOf: (v) => v.release ?? "",
    labelOf: (r) => releaseLabel("metamorpho", r),
    order: ["v1.1", "v1.0"],
  },
];

// Focus (ui-jobs 557): VaultRoster keeps the vaults in focus (useScopedRows).
export function VaultDirectoryView({
  chainId,
  initialSearch,
  vaults,
  yields,
  blockNumber,
  readBy,
  chainStale,
  catalogSize,
}: {
  /** The chain the roster is on. */
  chainId: MetaMorphoRouteChain;
  /** The query string the page was served with (the roster's preset and sort). */
  initialSearch?: string;
  vaults: VaultSummary[];
  yields: Record<string, VaultYield>;
  blockNumber: number;
  /** rails-server's read of `blockNumber`, when it answered every read. */
  readBy?: ServerRead | null;
  chainStale: boolean;
  /** How many vaults the roster holds (the empty count's receipt). */
  catalogSize: number;
}) {
  const coords: MorphoVaultCoords = { chainId, blockNumber: blockNumber || undefined, readBy };
  return (
    <>
      <ProvSection scope={ROSTER_SCOPE} as="div">
        <VaultRoster
          initialSearch={initialSearch}
          readTime={readBy?.blockTime}
          vaults={vaults}
          yieldOf={(v) => yields[v.address]}
          kindOf={(v) => v.releaseLabel}
          chainId={chainId}
          blockNumber={blockNumber}
          chainStale={chainStale}
          skel="directory"
          facets={FACETS}
          hrefOf={(v) => metaMorphoVaultHref(chainId, v.address)}
          holdersHrefOf={(v) => metaMorphoVaultsListingHref(chainId, { vault: v.address })}
          receiptsOf={(v) => metaMorphoRowReceipts({ ...coords, chainId }, v)}
          hooksOf={(v) => ({ "data-family": v.release ?? "" })}
          emptyCountProv={(count) => vaultDirectoryEmptyCountProv(coords, count, catalogSize)}
          head={{ drawer: null }}
        />
      </ProvSection>
      <CompareBar />
    </>
  );
}
