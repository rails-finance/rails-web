"use client";

/**
 * FilterPill (N1.10, ui-jobs 681): one editable pill of a listing's toolbar.
 * Three states, worked out in ./pill-model:
 *   unset   — not drawn (ui-jobs 801): the Filters button reaches the group.
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
import { ArrowDown, ArrowUp, ChevronDown, X } from "lucide-react";
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
/** The sort pill and the Filters button: a neutral filled pill. */
export const PILL_NEUTRAL =
  "border border-rb-200 bg-rb-100 text-foreground hover:bg-rb-200 dark:border-rb-700 dark:bg-rb-800 dark:hover:bg-rb-700";

export interface FilterPillProps {
  /** The group's name, for the data hook and the × button's name. */
  name: string;
  state: PillState;
  locked: boolean;
  /** Fixed from outside: plain text, no editor, no ×. */
  pinned?: boolean;
  label: string;
  value: string;
  /** The pill's accessible name: "Status Open". */
  spoken: string;
  expanded: boolean;
  onOpen: () => void;
  onRemove: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
  /** The editor, drawn beside the pill (a popover anchors to the pill). */
  children?: ReactNode;
  /** Codes after N1.10 where a surface names its pills (the timeline's
   *  L1.3–L1.7). */
  anatomy?: string;
  /** Data hooks on the pill's main button (the timeline's Date pill keeps
   *  `data-date-control`). */
  openData?: Record<string, string>;
}

export function FilterPill({
  name,
  state,
  locked,
  pinned = false,
  label,
  value,
  spoken,
  expanded,
  onOpen,
  onRemove,
  buttonRef,
  children,
  anatomy,
  openData,
}: FilterPillProps) {
  const hooks = {
    "data-filter-pill": name,
    "data-pill-state": state,
    "data-anatomy": anatomy ? `N1.10 ${anatomy}` : "N1.10",
  };
  // An unset group draws no pill: the Filters button reaches it (ui-jobs 801).
  if (state === "unset") return null;
  if (pinned) {
    return (
      <div className="relative shrink-0" {...hooks}>
        <div className={`${PILL_BASE} ${PILL_SET_TONE} gap-1.5 px-3.5 text-foreground`}>
          {label && <span className={`shrink-0 ${LABEL}`}>{label}</span>}
          <span className="min-w-0 truncate font-semibold">{value}</span>
        </div>
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
          {...openData}
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

/** A set pill that is not an axis: the timeline's chart cut, "Timeline to
 *  7 Oct '26 ×" (L2.1, ui-jobs 764), in the set pill's tone, height, radius
 *  and ×, with a glyph at its start. The main button runs `onPress`, the ×
 *  `onRemove`; each carries data hooks. */
export function FilterPillChip({
  icon,
  label,
  value,
  title,
  removeLabel,
  onPress,
  onRemove,
  data,
  pressData,
  removeData,
}: {
  icon: ReactNode;
  /** Muted before the value, as a set pill's axis name: "Timeline to". */
  label?: string;
  value: string;
  title: string;
  removeLabel: string;
  onPress: () => void;
  onRemove: () => void;
  data?: Record<string, string>;
  pressData?: Record<string, string>;
  removeData?: Record<string, string>;
}) {
  return (
    <div className="relative shrink-0" {...data}>
      <div className={`${PILL_BASE} ${PILL_SET} text-foreground`}>
        <button
          type="button"
          onClick={onPress}
          title={title}
          className={`flex h-full min-w-0 items-center gap-1.5 rounded-full pl-3 pr-1 ${FOCUS}`}
          {...pressData}
        >
          {icon}
          {label && <span className={`shrink-0 ${LABEL}`}>{label}</span>}
          {label && " "}
          <span className="min-w-0 truncate font-semibold">{value}</span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          className={`flex h-full w-9 shrink-0 items-center justify-center rounded-full ${LABEL} hover:text-foreground ${FOCUS}`}
          aria-label={removeLabel}
          {...removeData}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** A resting icon button's place, held empty, unseen and out of the
 *  accessibility tree, so the row does not move when the button arrives (the
 *  timeline's Date button while its page's panel reads, ui-jobs 764). */
export function FilterPillReserve({ name }: { name: string }) {
  return <span aria-hidden="true" className="invisible size-11 shrink-0 sm:size-10" data-pill-reserve={name} />;
}

/** A round icon button of the toolbar row, in the neutral pill's tone: 44px
 *  on a phone, 40px from sm (the search, the Filters button, the resting
 *  sort and the timeline's resting Date; ui-jobs 801). */
export const PILL_ICON_BUTTON = `${PILL_NEUTRAL} ${FOCUS} inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors sm:size-10`;

/** The sort (N1.3): its arrow alone on the listing's resting sort, and
 *  "↓ Collateral ⌄" on any other (ui-jobs 801). */
export function SortPillButton({
  label,
  named,
  order,
  spoken,
  expanded,
  onOpen,
  buttonRef,
}: {
  label: string;
  /** False on the resting sort: the arrow stands alone. */
  named: boolean;
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
      className={named ? `${PILL_BASE} ${PILL_NEUTRAL} ${FOCUS} gap-1.5 px-3.5` : PILL_ICON_BUTTON}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-label={spoken}
      title={named ? undefined : spoken}
      data-sort-pill={named ? "named" : "arrow"}
    >
      <Arrow className="size-4" aria-hidden="true" />
      {named && <span>{label}</span>}
      {named && <ChevronDown className="size-3.5 text-rb-500" aria-hidden="true" />}
    </button>
  );
}
