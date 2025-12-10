"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

export function PaginationControls({
  currentPage,
  totalPages,
  totalCount,
  itemsPerPage,
  onPageChange,
}: PaginationControlsProps) {
  if (totalPages <= 1) return null;

  const showingFrom = (currentPage - 1) * itemsPerPage + 1;
  const showingTo = Math.min(currentPage * itemsPerPage, totalCount);
  const focusStyles =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-slate-400 dark:focus-visible:ring-offset-slate-900";

  const pageNumbers = [];
  const maxVisible = 5;
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);

  if (end - start + 1 < maxVisible) {
    start = Math.max(1, end - maxVisible + 1);
  }

  for (let i = start; i <= end; i++) {
    pageNumbers.push(i);
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8">
      <div className="text-sm text-slate-400 whitespace-nowrap">
        Showing {showingFrom}-{showingTo} of {totalCount} troves
      </div>

      <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-center">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Go to previous page"
          className={`cursor-pointer p-1.5 text-slate-700 dark:text-slate-50 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/75 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 ${focusStyles}`}
        >
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>

        {start > 1 && (
          <>
            <button
              onClick={() => onPageChange(1)}
              aria-label="Go to first page"
              className={`cursor-pointer text-slate-700 dark:text-slate-50 px-2 sm:px-3 py-0.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/75 transition-colors duration-150 ${focusStyles}`}
            >
              1
            </button>
            {start > 2 && <span className="font-bold text-slate-700 dark:text-slate-50">...</span>}
          </>
        )}

        {pageNumbers.map((num) => (
          <button
            key={num}
            onClick={() => onPageChange(num)}
            aria-label={`Page ${num}${num === currentPage ? ", current page" : ""}`}
            aria-current={num === currentPage ? "page" : undefined}
            className={`cursor-pointer text-slate-700 dark:text-slate-50 px-2 sm:px-3 py-0.5 font-bold rounded-lg transition-colors ${focusStyles} ${
              num === currentPage
                ? "bg-slate-200 dark:bg-slate-600 text-slate-700"
                : "hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            {num}
          </button>
        ))}

        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span className="font-bold text-slate-700 dark:text-slate-50">...</span>}
            <button
              onClick={() => onPageChange(totalPages)}
              aria-label="Go to last page"
              className={`cursor-pointer px-2 sm:px-3 py-0.5 font-bold text-slate-700 dark:text-slate-50 rounded-lg dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/75 transition-colors duration-150 ${focusStyles}`}
            >
              {totalPages}
            </button>
          </>
        )}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Go to next page"
          className={`cursor-pointer text-slate-700 dark:text-slate-50 p-1.5 font-bold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/75 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 ${focusStyles}`}
        >
          <ChevronRight className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
