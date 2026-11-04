"use client";

// The roster: every catalogued MetaMorpho vault on one chain, at one block.
// ----------------------------------------------------------------------------
// What /base/morpho/vaults and /ethereum/morpho/vaults show — the Vaults tab of
// the Morpho Blue rail on each chain (ui-jobs 486).
// One vault row (V1, components/vaults/vault-row.tsx) per catalogued vault,
// grouped by asset, through the shared roster (components/vaults/
// vault-roster.tsx). What the family supplies: its receipts, its Family facet
// (the two factory releases), the census sentence and the intro drawer.
//
// SHARE PRICE is `convertToAssets(10^18)` — one whole share, in the vault's
// own asset. No USD.

import type { ReactNode } from "react";
import type { ServerRead } from "@/lib/shared/server-head-read";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { VaultRoster, type VaultRosterFacet } from "@/components/vaults/vault-roster";
import { isoSeconds, RosterBlock } from "@/components/vaults/roster-read-stamp";
import {
  metaMorphoVaultHref,
  metaMorphoVaultsListingHref,
  metaMorphoVaultRosterHref,
  type MetaMorphoRouteChain,
} from "@/lib/vaults/routes";
import { chainMeta } from "@/lib/shared/chains";
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
  chainId,
  initialSearch,
  vaults,
  yields,
  blockNumber,
  readBy,
  chainStale,
  catalogSize,
  censusBlock,
  withCensus,
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
  /** How many vaults the roster holds, and the block it was swept at. */
  catalogSize: number;
  censusBlock: number;
  /** The position census answered: the rows carry Holders. */
  withCensus: boolean;
}) {
  const coords: MorphoVaultCoords = { chainId, blockNumber: blockNumber || undefined, readBy };
  const chain = chainMeta(chainId).name;
  const rowCoords = (v: VaultSummary): MorphoVaultCoords => ({
    ...coords,
    vault: v.address,
    vaultName: vaultDisplayName(v) ?? undefined,
    assetSymbol: v.asset.symbol,
  });

  const readBlock = (
    <RosterBlock
      read={{
        label: `Morpho on ${chain}`,
        block: blockNumber,
        at: readBy?.blockTime ?? isoSeconds(vaults[0]?.readAt.timestamp),
      }}
      chainId={chainId}
    />
  );
  const registry = useReceiptRegistry();
  return (
    <ProvReceiptsScope registry={registry}>
      <VaultRoster
        initialSearch={initialSearch}
        readTime={readBy?.blockTime}
        vaults={vaults}
        yields={yields}
        chainId={chainId}
        blockNumber={blockNumber}
        chainStale={chainStale}
        skel="directory"
        facets={FACETS}
        hrefOf={(v) => metaMorphoVaultHref(chainId, v.address)}
        holdersHrefOf={(v) => metaMorphoVaultsListingHref(chainId, { vault: v.address })}
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
          listingHref: withCensus ? metaMorphoVaultsListingHref(chainId) : null,
          infoHref: `${metaMorphoVaultRosterHref(chainId)}/info`,
          drawer: <MorphoRosterDrawer block={readBlock} chain={chain} />,
        }}
      />
    </ProvReceiptsScope>
  );
}

/** The listing intro drawer (standards/explanation-copy-charter.md §8a). */
function MorphoRosterDrawer({ block, chain }: { block: ReactNode; chain: string }) {
  return (
    <>
      <h3 className="text-[13px] font-semibold text-foreground">What a MetaMorpho vault is</h3>
      <p>
        A vault pools one asset and lends it across the Morpho Blue markets its curator chooses. A depositor holds
        shares, and a share buys back more of the asset as those markets pay interest.
      </p>
      <h3 className="text-[13px] font-semibold text-foreground">What this page is</h3>
      <p>
        One row is one vault the two MetaMorpho factories deployed on {chain}, grouped by asset. The list is a floor: a
        vault deployed without a factory emits no creation event, a vault created since the census block joins when the
        census runs again, and the Vault V2 family is outside it. Names are read live, because a V1.1 owner can rename a
        vault. Every figure is a call answered at {block}, re-read at most every five minutes.
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
