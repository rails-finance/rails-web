// Morpho Blue's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts
// the shared units read, for the Ethereum and Base deployments. For now the
// event page's (ui-jobs 236): the market and the account, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { shortMarketId } from "@/lib/morpho/asset-catalog";

const WORDS = {
  paragraph: (deployment: string) =>
    `This page is one transaction from this account's position in one ${deployment} market.`,
  timeline_link: "See the whole history in the timeline.",
  timeline_hint: "Open this event in the position's timeline",
  market: "Market",
  copy_market: "Copy the market id",
  account: "Account",
  copy_account: "Copy the account's address",
  description: (deployment: string, account: string, day: string) =>
    `One transaction from the ${deployment} market position of ${account}, on ${day}.`,
};

const DEPLOYMENT_NAME = { ethereum: "Morpho Blue", base: "Morpho Blue on Base" } as const;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export interface MorphoEventPageInput extends EventPageSlot {
  /** The market's id, with or without the `0x`. */
  marketId: string;
  /** The pair as the page names it ("USDC / WBTC"); null before the position's read lands. */
  marketLabel: string | null;
  wallet: string;
  deployment: "ethereum" | "base";
}

/** The event's heading: T1's word. Also read on the server. */
export function morphoEventHeading(event: BaseActivityEvent): string {
  return event.actionLabel;
}

/** The page's metadata description, also read on the server. */
export function morphoEventPageDescription(
  deployment: "ethereum" | "base",
  wallet: string,
  timestamp: number,
): string {
  return `${WORDS.description(DEPLOYMENT_NAME[deployment], short(wallet), formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export const morphoExplorer: ExplorerAdapter<MorphoEventPageInput> = {
  eventPage: ({ marketId, marketLabel, wallet, deployment, event, ...slot }) => ({
    heading: morphoEventHeading(event),
    words: {
      paragraph: WORDS.paragraph(DEPLOYMENT_NAME[deployment]),
      timelineLink: WORDS.timeline_link,
      timelineHint: WORDS.timeline_hint,
    },
    facts: [
      {
        key: "market",
        label: WORDS.market,
        value: marketLabel ?? shortMarketId(marketId),
        full: marketId.startsWith("0x") ? marketId : `0x${marketId}`,
        copy: WORDS.copy_market,
      },
      {
        key: "account",
        label: WORDS.account,
        value: wallet,
        mono: true,
        copy: WORDS.copy_account,
        href: listingHrefForWallet(deployment === "base" ? "morpho-base" : "morpho", wallet) ?? undefined,
      },
    ],
    ...slot,
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventId: event.id,
    description: morphoEventPageDescription(deployment, wallet, event.timestamp),
  }),
  eventMarkdown: { missing: "no Markdown route serves this family's events yet (ui-jobs 236)" },
};
