// Polaris's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts the
// shared units read. For now the event page's (ui-jobs 236): the market, the
// CDP and its holder, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import { isPolarisEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { makeEventTitle, type EventTitle } from "@/lib/shared/event-title";
import { polarisT1Caption, polarisT1Words } from "@/lib/polaris/event-prose";
import { PETH, POLARIS_MARKET_CONFIG, type PolarisMarket } from "@/lib/polaris/asset-catalog";
import { polarisSurplusLabel } from "@/lib/polaris/surplus-claim";

const WORDS = {
  paragraph: "This page is one transaction from this position's history.",
  timeline_link: "See the whole history in the timeline.",
  timeline_hint: "Open this event in the position's timeline",
  market: "Market",
  cdp: "Position",
  copy_cdp: "Copy the position's number",
  holder: "Holder",
  last_holder: "Last holder",
  description: (stable: string, cdpId: string, day: string) =>
    `One transaction from the Polaris ${stable} position #${cdpId}, on ${day}.`,
};

const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export interface PolarisEventPageInput extends EventPageSlot {
  market: PolarisMarket;
  cdpId: string;
  /** The NFT's holder now, or the last holder once the CDP is closed; null
   *  while neither read has answered. */
  holder: string | null;
  closed: boolean;
}

/** The event's title: T1's word and the amounts its head states (an
 *  open's or adjust's collateral and debt with their verbs, a close's two
 *  sides, a liquidation's seized, cleared and claimable). Also read on the
 *  server. */
export function polarisEventTitle(event: BaseActivityEvent): EventTitle {
  if (!isPolarisEvent(event)) return makeEventTitle(event, event.actionLabel, []);
  const ctx = event.context.data;
  const num = (s?: string) => (Number.isFinite(Number(s ?? "0")) ? Number(s ?? "0") : 0);
  const stable = ctx.stableSymbol;
  const coll = num(ctx.collChange);
  const debt = num(ctx.debtChange);
  switch (ctx.eventType) {
    case "open":
    case "adjust": {
      const title = makeEventTitle(event, ctx.eventType === "open" ? "Open" : event.actionLabel, [
        coll !== 0
          ? { value: coll, symbol: PETH.symbol, address: PETH.address, label: coll > 0 ? "Deposit" : "Withdraw" }
          : null,
        debt !== 0
          ? { value: debt, symbol: stable, address: stableAddress(ctx.market), label: debt > 0 ? "Borrow" : "Repay" }
          : null,
      ]);
      return ctx.eventType === "adjust" && title.amounts.length > 0 ? { ...title, kind: "" } : title;
    }
    case "close":
      return makeEventTitle(event, event.actionLabel, [
        { value: coll, symbol: PETH.symbol, address: PETH.address },
        { value: debt, symbol: stable, address: stableAddress(ctx.market) },
      ]);
    case "liquidate":
      return makeEventTitle(event, event.actionLabel, [
        { value: num(ctx.collLiquidated), symbol: PETH.symbol, address: PETH.address, label: "Seized" },
        { value: num(ctx.debtLiquidated), symbol: stable, address: stableAddress(ctx.market), label: "Cleared" },
        {
          value: num(ctx.collSurplus),
          symbol: PETH.symbol,
          address: PETH.address,
          label: polarisSurplusLabel(ctx.surplus),
        },
      ]);
    default:
      return makeEventTitle(event, event.actionLabel, []);
  }
}

const stableAddress = (market: PolarisMarket) => POLARIS_MARKET_CONFIG[market].stable.address;

/** The event's heading: the timeline head's words (decision 0045), the past
 *  participle and its clause: "Liquidated · 0.3231 pETH claimable". Also read
 *  on the server, for the tab title. */
export function polarisEventHeading(event: BaseActivityEvent): string {
  return isPolarisEvent(event) ? polarisT1Caption(polarisT1Words(event.context.data)) : event.actionLabel;
}

/** The page's metadata description, also read on the server. */
export function polarisEventPageDescription(market: PolarisMarket, cdpId: string, timestamp: number): string {
  const stable = POLARIS_MARKET_CONFIG[market].stable.symbol;
  return `${WORDS.description(stable, cdpId, formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export const polarisExplorer: ExplorerAdapter<PolarisEventPageInput> = {
  eventPage: ({ market, cdpId, holder, closed, event, ...slot }) => ({
    heading: polarisEventHeading(event),
    title: polarisEventTitle(event),
    words: {
      paragraph: WORDS.paragraph,
      timelineLink: WORDS.timeline_link,
      timelineHint: WORDS.timeline_hint,
    },
    facts: [
      { key: "market", label: WORDS.market, value: `${POLARIS_MARKET_CONFIG[market].stable.symbol} market` },
      { key: "cdp", label: WORDS.cdp, value: cdpId, mono: true, copy: WORDS.copy_cdp },
      ...(holder
        ? [
            {
              key: "holder",
              label: closed ? WORDS.last_holder : WORDS.holder,
              value: shortAddress(holder),
              full: holder,
              mono: true,
              href: listingHrefForWallet("polaris", holder) ?? undefined,
            },
          ]
        : []),
    ],
    ...slot,
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventId: event.id,
    description: polarisEventPageDescription(market, cdpId, event.timestamp),
  }),
  eventMarkdown: { missing: "no Markdown route serves this family's events yet (ui-jobs 236)" },
};
