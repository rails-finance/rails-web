// Polaris's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts the
// shared units read. For now the event page's (ui-jobs 236): the market, the
// CDP and its holder, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { POLARIS_MARKET_CONFIG, type PolarisMarket } from "@/lib/polaris/asset-catalog";

const WORDS = {
  paragraph: "This page is one transaction from this CDP's history.",
  timeline_link: "See the whole history in the timeline.",
  timeline_hint: "Open this event in the CDP's timeline",
  market: "Market",
  cdp: "CDP",
  copy_cdp: "Copy the CDP's number",
  holder: "Holder",
  last_holder: "Last holder",
  description: (stable: string, cdpId: string, day: string) =>
    `One transaction from the Polaris ${stable} CDP #${cdpId}, on ${day}.`,
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

/** The event's heading: T1's word. Also read on the server. */
export function polarisEventHeading(event: BaseActivityEvent): string {
  return event.actionLabel;
}

/** The page's metadata description, also read on the server. */
export function polarisEventPageDescription(market: PolarisMarket, cdpId: string, timestamp: number): string {
  const stable = POLARIS_MARKET_CONFIG[market].stable.symbol;
  return `${WORDS.description(stable, cdpId, formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export const polarisExplorer: ExplorerAdapter<PolarisEventPageInput> = {
  eventPage: ({ market, cdpId, holder, closed, event, ...slot }) => ({
    heading: polarisEventHeading(event),
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
