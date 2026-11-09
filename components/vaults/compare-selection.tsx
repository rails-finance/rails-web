"use client";

// Choosing vaults to compare (rails-ops ui-jobs 553, door 3): the tick on each
// asset-step card and each /vaults row (E2), and the bar that opens
// /vaults/compare once two to four are ticked (E3). The selection is client
// state, kept in sessionStorage so it carries between the two surfaces; every
// read and write is guarded, and without storage the selection lives for the
// page. A fifth tick is refused with a plain line (lib/vaults/compare.ts).
//
// The tick never takes the row's or the card's link: on a linked row
// (components/shared/data-table) it stands above the cell's cover, and on a
// card it sits beside the card's link, not inside it.

import { useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { COMPARE_MIN, compareHref, toggleCompare } from "@/lib/vaults/compare";
import { COMPARE_BAR, COMPARE_TICK } from "@/lib/vaults/compare-words";

const STORAGE_KEY = "rails.vault-compare";

interface CompareState {
  keys: string[];
  /** The last tick was refused: the bar says why until the next change. */
  refused: boolean;
}

const EMPTY: CompareState = { keys: [], refused: false };
let state: CompareState | null = null;
const listeners = new Set<() => void>();

function read(): CompareState {
  if (state) return state;
  let keys: string[] = [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) keys = parsed.filter((k): k is string => typeof k === "string");
  } catch {
    // No storage: the selection lives for this page.
  }
  state = { keys, refused: false };
  return state;
}

function write(next: CompareState) {
  state = next;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next.keys));
  } catch {
    // As above.
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The selection, and its two changes. */
export function useCompareSelection() {
  const s = useSyncExternalStore(subscribe, read, () => EMPTY);
  const toggle = useCallback((key: string) => {
    const { keys, refused } = toggleCompare(read().keys, key);
    write({ keys, refused });
  }, []);
  const clear = useCallback(() => write({ keys: [], refused: false }), []);
  return { ...s, toggle, clear };
}

/** Above a linked row's cover (z-10), as the row's own controls are; the
 *  caller positions it (`relative` in a cell, `absolute` on a card). */
const TICK =
  "z-10 inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-rb-500 select-none hover:text-foreground focus-within:ring-2 focus-within:ring-teal-600 dark:focus-within:ring-teal-400";

/** One vault's tick. `className` places it (a card's corner, a row's cell). */
export function CompareTick({
  vaultKey,
  name,
  className = "relative",
}: {
  vaultKey: string;
  name: string;
  className?: string;
}) {
  const { keys, toggle } = useCompareSelection();
  const on = keys.includes(vaultKey);
  return (
    <label className={`${TICK} ${className}`} data-anatomy="E2" data-compare-tick={vaultKey}>
      <input
        type="checkbox"
        checked={on}
        onChange={() => toggle(vaultKey)}
        aria-label={COMPARE_TICK.aria(name)}
        className="h-3.5 w-3.5 accent-teal-600 dark:accent-teal-400"
        data-compare-checked={on ? "" : undefined}
      />
      <span aria-hidden>{COMPARE_TICK.label}</span>
    </label>
  );
}

/** The bar: shown with two to four ticked, fixed to the foot of the window. */
export function CompareBar() {
  const { keys, refused, clear } = useCompareSelection();
  if (keys.length < COMPARE_MIN) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4"
      data-anatomy="E3"
      data-compare-bar={keys.length}
    >
      <div
        role="region"
        aria-label={COMPARE_BAR.label}
        className="pointer-events-auto flex max-w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-rb-200 bg-raised px-4 py-2.5 text-sm shadow-lg dark:border-rb-600"
      >
        <Link href={compareHref(keys)} className={`font-semibold ${INLINE_LINK}`} data-compare-go="">
          {COMPARE_BAR.go(keys.length)}
        </Link>
        <button
          type="button"
          onClick={clear}
          className="rounded text-teal-600 hover:underline focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none dark:text-teal-400 dark:focus-visible:ring-teal-400"
          data-compare-clear=""
        >
          {COMPARE_BAR.clear}
        </button>
        {refused && (
          <span className="basis-full text-rb-500" role="status" data-compare-refused="">
            {COMPARE_BAR.refused}
          </span>
        )}
      </div>
    </div>
  );
}
