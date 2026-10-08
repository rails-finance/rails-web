// The explorer kit's per-family contracts (rails-ops TO-DO-ui-jobs 307): a
// shared unit reads one typed contract, and a family supplies the data and
// the words, never which parts exist. `ExplorerAdapter` collects a family's
// contracts, one field per unit; a new unit is a new required field, so the
// build fails until every family fills it. Each family's adapter is
// `lib/<family>/explorer.ts`. The event page (ui-jobs 236) is the first unit.

import type { ReactNode } from "react";

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

/** Copy for LLM and View as Markdown: the event's Markdown, built on the
 *  page, and served at the event page's URL with `.md`. A family with no
 *  Markdown route says why. */
export type EventPageMarkdown = { build: () => string } | { missing: string };

/** The event card's page mode (`EventCard`'s `page`): the side column's
 *  contract, the page's h1 (the family's header in its title form), and the
 *  Markdown, which the family's card builds. */
export interface EventPageMode {
  contract: EventPageContract;
  title: ReactNode;
  markdown: EventPageMarkdown;
}

/** What the event page's side column draws (`components/shared/event-page-aside.tsx`). */
export interface EventPageContract {
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
}
