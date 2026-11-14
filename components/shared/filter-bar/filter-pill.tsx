"use client";

/**
 * FilterPill (N1.10, ui-jobs 681): one editable pill of a listing's toolbar.
 * Three states, worked out in ./pill-model:
 *   unset   — dashed outline, muted, "+ Market"; the whole pill opens the editor.
 *   set     — tonal teal fill and border, muted label and bold value
 *             ("Status Open"); the main area opens the editor and a sibling ×
 *             removes the filter (two buttons side by side, never nested).
 *   default — drawn as set, a chevron in place of the × (the group rests on a
 *             default it cannot drop); its editor offers "Reset to default".
 * Teal marks a control (color-grammar §4c). Presentational only: the caller
 * owns the editor and the filters, so any other surface can draw the same pill
 * from ./pill-model.
 */

import type { ReactNode, Ref } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Plus, X } from "lucide-react";
import type { PillState } from "@/components/shared/filter-bar/pill-model";

/** 44px on a phone, 40px from sm; fully rounded. */
const PILL_BASE =
  "inline-flex shrink-0 items-center h-11 sm:h-10 rounded-full text-sm whitespace-nowrap transition-colors";
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
/** Muted text on and around the pills, at 4.5:1 or more on its ground in
 *  both themes (dark rb-500 measures 3.8:1 on the page; rb-400 at 75% clears
 *  it). */
export const PILL_MUTED = "text-rb-500 dark:text-rb-400/75";
const LABEL = PILL_MUTED;
/** The set pill's tonal fill and border. */
export const PILL_SET_TONE = "border border-teal-600/35 bg-teal-500/[0.06] dark:border-teal-400/30 dark:bg-teal-400/10";
const PILL_SET = `${PILL_SET_TONE} hover:bg-teal-500/10 dark:hover:bg-teal-400/15`;
const PILL_UNSET = `border border-dashed border-rb-400 dark:border-rb-500/60 ${PILL_MUTED} hover:text-foreground hover:border-rb-500`;
/** The sort pill and the Filters button: a neutral filled pill. */
export const PILL_NEUTRAL =
  "border border-rb-200 bg-rb-100 text-foreground hover:bg-rb-200 dark:border-rb-700 dark:bg-rb-800 dark:hover:bg-rb-700";

export interface FilterPillProps {
  /** The group's name, for the data hook and the × button's name. */
  name: string;
  state: PillState;
  locked: boolean;
  label: string;
  value: string;
  /** The pill's accessible name: "Status Open", "Add Market filter". */
  spoken: string;
  expanded: boolean;
  onOpen: () => void;
  onRemove: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
  /** The editor, drawn beside the pill (a popover anchors to the pill). */
  children?: ReactNode;
}

export function FilterPill({
  name,
  state,
  locked,
  label,
  value,
  spoken,
  expanded,
  onOpen,
  onRemove,
  buttonRef,
  children,
}: FilterPillProps) {
  const hooks = { "data-filter-pill": name, "data-pill-state": state, "data-anatomy": "N1.10" };
  if (state === "unset") {
    return (
      <div className="relative shrink-0" {...hooks}>
        <button
          ref={buttonRef}
          type="button"
          onClick={onOpen}
          className={`${PILL_BASE} ${PILL_UNSET} ${FOCUS} gap-1.5 pl-3 pr-3.5`}
          aria-haspopup="dialog"
          aria-expanded={expanded}
          aria-label={spoken}
          data-pill-open=""
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {name}
        </button>
        {children}
      </div>
    );
  }
  const removable = !locked;
  return (
    <div className="relative shrink-0" {...hooks}>
      <div className={`${PILL_BASE} ${PILL_SET} text-foreground`}>
        <button
          ref={buttonRef}
          type="button"
          onClick={onOpen}
          className={`flex h-full min-w-0 max-w-[180px] items-center gap-1.5 rounded-full pl-3.5 ${removable ? "pr-1" : "pr-3"} ${FOCUS}`}
          aria-haspopup="dialog"
          aria-expanded={expanded}
          aria-label={spoken}
          data-pill-open=""
        >
          {label && <span className={`shrink-0 ${LABEL}`}>{label}</span>}
          <span className="min-w-0 truncate font-semibold">{value}</span>
          {!removable && <ChevronDown className={`size-3.5 shrink-0 ${LABEL}`} aria-hidden="true" />}
        </button>
        {removable && (
          <button
            type="button"
            onClick={onRemove}
            className={`flex h-full w-9 shrink-0 items-center justify-center rounded-full ${LABEL} hover:text-foreground ${FOCUS}`}
            aria-label={`Remove ${name} filter`}
            data-pill-remove=""
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/** The sort as one pill: "↓ Recent activity ⌄" (N1.3). */
export function SortPillButton({
  label,
  order,
  spoken,
  expanded,
  onOpen,
  buttonRef,
}: {
  label: string;
  order: "asc" | "desc";
  spoken: string;
  expanded: boolean;
  onOpen: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const Arrow = order === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onOpen}
      className={`${PILL_BASE} ${PILL_NEUTRAL} ${FOCUS} gap-1.5 px-3.5`}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-label={spoken}
      data-sort-pill=""
    >
      <Arrow className="size-4" aria-hidden="true" />
      <span>{label}</span>
      <ChevronDown className="size-3.5 text-rb-500" aria-hidden="true" />
    </button>
  );
}
