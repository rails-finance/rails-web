"use client";

// The roster: every vault Aave's own enumerators name on Ethereum, at one block.
// ----------------------------------------------------------------------------
// The VAULTS tab of the Aave vaults rail (/ethereum/aave/vaults). One vault row
// (V1, components/vaults/vault-row.tsx) per vault, grouped by asset like every
// roster, through the shared roster (components/vaults/vault-roster.tsx). The
// family is a facet and a pill on the row: a reader narrowing to one asset
// still sees which rows are a slashable stake and which are wrapped supply.
// The family's own mechanic reads (deposit cap, wrapped aToken, cooldown and
// slashing) are on the vault's page; the mechanics in words are in the intro
// drawer, with Aave's own pages.
//
// THE DENOMINATOR is complete at its block: two enumerator calls answer their
// whole family in one read, and sGHO is one address Aave's book names.

import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { VaultRoster, type VaultRosterFacet } from "@/components/vaults/vault-roster";
import { AaveFirstPartySources } from "@/components/vaults/aave-first-party-sources";
import { AAVE_FAMILY_LABEL } from "@/components/vaults/aave-vault-format";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { ethereumVaultHref, ethereumVaultRosterHref, ethereumVaultsListingHref } from "@/lib/vaults/routes";
import { AAVE_VAULT_FAMILY_ORDER, aaveVaultAttestation, type AaveVaultFamily } from "@/lib/aave-vaults/vault-catalog";
import {
  aaveVaultAssetGroupCountProv,
  aaveVaultBookProv,
  aaveVaultCatalogueProv,
  aaveVaultEmptyCountProv,
  aaveVaultNameProv,
  aaveVaultSharePriceProv,
  aaveVaultTotalAssetsProv,
  type AaveVaultCoords,
} from "@/lib/aave-vaults/vault-provenance";
import { vaultDisplayName, type VaultSummary } from "@/lib/vaults/summary";
import type { VaultYield } from "@/lib/vaults/yield";

const n = (v: number) => v.toLocaleString("en-US");

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
  vaults,
  yields,
  blockNumber,
  chainStale,
  counts,
  censusBlock,
}: {
  vaults: VaultSummary[];
  yields: Record<string, VaultYield>;
  blockNumber: number;
  chainStale: boolean;
  /** What the enumerators answered at the block. */
  counts: { catalogSize: number; stataCount: number; stakeCount: number };
  /** The position census's block; null where the census did not answer. */
  censusBlock: number | null;
}) {
  const coords: AaveVaultCoords = { blockNumber: blockNumber || undefined };
  const rowCoords = (v: VaultSummary): AaveVaultCoords => ({
    ...coords,
    vault: v.address,
    vaultName: vaultDisplayName(v) ?? undefined,
    assetSymbol: v.asset.symbol,
    shareSymbol: v.symbol ?? undefined,
  });
  const family = (v: VaultSummary) => v.family as AaveVaultFamily;

  const registry = useReceiptRegistry();
  return (
    <ProvReceiptsScope registry={registry}>
      <VaultRoster
        vaults={vaults}
        yields={yields}
        chainId={MAINNET_CHAIN_ID}
        blockNumber={blockNumber}
        chainStale={chainStale}
        skel="directory"
        facets={FACETS}
        hrefOf={(v) => ethereumVaultHref(v.address)}
        holdersHrefOf={(v) => ethereumVaultsListingHref({ vault: v.address })}
        receiptsOf={(v) => ({
          name: aaveVaultNameProv(rowCoords(v), aaveVaultAttestation(v.address, family(v))),
          totalAssets: aaveVaultTotalAssetsProv(rowCoords(v), family(v)),
          sharePrice: v.shareDecimals != null ? aaveVaultSharePriceProv(rowCoords(v), v.shareDecimals) : undefined,
          standing: { "address-book": aaveVaultBookProv(rowCoords(v), aaveVaultAttestation(v.address, family(v))) },
        })}
        hooksOf={(v) => ({ "data-family": v.family })}
        groupCountProv={(assetSymbol, count) => aaveVaultAssetGroupCountProv({ ...coords, assetSymbol }, count)}
        emptyCountProv={(count) => aaveVaultEmptyCountProv(coords, count, counts.catalogSize)}
        head={{
          censusFigure: "directory-catalogue",
          census: (
            <>
              <Prov info={aaveVaultCatalogueProv(coords, counts)}>
                Aave&rsquo;s contracts name {n(counts.catalogSize)} vaults at this block
              </Prov>
              {censusBlock != null
                ? `; Holders counts every address that has held a share by census block ${n(censusBlock)}.`
                : "."}
            </>
          ),
          listingHref: ethereumVaultsListingHref(),
          infoHref: `${ethereumVaultRosterHref()}/info`,
          drawer: <AaveRosterDrawer counts={counts} />,
        }}
      />
    </ProvReceiptsScope>
  );
}

/** The listing intro drawer (standards/explanation-copy-charter.md §8a). */
function AaveRosterDrawer({ counts }: { counts: { stataCount: number; stakeCount: number } }) {
  return (
    <>
      <h3 className="text-[13px] font-semibold text-foreground">What Aave&rsquo;s vaults are</h3>
      <p>
        Three families of ERC-4626 vault that Aave deploys. Savings GHO is one vault over GHO: a holder&rsquo;s shares
        grow with a stored yield index, and withdrawals are clamped to the GHO the contract holds. A static aToken wraps
        exactly one Aave V3 aToken, so its shares are a non-rebasing claim on a supply position and its share price is
        the reserve&rsquo;s accrued index. An Umbrella stake token is staked against one reserve&rsquo;s deficit:
        Umbrella can slash it, which lowers every holder&rsquo;s share price at once, and redemption runs through a
        cooldown and a window after it.
      </p>
      <h3 className="text-[13px] font-semibold text-foreground">What this page is</h3>
      <p>
        One row is one vault, grouped by asset: savings GHO, the {n(counts.stataCount)} static aTokens{" "}
        <code>getStataTokens()</code> returns and the {n(counts.stakeCount)} stake tokens <code>getStkTokens()</code>{" "}
        returns, every one read at the block named above. Both calls answer their whole family, so the list is complete
        at that block. Outside it: Aave&rsquo;s deployments on other chains, the legacy static-aToken factory, and any
        ERC-4626 Aave has not published. The census that counts Holders runs on its own block.
      </p>
      <h3 className="text-[13px] font-semibold text-foreground">What the figures leave out</h3>
      <p>
        Amounts are in each vault&rsquo;s own asset and nothing is priced in USD. Three of the four stake tokens hold a
        static aToken, so their amounts are in that wrapper&rsquo;s units. A static aToken holding nothing still answers
        a share price well above one: the reserve&rsquo;s index. Yield is Rails&rsquo;s figure: the share price&rsquo;s
        growth over 30 days, annualised simply; Umbrella&rsquo;s rewards are paid outside the share and are not in it.
        The deposit cap, the wrapped aToken and the cooldown are on each vault&rsquo;s page.
      </p>
      <AaveFirstPartySources />
    </>
  );
}
