// LlamaLend's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts the
// shared units read. For now the event page's (ui-jobs 236): the market and the
// account, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import { isLlamalendEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { eventTitleWords, makeEventTitle, type EventTitle } from "@/lib/shared/event-title";
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

/** The event's title: T1's word and the amounts its head states. A
 *  liquidation states the collateral and debt it moved; any other row the
 *  verbs on each axis, led by Open on a loan's first row and Close on a repay
 *  that clears the debt. `mark` is the page's read of which row opens or closes
 *  a loan; where the server has none, the row's own flags decide. Also read on
 *  the server. */
export function llamalendEventTitle(event: BaseActivityEvent, mark?: LlamalendLoanMark | null): EventTitle {
  if (!isLlamalendEvent(event)) return makeEventTitle(event, event.actionLabel, []);
  const ctx = event.context.data;
  const coll = Number(ctx.collateralDelta ?? "0") || 0;
  const debt = Number(ctx.debtDelta ?? "0") || 0;
  if (ctx.eventType === "liquidation")
    return makeEventTitle(event, event.actionLabel, [
      { value: coll, symbol: ctx.collateralSymbol },
      { value: debt, symbol: ctx.borrowedSymbol },
    ]);
  const opens = mark ? mark.opens : !!ctx.isOpen;
  const closes = mark
    ? mark.closes
    : ctx.eventType === "repay" && ctx.debtAfter != null && Number(ctx.debtAfter) <= 1e-12;
  const title = makeEventTitle(event, opens ? "Open" : closes ? "Close" : "", [
    {
      value: coll,
      symbol: ctx.collateralSymbol,
      label: coll > 0 ? (opens ? "Deposit" : "Add") : "Withdraw",
    },
    { value: debt, symbol: ctx.borrowedSymbol, label: debt > 0 ? "Borrow" : "Repay" },
  ]);
  return title.kind || title.amounts.length > 0 ? title : { ...title, kind: event.actionLabel };
}

/** The event's heading: the title in words. Also read on the server. */
export function llamalendEventHeading(event: BaseActivityEvent, mark?: LlamalendLoanMark | null): string {
  return eventTitleWords(llamalendEventTitle(event, mark));
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
