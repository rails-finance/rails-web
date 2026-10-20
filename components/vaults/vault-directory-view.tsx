"use client";

// The roster: every catalogued MetaMorpho vault on Base, at one block.
// ----------------------------------------------------------------------------
// What /base/morpho/vaults shows — the Vaults tab of the Morpho Blue Base rail.
// One vault row (V1, components/vaults/vault-row.tsx) per catalogued vault,
// grouped by asset, through the shared roster (components/vaults/
// vault-roster.tsx). What the family supplies: its receipts, its Family facet
// (the two factory releases), the census sentence and the intro drawer.
//
// SHARE PRICE is `convertToAssets(10^18)` — one whole share, in the vault's
// own asset. No USD.

import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { VaultRoster, type VaultRosterFacet } from "@/components/vaults/vault-roster";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import { baseVaultHref, baseVaultsListingHref, baseVaultRosterHref } from "@/lib/vaults/routes";
import {
  vaultDirectoryCensusProv,
  vaultDirectoryEmptyCountProv,
  vaultDirectoryGroupCountProv,
  vaultDirectoryNameProv,
  vaultDirectorySharePriceProv,
  vaultDirectoryTotalAssetsProv,
  type MorphoVaultCoords,
} from "@/lib/morpho-base/vault-provenance";
import { releaseLabel } from "@/lib/vaults/families";
import { vaultDisplayName, type VaultSummary } from "@/lib/vaults/summary";
import type { VaultYield } from "@/lib/vaults/yield";

const n = (v: number) => v.toLocaleString("en-US");

const FACETS: VaultRosterFacet[] = [
  {
    id: "family",
    label: "Family",
    valueOf: (v) => v.release ?? "",
    labelOf: (r) => releaseLabel("metamorpho", r),
    order: ["v1.1", "v1.0"],
  },
];

export function VaultDirectoryView({
  vaults,
  yields,
  blockNumber,
  chainStale,
  catalogSize,
  censusBlock,
  withCensus,
}: {
  vaults: VaultSummary[];
  yields: Record<string, VaultYield>;
  blockNumber: number;
  chainStale: boolean;
  /** How many vaults the roster holds, and the block it was swept at. */
  catalogSize: number;
  censusBlock: number;
  /** The position census answered: the rows carry Holders. */
  withCensus: boolean;
}) {
  const coords: MorphoVaultCoords = { blockNumber: blockNumber || undefined };
  const rowCoords = (v: VaultSummary): MorphoVaultCoords => ({
    ...coords,
    vault: v.address,
    vaultName: vaultDisplayName(v) ?? undefined,
    assetSymbol: v.asset.symbol,
  });

  const registry = useReceiptRegistry();
  return (
    <ProvReceiptsScope registry={registry}>
      <VaultRoster
        vaults={vaults}
        yields={yields}
        chainId={MORPHO_BASE_CHAIN_ID}
        blockNumber={blockNumber}
        chainStale={chainStale}
        skel="directory"
        facets={FACETS}
        hrefOf={(v) => baseVaultHref(v.address)}
        holdersHrefOf={(v) => baseVaultsListingHref({ vault: v.address })}
        receiptsOf={(v) => ({
          name: vaultDirectoryNameProv(rowCoords(v)),
          totalAssets: vaultDirectoryTotalAssetsProv(rowCoords(v)),
          sharePrice: vaultDirectorySharePriceProv(rowCoords(v)),
        })}
        hooksOf={(v) => ({ "data-family": v.release ?? "" })}
        groupCountProv={(assetSymbol, count) => vaultDirectoryGroupCountProv({ ...coords, assetSymbol }, count)}
        emptyCountProv={(count) => vaultDirectoryEmptyCountProv(coords, count, catalogSize)}
        head={{
          censusFigure: "directory-census",
          census: (
            <>
              <Prov info={vaultDirectoryCensusProv(coords, { catalogSize, censusBlock })}>
                The {n(catalogSize)} vaults the two MetaMorpho factories had made at block {n(censusBlock)}
              </Prov>
              {withCensus ? "; Holders counts every address that has held a share." : "."}
            </>
          ),
          listingHref: withCensus ? baseVaultsListingHref() : null,
          infoHref: `${baseVaultRosterHref()}/info`,
          drawer: <MorphoRosterDrawer />,
        }}
      />
    </ProvReceiptsScope>
  );
}

/** The listing intro drawer (standards/explanation-copy-charter.md §8a). */
function MorphoRosterDrawer() {
  return (
    <>
      <h3 className="text-[13px] font-semibold text-foreground">What a MetaMorpho vault is</h3>
      <p>
        A vault pools one asset and lends it across the Morpho Blue markets its curator chooses. A depositor holds
        shares, and a share buys back more of the asset as those markets pay interest.
      </p>
      <h3 className="text-[13px] font-semibold text-foreground">What this page is</h3>
      <p>
        One row is one vault the two MetaMorpho factories deployed on Base, grouped by asset and ordered by total
        assets. The list is a floor: a vault deployed without a factory emits no creation event, a vault created since
        the census block joins when the census runs again, and the Vault V2 family is outside it. Names are read live,
        because a V1.1 owner can rename a vault. Every figure is a call answered at the block named above, re-read at
        most every five minutes.
      </p>
      <h3 className="text-[13px] font-semibold text-foreground">What the figures leave out</h3>
      <p>
        Amounts are in each vault&rsquo;s own asset and nothing is priced in USD, so two assets are never ordered or
        added together. Yield is Rails&rsquo;s figure: the share price&rsquo;s growth over 30 days, annualised simply,
        net of the fees the vault takes inside the share; rewards paid outside the share, such as MORPHO, are not in it.
        Holders counts every address the census has seen hold a share, live and closed, at its own block: a floor, since
        an address is often a wrapper. An empty vault answered zero to <code>totalAssets()</code>; a vault with no
        holder has never minted a share.
      </p>
    </>
  );
}
