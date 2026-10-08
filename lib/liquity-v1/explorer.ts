// Liquity V1's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts
// the shared units read. For now the event page's (ui-jobs 236): the market
// and the borrower's account, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";

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

/** The page's metadata description, also read on the server. */
export function liquityV1EventPageDescription(wallet: string, timestamp: number): string {
  return `${WORDS.description(short(wallet), formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export const liquityV1Explorer: ExplorerAdapter<LiquityV1EventPageInput> = {
  eventPage: ({ wallet, event, ...slot }) => ({
    heading: event.actionLabel,
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
