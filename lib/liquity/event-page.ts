// The Liquity V2 event page's facts (rails-ops TO-DO-ui-jobs 236): where the
// event stands in the Trove's history, the holder's name, and the metadata
// description. The page (server) and its client view both read them here.
// The words are the strings file's `page_words`
// (content/liquity-v2/event-prose.yaml).

import type { BaseActivityEvent } from "@/lib/shared/types/activity";
import { liquityTroveHistory } from "@/lib/liquity/event-prose-position";
import { fillText, liquityEventProse } from "@/lib/liquity/event-prose";
import { CONTEXT_WORDS, PAGE_WORDS } from "@/lib/liquity/event-templates";
import { formatDateLong } from "@/lib/date";

const BURN = "0x0000000000000000000000000000000000000000";

type LiquityEvent = ReturnType<typeof liquityTroveHistory>[number];

export interface EventPagePlace {
  /** The history in the trove page's order. */
  events: LiquityEvent[];
  /** The event's index in `events`; -1 where the history lacks it. */
  at: number;
  event?: LiquityEvent;
  previous?: LiquityEvent;
  next?: LiquityEvent;
  /** 1-based, the trove page's number. */
  n: number;
  total: number;
}

/** The trove page's order (block, time, log index, then a stable sort by
 *  time, as useTimelineEvents numbers them) and the event's place in it.
 *  `totalEvents` is the route's count where its first page stopped short. */
export function eventPagePlace(
  history: BaseActivityEvent[],
  eventId: string,
  totalEvents: number | null,
): EventPagePlace {
  const events = liquityTroveHistory(history).sort((a, b) => a.timestamp - b.timestamp);
  const at = events.findIndex((e) => e.id === eventId);
  const offset = totalEvents != null ? Math.max(0, totalEvents - events.length) : 0;
  return {
    events,
    at,
    event: at >= 0 ? events[at] : undefined,
    previous: at > 0 ? events[at - 1] : undefined,
    next: at >= 0 && at + 1 < events.length ? events[at + 1] : undefined,
    n: offset + at + 1,
    total: totalEvents ?? events.length,
  };
}

/** The Trove's owner; a closed Trove's owner is the burn address, and its
 *  wallet is `lastOwner`. */
export function troveHolder(trove: { owner?: string | null; lastOwner?: string | null } | null): {
  address: string | null;
  last: boolean;
} {
  if (trove?.owner && trove.owner.toLowerCase() !== BURN) return { address: trove.owner, last: false };
  return { address: trove?.lastOwner ?? null, last: true };
}

const short = (hex: string) => (hex.length > 12 ? `${hex.slice(0, 6)}…${hex.slice(-4)}` : hex);

/** The holder as the page names it: the ENS name, else the short address. */
export function holderName(owner: string | null, ownerEns: string | null): string {
  return ownerEns || (owner ? short(owner) : CONTEXT_WORDS.owner_unknown);
}

/** The page's metadata description: the Trove, its holder, the event's place
 *  and day, what the figures are, and the timeline sentence. */
export function eventPageDescription(o: {
  collSymbol: string;
  troveId: string;
  owner: string | null;
  ownerEns: string | null;
  lastOwner: boolean;
  n: number;
  total: number;
  timestamp: number;
}): string {
  const owner = holderName(o.owner, o.ownerEns);
  const holder = o.lastOwner ? fillText(PAGE_WORDS.last_held_by, { owner }) : fillText(PAGE_WORDS.held_by, { owner });
  const text = fillText(PAGE_WORDS.description, {
    coll_symbol: o.collSymbol,
    trove: short(o.troveId),
    holder,
    n: o.n,
    total: o.total,
    day: formatDateLong(o.timestamp),
  });
  return `${text} ${PAGE_WORDS.timeline_link}`;
}

/** The event's heading in words, for the browser title: the prose's L1 line
 *  ("Repay · 100K BOLD") with its groups joined by spaces. Null where the
 *  history lacks the event. */
export function eventHeadingWords(place: EventPagePlace, currentPrice?: number): string | null {
  const { event, previous } = place;
  if (!event) return null;
  const { L1 } = liquityEventProse({
    ctx: event.context.data,
    event,
    previousEvent: previous,
    currentEvent: event,
    currentPrice,
    ledger: null,
    collDecimals: null,
    debtDecimals: null,
  });
  return L1.split(" · ").join(" ");
}
