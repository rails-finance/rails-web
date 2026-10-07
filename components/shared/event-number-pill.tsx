"use client";

// The event's number, every family's (rails-ops TO-DO-ui-jobs 291, 250). A
// header places `EventNumberPill` at the end of its right slot. In a timeline
// card the number stands in the row's column at the far left, at both widths
// (`PlainNumber`, no link), and the slot holds the transaction hash as an
// explorer link where Display's "Transaction hashes" asks for it. On the
// event page the slot draws the pill, a link to the card in the timeline
// (`?at=`). `data-event-number` carries the number (a range's first) for the
// verifiers.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useLayoutEffect, type ReactNode } from "react";
import { useEventShareHref } from "@/components/shared/event-share-context";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import { shortAddr } from "@/lib/shared/format-event";
import { useChainId } from "@/lib/shared/chain-context";
import { explorerUrl } from "@/lib/shared/chains";

/** The card's transaction hash, provided by `EventCard` around its header. */
export const EventTxHashContext = createContext<string | null>(null);

/** What `EventCard` hands its header (rails-ops TO-DO-ui-jobs 295): the
 *  chevron, which a header places after its action word with
 *  `<EventHeadChevron />`. Null outside a card, and on the event page. */
export const EventHeadContext = createContext<{
  chevron: ReactNode;
  /** Set where the card draws the number in a column of its row, left of the
   *  spine (ui-jobs 250, the timeline's desktop row): the header's pill hands
   *  its number there and draws none in the header. */
  numberColumn?: (n: { number: number; last?: number } | null) => void;
} | null>(null);

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
  const head = useContext(EventHeadContext);
  const toColumn = head?.numberColumn;
  const { number, last } = props;
  useLayoutEffect(() => {
    if (!toColumn) return;
    toColumn({ number, last });
    return () => toColumn(null);
  }, [toColumn, number, last]);
  return (
    <>
      {/* With the number in the card's column, its old slot holds the
          transaction hash where Display asks for it (desktop only). */}
      {toColumn && <TxHashLink />}
      {/* In a timeline card the number stands in the row's column, at both
          widths; the header draws it only outside one (the event page). */}
      {!toColumn && <NumberPill {...props} />}
    </>
  );
}

/** The transaction hash, abbreviated ("0x53e0…fac5"), as a link to the
 *  chain's explorer: "Transaction hashes" in Display, off by default, at
 *  >=640px; below it the row's ⋮ menu carries the explorer link. It
 *  is a pointer and carries no receipt (TO-DO-mobile-timeline decision 13). */
function TxHashLink() {
  const txHash = useContext(EventTxHashContext);
  const { showTxHashes } = useTimelineDisplay();
  const chainId = useChainId();
  if (!showTxHashes || !txHash) return null;
  return (
    <a
      href={explorerUrl(chainId, "tx", txHash)}
      target="_blank"
      rel="noopener noreferrer"
      className="hidden font-mono text-xs text-rb-500 underline-offset-2 hover:text-foreground hover:underline sm:inline"
      title={txHash}
      data-event-tx-hash={txHash}
      data-prov-exempt=""
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {shortAddr(txHash)}
    </a>
  );
}

/** The row's number: muted, no fill, no link (ui-jobs 250 point 3,
 *  revised); the event page is "Open event page" in the row's ⋮ menu. */
export function PlainNumber({ number, last }: { number: number; last?: number }) {
  const range = last != null && last !== number;
  return (
    <span
      className="num-pill"
      aria-label={range ? `Events ${number} to ${last}` : `Event ${number}`}
      data-event-number={number}
      data-prov-exempt=""
    >
      {range ? `${number}–${last}` : String(number)}
    </span>
  );
}

export function NumberPill({
  number,
  last,
  className,
  numberOnly,
}: {
  number: number;
  /** The column's pill: the number whatever Display says (the hash has its
   *  own slot). */
  numberOnly?: boolean;
  /** A row drawing several events ends its range here: "7–8". */
  last?: number;
  className?: string;
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
        className={`${EVENT_NUMBER_PILL}${className ? ` ${className}` : ""}`}
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
  const hash = !onPage && !numberOnly && showTxHashes && txHash ? txHash : null;
  return (
    <Link
      href={onPage ? timelineHrefOf(shareHref) : shareHref}
      className={`${EVENT_NUMBER_PILL} ${LINKED}${hash ? " font-mono" : ""}${className ? ` ${className}` : ""}`}
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
