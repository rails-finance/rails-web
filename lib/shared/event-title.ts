// The event page's title (rails-ops TO-DO-ui-jobs 307, point 7): the event's
// kind word and its main amounts, which `EventPageTitle` draws with the token
// icons and the browser title spells out. One typed value feeds both, so the
// h1 and the tab never differ. A family builds it from the event alone
// (`lib/<family>/explorer.ts`), which keeps it readable on the server where the
// page's metadata is made. Server-safe.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { EVENT_PAGE_WORDS } from "@/lib/shared/event-page-words";
import { fmtHeaderMagnitude } from "@/lib/shared/spine-format";

/** One amount the title states: a magnitude with its token. */
export interface EventTitleAmount {
  /** The magnitude; the sign is dropped, the kind word carries the direction. */
  value: number;
  symbol: string;
  /** The token's contract, for its icon. */
  address?: string;
  /** A word before the figure where the title states two amounts of different
   *  roles ("Collateral", "Debt"). */
  label?: string;
}

export interface EventTitle {
  /** The family's word for the event (T1's); empty where the amounts' own
   *  labels carry the verbs ("Deposit 1 ETH Generate 100 DAI"). */
  kind: string;
  /** Empty where the event moves no amount (a terms change): the kind word
   *  stands alone. */
  amounts: EventTitleAmount[];
}

/** A title of the kind word alone, for an event that moves no amount and for a
 *  family whose amounts the server cannot name (see its adapter). */
export const kindTitle = (kind: string): EventTitle => ({ kind, amounts: [] });

/** The title's amounts, in text: "5K" for a figure, as the card's head states it. */
export const titleFigure = (a: EventTitleAmount): string => fmtHeaderMagnitude(Math.abs(a.value), a.symbol);

/** The title as the browser title spells it: "Repay 5K USDC". */
export function eventTitleWords(t: EventTitle): string {
  if (t.amounts.length === 0) return t.kind;
  const labelled = t.amounts.some((a) => a.label);
  const parts = t.amounts.map((a) => `${a.label ? `${a.label} ` : ""}${titleFigure(a)} ${a.symbol}`);
  return `${t.kind ? `${t.kind} ` : ""}${parts.join(labelled ? " " : ` ${EVENT_PAGE_WORDS.title_and} `)}`;
}

/** An event's title: the kind word and the amounts that moved. An amount of
 *  zero, one that is not a number, and one of a token whose decimals did not
 *  load are left out (that figure is stated "Not loaded" in the card). An
 *  amount with no contract takes the event's sole flow of that symbol. */
export function makeEventTitle(
  event: BaseActivityEvent,
  kind: string,
  amounts: ReadonlyArray<(Omit<EventTitleAmount, "symbol"> & { symbol?: string | null }) | null | undefined>,
): EventTitle {
  const unread = event.decimalsUnread ?? [];
  const kept: EventTitleAmount[] = [];
  for (const a of amounts) {
    if (!a || !a.symbol || !Number.isFinite(a.value) || a.value === 0) continue;
    const address = a.address ?? soleFlowAddress(event.flows, a.symbol);
    const isUnread = unread.some(
      (u) => (address && u.address.toLowerCase() === address.toLowerCase()) || u.label === a.symbol,
    );
    if (isUnread) continue;
    kept.push({ ...a, symbol: a.symbol, address });
  }
  return { kind, amounts: kept };
}
