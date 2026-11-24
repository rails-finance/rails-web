"use client";

// The roster: every vault Aave's own enumerators name on Ethereum, at one block.
// ----------------------------------------------------------------------------
// The VAULTS tab of the Aave vaults rail (/ethereum/aave/vaults). One table row
// (V6) per vault, through the shared roster (components/vaults/vault-roster.tsx;
// ui-jobs 605). The family is a facet and the Kind cell on the row: a reader
// narrowing to one asset still sees which rows are a slashable stake and which
// are wrapped supply.
// The family's own mechanic reads (deposit cap, wrapped aToken, cooldown and
// slashing) are on the vault's page; the mechanics in words, the catalogue count
// and Aave's pages are on the vaults info page, since the roster opens on its
// read stamp alone (ui-jobs 771).
//
// THE DENOMINATOR is complete at its block: two enumerator calls answer their
// whole family in one read, and sGHO is one address Aave's book names.

import type { ServerRead } from "@/lib/shared/server-head-read";
import { ProvSection } from "@/components/shared/section-menu";
import { ROSTER_SCOPE, VaultRoster, type VaultRosterFacet } from "@/components/vaults/vault-roster";
import { AAVE_FAMILY_LABEL } from "@/components/vaults/aave-vault-format";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { ethereumVaultHref, ethereumVaultsListingHref } from "@/lib/vaults/routes";
import { AAVE_VAULT_FAMILY_ORDER, type AaveVaultFamily } from "@/lib/aave-vaults/vault-catalog";
import { aaveVaultEmptyCountProv, type AaveVaultCoords } from "@/lib/aave-vaults/vault-provenance";
import type { VaultSummary } from "@/lib/vaults/summary";
import type { VaultYield } from "@/lib/vaults/yield";
import { aaveRowReceipts } from "@/lib/vaults/row-receipts";

const FACETS: VaultRosterFacet[] = [
  {
    id: "family",
    label: "Family",
    valueOf: (v) => v.family,
    labelOf: (f) => AAVE_FAMILY_LABEL[f as AaveVaultFamily] ?? f,
    order: AAVE_VAULT_FAMILY_ORDER,
  },
];

export function AaveVaultDirectoryView({
  initialSearch,
  vaults,
  yields,
  blockNumber,
  readBy,
  chainStale,
  catalogSize,
}: {
  /** The query string the page was served with (the roster's preset and sort). */
  initialSearch?: string;
  vaults: VaultSummary[];
  yields: Record<string, VaultYield>;
  blockNumber: number;
  /** rails-server's read of `blockNumber`, when it answered every read. */
  readBy?: ServerRead | null;
  chainStale: boolean;
  /** How many vaults the enumerators answered at the block (the empty count's receipt). */
  catalogSize: number;
}) {
  const coords: AaveVaultCoords = { blockNumber: blockNumber || undefined, readBy };

  return (
    <>
      <ProvSection scope={ROSTER_SCOPE} as="div">
        <VaultRoster
          initialSearch={initialSearch}
          readTime={readBy?.blockTime}
          vaults={vaults}
          yieldOf={(v) => yields[v.address]}
          kindOf={(v) => v.releaseLabel}
          chainId={MAINNET_CHAIN_ID}
          blockNumber={blockNumber}
          chainStale={chainStale}
          skel="directory"
          facets={FACETS}
          hrefOf={(v) => ethereumVaultHref(v.address)}
          holdersHrefOf={(v) => ethereumVaultsListingHref({ vault: v.address })}
          receiptsOf={(v) => aaveRowReceipts(coords, v)}
          hooksOf={(v) => ({ "data-family": v.family })}
          emptyCountProv={(count) => aaveVaultEmptyCountProv(coords, count, catalogSize)}
          head={{ drawer: null }}
        />
      </ProvSection>
    </>
  );
}
