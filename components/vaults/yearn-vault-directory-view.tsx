"use client";

// The roster: every vault the Yearn V3 factories made on Ethereum, at one block.
// ----------------------------------------------------------------------------
// What /ethereum/yearn/vaults shows — the Vaults tab of the Yearn V3 rail, and
// the explorer's landing page (rails-ops decision 0027 call 2). One table row
// (V6) per catalogued vault, through the shared roster (components/vaults/
// vault-roster.tsx; ui-jobs 605). Compare ticks as on /vaults (E2, E3).
//
// THE ENDORSEMENT IS EARNED, THE FAMILY WORD IS NOT. "Yearn V3" and the release
// sit in every row's Kind cell; the "endorsed" pill only where
// `Registry.isEndorsed()` answered true at the block read (decision 0027
// call 1). The table draws no protocol mark on this one-protocol roster
// (ui-jobs 605).
//
// Holders is the position census's (ui-jobs 585); with no positions listing,
// the figure links nowhere. Above the rows the read stamp alone (ui-jobs 771):
// the census and endorsed counts and the family's words are on the vaults info
// page.

import type { ServerRead } from "@/lib/shared/server-head-read";
import { ProvSection } from "@/components/shared/section-menu";
import { ROSTER_SCOPE, VaultRoster, type VaultRosterFacet } from "@/components/vaults/vault-roster";
import { CompareBar } from "@/components/vaults/compare-selection";
import { yearnVaultHref } from "@/lib/vaults/routes";
import { yearnEmptyCountProv, type YearnVaultCoords } from "@/lib/yearn/vault-provenance";
import { releaseLabel } from "@/lib/vaults/families";
import type { VaultSummary } from "@/lib/vaults/summary";
import type { VaultYield } from "@/lib/vaults/yield";
import { yearnRowReceipts } from "@/lib/vaults/row-receipts";

const CHAIN_ID = 1;

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
  initialSearch,
  vaults,
  yields,
  blockNumber,
  readBy,
  chainStale,
  catalogSize,
  /** Rows whose endorsement read did not answer, by address: the row draws no
   *  pill for them, and the verifier tells unread from false. */
  endorsementUnread,
}: {
  /** The query string the page was served with (the roster's preset and sort). */
  initialSearch?: string;
  vaults: VaultSummary[];
  yields: Record<string, VaultYield>;
  blockNumber: number;
  /** rails-server's read of `blockNumber`, when it answered every read. */
  readBy?: ServerRead | null;
  chainStale: boolean;
  /** How many vaults the census holds (the empty count's receipt). */
  catalogSize: number;
  endorsementUnread: readonly string[];
}) {
  const coords: YearnVaultCoords = { blockNumber: blockNumber || undefined, readBy };
  const unread = new Set(endorsementUnread);

  return (
    <>
      <ProvSection scope={ROSTER_SCOPE} as="div">
        <VaultRoster
          initialSearch={initialSearch}
          readTime={readBy?.blockTime}
          vaults={vaults}
          yieldOf={(v) => yields[v.address]}
          kindOf={(v) => v.releaseLabel}
          chainId={CHAIN_ID}
          blockNumber={blockNumber}
          chainStale={chainStale}
          skel="roster"
          facets={FACETS}
          hrefOf={(v) => yearnVaultHref(v.address)}
          holdersHrefOf={null}
          receiptsOf={(v) => yearnRowReceipts(coords, v)}
          hooksOf={(v) => ({
            "data-release": v.release ?? "",
            "data-endorsed": unread.has(v.address) ? "unread" : String(v.standing.includes("endorsed")),
          })}
          emptyCountProv={(count) => yearnEmptyCountProv(coords, count, catalogSize)}
          head={{ drawer: null }}
        />
      </ProvSection>
      <CompareBar />
    </>
  );
}
