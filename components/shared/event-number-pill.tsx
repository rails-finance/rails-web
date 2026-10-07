"use client";

// The event's number in the card header's right-hand group, every family's
// (rails-ops TO-DO-ui-jobs 291). Inside a timeline the pill is a link to the
// event's page; on that page it links to the card in the timeline (`?at=`).
// Outside a timeline (no share href: a simulator shell, the home page's live
// example) it is the plain pill. `data-event-number` carries the number (a
// range's first) for the verifiers.
//
// With Display's "Transaction hashes" on (ui-jobs 294) a timeline pill shows
// its transaction's short hash, the full hash in its title; the aria-label
// keeps the number. The event page's pill always shows the number.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";
import { useEventShareHref } from "@/components/shared/event-share-context";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import { shortAddr } from "@/lib/shared/format-event";

/** The card's transaction hash, provided by `EventCard` around its header. */
export const EventTxHashContext = createContext<string | null>(null);

/** What `EventCard` hands its header (rails-ops TO-DO-ui-jobs 295): the
 *  chevron, which a header places after its action word with
 *  `<EventHeadChevron />`, and the event menu (⋮), which the number pill
 *  draws before the number so the pill stays the last thing on the line. Null
 *  outside a card, and on the event page. */
export const EventHeadContext = createContext<{ chevron: ReactNode; menu: ReactNode } | null>(null);

/** The card's chevron, after the header's action word; `className` sets
 *  its wrapper's spacing. Nothing where the card draws no chevron. */
export function EventHeadChevron({ className }: { className?: string }) {
  const chevron = useEventHeadChevron();
  if (!chevron) return null;
  return <span className={`inline-flex items-center ${className ?? ""}`}>{chevron}</span>;
}

/** The card's chevron node, or null where the card draws none. */
export function useEventHeadChevron(): ReactNode {
  return useContext(EventHeadContext)?.chevron ?? null;
}

/** The pill's shape, shared with the boundary card's row-range pill. */
export const EVENT_NUMBER_PILL = "inline-flex items-center rounded-full bg-sunken px-1.5 py-0.5 text-[9px] text-rb-500";

const LINKED =
  "cursor-pointer transition-colors underline-offset-2 hover:bg-selected hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rb-400";

/** An event page's path (`<position>/event/<id>[?subject]`) as the timeline's
 *  `?at=` landing on that event, keeping the subject query. */
export function timelineHrefOf(shareHref: string): string {
  const [path, query] = shareHref.split("?");
  const m = path.match(/^(.*)\/event\/([^/]+)$/);
  if (!m) return shareHref;
  return `${m[1]}?at=${m[2]}${query ? `&${query}` : ""}`;
}

function decoded(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export function EventNumberPill(props: { number: number; last?: number }) {
  const menu = useContext(EventHeadContext)?.menu ?? null;
  return (
    <>
      {menu}
      <NumberPill {...props} />
    </>
  );
}

function NumberPill({
  number,
  last,
}: {
  number: number;
  /** A row drawing several events ends its range here: "7–8". */
  last?: number;
}) {
  const shareHref = useEventShareHref();
  const pathname = usePathname();
  const txHash = useContext(EventTxHashContext);
  const { showTxHashes } = useTimelineDisplay();
  const range = last != null && last !== number;
  const text = range ? `${number}–${last}` : String(number);
  const which = range ? `events ${number} to ${last}` : `event ${number}`;

  if (!shareHref) {
    return (
      <span
        className={EVENT_NUMBER_PILL}
        aria-label={range ? `Events ${number} to ${last}` : `Event ${number}`}
        data-event-number={number}
        data-prov-exempt=""
      >
        {text}
      </span>
    );
  }
  const onPage = pathname != null && decoded(pathname) === decoded(shareHref.split("?")[0]);
  const action = onPage ? "View in timeline" : "View event page";
  // Mono text gives every short hash one width, so the pills line up from
  // card to card.
  const hash = !onPage && showTxHashes && txHash ? txHash : null;
  return (
    <Link
      href={onPage ? timelineHrefOf(shareHref) : shareHref}
      className={`${EVENT_NUMBER_PILL} ${LINKED}${hash ? " font-mono" : ""}`}
      aria-label={`${action}, ${which}`}
      title={hash ?? action}
      data-event-number={number}
      data-event-tx-hash={hash ?? undefined}
      data-event-number-link={onPage ? "timeline" : "page"}
      data-prov-exempt=""
      // The header toggles the card on click and on Enter; the pill's click
      // and key go to the link.
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {hash ? shortAddr(hash) : text}
    </Link>
  );
}
