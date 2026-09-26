"use client";

// RailHeader — the two-row header on every explorer surface. The protocol's
// identity (ProtocolIdentity) takes the left of the first row and the chain
// chooser the right end of it (rails-ops TO-DO-ui-jobs 68): the two together
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
// A POSITION VIEW DRAWS NO SECOND ROW, ONLY THE IDENTITY AND THE CHOOSER
// (rails-ops TO-DO-ui-jobs 48, 68). The tabs and the (i) belong to the
// protocol, not to one account's position, and nothing in them was ever lit
// here; the identity keeps its link, which is the one door back to the rail.
// The recency stamp left with them — a position states its chain head in the
// row under this one. The identity now takes the title scale like every other
// venue. The earlier justification for holding it at small caps here (the
// subject of a position view is the account named in its h1) does not hold:
// a position view has no h1. DetailBackRow and DetailTopRow, which mount this
// row, add none. That left the position page with no large identity of any
// kind, its biggest type being the collateral figure. Giving a position view
// a heading that names its account is a separate gap, logged as an item. The
// chooser stays, because it is the only one an app page has above `md`.
//
// THE CHOOSER IS `md` AND UP ONLY. Below `md` there is no brand rail and
// HeaderBar keeps the chain trigger and the theme toggle, so drawing it here
// too would be a second copy of one control.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { positionNounPlural, protocolForSession, subPageForPathname } from "@/lib/shared/protocols";
import { ProtocolIdentity } from "@/components/shared/protocol-identity";
import { RecencyStamp } from "@/components/shared/recency-stamp";
import { INFO_PATH } from "@/components/shared/info-disclosure";
import { ChainSwitcher } from "@/components/nav/chain-switcher";

/** The chain chooser as it sits on the title row: hidden below `md`, where
 *  HeaderBar still carries it. `-mr-2.5` pulls the trigger's own padding back
 *  so its glyph lines up with the content's right edge rather than the
 *  padding box. */
function TitleRowChooser() {
  return (
    <div className="-mr-2.5 hidden shrink-0 md:block">
      <ChainSwitcher variant="chain" />
    </div>
  );
}

/** Which surface of the rail is being looked at — decides the lit slot. */
export type RailVenue = "listing" | "subPage" | "position" | "info";

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
export const TAB_IDLE = `${TAB_BASE} border-transparent text-rb-500 transition-colors hover:text-blue-500`;

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
   *  sat. Ignored at the `position` venue, where the stamp sits in the row
   *  below (DetailTopRow). */
  stamp?: boolean;
}) {
  const pathname = usePathname();
  const entry = protocolForSession(session);
  if (!entry) return null;
  const litSubPage = venue === "subPage" ? subPageForPathname(entry, pathname) : undefined;
  if (venue === "position") {
    return (
      <div className="flex min-h-9 items-center justify-between gap-3">
        <div className="min-w-0">
          <ProtocolIdentity session={session} scale="title" />
        </div>
        <TitleRowChooser />
      </div>
    );
  }
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
          ProtocolIdentity, so every explorer wears the same one. The chooser
          takes the far end of the row, and `min-w-0` lets a long name shrink
          rather than push it off. */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <ProtocolIdentity session={session} scale="title" />
        </div>
        <TitleRowChooser />
      </div>
      {/* Right-aligned even with the stamp off (the info page): a lone nav
          flush right still reads as one deliberate row, not a stamp-shaped
          gap. With the stamp on, the two ends split it as before. */}
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 ${stamp ? "justify-between" : "justify-end"}`}>
        {stamp && <RecencyStamp />}
        <nav aria-label="Explorer sections" className="flex flex-wrap items-center gap-4">
          {/* The position listing, where the explorer has one. A vault-native
              explorer has none — a share in a vault is not a position in the
              roster's sense (rails-ops decision 0027 call 2) — so its first tab
              is its first sub-page and its own route opens on that sub-page. */}
          {entry.positionListing !== false && (
            <Link
              href={entry.href}
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
