"use client";

// The roster: every vault the Yearn V3 factories made on Ethereum, at one block.
// ----------------------------------------------------------------------------
// What /ethereum/yearn/vaults shows — the Vaults tab of the Yearn V3 rail, and
// the explorer's landing page (rails-ops decision 0027 call 2). One vault row
// (V1, components/vaults/vault-row.tsx) per catalogued vault, grouped by asset,
// through the shared roster (components/vaults/vault-roster.tsx).
//
// THE MARK IS EARNED, THE FAMILY WORD IS NOT. "Yearn V3" and the release sit on
// every row; the Yearn mark and the "endorsed" pill only where
// `Registry.isEndorsed()` answered true at the block read (decision 0027
// call 1). The address sits beside every name: four names on this roster are
// each carried by three vaults.
//
// No census: the Holders slot reads "no census" until Yearn has one.

import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { VaultRoster, type VaultRosterFacet } from "@/components/vaults/vault-roster";
import { yearnVaultHref, yearnVaultRosterHref } from "@/lib/vaults/routes";
import {
  yearnAssetGroupCountProv,
  yearnEmptyCountProv,
  yearnEndorsedCountProv,
  yearnRosterCensusProv,
  yearnVaultEndorsedProv,
  yearnVaultNameProv,
  yearnVaultSharePriceProv,
  yearnVaultShutdownProv,
  yearnVaultTotalAssetsProv,
  type YearnVaultCoords,
} from "@/lib/yearn/vault-provenance";
import { releaseLabel } from "@/lib/vaults/families";
import { vaultDisplayName, type VaultSummary } from "@/lib/vaults/summary";
import type { VaultYield } from "@/lib/vaults/yield";

const CHAIN_ID = 1;
const n = (v: number) => v.toLocaleString("en-US");

const FACETS: VaultRosterFacet[] = [
  {
    id: "release",
    label: "Family",
    valueOf: (v) => v.release ?? "",
    labelOf: (r) => releaseLabel("yearn-v3", r),
  },
  {
    id: "standing",
    label: "Endorsement",
    valueOf: (v) => (v.standing.includes("endorsed") ? "endorsed" : "unendorsed"),
    labelOf: (s) => (s === "endorsed" ? "Endorsed" : "Unendorsed"),
    order: ["endorsed", "unendorsed"],
  },
];

export function YearnVaultDirectoryView({
  vaults,
  yields,
  blockNumber,
  chainStale,
  catalogSize,
  censusBlock,
  /** Rows whose endorsement read did not answer, by address: the row draws no
   *  pill for them, and the verifier tells unread from false. */
  endorsementUnread,
}: {
  vaults: VaultSummary[];
  yields: Record<string, VaultYield>;
  blockNumber: number;
  chainStale: boolean;
  catalogSize: number;
  censusBlock: number;
  endorsementUnread: readonly string[];
}) {
  const coords: YearnVaultCoords = { blockNumber: blockNumber || undefined };
  const rowCoords = (v: VaultSummary): YearnVaultCoords => ({
    ...coords,
    vault: v.address,
    vaultName: vaultDisplayName(v) ?? undefined,
    assetSymbol: v.asset.symbol,
    apiVersion: v.release ?? undefined,
  });
  const endorsed = vaults.filter((v) => v.standing.includes("endorsed")).length;
  const unread = new Set(endorsementUnread);

  const registry = useReceiptRegistry();
  return (
    <ProvReceiptsScope registry={registry}>
      <VaultRoster
        vaults={vaults}
        yields={yields}
        chainId={CHAIN_ID}
        blockNumber={blockNumber}
        chainStale={chainStale}
        skel="roster"
        facets={FACETS}
        hrefOf={(v) => yearnVaultHref(v.address)}
        holdersHrefOf={null}
        receiptsOf={(v) => ({
          name: yearnVaultNameProv(rowCoords(v)),
          totalAssets: yearnVaultTotalAssetsProv(rowCoords(v)),
          sharePrice: yearnVaultSharePriceProv(rowCoords(v)),
          standing: {
            endorsed: yearnVaultEndorsedProv(rowCoords(v), true),
            "shut-down": yearnVaultShutdownProv(rowCoords(v)),
          },
        })}
        hooksOf={(v) => ({
          "data-release": v.release ?? "",
          "data-endorsed": unread.has(v.address) ? "unread" : String(v.standing.includes("endorsed")),
        })}
        groupCountProv={(assetSymbol, count) => yearnAssetGroupCountProv({ ...coords, assetSymbol }, count)}
        emptyCountProv={(count) => yearnEmptyCountProv(coords, count, catalogSize)}
        head={{
          censusFigure: "roster-census",
          census: (
            <>
              <Prov info={yearnRosterCensusProv(coords, { catalogSize, censusBlock })}>
                The {n(catalogSize)} vaults the Yearn V3 factories had deployed on Ethereum at block {n(censusBlock)}
              </Prov>
              ; <Prov info={yearnEndorsedCountProv(coords, endorsed, catalogSize)}>{n(endorsed)} are endorsed</Prov>.
            </>
          ),
          listingHref: null,
          infoHref: `${yearnVaultRosterHref()}/info`,
          drawer: <YearnRosterDrawer />,
        }}
      />
    </ProvReceiptsScope>
  );
}

/** The listing intro drawer (standards/explanation-copy-charter.md §8a). */
function YearnRosterDrawer() {
  return (
    <>
      <h3 className="text-[13px] font-semibold text-foreground">What a Yearn V3 vault is</h3>
      <p>
        A vault pools one token from its depositors and hands it to strategies that put it to work. A depositor holds
        shares, and a share buys back more of the token as those strategies earn.
      </p>
      <h3 className="text-[13px] font-semibold text-foreground">What this page is</h3>
      <p>
        One row is one vault the five V3 factories deployed on Ethereum, grouped by asset and ordered by total assets.
        The factories are open to anyone, so the list is a floor: a vault deployed without a factory leaves no trace to
        enumerate, and a vault created since the census block joins when the census runs again. Yearn V2 is a separate
        registry and is outside it. Every figure is a call answered at the block named above, re-read at most every five
        minutes.
      </p>
      <h3 className="text-[13px] font-semibold text-foreground">What the figures leave out</h3>
      <p>
        Deploying from a Yearn factory and being endorsed by Yearn are two facts: the Yearn mark and the
        &ldquo;endorsed&rdquo; pill sit only on vaults the Registry endorses at that block, and Yearn can withdraw an
        endorsement. Amounts are in each vault&rsquo;s own asset and nothing is priced in USD, so two assets are never
        ordered or added together. Yield is Rails&rsquo;s figure: the share price&rsquo;s growth over 30 days,
        annualised simply, net of the fees the vault takes inside the share; gauge rewards paid outside the share are
        not in it. An empty vault answered zero to <code>totalAssets()</code>: a deployment never funded looks the same
        as one whose depositors have all left. Yearn has no holder census here yet.
      </p>
    </>
  );
}
