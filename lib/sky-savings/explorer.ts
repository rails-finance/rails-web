// Sky Savings' explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts
// the shared units read. For now the event page's (ui-jobs 236): the savings
// and the saver, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import { isSkySavingsEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { eventTitleWords, makeEventTitle, type EventTitle } from "@/lib/shared/event-title";
import { SUSDS, USDS } from "@/lib/sky-savings/constants";
import { skyTransition, units } from "@/lib/sky-savings/math";
import { SKY_EVENT_LABEL } from "@/lib/sky-savings/event-label";
import { skyFirstSentence } from "@/lib/sky-savings/explainer-clauses";

const WORDS = {
  paragraph: "This page is one transaction from this saver's sUSDS history.",
  timeline_link: "See the whole history in the timeline.",
  timeline_hint: "Open this event in the saver's timeline",
  savings: "Savings",
  savings_value: "sUSDS on Ethereum",
  account: "Account",
  copy_account: "Copy the saver's address",
  description: (account: string, day: string) =>
    `One sUSDS transaction of the Sky Savings account ${account}, on ${day}.`,
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export interface SkySavingsEventPageInput extends EventPageSlot {
  holder: string;
}

/** The event's title: T1's word and the amounts its head states (a deposit's
 *  or withdrawal's USDS and sUSDS, a transfer's sUSDS). Also read on the
 *  server. */
export function skySavingsEventTitle(event: BaseActivityEvent): EventTitle {
  if (!isSkySavingsEvent(event)) return makeEventTitle(event, event.actionLabel, []);
  const c = event.context.data;
  const kind = SKY_EVENT_LABEL[c.eventType];
  const t = skyTransition(c);
  const shares = { value: units(t.sharesDelta), symbol: SUSDS.symbol, address: SUSDS.address };
  if (c.eventType === "deposit" || c.eventType === "withdrawal")
    return makeEventTitle(event, kind, [{ value: units(t.usds), symbol: USDS.symbol, address: USDS.address }, shares]);
  if (c.eventType === "received" || c.eventType === "sent") return makeEventTitle(event, kind, [shares]);
  return makeEventTitle(event, kind, []);
}

/** The event's heading: the title in words. Also read on the server. */
export function skySavingsEventHeading(event: BaseActivityEvent): string {
  return eventTitleWords(skySavingsEventTitle(event));
}

/** The browser title's event words: the Explanation's first sentence, which
 *  the page's h1 states (rails-ops decision 0045, "Ruled since"), else the
 *  heading. Also read on the server. */
export function skySavingsEventPageTitle(event: BaseActivityEvent): string {
  if (!isSkySavingsEvent(event)) return skySavingsEventHeading(event);
  return skyFirstSentence(event.context.data) ?? skySavingsEventHeading(event);
}

/** The page's metadata description, also read on the server. */
export function skySavingsEventPageDescription(holder: string, timestamp: number): string {
  return `${WORDS.description(short(holder), formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export const skySavingsExplorer: ExplorerAdapter<SkySavingsEventPageInput> = {
  eventPage: ({ holder, event, ...slot }) => ({
    heading: skySavingsEventHeading(event),
    title: skySavingsEventTitle(event),
    words: {
      paragraph: WORDS.paragraph,
      timelineLink: WORDS.timeline_link,
      timelineHint: WORDS.timeline_hint,
    },
    facts: [
      { key: "savings", label: WORDS.savings, value: WORDS.savings_value },
      {
        key: "account",
        label: WORDS.account,
        value: holder,
        mono: true,
        copy: WORDS.copy_account,
        href: listingHrefForWallet("sky-savings", holder) ?? undefined,
      },
    ],
    ...slot,
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventId: event.id,
    description: skySavingsEventPageDescription(holder, event.timestamp),
  }),
  eventMarkdown: { missing: "no Markdown route serves this family's events yet (ui-jobs 236)" },
};
