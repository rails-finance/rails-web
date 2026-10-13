// SparkLend's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts the
// shared units read. For now the event page's (ui-jobs 236): the market and the
// account, then the shared rows. The words are the strings file's `page_words`
// (content/spark/event-prose.yaml).

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import { isSparkEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { sparkRowLabel } from "@/lib/spark/event-label";
import { sparkFeeLiquidation, type SparkTimelineEvent } from "@/lib/spark/liquidation-fee";
import { PROSE, SPARK_PAGE_WORDS } from "@/lib/spark/event-templates";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export interface SparkEventPageInput extends EventPageSlot {
  wallet: string;
  /** The rows of the event's transaction, which name a liquidation's fee transfer. */
  siblings?: readonly SparkTimelineEvent[];
}

/** The event's heading: T1's word. Also read on the server. */
export function sparkEventHeading(event: BaseActivityEvent, siblings?: readonly SparkTimelineEvent[]): string {
  if (!isSparkEvent(event)) return event.actionLabel;
  return sparkRowLabel(event.context.data, event.actionLabel, sparkFeeLiquidation(event.context.data, siblings));
}

/** The page's metadata description, also read on the server. */
export function sparkEventPageDescription(wallet: string, timestamp: number): string {
  const text = PROSE.fillText(SPARK_PAGE_WORDS.description, {
    account: short(wallet),
    day: formatDateLong(timestamp),
  });
  return `${text} ${SPARK_PAGE_WORDS.timeline_link}`;
}

export const sparkExplorer: ExplorerAdapter<SparkEventPageInput> = {
  eventPage: ({ wallet, siblings, event, ...slot }) => ({
    heading: sparkEventHeading(event, siblings),
    words: {
      paragraph: SPARK_PAGE_WORDS.paragraph,
      timelineLink: SPARK_PAGE_WORDS.timeline_link,
      timelineHint: SPARK_PAGE_WORDS.timeline_hint,
    },
    facts: [
      { key: "market", label: SPARK_PAGE_WORDS.market, value: SPARK_PAGE_WORDS.market_value },
      {
        key: "account",
        label: SPARK_PAGE_WORDS.account,
        value: wallet,
        mono: true,
        copy: SPARK_PAGE_WORDS.copy_account,
        href: listingHrefForWallet("spark", wallet) ?? undefined,
      },
    ],
    ...slot,
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventId: event.id,
    description: sparkEventPageDescription(wallet, event.timestamp),
  }),
  eventMarkdown: { missing: "no Markdown route serves this family's events yet (ui-jobs 236)" },
};
