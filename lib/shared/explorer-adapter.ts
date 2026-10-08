// The explorer kit's per-family contracts (rails-ops TO-DO-ui-jobs 307): a
// shared unit reads one typed contract, and a family supplies the data and
// the words, never which parts exist. `ExplorerAdapter` collects a family's
// contracts, one field per unit; a new unit is a new required field, so the
// build fails until every family fills it. Each family's adapter is
// `lib/<family>/explorer.ts`. The event page (ui-jobs 236) is the first unit.

import type { ReactNode } from "react";
import type { BaseActivityEvent } from "@/lib/shared/types/activity";

/** One row of the event page's facts table: what the card does not show. */
export interface EventPageFact {
  /** The row's name in the DOM (`data-fact`). */
  key: string;
  label: string;
  /** The text the cell shows. */
  value: string;
  /** The full value, for the cell's tooltip and the copy button. */
  full?: string;
  /** Monospace, truncated to the column (an id or an address). */
  mono?: boolean;
  /** The copy button's words; unset, the row has no button. */
  copy?: string;
  /** Where the value links (the holder's listing). */
  href?: string;
}

/** The event page's shell (`EventPageContext`): the side column's contract
 *  and the page's h1. The card draws the column in page mode where the shell
 *  provides it. */
export interface EventPageShell {
  contract: EventPageContract;
  title: ReactNode;
}

/** What the shell knows of the page's event (`ChainTruthTimeline`'s pinned
 *  route): the event, its place and its neighbours' links. A family's
 *  `eventPage` input extends it with the family's data. */
export interface EventPageSlot {
  event: BaseActivityEvent;
  /** 1-based, the timeline's number. */
  n: number;
  total: number;
  previousHref: string | null;
  nextHref: string | null;
  timelineHref: string;
}

/** What the event page's side column draws (`components/shared/event-page-aside.tsx`). */
export interface EventPageContract {
  /** The event's heading in words: the browser title's last words, and the
   *  page's h1 where the family's header has no title form. */
  heading: string;
  /** The family's words: the paragraph, the timeline link after it, and the
   *  View in timeline control's tooltip. */
  words: { paragraph: string; timelineLink: string; timelineHint: string };
  /** The family's rows (the market, the account, its holder), above the
   *  shared rows (event n of N, block, transaction). */
  facts: EventPageFact[];
  /** 1-based, the timeline's number. */
  n: number;
  total: number;
  blockNumber: number;
  txHash: string;
  /** The card's receipts scope, which Show provenance arms (ui-jobs 284). */
  eventId: string;
  /** Null at the first or last event. */
  previousHref: string | null;
  nextHref: string | null;
  /** The position page's `?at=` landing. */
  timelineHref: string;
  /** The page's metadata description. */
  description: string;
}

/** A family's contracts, one per shared unit. `I` is what the family's
 *  event page loads. */
export interface ExplorerAdapter<I> {
  eventPage: (input: I) => EventPageContract;
  /** Copy for LLM and View as Markdown on the event page: "card" where the
   *  family's card provides the build (`EventMarkdownContext`) and the
   *  event's `.md` route serves it; else why the family has none. */
  eventMarkdown: "card" | { missing: string };
}
