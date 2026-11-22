"use client";

// Shared pagination strip for the server-driven listing tier (Spark, and the
// larger chain-state protocols that page against the backend rather than filter
// a fetched set in-memory). "Showing X–Y of N" plus first / prev / windowed page
// numbers / next / last; on one page, the count alone. Holds no state — the current page + total come from the
// caller (URL-backed). Generic: no protocol-specific logic, so every server-
// driven listing shares one control. (The reference tier keeps its own bespoke
// AaveV4PaginationControls; this is the chain-state tier's shared equivalent.)

import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  noun?: string;
  /** Said after the count ("closed and liquidated ones under Status"). */
  note?: string;
}

/** The count of what a listing shows, under its results where there is no
 *  paging to carry it: one page of a server listing, and a listing filtered
 *  in memory. Nothing for an empty result, which the listing words. */
export function ResultCountLine({ total, noun, note }: { total: number; noun: string; note?: string }) {
  if (total <= 0) return null;
  return (
    <div className="mt-8 text-sm text-rb-500" data-anatomy="N3" data-result-line={total} data-prov-exempt="">
      {total.toLocaleString("en-US")} {total === 1 ? noun.replace(/s$/, "") : noun}
      {note ? <> · {note}</> : null}
    </div>
  );
}

export function PaginationControls({
  currentPage,
  totalPages,
  totalCount,
  itemsPerPage,
  onPageChange,
  noun = "positions",
  note,
}: PaginationControlsProps) {
  // One page: the count alone ("12 open positions"). The line under the
  // results always states what is shown, with its noun (Miles, 22 Nov 2026).
  if (totalPages <= 1) return <ResultCountLine total={totalCount} noun={noun} note={note} />;

  const showingFrom = (currentPage - 1) * itemsPerPage + 1;
  const showingTo = Math.min(currentPage * itemsPerPage, totalCount);
  const focusStyles =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rb-500 focus-visible:ring-offset-2 focus-visible:ring-offset-rb-50 dark:focus-visible:ring-rb-400 dark:focus-visible:ring-offset-rb-900";

  const pageNumbers: number[] = [];
  const maxVisible = 5;
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  const end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
  for (let i = start; i <= end; i++) pageNumbers.push(i);

  return (
    // Page numbers and the "Showing" line are chrome: data-prov-exempt.
    <div
      className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8"
      data-anatomy="N3"
      data-prov-exempt=""
    >
      <div className={`text-sm text-rb-500 ${note ? "text-center sm:text-left" : "whitespace-nowrap"}`}>
        Showing {showingFrom.toLocaleString("en-US")}–{showingTo.toLocaleString("en-US")} of{" "}
        {totalCount.toLocaleString("en-US")} {noun}
        {note ? <> · {note}</> : null}
      </div>

      <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-center">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Go to previous page"
          className={`cursor-pointer p-1.5 text-foreground rounded-lg hover:bg-rb-200 dark:hover:bg-rb-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 ${focusStyles}`}
        >
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>

        {start > 1 && (
          <>
            <button
              onClick={() => onPageChange(1)}
              aria-label="Go to first page"
              className={`cursor-pointer text-foreground px-2 sm:px-3 py-0.5 rounded-lg hover:bg-rb-200 dark:hover:bg-rb-800 transition-colors duration-150 ${focusStyles}`}
            >
              1
            </button>
            {start > 2 && <span className="font-bold text-foreground">...</span>}
          </>
        )}

        {pageNumbers.map((num) => (
          <button
            key={num}
            onClick={() => onPageChange(num)}
            aria-label={`Page ${num}${num === currentPage ? ", current page" : ""}`}
            aria-current={num === currentPage ? "page" : undefined}
            className={`cursor-pointer text-foreground px-2 sm:px-3 py-0.5 font-bold rounded-lg transition-colors ${focusStyles} ${
              num === currentPage ? "bg-rb-200 dark:bg-rb-900 text-foreground" : "hover:bg-rb-200 dark:hover:bg-rb-800"
            }`}
          >
            {num}
          </button>
        ))}

        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span className="font-bold text-foreground">...</span>}
            <button
              onClick={() => onPageChange(totalPages)}
              aria-label="Go to last page"
              className={`cursor-pointer px-2 sm:px-3 py-0.5 font-bold text-foreground rounded-lg hover:bg-rb-200 dark:hover:bg-rb-800 transition-colors duration-150 ${focusStyles}`}
            >
              {totalPages}
            </button>
          </>
        )}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Go to next page"
          className={`cursor-pointer text-foreground p-1.5 font-bold rounded-lg hover:bg-rb-200 dark:hover:bg-rb-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 ${focusStyles}`}
        >
          <ChevronRight className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
