"use client";

// The roster: every vault the IPOR Fusion factory made on a chain, at one
// block (rails-ops TO-DO-ipor-scoping §6.3). What /<chain>/ipor-fusion/vaults
// shows, through the shared roster (components/vaults/vault-roster.tsx), as
// Yearn's does, with its read stamp above the rows and nothing else (Miles, 19
// Nov 2026): what the list is, and the docs link, are on the about page.

import type { ServerRead } from "@/lib/shared/server-head-read";
import type { ChainId } from "@/lib/shared/chains";
import { ProvSection } from "@/components/shared/section-menu";
import { ROSTER_SCOPE, VaultRoster, type VaultRosterFacet } from "@/components/vaults/vault-roster";
import { CompareBar } from "@/components/vaults/compare-selection";
import { iporFusionVaultHref } from "@/lib/vaults/routes";
import { iporEmptyCountProv, type IporFusionCoords } from "@/lib/ipor-fusion/vault-provenance";
import { releaseLabel } from "@/lib/vaults/families";
import type { VaultSummary } from "@/lib/vaults/summary";
import { iporFusionRowReceipts } from "@/lib/vaults/row-receipts";

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
}: {
  chainId: ChainId;
  initialSearch?: string;
  vaults: VaultSummary[];
  blockNumber: number;
  readBy?: ServerRead | null;
  chainStale: boolean;
  catalogSize: number;
}) {
  const coords: IporFusionCoords = { chainId, blockNumber: blockNumber || undefined, readBy };
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
          // Miles, 19 Nov 2026: the roster carries its read stamp and nothing
          // else above the rows; what the list is lives on the about page.
          head={{
            censusFigure: "roster-census",
            census: null,
            listingHref: null,
            drawer: null,
            infoHref: null,
            indexHref: null,
          }}
        />
      </ProvSection>
      <CompareBar />
    </>
  );
}
