// LlamaLend's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts the
// shared units read. For now the event page's (ui-jobs 236): the market and the
// account, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import { isLlamalendEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";

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
}

/** The event's heading: T1's word. Also read on the server. */
export function llamalendEventHeading(event: BaseActivityEvent): string {
  if (isLlamalendEvent(event) && event.context.data.eventType !== "liquidation" && event.context.data.isOpen)
    return "Open";
  return event.actionLabel;
}

/** The page's metadata description, also read on the server. */
export function llamalendEventPageDescription(event: BaseActivityEvent, user: string): string {
  const market = marketOf(event) ?? "loan";
  return `${WORDS.description(market, short(user), formatDateLong(event.timestamp))} ${WORDS.timeline_link}`;
}

export const llamalendExplorer: ExplorerAdapter<LlamalendEventPageInput> = {
  eventPage: ({ controller, user, marketLabel, event, ...slot }) => ({
    heading: llamalendEventHeading(event),
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
