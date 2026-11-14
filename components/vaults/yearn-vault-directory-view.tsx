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
// the figure links nowhere.

import type { ReactNode } from "react";
import type { ServerRead } from "@/lib/shared/server-head-read";
import { Prov } from "@/components/shared/provenance";
import { ProvSection } from "@/components/shared/section-menu";
import { isoSeconds, RosterBlock } from "@/components/vaults/roster-read-stamp";
import { ROSTER_SCOPE, RosterMenu, VaultRoster, type VaultRosterFacet } from "@/components/vaults/vault-roster";
import { CompareBar } from "@/components/vaults/compare-selection";
import { yearnVaultHref, yearnVaultRosterHref } from "@/lib/vaults/routes";
import {
  yearnEmptyCountProv,
  yearnEndorsedCountProv,
  yearnRosterCensusProv,
  type YearnVaultCoords,
} from "@/lib/yearn/vault-provenance";
import { releaseLabel } from "@/lib/vaults/families";
import type { VaultSummary } from "@/lib/vaults/summary";
import type { VaultYield } from "@/lib/vaults/yield";
import { yearnRowReceipts } from "@/lib/vaults/row-receipts";

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
  initialSearch,
  vaults,
  yields,
  blockNumber,
  readBy,
  chainStale,
  catalogSize,
  censusBlock,
  holdersBlock,
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
  catalogSize: number;
  censusBlock: number;
  /** The position census's block; null where the census did not answer. */
  holdersBlock: number | null;
  endorsementUnread: readonly string[];
}) {
  const coords: YearnVaultCoords = { blockNumber: blockNumber || undefined, readBy };
  const endorsed = vaults.filter((v) => v.standing.includes("endorsed")).length;
  const unread = new Set(endorsementUnread);

  const readBlock = (
    <RosterBlock
      read={{
        label: "Yearn on Ethereum",
        block: blockNumber,
        at: readBy?.blockTime ?? isoSeconds(vaults[0]?.readAt.timestamp),
      }}
      chainId={CHAIN_ID}
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
          head={{
            censusFigure: "roster-census",
            census: (
              <>
                <Prov info={yearnRosterCensusProv(coords, { catalogSize, censusBlock })}>
                  The {n(catalogSize)} vaults the Yearn V3 factories had deployed on Ethereum at block {n(censusBlock)}
                </Prov>
                ; <Prov info={yearnEndorsedCountProv(coords, endorsed, catalogSize)}>{n(endorsed)} are endorsed</Prov>
                {holdersBlock != null
                  ? `. Holders counts every address holding a share at census block ${n(holdersBlock)}.`
                  : "."}
              </>
            ),
            listingHref: null,
            infoHref: `${yearnVaultRosterHref()}/info`,
            menu: (
              <RosterMenu
                listingHref={null}
                infoHref={`${yearnVaultRosterHref()}/info`}
                docs={{
                  title: "Yearn's documentation",
                  subtitle: "docs.yearn.fi: Introduction",
                  href: "https://docs.yearn.fi/getting-started/intro",
                }}
              />
            ),
            drawer: <YearnRosterDrawer block={readBlock} withHolders={holdersBlock != null} />,
          }}
        />
      </ProvSection>
      <CompareBar />
    </>
  );
}

/** The listing intro drawer (standards/explanation-copy-charter.md §8a). */
function YearnRosterDrawer({ block, withHolders }: { block: ReactNode; withHolders: boolean }) {
  return (
    <>
      <h3 className="text-[13px] font-semibold text-foreground">What a Yearn V3 vault is</h3>
      <p>
        A vault pools one token from its depositors and hands it to strategies that put it to work. A depositor holds
        shares, and a share buys back more of the token as those strategies earn.
      </p>
      <h3 className="text-[13px] font-semibold text-foreground">What this page is</h3>
      <p>
        One row is one vault the five V3 factories deployed on Ethereum. The factories are open to anyone, so the list
        is a floor: a vault deployed without a factory leaves no trace to enumerate, and a vault created since the
        census block joins when the census runs again. Yearn V2 is a separate registry and is outside it. Every figure
        is a call answered at {block}, re-read at most every five minutes.
      </p>
      <h3 className="text-[13px] font-semibold text-foreground">What the figures leave out</h3>
      <p>
        Deploying from a Yearn factory and being endorsed by Yearn are two facts: the Yearn mark and the
        &ldquo;endorsed&rdquo; pill sit only on vaults the Registry endorses at that block, and Yearn can withdraw an
        endorsement. Amounts are in each vault&rsquo;s own asset and nothing is priced in USD, so two assets are never
        ordered or added together. Yield is Rails&rsquo;s figure: the share price&rsquo;s growth over 30 days,
        annualised simply, net of the fees the vault takes inside the share; gauge rewards paid outside the share are
        not in it. An empty vault answered zero to <code>totalAssets()</code>: a deployment never funded looks the same
        as one whose depositors have all left.
        {withHolders &&
          " Holders counts every address holding a share at the census's own block: a floor, since an address is often a wrapper."}
      </p>
    </>
  );
}
