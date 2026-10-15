// Maple's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts the
// shared units read. For now the event page's (ui-jobs 236): the pool and the
// lender, then the shared rows.

import type { EventPageFact, EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import { isMapleEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { eventTitleWords, makeEventTitle, type EventTitle } from "@/lib/shared/event-title";
import { mapleRowLabel } from "@/lib/maple/event-label";

const WORDS = {
  paragraph: "This page is one transaction from this lender's history in the Maple pools.",
  timeline_link: "See the whole history in the timeline.",
  timeline_hint: "Open this event in the lender's timeline",
  pool: "Pool",
  account: "Account",
  copy_account: "Copy the lender's address",
  description: (account: string, day: string) => `One transaction from the Maple lender ${account}, on ${day}.`,
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The pools overview, which lists each pool by its share token. */
const POOLS_HREF = "/ethereum/maple/pools";

export interface MapleEventPageInput extends EventPageSlot {
  wallet: string;
}

/** The event's title: T1's word and the legs its head states (the asset, then
 *  the pool shares a deposit or withdrawal minted or burned; a request's or a
 *  transfer's shares). Also read on the server. */
export function mapleEventTitle(event: BaseActivityEvent): EventTitle {
  const kind = mapleRowLabel(event);
  if (!isMapleEvent(event)) return makeEventTitle(event, kind, []);
  const ctx = event.context.data;
  const shares = (value: number) => ({ value, symbol: ctx.poolSymbol });
  switch (ctx.eventType) {
    case "deposit":
    case "withdraw":
      return makeEventTitle(event, kind, [
        { value: Number(ctx.assetsDelta ?? "0") || 0, symbol: ctx.assetSymbol },
        shares(Number(ctx.sharesDelta ?? "0") || 0),
      ]);
    case "request_fill":
      return makeEventTitle(event, kind, [{ value: Number(ctx.assetsDelta ?? "0") || 0, symbol: ctx.assetSymbol }]);
    case "request":
    case "request_decrease":
    case "request_cancel":
      return makeEventTitle(event, kind, [shares(Number(ctx.requestShares ?? "0") || 0)]);
    case "transfer_in":
    case "transfer_out":
      return makeEventTitle(event, kind, [shares(Number(ctx.sharesDelta ?? "0") || 0)]);
    default:
      return makeEventTitle(event, kind, []);
  }
}

/** The event's heading: the title in words. Also read on the server. */
export function mapleEventHeading(event: BaseActivityEvent): string {
  return eventTitleWords(mapleEventTitle(event));
}

/** The page's metadata description, also read on the server. */
export function mapleEventPageDescription(wallet: string, timestamp: number): string {
  return `${WORDS.description(short(wallet), formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export const mapleExplorer: ExplorerAdapter<MapleEventPageInput> = {
  eventPage: ({ wallet, event, ...slot }) => {
    const pool: EventPageFact[] = isMapleEvent(event)
      ? [{ key: "pool", label: WORDS.pool, value: event.context.data.poolSymbol, href: POOLS_HREF }]
      : [];
    return {
      heading: mapleEventHeading(event),
      title: mapleEventTitle(event),
      words: {
        paragraph: WORDS.paragraph,
        timelineLink: WORDS.timeline_link,
        timelineHint: WORDS.timeline_hint,
      },
      facts: [
        ...pool,
        {
          key: "account",
          label: WORDS.account,
          value: wallet,
          mono: true,
          copy: WORDS.copy_account,
          href: listingHrefForWallet("maple", wallet) ?? undefined,
        },
      ],
      ...slot,
      blockNumber: event.blockNumber,
      txHash: event.txHash,
      eventId: event.id,
      description: mapleEventPageDescription(wallet, event.timestamp),
    };
  },
  eventMarkdown: { missing: "no Markdown route serves this family's events yet (ui-jobs 236)" },
};
