// f(x)'s explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts the
// shared units read. For now the event page's (ui-jobs 236): the pool, the
// position and its owner, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import { isFxEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { eventTitleWords, kindTitle, type EventTitle } from "@/lib/shared/event-title";
import { fxT1Caption, fxT1Words } from "@/lib/fx/head-words";
import { fxExplainerTeaser } from "@/lib/fx/explainer-clauses";
import { firstSentenceText } from "@/lib/fx/sentence-text";
import type { FxCoords } from "@/lib/fx/event-provenance";
import { FX_POOLS, isFxPoolKey, type FxPoolKey } from "@/lib/fx/asset-catalog";

const WORDS = {
  paragraph: "This page is one transaction from this position's history.",
  timeline_link: "See the whole history in the timeline.",
  timeline_hint: "Open this event in the position's timeline",
  pool: "Pool",
  position: "Position",
  copy_position: "Copy the position's id",
  owner: "Owner",
  description: (token: string, positionId: string, day: string) =>
    `One transaction from the f(x) ${token} position #${positionId}, on ${day}.`,
};

const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export interface FxEventPageInput extends EventPageSlot {
  pool: FxPoolKey;
  positionId: string;
  /** The position's owner now; null while the read has not answered. */
  owner: string | null;
}

/** The event's title where the card has no teaser: T1's words (rails-ops
 *  decision 0045). A pool-wide liquidation's "Debt written off" needs the
 *  page's position reads, so the server's words leave it out. Also read on the
 *  server. */
export function fxEventTitle(event: BaseActivityEvent): EventTitle {
  if (!isFxEvent(event)) return kindTitle(event.actionLabel);
  const ctx = event.context.data;
  const to = ctx.eventType === "transfer" && ctx.transferTo ? ctx.transferTo : null;
  return kindTitle(fxT1Caption(fxT1Words(ctx), to ? `to ${to.slice(0, 6)}…${to.slice(-4)}` : undefined));
}

/** The event's heading, the browser title's last words: the Explanation's
 *  first sentence, as the page's h1 states it, else T1's words. Also read on
 *  the server. */
export function fxEventHeading(event: BaseActivityEvent): string {
  if (!isFxEvent(event)) return event.actionLabel;
  const ctx = event.context.data;
  const meta = isFxPoolKey(ctx.pool) ? FX_POOLS[ctx.pool] : undefined;
  const coords: FxCoords = {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    pool: meta?.address,
    poolLabel: ctx.poolSymbol,
    positionId: ctx.positionId,
  };
  return firstSentenceText(fxExplainerTeaser(ctx, coords)) ?? eventTitleWords(fxEventTitle(event));
}

/** The page's metadata description, also read on the server. */
export function fxEventPageDescription(pool: FxPoolKey, positionId: string, timestamp: number): string {
  return `${WORDS.description(FX_POOLS[pool].tokenSymbol, positionId, formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export const fxExplorer: ExplorerAdapter<FxEventPageInput> = {
  eventPage: ({ pool, positionId, owner, event, ...slot }) => ({
    heading: fxEventHeading(event),
    title: fxEventTitle(event),
    words: {
      paragraph: WORDS.paragraph,
      timelineLink: WORDS.timeline_link,
      timelineHint: WORDS.timeline_hint,
    },
    facts: [
      { key: "pool", label: WORDS.pool, value: `${FX_POOLS[pool].tokenSymbol} pool` },
      { key: "position", label: WORDS.position, value: positionId, mono: true, copy: WORDS.copy_position },
      ...(owner
        ? [
            {
              key: "owner",
              label: WORDS.owner,
              value: shortAddress(owner),
              full: owner,
              mono: true,
              href: listingHrefForWallet("fx", owner) ?? undefined,
            },
          ]
        : []),
    ],
    ...slot,
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventId: event.id,
    description: fxEventPageDescription(pool, positionId, event.timestamp),
  }),
  eventMarkdown: { missing: "no Markdown route serves this family's events yet (ui-jobs 236)" },
};
