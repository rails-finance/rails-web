"use client";

// SubPageHeader — the one header for every explorer's protocol-level
// sub-page (branch roster, market roster, system state, hub comparison, loan
// book). Before this, each of the sub-pages hand-rolled its own crumb + h1
// (and, on three of them, "/ Base /" spelled into the crumb text) — this
// component is the single place that markup lives, driven by the roster
// entry (`lib/shared/protocols.ts`) rather than restated per page.
//
// The context row is the shared `RailHeader` — identity on the left, the
// rail's sub-nav on the right with this sub-page's tab active. The chain is
// the mark inside the identity line, never a crumb word, and the sub-page's
// own name is said by the lit tab rather than a "/ …" tail.
//
// The header carries NO explanatory prose: protocol explanation lives on the
// rail's /info page (the (i) in the sub-nav), how-to-read-a-figure lives in
// the view's own receipts and tooltips, and deep mechanics in the "?"
// LearnMore modal where a page has one. The header is title + stamp only.

import type { ReactNode } from "react";
import { RailHeader } from "@/components/shared/rail-header";
import { LearnMore, type LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { ProtocolEntry } from "@/lib/shared/protocols";

export interface SubPageHeaderProps {
  /** The roster entry this sub-page belongs to — supplies the identity line
   *  and the rail sub-nav. Look it up with `protocolForHref`/
   *  `protocolForSession` against the page's own basePath rather than
   *  hand-writing it. */
  protocol: ProtocolEntry;
  /** The h1. The identity line above it already names the protocol and its
   *  chain, so the title should say neither ("Markets", not "Compound V3
   *  Markets on Base"). */
  title: string;
  /** Renders the "?" LearnMore button inline beside the h1, where a page has
   *  one — matches the placement the pages that already carry it use today. */
  learnMore?: LearnMoreContent;
  /** The "as of block …" chain-snapshot line — the page's one line under the
   *  h1. */
  stamp?: ReactNode;
}

export function SubPageHeader({ protocol, title, learnMore, stamp }: SubPageHeaderProps) {
  return (
    <header className="mb-6">
      {/* The identity line owns the chain mark — none beside the h1, or a
          Base sub-page would say the chain twice. The rail header sits
          OUTSIDE the measured page-header section: the loading boundary
          draws the real header above its blocks, so the reserved height
          must not count it twice. */}
      <div className="mb-2.5">
        <RailHeader session={protocol.session} venue="subPage" />
      </div>
      <div data-skel-section="page-header">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          {learnMore && <LearnMore content={learnMore} inline />}
        </div>
        {stamp}
      </div>
    </header>
  );
}
