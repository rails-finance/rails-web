// Frankencoin's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts
// the shared units read. For now the event page's (ui-jobs 236): the
// collateral, the position contract and its owner, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import { isFrankencoinEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { eventTitleWords, makeEventTitle, type EventTitle, type EventTitleAmount } from "@/lib/shared/event-title";

const WORDS = {
  paragraph: "This page is one transaction from this position's history.",
  timeline_link: "See the whole history in the timeline.",
  timeline_hint: "Open this event in the position's timeline",
  market: "Collateral",
  position: "Position",
  copy_position: "Copy the position's address",
  owner: "Owner",
  description: (symbol: string, position: string, day: string) =>
    `One transaction from the Frankencoin ${symbol} position ${position}, on ${day}.`,
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export interface FrankencoinEventPageInput extends EventPageSlot {
  position: string;
  collateralSymbol: string;
  /** Null where the read has no owner. */
  owner: string | null;
}

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

/** The event's title: T1's word and the amounts its head states, as the head
 *  words them (an open and an adjust state only the verbs on their amounts, a
 *  challenge or an auction its own labels). Also read on the server. */
export function frankencoinEventTitle(event: BaseActivityEvent): EventTitle {
  if (!isFrankencoinEvent(event)) return makeEventTitle(event, event.actionLabel, []);
  const ctx = event.context.data;
  const sym = ctx.collateralSymbol;
  const zchf = (value: number, label?: string): EventTitleAmount => ({ value, symbol: "ZCHF", label });
  const coll = (value: number, label?: string): EventTitleAmount => ({ value, symbol: sym, label });
  const dMint = ctx.minted != null && ctx.mintedBefore != null ? num(ctx.minted) - num(ctx.mintedBefore) : null;
  const dColl =
    !ctx.collateralUnderstated && ctx.collateral != null && ctx.collateralBefore != null
      ? num(ctx.collateral) - num(ctx.collateralBefore)
      : null;
  const collVerb = (d: number) => (d > 0 ? "Add" : "Withdraw");
  const debtVerb = (d: number) => (d > 0 ? "Mint" : "Repay");
  /** The verbs on the amounts stand in for the word. */
  const verbs = (amounts: EventTitleAmount[]): EventTitle => {
    const t = makeEventTitle(event, event.actionLabel, amounts);
    return t.amounts.length > 0 ? { ...t, kind: "" } : t;
  };
  switch (ctx.eventType) {
    case "open":
    case "clone":
      return makeEventTitle(
        event,
        "Open",
        [
          num(ctx.collateral) > 0 ? coll(num(ctx.collateral), collVerb(1)) : null,
          num(ctx.minted) > 0 ? zchf(num(ctx.minted), debtVerb(1)) : null,
        ].filter((a): a is EventTitleAmount => a != null),
      );
    case "mint":
    case "repay":
      return verbs(dMint != null && dMint !== 0 ? [zchf(dMint, debtVerb(dMint))] : []);
    case "add_collateral":
    case "withdraw_collateral":
      return verbs(dColl != null && dColl !== 0 ? [coll(dColl, collVerb(dColl))] : []);
    case "adjust":
      return verbs([
        ...(dColl != null && dColl !== 0 ? [coll(dColl, collVerb(dColl))] : []),
        ...(dMint != null && dMint !== 0 ? [zchf(dMint, debtVerb(dMint))] : []),
      ]);
    case "close":
      return makeEventTitle(event, event.actionLabel, [
        dColl != null ? coll(dColl) : null,
        dMint != null ? zchf(dMint) : null,
      ]);
    case "auction_settlement":
      return makeEventTitle(event, event.actionLabel, [
        dColl != null ? coll(dColl, "Collateral") : null,
        dMint != null ? zchf(dMint, "Debt cleared") : null,
      ]);
    case "challenge_started":
      return makeEventTitle(event, event.actionLabel, [coll(num(ctx.challengeSize), "Challenged")]);
    case "challenge_averted":
      return makeEventTitle(event, event.actionLabel, [coll(num(ctx.challengeSize), "Averted")]);
    case "challenge_succeeded":
      return makeEventTitle(event, event.actionLabel, [
        coll(num(ctx.acquiredCollateral), "Sold"),
        zchf(num(ctx.bid), "Bid"),
      ]);
    case "forced_sale":
      return makeEventTitle(event, event.actionLabel, [coll(num(ctx.forcedSaleAmount), "Sold")]);
    default:
      return makeEventTitle(event, event.actionLabel, []);
  }
}

/** The event's heading: the title in words. Also read on the server. */
export function frankencoinEventHeading(event: BaseActivityEvent): string {
  return eventTitleWords(frankencoinEventTitle(event));
}

/** The page's metadata description, also read on the server. */
export function frankencoinEventPageDescription(collateralSymbol: string, position: string, timestamp: number): string {
  return `${WORDS.description(collateralSymbol, short(position), formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export const frankencoinExplorer: ExplorerAdapter<FrankencoinEventPageInput> = {
  eventPage: ({ position, collateralSymbol, owner, event, ...slot }) => ({
    heading: frankencoinEventHeading(event),
    title: frankencoinEventTitle(event),
    words: {
      paragraph: WORDS.paragraph,
      timelineLink: WORDS.timeline_link,
      timelineHint: WORDS.timeline_hint,
    },
    facts: [
      { key: "market", label: WORDS.market, value: collateralSymbol },
      { key: "position", label: WORDS.position, value: position, mono: true, copy: WORDS.copy_position },
      ...(owner
        ? [
            {
              key: "owner",
              label: WORDS.owner,
              value: short(owner),
              full: owner,
              href: listingHrefForWallet("frankencoin", owner) ?? undefined,
            },
          ]
        : []),
    ],
    ...slot,
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventId: event.id,
    description: frankencoinEventPageDescription(collateralSymbol, position, event.timestamp),
  }),
  eventMarkdown: { missing: "no Markdown route serves this family's events yet (ui-jobs 236)" },
};
