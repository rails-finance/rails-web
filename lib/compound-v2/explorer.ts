// Compound V2's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts
// the shared units read. For now the event page's (ui-jobs 236): the event's
// market and the account, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import { isCompoundV2Event, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { eventTitleWords, makeEventTitle, type EventTitle } from "@/lib/shared/event-title";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
import { externalActor } from "@/lib/shared/external-actor";
import { compoundV2EventProse, type CompoundV2Event } from "@/lib/compound-v2/event-prose";

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

/** The event's title: T1's word and the amounts its head states (a
 *  liquidation's debt covered and cTokens seized, else what the row moved).
 *  Also read on the server. */
export function compoundV2EventTitle(event: BaseActivityEvent): EventTitle {
  if (!isCompoundV2Event(event)) return makeEventTitle(event, event.actionLabel, []);
  const ctx = event.context.data;
  const cSym = COMPOUND_V2_MARKET_BY_KEY[ctx.market]?.cSymbol ?? `c${ctx.marketSymbol}`;
  const kind = event.actionLabel;
  if (ctx.eventType === "liquidation") {
    const collM = ctx.collateralMarket ? COMPOUND_V2_MARKET_BY_KEY[ctx.collateralMarket] : undefined;
    return makeEventTitle(event, kind, [
      { value: Number(ctx.assetsDelta ?? "0") || 0, symbol: ctx.marketSymbol },
      {
        value: Number(ctx.seizeTokens ?? "0") || 0,
        symbol: ctx.collateralSymbol ? (collM?.cSymbol ?? `c${ctx.collateralSymbol}`) : "",
      },
    ]);
  }
  if (ctx.eventType === "seize_out" || ctx.eventType === "seize_burn")
    return makeEventTitle(event, kind, [{ value: Number(ctx.cTokensDelta ?? "0") || 0, symbol: cSym }]);
  const cTokenLane =
    ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out" || ctx.eventType === "seize_in";
  return makeEventTitle(event, kind, [
    {
      value: Number((cTokenLane ? ctx.cTokensDelta : ctx.assetsDelta) ?? "0") || 0,
      symbol: cTokenLane ? cSym : ctx.marketSymbol,
    },
  ]);
}

/** The event's heading: the title in words. Also read on the server. */
export function compoundV2EventHeading(event: BaseActivityEvent): string {
  return eventTitleWords(compoundV2EventTitle(event));
}

/** The browser title's last words (rails-ops decision 0045, "Ruled since"):
 *  the Explanation's first sentence, which the card's teaser and the page's
 *  h1 state, else the heading. `events`: the timeline's events, for the
 *  same-transaction seam a seizure reads. Read on the server. */
export function compoundV2EventTabWords(event: BaseActivityEvent, events: readonly BaseActivityEvent[]): string {
  if (!isCompoundV2Event(event)) return compoundV2EventHeading(event);
  const ctx = event.context.data;
  const self = event as CompoundV2Event;
  const siblings = events.filter((e): e is CompoundV2Event => e.txHash === event.txHash && isCompoundV2Event(e));
  const seized = ctx.eventType === "liquidation" || ctx.eventType.startsWith("seize_");
  const by = seized ? null : externalActor({ txFrom: ctx.txFrom, poolCaller: ctx.caller }, event.wallet);
  const { L4 } = compoundV2EventProse({
    ctx,
    siblings: siblings.length > 0 ? siblings : [self],
    self,
    externalBy: by ?? undefined,
    blockNumber: event.blockNumber,
  });
  return L4[0]?.text ?? compoundV2EventHeading(event);
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
      title: compoundV2EventTitle(event),
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
