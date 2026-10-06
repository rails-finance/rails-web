// The Liquity V2 event page's facts (rails-ops TO-DO-ui-jobs 236): where the
// event stands in the Trove's history, and the paragraph beside its card. The
// page (server, for the metadata description) and its client view both read
// them here, so the two say the same thing. The words are the strings file's
// `page_words` (content/liquity-v2/event-prose.yaml).

import type { BaseActivityEvent } from "@/lib/shared/types/activity";
import { liquityTroveHistory } from "@/lib/liquity/event-prose-position";
import { fillText } from "@/lib/liquity/event-prose";
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

/** The paragraph beside the card, and its timeline link's words. */
export function eventPageParagraph(o: {
  collSymbol: string;
  troveId: string;
  owner: string | null;
  ownerEns: string | null;
  lastOwner: boolean;
  n: number;
  total: number;
  timestamp: number;
}): { text: string; link: string } {
  const owner = o.ownerEns || (o.owner ? short(o.owner) : CONTEXT_WORDS.owner_unknown);
  const holder = o.lastOwner ? fillText(PAGE_WORDS.last_held_by, { owner }) : fillText(PAGE_WORDS.held_by, { owner });
  const text = fillText(PAGE_WORDS.paragraph, {
    coll_symbol: o.collSymbol,
    trove: short(o.troveId),
    holder,
    n: o.n,
    total: o.total,
    day: formatDateLong(o.timestamp),
  });
  return { text, link: PAGE_WORDS.timeline_link };
}
