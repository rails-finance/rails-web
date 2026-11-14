"use client";

// The roster: every catalogued MetaMorpho vault on one chain, at one block.
// ----------------------------------------------------------------------------
// What /base/morpho/vaults and /ethereum/morpho/vaults show — the Vaults tab of
// the Morpho Blue rail on each chain (ui-jobs 486).
// One table row (V6) per catalogued vault, through the shared roster
// (components/vaults/vault-roster.tsx; ui-jobs 605). What the family supplies:
// its receipts, its Family facet (the two factory releases, also the Kind
// cell), the census sentence and the intro drawer. Compare ticks as on /vaults
// (E2, E3).
//
// SHARE PRICE is `convertToAssets(10^18)` — one whole share, in the vault's
// own asset. No USD.

import type { ReactNode } from "react";
import type { ServerRead } from "@/lib/shared/server-head-read";
import { Prov } from "@/components/shared/provenance";
import { ProvSection } from "@/components/shared/section-menu";
import { ROSTER_SCOPE, RosterMenu, VaultRoster, type VaultRosterFacet } from "@/components/vaults/vault-roster";
import { CompareBar } from "@/components/vaults/compare-selection";
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
  type MorphoVaultCoords,
} from "@/lib/morpho-base/vault-provenance";
import { releaseLabel } from "@/lib/vaults/families";
import { metaMorphoRowReceipts } from "@/lib/vaults/row-receipts";
import type { VaultSummary } from "@/lib/vaults/summary";
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
          head={{
            censusFigure: "directory-census",
            census: (
              <>
                <Prov info={vaultDirectoryCensusProv(coords, { catalogSize, censusBlock })}>
                  The {n(catalogSize)} vaults the two MetaMorpho factories had made at block {n(censusBlock)}
                </Prov>
                {withCensus ? "; Holders counts every address holding a share." : "."}
              </>
            ),
            listingHref: withCensus ? metaMorphoVaultsListingHref(chainId) : null,
            infoHref: `${metaMorphoVaultRosterHref(chainId)}/info`,
            menu: (
              <RosterMenu
                listingHref={withCensus ? metaMorphoVaultsListingHref(chainId) : null}
                infoHref={`${metaMorphoVaultRosterHref(chainId)}/info`}
                docs={{
                  title: "Morpho's documentation",
                  subtitle: "docs.morpho.org: Vaults V1 roles",
                  href: "https://docs.morpho.org/curate/concepts/roles/#morpho-vaults-v1-roles",
                }}
              />
            ),
            drawer: <MorphoRosterDrawer block={readBlock} chain={chain} />,
          }}
        />
      </ProvSection>
      <CompareBar />
    </>
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
        One row is one vault the two MetaMorpho factories deployed on {chain}. The list is a floor: a vault deployed
        without a factory emits no creation event, a vault created since the census block joins when the census runs
        again, and the Vault V2 family is outside it. Names are read live, because a V1.1 owner can rename a vault.
        Every figure is a call answered at {block}, re-read at most every five minutes.
      </p>
      <h3 className="text-[13px] font-semibold text-foreground">What the figures leave out</h3>
      <p>
        Amounts are in each vault&rsquo;s own asset and nothing is priced in USD, so two assets are never ordered or
        added together. Yield is Rails&rsquo;s figure: the share price&rsquo;s growth over 30 days, annualised simply,
        net of the fees the vault takes inside the share; rewards paid outside the share, such as MORPHO, are not in it.
        Holders counts every address holding a share at the census&rsquo;s own block: a floor, since an address is often
        a wrapper. An empty vault answered zero to <code>totalAssets()</code>; a vault with no holder has never minted a
        share.
      </p>
    </>
  );
}
