// Morpho Blue's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts
// the shared units read, for the Ethereum and Base deployments. For now the
// event page's (ui-jobs 236): the market and the account, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import { isMorphoEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { eventTitleWords, makeEventTitle, type EventTitle } from "@/lib/shared/event-title";
import { shortMarketId } from "@/lib/morpho/asset-catalog";
import { morphoEventProse, morphoExplanationRuns } from "@/lib/morpho/event-prose";

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

const DEPLOYMENT_NAME = {
  ethereum: "Morpho Blue",
  base: "Morpho Blue on Base",
  arbitrum: "Morpho Blue on Arbitrum",
} as const;

export type MorphoExplorerDeployment = keyof typeof DEPLOYMENT_NAME;

const SESSION = { ethereum: "morpho", base: "morpho-base", arbitrum: "morpho-arbitrum" } as const;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export interface MorphoEventPageInput extends EventPageSlot {
  /** The market's id, with or without the `0x`. */
  marketId: string;
  /** The pair as the page names it ("USDC / WBTC"); null before the position's read lands. */
  marketLabel: string | null;
  wallet: string;
  deployment: MorphoExplorerDeployment;
}

/** The event's title: T1's word and the amounts its head states (the side's
 *  assets moved, and a liquidation's loan repaid). Also read on the server. */
export function morphoEventTitle(event: BaseActivityEvent): EventTitle {
  if (!isMorphoEvent(event)) return makeEventTitle(event, event.actionLabel, []);
  const ctx = event.context.data;
  return makeEventTitle(event, event.actionLabel, [
    {
      value: Number(ctx.assetsDelta) || 0,
      symbol: ctx.side === "collateral" ? ctx.collateralSymbol : ctx.loanSymbol,
    },
    ctx.eventType === "liquidation" ? { value: Number(ctx.loanRepaid) || 0, symbol: ctx.loanSymbol } : null,
  ]);
}

/** The event's heading: the title in words. Also read on the server. */
export function morphoEventHeading(event: BaseActivityEvent): string {
  return eventTitleWords(morphoEventTitle(event));
}

/** The page's metadata description, also read on the server. */
/** The browser title's event words: the Explanation's first sentence, which
 *  the page's h1 states (rails-ops decision 0045, "Ruled since"), read from
 *  the row alone; else the heading. Also read on the server. */
export function morphoEventPageTitle(event: BaseActivityEvent): string {
  if (!isMorphoEvent(event)) return morphoEventHeading(event);
  const prose = morphoEventProse({ ctx: event.context.data, blockNumber: event.blockNumber });
  return morphoExplanationRuns(prose)[0]?.sentences[0]?.text ?? morphoEventHeading(event);
}

export function morphoEventPageDescription(
  deployment: MorphoExplorerDeployment,
  wallet: string,
  timestamp: number,
): string {
  return `${WORDS.description(DEPLOYMENT_NAME[deployment], short(wallet), formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export const morphoExplorer: ExplorerAdapter<MorphoEventPageInput> = {
  eventPage: ({ marketId, marketLabel, wallet, deployment, event, ...slot }) => ({
    heading: morphoEventHeading(event),
    title: morphoEventTitle(event),
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
        href: listingHrefForWallet(SESSION[deployment], wallet) ?? undefined,
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
