"use client";

// SortControl — the shared sort widget for listing toolbars: an asc/desc flip
// button + a "sort by" dropdown. Extracted from the near-verbatim markup the
// Trove and Aave V4 list filters each inline, so every listing sorts through one
// component. State-free: it reads sortBy/sortOrder and reports changes; the
// caller owns where that state lives (URL param object).

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown, ChevronDown } from "lucide-react";
import { CTRL_GHOST, CTRL_OFF, CTRL_ON, OVERLAY_HEADING } from "@/lib/shared/ui-grammar";

export interface SortOption {
  value: string;
  label: string;
}

/** The recency sort's one label, roster-wide. Every family's dimension file
 *  spells its first sort option with this (the `value` differs per family,
 *  `recent` or `lastActivity`, and stays); the census at web 06ada339 found
 *  three spellings across 27 files, and sentence case is the sweep's rule. */
export const RECENT_ACTIVITY_LABEL = "Recent activity";

export interface SortControlProps {
  options: SortOption[];
  sortBy: string;
  sortOrder: "asc" | "desc";
  onChange: (sortBy: string, sortOrder: "asc" | "desc") => void;
}

export function SortControl({ options, sortBy, sortOrder, onChange }: SortControlProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const current = options.find((o) => o.value === sortBy)?.label ?? "Sort";

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(sortBy, sortOrder === "asc" ? "desc" : "asc")}
        className={`${CTRL_GHOST} ${CTRL_OFF} w-8 h-8 rounded-md`}
        aria-label={sortOrder === "asc" ? "Sort ascending — click to flip" : "Sort descending — click to flip"}
        title={sortOrder === "asc" ? "Ascending" : "Descending"}
      >
        {sortOrder === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
      </button>
      <div className="relative h-8" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className={`${CTRL_GHOST} ${open ? CTRL_ON : CTRL_OFF} gap-2 px-3 h-8 rounded-md text-xs font-medium min-w-[150px]`}
          aria-expanded={open}
        >
          <span>{current}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-rb-500 ml-auto transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
        {open && (
          <div className="absolute top-full right-0 mt-2 z-50 min-w-[200px] overflow-hidden overlay-panel" role="menu">
            <div className="flex items-center px-4 py-3">
              <span className={OVERLAY_HEADING}>Sort</span>
            </div>
            <div className="my-1 mx-3 border-t border-rb-300 dark:border-rb-700" />
            {options.map((o) => (
              <button
                key={o.value}
                onClick={() => {
                  onChange(o.value, sortOrder);
                  setOpen(false);
                }}
                className={`overlay-item ${o.value === sortBy ? "overlay-item-active" : ""}`}
                role="menuitem"
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
