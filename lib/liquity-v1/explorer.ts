// Liquity V1's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts
// the shared units read. For now the event page's (ui-jobs 236): the market
// and the borrower's account, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import { isLiquityV1Event, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { eventTitleWords, makeEventTitle, type EventTitle, type EventTitleAmount } from "@/lib/shared/event-title";
import { COLL_VERB, DEBT_VERB } from "@/lib/shared/liquity-fork-ops";
import { COLLATERAL_SYMBOL, DEBT_SYMBOL, LIQUITY_V1_ADDRESSES } from "@/lib/liquity-v1/asset-catalog";
import {
  LIQUIDATION_COLL_VERB,
  LIQUIDATION_DEBT_VERB,
  LIQUITY_V1_RESERVE,
  redemptionSplit,
} from "@/lib/liquity-v1/event-figures";

const WORDS = {
  paragraph: "This page is one transaction from this wallet's Trove history.",
  timeline_link: "See the whole history in the timeline.",
  timeline_hint: "Open this event in the Trove's timeline",
  market: "Market",
  market_value: "ETH / LUSD",
  account: "Borrower",
  copy_account: "Copy the borrower's address",
  description: (account: string, day: string) => `One transaction from the Liquity V1 Trove of ${account}, on ${day}.`,
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export interface LiquityV1EventPageInput extends EventPageSlot {
  wallet: string;
}

/** The event's title: T1's word and the amounts its head states (an open's and
 *  adjust's verbs on each axis, a redemption's cleared LUSD and reduced ETH, a
 *  liquidation's seized and cleared, a close's repaid debt). Also read on the
 *  server. */
export function liquityV1EventTitle(event: BaseActivityEvent): EventTitle {
  if (!isLiquityV1Event(event)) return makeEventTitle(event, event.actionLabel, []);
  const ctx = event.context.data;
  const isRedemption = ctx.eventType === "redemption";
  const isOpen = ctx.eventType === "openTrove";
  const isAdjust = ctx.eventType === "adjustTrove";
  const isLiq = ctx.eventType === "liquidation";
  const isClose = ctx.eventType === "closeTrove";
  const perAxis = isOpen || isAdjust;
  const coll = Number(ctx.collDelta) || 0;
  const debt = Number(ctx.debtDelta) || 0;
  const split = redemptionSplit(ctx);

  const collAmount: EventTitleAmount | null =
    coll === 0
      ? null
      : split?.full
        ? { value: split.ethToRedeemer, symbol: COLLATERAL_SYMBOL, label: "Reduced" }
        : {
            value: coll,
            symbol: COLLATERAL_SYMBOL,
            label: isRedemption
              ? "Reduced"
              : isLiq
                ? LIQUIDATION_COLL_VERB
                : perAxis
                  ? coll > 0
                    ? COLL_VERB.add
                    : COLL_VERB.withdraw
                  : undefined,
          };
  let debtAmount: EventTitleAmount | null = null;
  if (debt !== 0 && isClose)
    debtAmount = {
      value: Math.max(0, Math.abs(debt) - LIQUITY_V1_RESERVE),
      symbol: DEBT_SYMBOL,
      address: LIQUITY_V1_ADDRESSES.LUSD,
    };
  else if (debt > 0 && perAxis && ctx.lusdReceived != null && ctx.borrowingFee != null)
    debtAmount = {
      value: Number(ctx.lusdReceived),
      symbol: DEBT_SYMBOL,
      address: LIQUITY_V1_ADDRESSES.LUSD,
      label: DEBT_VERB.borrow,
    };
  else if (debt !== 0)
    debtAmount = {
      value: debt,
      symbol: DEBT_SYMBOL,
      address: LIQUITY_V1_ADDRESSES.LUSD,
      label: isRedemption
        ? "Cleared"
        : isLiq
          ? LIQUIDATION_DEBT_VERB
          : perAxis
            ? debt > 0
              ? DEBT_VERB.borrow
              : DEBT_VERB.repay
            : undefined,
    };
  const title = makeEventTitle(
    event,
    isOpen ? "Open" : event.actionLabel,
    isRedemption ? [debtAmount, collAmount] : [collAmount, debtAmount],
  );
  return isAdjust && title.amounts.length > 0 ? { ...title, kind: "" } : title;
}

/** The event's heading: the title in words. Also read on the server. */
export function liquityV1EventHeading(event: BaseActivityEvent): string {
  return eventTitleWords(liquityV1EventTitle(event));
}

/** The page's metadata description, also read on the server. */
export function liquityV1EventPageDescription(wallet: string, timestamp: number): string {
  return `${WORDS.description(short(wallet), formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export const liquityV1Explorer: ExplorerAdapter<LiquityV1EventPageInput> = {
  eventPage: ({ wallet, event, ...slot }) => ({
    heading: liquityV1EventHeading(event),
    title: liquityV1EventTitle(event),
    words: {
      paragraph: WORDS.paragraph,
      timelineLink: WORDS.timeline_link,
      timelineHint: WORDS.timeline_hint,
    },
    facts: [
      { key: "market", label: WORDS.market, value: WORDS.market_value },
      {
        key: "account",
        label: WORDS.account,
        value: wallet,
        mono: true,
        copy: WORDS.copy_account,
        href: listingHrefForWallet("liquity-v1", wallet) ?? undefined,
      },
    ],
    ...slot,
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventId: event.id,
    description: liquityV1EventPageDescription(wallet, event.timestamp),
  }),
  eventMarkdown: { missing: "no Markdown route serves this family's events yet (ui-jobs 236)" },
};
