// LlamaLend's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts the
// shared units read. For now the event page's (ui-jobs 236): the market and the
// account, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import { isLlamalendEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { eventTitleWords, kindTitle, type EventTitle } from "@/lib/shared/event-title";
import { llamalendT1Caption, llamalendT1Words } from "@/lib/llamalend/head-words";
import { llamalendExplainerTeaser } from "@/lib/llamalend/explainer-clauses";
import { firstSentenceText } from "@/lib/llamalend/sentence-text";
import type { LlamalendLoanMark } from "@/lib/llamalend/event-figures";

const WORDS = {
  paragraph: "This page is one transaction from this account's loan in the market.",
  timeline_link: "See the whole history in the timeline.",
  timeline_hint: "Open this event in the account's timeline",
  market: "Market",
  copy_market: "Copy the market's controller address",
  account: "Account",
  copy_account: "Copy the account's address",
  description: (market: string, account: string, day: string) =>
    `One transaction from the LlamaLend ${market} market, account ${account}, on ${day}.`,
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The market's name as the position card states it: collateral / borrowed. */
function marketOf(event: BaseActivityEvent): string | null {
  if (!isLlamalendEvent(event)) return null;
  const { collateralSymbol, borrowedSymbol } = event.context.data;
  return collateralSymbol && borrowedSymbol ? `${collateralSymbol} / ${borrowedSymbol}` : null;
}

export interface LlamalendEventPageInput extends EventPageSlot {
  controller: string;
  user: string;
  /** The position card's market label; unset, the event's symbols name it. */
  marketLabel?: string | null;
  /** The page's read of whether this row opens or closes a loan. */
  loanMark?: LlamalendLoanMark | null;
}

/** The event's title where the card has no teaser: T1's words (rails-ops
 *  decision 0045). `mark` is the page's read of which row opens or closes a
 *  loan; where the server has none, the row's own flags decide. Also read on
 *  the server. */
export function llamalendEventTitle(event: BaseActivityEvent, mark?: LlamalendLoanMark | null): EventTitle {
  if (!isLlamalendEvent(event)) return kindTitle(event.actionLabel);
  return kindTitle(llamalendT1Caption(llamalendT1Words(event.context.data, mark)));
}

/** The event's heading, the browser title's last words: the Explanation's
 *  first sentence, as the page's h1 states it, else T1's words. Also read on
 *  the server. */
export function llamalendEventHeading(event: BaseActivityEvent, mark?: LlamalendLoanMark | null): string {
  if (!isLlamalendEvent(event)) return event.actionLabel;
  const ctx = event.context.data;
  const coords = {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    controller: ctx.controller,
    user: event.wallet,
  };
  return (
    firstSentenceText(llamalendExplainerTeaser(ctx, coords, mark)) ?? eventTitleWords(llamalendEventTitle(event, mark))
  );
}

/** The page's metadata description, also read on the server. */
export function llamalendEventPageDescription(event: BaseActivityEvent, user: string): string {
  const market = marketOf(event) ?? "loan";
  return `${WORDS.description(market, short(user), formatDateLong(event.timestamp))} ${WORDS.timeline_link}`;
}

export const llamalendExplorer: ExplorerAdapter<LlamalendEventPageInput> = {
  eventPage: ({ controller, user, marketLabel, loanMark, event, ...slot }) => ({
    heading: llamalendEventHeading(event, loanMark),
    title: llamalendEventTitle(event, loanMark),
    words: {
      paragraph: WORDS.paragraph,
      timelineLink: WORDS.timeline_link,
      timelineHint: WORDS.timeline_hint,
    },
    facts: [
      {
        key: "market",
        label: WORDS.market,
        value: marketLabel ?? marketOf(event) ?? short(controller),
        full: controller,
        copy: WORDS.copy_market,
      },
      {
        key: "account",
        label: WORDS.account,
        value: user,
        mono: true,
        copy: WORDS.copy_account,
        href: listingHrefForWallet("llamalend", user) ?? undefined,
      },
    ],
    ...slot,
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventId: event.id,
    description: llamalendEventPageDescription(event, user),
  }),
  eventMarkdown: { missing: "no Markdown route serves this family's events yet (ui-jobs 236)" },
};
