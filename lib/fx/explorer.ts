// f(x)'s explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts the
// shared units read. For now the event page's (ui-jobs 236): the pool, the
// position and its owner, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import { isFxEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { eventTitleWords, makeEventTitle, type EventTitle } from "@/lib/shared/event-title";
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

/** The event's word: T1's, where an adjust reads as the axes it
 *  moved ("Deposit + Borrow", as T1 states it). Also read on the server. */
function fxEventKind(event: BaseActivityEvent): string {
  if (!isFxEvent(event)) return event.actionLabel;
  const ctx = event.context.data;
  if (ctx.reopens) return "Opened again";
  if (ctx.isOpen) return "Open";
  if (ctx.eventType !== "operate" || ctx.emptiesPosition) return event.actionLabel;
  const coll = Number(ctx.collDelta ?? "0") || 0;
  const debt = Number(ctx.debtDelta ?? "0") || 0;
  const collVerb = coll === 0 ? null : coll > 0 ? "Deposit" : "Withdraw";
  const debtVerb = debt === 0 ? null : debt > 0 ? "Borrow" : "Repay";
  if (collVerb && debtVerb) return `${collVerb} + ${debtVerb}`;
  return collVerb ?? debtVerb ?? event.actionLabel;
}

/** The event's title: the word and the amounts its head states (an open's or
 *  adjust's collateral and debt with their verbs, a liquidation's seized and
 *  debt). A pool-wide row moves none of the position's own. Also read on the
 *  server. */
export function fxEventTitle(event: BaseActivityEvent): EventTitle {
  const kind = fxEventKind(event);
  if (!isFxEvent(event)) return makeEventTitle(event, kind, []);
  const ctx = event.context.data;
  const meta = isFxPoolKey(ctx.pool) ? FX_POOLS[ctx.pool] : undefined;
  const tokenSym = meta?.tokenSymbol ?? ctx.poolSymbol;
  if (ctx.eventType === "tickRebalance" || (ctx.eventType === "liquidation" && ctx.poolWide === true))
    return makeEventTitle(event, kind, []);
  if (ctx.eventType === "liquidation")
    return makeEventTitle(event, kind, [
      { value: Number(ctx.liqColls ?? "0") || 0, symbol: tokenSym, address: meta?.tokenAddress },
      { value: Number(ctx.debtDelta ?? "0") || 0, symbol: "fxUSD" },
    ]);
  const coll = Number(ctx.collDelta ?? "0") || 0;
  const debt = Number(ctx.debtDelta ?? "0") || 0;
  const isOpen = !!ctx.isOpen || !!ctx.reopens;
  const isAdjust = ctx.eventType === "operate" && !isOpen && !ctx.emptiesPosition;
  const perAxis = isOpen || isAdjust;
  const title = makeEventTitle(event, kind, [
    { value: coll, symbol: ctx.poolSymbol, label: perAxis ? (coll > 0 ? "Deposit" : "Withdraw") : undefined },
    { value: debt, symbol: "fxUSD", label: perAxis ? (debt > 0 ? "Borrow" : "Repay") : undefined },
  ]);
  return isAdjust && title.amounts.length > 0 ? { ...title, kind: "" } : title;
}

/** The event's heading: the title in words. Also read on the server. */
export function fxEventHeading(event: BaseActivityEvent): string {
  return eventTitleWords(fxEventTitle(event));
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
