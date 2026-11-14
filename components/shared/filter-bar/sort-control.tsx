"use client";

// SortPill — the listing's sort as one pill (N1.3, ui-jobs 681): "↓ Recent
// activity ⌄", opening an editor with the sort keys and Ascending /
// Descending. A pick applies at once, as the sort always has. State-free: it
// reads sortBy/sortOrder and reports changes; the caller owns where that state
// lives (URL param object).

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { SortPillButton } from "@/components/shared/filter-bar/filter-pill";
import { EditorShell, usePhone, type EditorLeave } from "@/components/shared/filter-bar/pill-editor";
import { sortSpoken } from "@/components/shared/filter-bar/pill-model";

export interface SortOption {
  value: string;
  label: string;
}

/** The recency sort's one label, roster-wide. Every family's dimension file
 *  spells its first sort option with this (the `value` differs per family,
 *  `recent` or `lastActivity`, and stays); the census at web 06ada339 found
 *  three spellings across 27 files, and sentence case is the sweep's rule. */
export const RECENT_ACTIVITY_LABEL = "Recent activity";

export interface SortPillProps {
  options: SortOption[];
  sortBy: string;
  sortOrder: "asc" | "desc";
  onChange: (sortBy: string, sortOrder: "asc" | "desc") => void;
}

const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

export function SortPill({ options, sortBy, sortOrder, onChange }: SortPillProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.value === sortBy)?.label ?? "Sort";
  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  // Below sm a pick closes the sheet first and then writes the URL, so the
  // sheet's history entry has left (pill-editor `EditorLeave`); from sm the
  // order stays open for another pick.
  const isPhone = usePhone() === true;
  const sheetClose = useRef<EditorLeave | null>(null);
  const pickThenClose = (write: () => void) => {
    if (isPhone && sheetClose.current) sheetClose.current(write);
    else {
      write();
      close();
    }
  };

  return (
    <div className="relative shrink-0" ref={anchorRef} data-anatomy="N1.3">
      <SortPillButton
        label={current}
        order={sortOrder}
        spoken={sortSpoken(current, sortOrder)}
        expanded={open}
        onOpen={() => setOpen((o) => !o)}
        buttonRef={buttonRef}
      />
      {open && (
        <EditorShell
          title="Sort"
          onClose={close}
          anchorRef={anchorRef}
          anatomy="N1.3.1"
          align="end"
          sheetCloseRef={sheetClose}
        >
          <div role="radiogroup" aria-label="Sort by" className="flex flex-col">
            {options.map((o) => {
              const on = o.value === sortBy;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pickThenClose(() => onChange(o.value, sortOrder))}
                  className={`flex min-h-11 sm:min-h-9 w-full items-center gap-3 rounded-md px-1 text-left text-sm hover:bg-rb-100 dark:hover:bg-rb-800 ${FOCUS} ${on ? "font-semibold" : ""}`}
                  data-sort-option={o.value}
                >
                  <span className="flex-1">{o.label}</span>
                  {on && <Check className="size-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <div
            role="radiogroup"
            aria-label="Order"
            className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-rb-100 p-1 dark:bg-rb-900"
          >
            {(["asc", "desc"] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                role="radio"
                aria-checked={dir === sortOrder}
                onClick={() => (isPhone ? pickThenClose(() => onChange(sortBy, dir)) : onChange(sortBy, dir))}
                className={`h-10 sm:h-9 rounded-lg text-sm transition-colors ${FOCUS} ${
                  dir === sortOrder
                    ? "bg-background font-semibold text-foreground shadow-sm dark:bg-rb-700"
                    : "text-rb-500 dark:text-rb-400/75 hover:text-foreground"
                }`}
                data-sort-order={dir}
              >
                {dir === "asc" ? "Ascending" : "Descending"}
              </button>
            ))}
          </div>
        </EditorShell>
      )}
    </div>
  );
}
