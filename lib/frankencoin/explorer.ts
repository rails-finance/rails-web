// Frankencoin's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts
// the shared units read. For now the event page's (ui-jobs 236): the
// collateral, the position contract and its owner, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";

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

/** The page's metadata description, also read on the server. */
export function frankencoinEventPageDescription(collateralSymbol: string, position: string, timestamp: number): string {
  return `${WORDS.description(collateralSymbol, short(position), formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export const frankencoinExplorer: ExplorerAdapter<FrankencoinEventPageInput> = {
  eventPage: ({ position, collateralSymbol, owner, event, ...slot }) => ({
    heading: event.actionLabel,
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
