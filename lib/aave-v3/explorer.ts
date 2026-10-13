// Aave V3's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts the
// shared units read, for the Ethereum Pools (Core, Prime, EtherFi) and Base. For
// now the event page's (ui-jobs 236): the Pool and the account, then the shared
// rows. The words are the strings file's `page_words`
// (content/aave-v3/event-prose.yaml).

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import { isAaveV3Event, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { aaveV3CtLabel } from "@/lib/aave-v3/event-label";
import { feeLiquidation } from "@/lib/aave-v3/liquidation-fee";
import { AAVE_V3_PAGE_WORDS, PROSE } from "@/lib/aave-v3/event-templates";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export type AaveV3Deployment = "ethereum" | "base";

type SiblingRows = Parameters<typeof feeLiquidation>[1];

export interface AaveV3EventPageInput extends EventPageSlot {
  /** The Pool's name: Core, Prime, EtherFi, or Base. */
  market: string;
  wallet: string;
  deployment: AaveV3Deployment;
  /** The rows of the event's transaction, which name a liquidation's fee transfer. */
  siblings?: SiblingRows;
}

/** The event's heading: T1's word. Also read on the server. */
export function aaveV3EventHeading(
  event: BaseActivityEvent,
  deployment: AaveV3Deployment,
  siblings?: SiblingRows,
): string {
  if (!isAaveV3Event(event)) return event.actionLabel;
  const chainId = deployment === "base" ? BASE_CHAIN_ID : MAINNET_CHAIN_ID;
  return aaveV3CtLabel(event.context.data, !!feeLiquidation(event.context.data, siblings, chainId), chainId);
}

/** The page's metadata description, also read on the server. */
export function aaveV3EventPageDescription(market: string, wallet: string, timestamp: number): string {
  const text = PROSE.fillText(AAVE_V3_PAGE_WORDS.description, {
    market,
    account: short(wallet),
    day: formatDateLong(timestamp),
  });
  return `${text} ${AAVE_V3_PAGE_WORDS.timeline_link}`;
}

export const aaveV3Explorer: ExplorerAdapter<AaveV3EventPageInput> = {
  eventPage: ({ market, wallet, deployment, siblings, event, ...slot }) => ({
    heading: aaveV3EventHeading(event, deployment, siblings),
    words: {
      paragraph: PROSE.fillText(AAVE_V3_PAGE_WORDS.paragraph, { market }),
      timelineLink: AAVE_V3_PAGE_WORDS.timeline_link,
      timelineHint: AAVE_V3_PAGE_WORDS.timeline_hint,
    },
    facts: [
      { key: "market", label: AAVE_V3_PAGE_WORDS.market, value: market },
      {
        key: "account",
        label: AAVE_V3_PAGE_WORDS.account,
        value: wallet,
        mono: true,
        copy: AAVE_V3_PAGE_WORDS.copy_account,
        href: listingHrefForWallet(deployment === "base" ? "aave-v3-base" : "aave-v3", wallet) ?? undefined,
      },
    ],
    ...slot,
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventId: event.id,
    description: aaveV3EventPageDescription(market, wallet, event.timestamp),
  }),
  eventMarkdown: { missing: "no Markdown route serves this family's events yet (ui-jobs 236)" },
};
