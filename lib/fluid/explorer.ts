// Fluid's explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts the
// shared units read. For now the event page's (ui-jobs 236): the vault, the
// position and its owner, then the shared rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";
import { isFluidEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { eventTitleWords, makeEventTitle, type EventTitle } from "@/lib/shared/event-title";

const WORDS = {
  paragraph: "This page is one transaction from this position's history.",
  timeline_link: "See the whole history in the timeline.",
  timeline_hint: "Open this event in the position's timeline",
  vault: "Vault",
  position: "Position",
  copy_position: "Copy the position's NFT id",
  owner: "Owner",
  description: (pair: string, nftId: string, day: string) =>
    `One transaction from the Fluid ${pair} vault position #${nftId}, on ${day}.`,
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export interface FluidEventPageInput extends EventPageSlot {
  nftId: string;
  /** The vault's pair as the position card names it. */
  pair: string;
  /** The vault contract. */
  vault: string;
  /** Null where the read has no owner. */
  owner: string | null;
}

/** The event's title: T1's word and the amounts its head states (a
 *  liquidation's seized collateral and cleared debt, else the collateral and
 *  debt moved; an ownership move states none). Also read on the server. */
export function fluidEventTitle(event: BaseActivityEvent): EventTitle {
  if (!isFluidEvent(event)) return makeEventTitle(event, event.actionLabel, []);
  const ctx = event.context.data;
  const supply = ctx.supplySymbol ?? "DEX shares";
  const borrow = ctx.borrowSymbol ?? "DEX shares";
  if (ctx.eventType === "liquidated" || ctx.eventType === "absorbed") {
    const seized = Number(ctx.liqSupplyBefore ?? "0") - Number(ctx.liqSupplyAfter ?? "0");
    const cleared = Number(ctx.liqBorrowBefore ?? "0") - Number(ctx.liqBorrowAfter ?? "0");
    return makeEventTitle(event, event.actionLabel, [
      seized > 0 ? { value: seized, symbol: supply, label: "Seized" } : null,
      cleared > 0 ? { value: cleared, symbol: borrow, label: "Cleared" } : null,
    ]);
  }
  if (ctx.eventType === "mint" || ctx.eventType === "transfer") return makeEventTitle(event, event.actionLabel, []);
  return makeEventTitle(event, event.actionLabel, [
    { value: Number(ctx.colDelta ?? "0") || 0, symbol: supply },
    { value: Number(ctx.debtDelta ?? "0") || 0, symbol: borrow },
  ]);
}

/** The event's heading: the title in words. Also read on the server. */
export function fluidEventHeading(event: BaseActivityEvent): string {
  return eventTitleWords(fluidEventTitle(event));
}

/** The page's metadata description, also read on the server. */
export function fluidEventPageDescription(pair: string, nftId: string, timestamp: number): string {
  return `${WORDS.description(pair, nftId, formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export const fluidExplorer: ExplorerAdapter<FluidEventPageInput> = {
  eventPage: ({ nftId, pair, vault, owner, event, ...slot }) => ({
    heading: fluidEventHeading(event),
    title: fluidEventTitle(event),
    words: {
      paragraph: WORDS.paragraph,
      timelineLink: WORDS.timeline_link,
      timelineHint: WORDS.timeline_hint,
    },
    facts: [
      { key: "vault", label: WORDS.vault, value: pair, full: vault },
      {
        key: "position",
        label: WORDS.position,
        value: `#${nftId}`,
        full: nftId,
        mono: true,
        copy: WORDS.copy_position,
      },
      ...(owner
        ? [
            {
              key: "owner",
              label: WORDS.owner,
              value: short(owner),
              full: owner,
              mono: true,
              href: listingHrefForWallet("fluid", owner) ?? undefined,
            },
          ]
        : []),
    ],
    ...slot,
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventId: event.id,
    description: fluidEventPageDescription(pair, nftId, event.timestamp),
  }),
  eventMarkdown: { missing: "no Markdown route serves this family's events yet (ui-jobs 236)" },
};
