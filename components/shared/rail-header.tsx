"use client";

// RailHeader — the one header row on every explorer surface: the protocol's
// identity (ProtocolIdentity) on the left, with the recency stamp reading on
// from it (the chain head is rail-level context — the block the page reads
// against — not row furniture), and the rail's sub-nav on the right. The
// sub-nav is live tab links — the position listing (named by the protocol's
// own noun: TROVES, VAULTS, ACCOUNTS; absent on an explorer that has none),
// then each of the roster's sub-pages in order (MARKETS, BRANCHES, SYSTEM, …)
// — then, slightly apart, the (i) link to
// the explorer's info page. On a position view no tab is lit: a position has
// no stable place in the sub-nav (it is reached through the listing), and the
// page below the row already says what is being looked at. On a sub-page the
// lit tab is the one whose route holds the pathname, so a sub-page's nested
// routes (Morpho's markets/[loanToken]) light their parent.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { positionNounPlural, protocolForSession, subPageForPathname } from "@/lib/shared/protocols";
import { ProtocolIdentity } from "@/components/shared/protocol-identity";
import { RecencyStamp } from "@/components/shared/recency-stamp";
import { INFO_PATH } from "@/components/shared/info-disclosure";

/** Which surface of the rail is being looked at — decides the lit slot. */
export type RailVenue = "listing" | "subPage" | "position" | "info";

// Same 11px small-caps register as ProtocolIdentity. Every slot carries the
// bottom border so the active underline never shifts the baseline; the idle
// border is just transparent.
//
// EXPORTED, so the Vaults section's own rail (components/vaults/vaults-rail-header.tsx)
// wears the same three classes rather than a copy of them: a second rail that
// drifted a letter-spacing would read as a second product.
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
  /** Render the shared RecencyStamp after the identity (decision 0006's
   *  freshness signal). On for listings and chain-overlay position views; off
   *  where the page reads no chain head (the info page, PWN's detail) —
   *  rendering it there would assert a freshness the page doesn't have. */
  stamp?: boolean;
}) {
  const pathname = usePathname();
  const entry = protocolForSession(session);
  if (!entry) return null;
  const litSubPage = venue === "subPage" ? subPageForPathname(entry, pathname) : undefined;
  return (
    // Below sm the sub-nav ALWAYS takes the row under the identity. Left to
    // wrap on its own it landed in two places — beside the name on the markets
    // and info pages, under it on the listing, whose recency stamp is what
    // pushed it down — so the tabs jumped as the reader moved between the
    // three (Miles, 2026-09-02). A tab row that stays put is what makes the
    // rail feel like one surface. From sm up the row fits and the sub-nav
    // sits right, as before; flex-wrap still catches a long name (FRANKENCOIN)
    // plus the stamp there.
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex items-center gap-3">
        <ProtocolIdentity session={session} />
        {stamp && <RecencyStamp />}
      </div>
      <nav aria-label="Explorer sections" className="flex items-center gap-4 basis-full sm:basis-auto">
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
  );
}
