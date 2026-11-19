"use client";

// The roster: every vault the IPOR Fusion factory made on a chain, at one
// block (rails-ops TO-DO-ipor-scoping §6.3). What /<chain>/ipor-fusion/vaults
// shows, through the shared roster (components/vaults/vault-roster.tsx), as
// Yearn's does. No mark on this one-protocol roster and no endorsement pill:
// the factory is open to anyone, and IPOR's register of fuses is stated per
// fuse on each factsheet.

import type { ReactNode } from "react";
import type { ServerRead } from "@/lib/shared/server-head-read";
import type { ChainId } from "@/lib/shared/chains";
import { chainMeta } from "@/lib/shared/chains";
import { Prov } from "@/components/shared/provenance";
import { ProvSection } from "@/components/shared/section-menu";
import { isoSeconds, RosterBlock } from "@/components/vaults/roster-read-stamp";
import { ROSTER_SCOPE, RosterMenu, VaultRoster, type VaultRosterFacet } from "@/components/vaults/vault-roster";
import { CompareBar } from "@/components/vaults/compare-selection";
import { iporFusionVaultHref, iporFusionVaultRosterHref } from "@/lib/vaults/routes";
import { iporEmptyCountProv, iporRosterCensusProv, type IporFusionCoords } from "@/lib/ipor-fusion/vault-provenance";
import { releaseLabel } from "@/lib/vaults/families";
import type { VaultSummary } from "@/lib/vaults/summary";
import { iporFusionRowReceipts } from "@/lib/vaults/row-receipts";

const n = (v: number) => v.toLocaleString("en-US");

export const IPOR_FUSION_DOCS = {
  title: "IPOR's documentation",
  subtitle: "ipor.io/docs: What is a fuse",
  href: "https://ipor.io/docs/build-on-fusion/architecture-overview/what-is-a-fuse",
};

const FACETS: VaultRosterFacet[] = [
  {
    id: "release",
    label: "Factory version",
    valueOf: (v) => v.release ?? "",
    labelOf: (r) => releaseLabel("ipor-fusion", r || null),
  },
];

export function IporFusionVaultDirectoryView({
  chainId,
  initialSearch,
  vaults,
  blockNumber,
  readBy,
  chainStale,
  catalogSize,
  censusBlock,
  factory,
}: {
  chainId: ChainId;
  initialSearch?: string;
  vaults: VaultSummary[];
  blockNumber: number;
  readBy?: ServerRead | null;
  chainStale: boolean;
  catalogSize: number;
  censusBlock: number;
  factory: string;
}) {
  const coords: IporFusionCoords = { chainId, blockNumber: blockNumber || undefined, readBy };
  const chain = chainMeta(chainId).name;
  const rosterHref = iporFusionVaultRosterHref(chainId)!;
  const readBlock = (
    <RosterBlock
      read={{
        label: `IPOR Fusion on ${chain}`,
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
          yieldOf={() => undefined}
          kindOf={(v) => v.releaseLabel}
          chainId={chainId}
          blockNumber={blockNumber}
          chainStale={chainStale}
          skel="roster"
          facets={FACETS}
          hrefOf={(v) => iporFusionVaultHref(chainId, v.address)!}
          holdersHrefOf={null}
          receiptsOf={(v) => iporFusionRowReceipts(coords, v)}
          hooksOf={(v) => ({ "data-release": v.release ?? "" })}
          emptyCountProv={(count) => iporEmptyCountProv(coords, count, catalogSize)}
          head={{
            censusFigure: "roster-census",
            census: (
              <>
                Listed below are the{" "}
                <Prov info={iporRosterCensusProv(coords, { catalogSize, censusBlock, factory })}>
                  {n(catalogSize)} vaults the IPOR Fusion factory had made on {chain} by block {n(censusBlock)}
                </Prov>
                .
              </>
            ),
            listingHref: null,
            // The cross-protocol index lists no IPOR Fusion vault until phase C
            // (TO-DO-ipor-scoping §6.3), so the line carries no link to it.
            indexHref: null,
            infoHref: `${rosterHref}/info`,
            menu: <RosterMenu listingHref={null} infoHref={`${rosterHref}/info`} docs={IPOR_FUSION_DOCS} />,
            drawer: <IporFusionRosterDrawer block={readBlock} chain={chain} />,
          }}
        />
      </ProvSection>
      <CompareBar />
    </>
  );
}

/** The listing intro drawer (standards/explanation-copy-charter.md §8a). */
function IporFusionRosterDrawer({ block, chain }: { block: ReactNode; chain: string }) {
  return (
    <>
      <h3 className="text-[13px] font-semibold text-foreground">What an IPOR Fusion vault is</h3>
      <p>
        A vault pools one token from its depositors. Its curator moves that token into other protocols through fuses,
        small contracts that each speak to one protocol. A depositor holds shares, and a share buys back more of the
        token as those positions earn.
      </p>
      <h3 className="text-[13px] font-semibold text-foreground">What this page is</h3>
      <p>
        One row is one vault the IPOR Fusion factory made on {chain}. The factory is open to anyone, so a vault here is
        not one IPOR curates, and the list is a floor: a vault deployed by hand or by an earlier factory leaves no
        creation event to find, and a vault made since the census block joins when the census runs again. Every figure
        is a call answered at {block}, re-read at most every five minutes.
      </p>
      <h3 className="text-[13px] font-semibold text-foreground">What the figures leave out</h3>
      <p>
        Amounts are in each vault&rsquo;s own asset and nothing is priced in USD, so two assets are never ordered or
        added together. A vault&rsquo;s total assets include the balances its fuses last booked in each market, which
        can trail the markets until the vault updates them. An empty vault answered zero to <code>totalAssets()</code>:
        a vault never funded looks the same as one whose depositors have all left.
      </p>
    </>
  );
}
