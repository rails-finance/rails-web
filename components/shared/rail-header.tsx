"use client";

// RailHeader — the two-row header on every explorer surface. The protocol's
// identity (ProtocolIdentity) takes the left of the first row and the chain's
// name the right end of it (rails-ops TO-DO-ui-jobs 68, 497): the two together
// say what you are looking at and which chain it runs on, so they belong on
// one line rather than one on the page and one in the chrome. The second row
// carries the recency stamp on the left (the chain head is rail-level
// context — the block the page reads against — not row furniture) and the
// rail's sub-nav on the right. The sub-nav is live tab links — the position
// listing (named by the protocol's own noun: TROVES, VAULTS, ACCOUNTS;
// absent on an explorer that has none), then each of the roster's sub-pages
// in order (MARKETS, BRANCHES, SYSTEM, …) — then, slightly apart, the (i)
// link to the explorer's info page. On a sub-page the lit tab is the one
// whose route holds the pathname, so a sub-page's nested routes (Morpho's
// markets/[loanToken]) light their parent.
//
// A POSITION PAGE DRAWS NO RAIL HEADER (rails-ops decisions/0052): the
// wallet heading is its frame, with a line naming the protocol and linking
// to its listing (components/shared/wallet-heading.tsx).
//
// The chain is named at the right end of the first row (ChainLabel); the
// chooser that stood there is the brand rail's since ui-jobs 497.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { positionNounPlural, protocolForSession, subPageForPathname } from "@/lib/shared/protocols";
import { ProtocolIdentity } from "@/components/shared/protocol-identity";
import { RecencyStamp } from "@/components/shared/recency-stamp";
import { INFO_PATH } from "@/components/shared/info-disclosure";
import { ChainGlyph } from "@/components/shared/chain-toggle";
import { CHAINS, type ChainId } from "@/lib/shared/chains";

/** The explorer's chain, named at the right end of the title row: the glyph
 *  and the name in the rail's small caps, a label and not a control. The
 *  chooser it replaced moved to the brand rail (ui-jobs 497), where it does
 *  not follow the page's chain. From md the profile control (H20) stands at
 *  the column's top right (app/(app)/layout.tsx), so `md:mr-8` leaves its
 *  38px, less the 10px it reaches past the content edge, and a 4px gap.
 *  Below md the label stays: the header bar's chooser names no chain either. */
export function ChainLabel({ chainId, className = "" }: { chainId: ChainId; className?: string }) {
  const chain = CHAINS[chainId];
  if (!chain) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 text-rb-500 ${className}`}
      data-chain-label={chain.slug}
      data-anatomy="H3.2"
    >
      <ChainGlyph chainId={chain.id} className="h-4 w-4" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">{chain.name}</span>
    </span>
  );
}

/** Which surface of the rail is being looked at — decides the lit slot. */
export type RailVenue = "listing" | "subPage" | "info";

// Same 11px small-caps register as ProtocolIdentity. Every slot carries the
// bottom border so the active underline never shifts the baseline; the idle
// border is just transparent.
//
// EXPORTED, so a second rail component wears the same three classes rather
// than a copy of them: a second rail that drifted a letter-spacing would read
// as a second product. The vaults section had its own rail on these classes
// until decision 0028 retired the section and folded every vault layer under
// its protocol's explorer, so this file is the only rail today — the export
// stands for whatever rail comes next.
export const TAB_BASE = "border-b pb-0.5 text-[11px] font-semibold uppercase tracking-[0.14em]";
export const TAB_ACTIVE = `${TAB_BASE} border-current text-foreground`;
export const TAB_IDLE = `${TAB_BASE} border-transparent text-rb-500 transition-colors hover:text-blue-600 dark:hover:text-blue-400`;

export function RailHeader({
  session,
  venue,
  stamp = false,
}: {
  session: SessionProtocol;
  venue: RailVenue;
  /** Render the shared RecencyStamp on the second row, left of the sub-nav
   *  (decision 0006's freshness signal). On for listings; off where the page
   *  reads no chain head (the info page) — rendering it there would assert a
   *  freshness the page doesn't have, and the second row then carries the
   *  sub-nav alone, right-aligned rather than left where the stamp would have
   *  sat. */
  stamp?: boolean;
}) {
  const pathname = usePathname();
  const entry = protocolForSession(session);
  if (!entry) return null;
  const litSubPage = venue === "subPage" ? subPageForPathname(entry, pathname) : undefined;
  return (
    // Two rows at every width (rails-ops TO-DO-ui-jobs 66). Pinning the
    // sub-nav under the identity started as a fix for below `sm`: left to
    // wrap on its own it landed in two places — beside the name on the
    // markets and info pages, under it on the listing, whose recency stamp is
    // what pushed it down — so the tabs jumped as the reader moved between
    // the three (Miles, 2026-09-02). That reasoning is not a breakpoint's; a
    // tab row that stays put is what makes the rail feel like one surface, at
    // any width, so the split is unconditional now: the identity owns the
    // first row by itself, the stamp and the sub-nav share the second.
    <div className="flex flex-col gap-2">
      {/* The page's largest type (rails-ops TO-DO-ui-jobs 67). The first thing
          the eye lands on is now what the page is about; the scale lives in
          ProtocolIdentity, so every explorer wears the same one. The chain's
          label takes the far end of the row, and `min-w-0` lets a long name shrink
          rather than push it off. */}
      <div className="flex items-center justify-between gap-3" data-anatomy="H3">
        <div className="min-w-0">
          <ProtocolIdentity session={session} scale="title" />
        </div>
        <ChainLabel chainId={entry.chainId} className="md:mr-8" />
      </div>
      {/* Right-aligned even with the stamp off (the info page): a lone nav
          flush right still reads as one deliberate row, not a stamp-shaped
          gap. With the stamp on, the two ends split it as before. */}
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 ${stamp ? "justify-between" : "justify-end"}`}>
        {stamp && <RecencyStamp />}
        <nav aria-label="Explorer sections" className="flex flex-wrap items-center gap-4" data-anatomy="H5">
          {/* The position listing, where the explorer has one. A vault-native
              explorer has none — a share in a vault is not a position in the
              roster's sense (rails-ops decision 0027 call 2) — so its first tab
              is its first sub-page and its own route opens on that sub-page. */}
          {entry.positionListing !== false && (
            <Link
              href={entry.listingHref}
              className={venue === "listing" ? TAB_ACTIVE : TAB_IDLE}
              aria-current={venue === "listing" ? "page" : undefined}
            >
              {positionNounPlural(session)}
            </Link>
          )}
          {entry.subPages.map((sub) => (
            <Link
              key={sub.segment}
              href={sub.href}
              className={sub === litSubPage ? TAB_ACTIVE : TAB_IDLE}
              aria-current={sub === litSubPage ? "page" : undefined}
            >
              {sub.tab}
            </Link>
          ))}
          {/* The (i) sits slightly apart from the tabs: it is the door to the
              rail's ABOUT prose, not a third data surface. Same glyph as the
              disclosure triggers, sized to the tab letters. */}
          <Link
            href={entry.infoHref}
            aria-label="About this explorer"
            aria-current={venue === "info" ? "page" : undefined}
            className={`ml-1 ${venue === "info" ? TAB_ACTIVE : TAB_IDLE}`}
          >
            <svg className="mb-px inline-block h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d={INFO_PATH} clipRule="evenodd" />
            </svg>
          </Link>
        </nav>
      </div>
    </div>
  );
}
