// Compound V2's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts
// the shared units read. For now the event page's (ui-jobs 236): the event's
// market and the account, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import { isCompoundV2Event, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";

const WORDS = {
  paragraph: "This page is one transaction from this account's history across the Compound V2 markets.",
  timeline_link: "See the whole history in the timeline.",
  timeline_hint: "Open this event in the account's timeline",
  market: "Market",
  account: "Account",
  copy_account: "Copy the account's address",
  description: (account: string, day: string) => `One transaction from the Compound V2 account ${account}, on ${day}.`,
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export interface CompoundV2EventPageInput extends EventPageSlot {
  wallet: string;
}

/** The event's heading: T1's word. Also read on the server. */
export function compoundV2EventHeading(event: BaseActivityEvent): string {
  return event.actionLabel;
}

/** The page's metadata description, also read on the server. */
export function compoundV2EventPageDescription(wallet: string, timestamp: number): string {
  return `${WORDS.description(short(wallet), formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

/** The cToken the event moved. A liquidation spans two markets and states both
 *  in the card, so it names none. */
function marketOf(event: BaseActivityEvent): string | null {
  if (!isCompoundV2Event(event)) return null;
  const ctx = event.context.data;
  if (ctx.eventType === "liquidation") return null;
  return COMPOUND_V2_MARKET_BY_KEY[ctx.market]?.cSymbol ?? `c${ctx.marketSymbol}`;
}

export const compoundV2Explorer: ExplorerAdapter<CompoundV2EventPageInput> = {
  eventPage: ({ wallet, event, ...slot }) => {
    const market = marketOf(event);
    return {
      heading: compoundV2EventHeading(event),
      words: {
        paragraph: WORDS.paragraph,
        timelineLink: WORDS.timeline_link,
        timelineHint: WORDS.timeline_hint,
      },
      facts: [
        ...(market ? [{ key: "market", label: WORDS.market, value: market }] : []),
        {
          key: "account",
          label: WORDS.account,
          value: wallet,
          mono: true,
          copy: WORDS.copy_account,
          href: listingHrefForWallet("compound-v2", wallet) ?? undefined,
        },
      ],
      ...slot,
      blockNumber: event.blockNumber,
      txHash: event.txHash,
      eventId: event.id,
      description: compoundV2EventPageDescription(wallet, event.timestamp),
    };
  },
  eventMarkdown: { missing: "no Markdown route serves this family's events yet (ui-jobs 236)" },
};
