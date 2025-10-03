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
    <div className="flex items-center justify-between mt-8">
      <div className="text-sm text-slate-400">
        Showing {showingFrom}-{showingTo} of {totalCount} troves
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="cursor-pointer p-1.5 text-slate-700 dark:text-slate-50 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/75 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {start > 1 && (
          <>
            <button
              onClick={() => onPageChange(1)}
              className="cursor-pointer text-slate-700 dark:text-slate-50 px-3 py-0.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/75 transition-colors duration-150"
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
            className={`cursor-pointer text-slate-700 dark:text-slate-50 px-3 py-0.5 font-bold rounded-lg transition-colors ${
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
              className="cursor-pointer px-3 py-0.5 font-bold text-slate-700 dark:text-slate-50 rounded-lg dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/75 transition-colors duration-150"
            >
              {totalPages}
            </button>
          </>
        )}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="cursor-pointer text-slate-700 dark:text-slate-50 p-1.5 font-bold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/75 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
