"use client";

/**
 * FilterSheet — every filter at once (ui-jobs 544, 801): the Filters button in
 * the toolbar's row (the list-filter glyph; below sm a badge with how many
 * groups are set, ui-jobs 681). Below sm it opens a bottom sheet over a scrim.
 * From sm it opens a panel in the page, in the toolbar's `slot` under the row
 * and above the results: the filters that open a sub-view at the left, the
 * Size ranges in the middle, the section's other filters and the primary
 * button at the right; a second press on the button closes it.
 * The sheet lists one row per dimension, its name at the left and the current
 * choice with a chevron at the right; a row opens that dimension's options
 * (multi, or single with three or more) as a sub-view with its own back
 * control. Short choices sit in the list: a single dimension with one option
 * is on or off, a switch in its row; one with two options is a segmented
 * "Any / A / B" under its name ("A / B" where the dimension rests on one of
 * them, a preset); a range draws its slider under its name.
 * The footer holds "Reset" (every dimension back to its default) and
 * the primary button: the count the edits would give where the listing counts
 * a draft from rows it holds, else "Apply".
 *
 * Edits are staged: the sheet holds a draft of the filters, and only the
 * primary button writes it, through the same `onChange` the desktop panels
 * use (so the URL, Save listing and Copy link follow). Its count is the
 * listing's own until the draft changes, then `countFor(draft)`, which runs
 * the listing's own filtering (in memory, or the server's total). Escape and
 * the back control at the top close the sheet and drop the draft; a facet's
 * back returns to the list keeping it.
 *
 * Below sm a modal dialog: focus is held inside while it is open and returns
 * to the Filters button on close; the page behind does not scroll. The panel
 * in the page is a labelled region and holds neither.
 *
 * Browser back steps back inside the sheet (a phone's edge swipe or back
 * button fires it): opening the sheet and opening a sub-view each push a
 * history entry at the same URL, marked in `history.state[SHEET_STATE]`, and
 * popstate closes the sub-view or the sheet (dropping the draft, as Escape
 * does). The sheet's own controls leave through the same entries, so none is
 * left behind, and Show writes the draft only once they are gone. A sub-view
 * also returns to the list on a swipe to the right.
 */

import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, ListFilter, Minus, X } from "lucide-react";
import { CTRL_GHOST, CTRL_OFF, RESET_LINK } from "@/lib/shared/ui-grammar";
import { PILL_ICON_BUTTON } from "@/components/shared/filter-bar/filter-pill";
import { PRIMARY_BUTTON, usePhone } from "@/components/shared/filter-bar/pill-editor";
import { activeGroupCount, groupDimensions } from "@/components/shared/filter-bar/pill-model";
import {
  type FilterDimension,
  type FilterOptionDef,
  isDimensionActive,
  joinOptionLabels,
  rangeChipLabel,
} from "@/components/shared/filter-bar/types";
import {
  isOptionSearchable,
  narrowOptions,
  optionCapNote,
  OptionSearchInput,
  OptionSearchNote,
} from "@/components/shared/filter-bar/option-search";
import { RangeControl } from "@/components/shared/filter-bar/range-control";

export interface FilterSheetProps<F> {
  dimensions: FilterDimension<F>[];
  filters: F;
  onChange: (next: F) => void;
  /** The listing's result count and noun, read by the footer's button. */
  count?: { total: number; noun: string };
  /** True while the listing re-reads after an edit: the count is the last
   *  settled one until it lands. */
  countPending?: boolean;
  /** The count a draft would give, from rows the listing holds. Without it
   *  the button reads "Apply". */
  countFor?: (draft: F) => number | Promise<number>;
  /** The noun for a draft, where the selection names it ("open positions"
   *  while Status rests on Open). Without it, `count.noun`. */
  nounFor?: (draft: F) => string;
  /** The element under the toolbar's row that the filters open in from sm
   *  (ui-jobs 801): a panel in the page, above the results. Without it the
   *  sheet opens at the right edge from sm. */
  slot?: HTMLElement | null;
  /** Told when the panel in the page opens and closes, so the toolbar can
   *  set its other controls back while the filters hold the focus. */
  onPanelOpenChange?: (open: boolean) => void;
}

/** Wait after a draft edit before counting it, so a run of taps costs one read. */
const COUNT_DELAY_MS = 250;

/** The `history.state` key the sheet's entries carry: "list" or "view". */
const SHEET_STATE = "filterSheet";
const sheetState = (): string | undefined =>
  (window.history.state as Record<string, unknown> | null)?.[SHEET_STATE] as string | undefined;

/** A swipe returns when it passes this share of the view's width, or ends
 *  faster than SWIPE_FLICK px/ms. */
const SWIPE_SHARE = 1 / 3;
const SWIPE_FLICK = 0.5;
const SWIPE_MS = 180;

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** The groups the sheet draws together as one section, and its heading. */
const SECTION_GROUPS = ["Size", "Transactions", "History"];
const SECTION_TITLE = "Size and history";
/** In the page a column's last row has no rule under it. */
const LAST_ROW_OPEN = "[&>li:last-child]:border-b-0";

/** The dimension back at its default. */
const resetDim = <F,>(dim: FilterDimension<F>, f: F): F => dim.set(f, dim.defaultValues?.(f) ?? []);

/** A dimension that is on or off: one option, picked or not. */
const isToggle = <F,>(dim: FilterDimension<F>) => dim.cardinality === "single" && dim.options.length === 1;

/** A dimension short enough to choose in place: Any or one of two. */
const isSegmented = <F,>(dim: FilterDimension<F>) => dim.cardinality === "single" && dim.options.length === 2;

/** The row's right-hand text: the current choice in the option words. */
function currentChoice<F>(dim: FilterDimension<F>, f: F): string {
  if (!isDimensionActive(dim, f)) {
    const def = dim.defaultChip?.(f);
    if (!def) return "Any";
    return def.startsWith(`${dim.label}: `) ? def.slice(dim.label.length + 2) : def;
  }
  const vals = dim.get(f);
  if (dim.cardinality === "range") {
    return rangeChipLabel(dim.label, vals, dim.range?.usd, dim.range?.unit).replace(`${dim.label}: `, "");
  }
  if (dim.cardinality === "multi" && vals.length === dim.options.length) return "All";
  return joinOptionLabels(vals, dim.options);
}

export function FilterSheet<F>({
  dimensions,
  filters,
  onChange,
  count,
  countPending,
  countFor,
  nounFor,
  slot,
  onPanelOpenChange,
}: FilterSheetProps<F>) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const phone = usePhone();
  const inline = slot != null && phone === false;
  // The open sheet's own close, so a second press on the button leaves
  // through the sheet's history entries.
  const requestClose = useRef<(() => void) | null>(null);
  const panelOpen = open && inline;
  const onPanelOpenChangeRef = useRef(onPanelOpenChange);
  onPanelOpenChangeRef.current = onPanelOpenChange;
  useEffect(() => {
    onPanelOpenChangeRef.current?.(panelOpen);
  }, [panelOpen]);
  // The badge counts what the pills show set: groups off their default.
  const active = activeGroupCount(groupDimensions(dimensions, filters), filters);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (open) {
            requestClose.current?.();
            return;
          }
          // The sheet's history entry, at the same URL (no query change, so
          // Copy link and the listing do not see it).
          window.history.pushState({ [SHEET_STATE]: "list" }, "");
          setOpen(true);
        }}
        className={`${PILL_ICON_BUTTON} relative ${open && inline ? "border-teal-600! dark:border-teal-400!" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={active > 0 ? `Filters, ${active} active` : "Filters"}
        title="Filters"
        data-filter-sheet-open=""
        data-anatomy="N1.8.1"
      >
        <ListFilter className="w-[18px] h-[18px]" aria-hidden="true" />
        {/* Below sm the set chips can scroll out of sight, so the button
            counts them; from sm the chips beside it say it. */}
        {active > 0 && (
          <span
            className="absolute -right-1 -top-1 inline-flex min-w-5 h-5 px-1 items-center justify-center rounded-full bg-teal-700 text-white dark:bg-teal-400 dark:text-rb-900 text-xs font-bold tabular-nums sm:hidden"
            aria-hidden="true"
            data-filter-sheet-count={active}
            data-prov-exempt
          >
            {active}
          </span>
        )}
      </button>
      {open && (
        <Sheet
          dimensions={dimensions}
          applied={filters}
          onApply={onChange}
          count={count}
          countPending={countPending}
          countFor={countFor}
          nounFor={nounFor}
          inline={inline}
          slot={slot}
          requestCloseRef={requestClose}
          onClose={() => {
            setOpen(false);
            buttonRef.current?.focus();
          }}
        />
      )}
    </>
  );
}

function Sheet<F>({
  dimensions,
  applied,
  onApply,
  count,
  countPending,
  countFor,
  nounFor,
  inline,
  slot,
  requestCloseRef,
  onClose,
}: {
  inline: boolean;
  slot?: HTMLElement | null;
  requestCloseRef: MutableRefObject<(() => void) | null>;
  dimensions: FilterDimension<F>[];
  applied: F;
  onApply: (next: F) => void;
  count?: { total: number; noun: string };
  countPending?: boolean;
  countFor?: (draft: F) => number | Promise<number>;
  nounFor?: (draft: F) => string;
  onClose: () => void;
}) {
  // The staged filters: every control in the sheet reads and writes these.
  const [filters, setDraft] = useState<F>(applied);
  // The newest draft, for Show after a range flush has written one this tick.
  const draftRef = useRef<F>(applied);
  const onChange = (next: F) => {
    draftRef.current = next;
    setDraft(next);
  };
  // Each range row's pending slider move, written before Show.
  const flushers = useRef(new Map<string, MutableRefObject<(() => void) | null>>());
  const flushFor = (id: string) => {
    let r = flushers.current.get(id);
    if (!r) flushers.current.set(id, (r = { current: null }));
    return r;
  };
  const flushRanges = () => flushers.current.forEach((r) => r.current?.());
  const dirty = filters !== applied;
  const dims = dimensions.filter((d) => !d.available || d.available(filters));

  // The draft's count, read after a short pause; null until it lands (or
  // when the read fails, and the button then names no figure).
  const [draftCount, setDraftCount] = useState<number | null>(count?.total ?? null);
  const [draftPending, setDraftPending] = useState(false);
  const countForRef = useRef(countFor);
  countForRef.current = countFor;
  useEffect(() => {
    if (!dirty || !countForRef.current) return;
    let cancelled = false;
    setDraftPending(true);
    const t = window.setTimeout(() => {
      Promise.resolve()
        .then(() => countForRef.current!(filters))
        .then(
          (n) => !cancelled && setDraftCount(n),
          () => !cancelled && setDraftCount(null),
        )
        .finally(() => !cancelled && setDraftPending(false));
    }, COUNT_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [filters, dirty]);

  // The dimension whose options are open, or null for the list.
  const [openId, setOpenId] = useState<string | null>(null);
  // The row a sub-view was opened from, given focus again on the way back.
  const returnTo = useRef<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const applyRef = useRef(onApply);
  applyRef.current = onApply;
  const openIdRef = useRef(openId);
  openIdRef.current = openId;

  // History: how many of the sheet's entries stand above the listing's (1
  // with the list showing, 2 with a sub-view), and the draft Show writes once
  // they are gone.
  const depth = useRef(1);
  const pendingApply = useRef<{ draft: F } | null>(null);
  const closing = useRef(false);
  const finished = useRef(false);
  const fallback = useRef<number | undefined>(undefined);
  const finishClose = () => {
    if (finished.current) return;
    finished.current = true;
    window.clearTimeout(fallback.current);
    const p = pendingApply.current;
    closeRef.current();
    if (p) applyRef.current(p.draft);
  };
  /** Close, writing `draft` when given; the sheet's entries go first. */
  const closeSheet = (draft?: F) => {
    if (closing.current) return;
    closing.current = true;
    pendingApply.current = draft !== undefined ? { draft } : null;
    const n = depth.current;
    depth.current = 0;
    if (n > 0 && sheetState()) {
      window.history.go(-n);
      // Should popstate never come, close anyway.
      fallback.current = window.setTimeout(finishClose, 800);
    } else finishClose();
  };
  const openSub = (id: string) => {
    window.history.pushState({ [SHEET_STATE]: "view" }, "");
    depth.current = 2;
    setOpenId(id);
  };
  /** Back to the list, keeping the draft: through history when the sub-view
   *  has its entry, so popstate does the rest. */
  const leaveSub = () => {
    if (depth.current === 2 && sheetState() === "view") window.history.back();
    else {
      returnTo.current = openIdRef.current;
      setOpenId(null);
    }
  };

  useEffect(() => {
    const onPop = () => {
      const st = sheetState();
      if (st === "list") {
        depth.current = 1;
        if (openIdRef.current) {
          returnTo.current = openIdRef.current;
          setOpenId(null);
        }
      } else if (!st) {
        depth.current = 0;
        finishClose();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.clearTimeout(fallback.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads refs only
  }, []);

  const openDim = dims.find((d) => d.id === openId) ?? null;

  // Focus lands on the view's back control as it opens, and on the row it
  // came from when a sub-view closes.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (openId == null && returnTo.current) {
      panel.querySelector<HTMLElement>(`[data-filter-sheet-row="${returnTo.current}"]`)?.focus();
      returnTo.current = null;
      return;
    }
    panel.querySelector<HTMLElement>("[data-filter-sheet-back]")?.focus();
  }, [openId]);

  const closeSheetRef = useRef(() => closeSheet());
  closeSheetRef.current = () => closeSheet();
  requestCloseRef.current = closeSheetRef.current;
  // In the page (from sm, in the toolbar's slot) the filters are no modal:
  // the page scrolls and Tab moves on through it. Read once, as it opens.
  const modal = useRef(!inline).current;

  // Escape closes; Tab cycles inside the sheet; the page does not scroll.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        closeSheetRef.current();
        return;
      }
      if (!modal || e.key !== "Tab" || !panelRef.current) return;
      const els = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || !panelRef.current.contains(at))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (at === last || !panelRef.current.contains(at))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    if (modal) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (modal) document.body.style.overflow = prev;
    };
  }, [modal]);

  const anyActive = dims.some((d) => isDimensionActive(d, filters));
  const clearAll = () => {
    let next = filters;
    for (const dim of dims) next = resetDim(dim, next);
    onChange(next);
  };

  // Unedited, the listing's own count; edited, the draft's once read (the
  // last figure stays, dimmed, while a read is in flight).
  const shown = dirty ? (countFor ? draftCount : null) : (count?.total ?? null);
  const pending = dirty ? draftPending : countPending;
  const noun = count ? (dirty && nounFor ? nounFor(filters) : count.noun) : "";
  const showLabel =
    count && shown != null && (countFor || !dirty)
      ? `Show ${shown.toLocaleString("en-US")} ${shown === 1 ? noun.replace(/s$/, "") : noun}`
      : "Apply";
  const apply = () => {
    flushRanges();
    closeSheet(draftRef.current !== applied ? draftRef.current : undefined);
  };

  // One dimension's row in the list.
  const dimRow = (dim: FilterDimension<F>) => (
    <li key={dim.id} className="border-b border-rb-200 dark:border-rb-800">
      {dim.pinned?.(filters) ? (
        // Fixed from outside (a search naming a market): its choice
        // as plain text, with nothing to pick.
        <div
          className="flex w-full min-h-14 items-center gap-3 py-3"
          data-filter-sheet-row={dim.id}
          data-filter-sheet-pinned=""
        >
          <span className="text-sm">{dim.label}</span>
          <span className="ml-auto truncate text-sm font-medium text-foreground">{currentChoice(dim, filters)}</span>
        </div>
      ) : isToggle(dim) ? (
        <ToggleRow dim={dim} filters={filters} onChange={onChange} />
      ) : isSegmented(dim) ? (
        <SegmentRow dim={dim} filters={filters} onChange={onChange} />
      ) : dim.cardinality === "range" ? (
        <RangeRow
          dim={dim}
          filters={filters}
          // A delayed slider write lands on the newest draft, so it
          // never undoes an edit made in another row meanwhile.
          onChange={(next) => onChange(dim.set(draftRef.current, dim.get(next)))}
          flushRef={flushFor(dim.id)}
        />
      ) : (
        <button
          type="button"
          onClick={() => openSub(dim.id)}
          className="flex w-full min-h-14 items-center gap-3 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          data-filter-sheet-row={dim.id}
          data-anatomy="N1.8.3"
        >
          <span className="text-sm">{dim.label}</span>
          <span
            className={`ml-auto truncate text-sm ${isDimensionActive(dim, filters) ? "text-foreground font-medium" : "text-rb-500"}`}
          >
            {currentChoice(dim, filters)}
          </span>
          <ChevronRight className="w-4 h-4 shrink-0 text-rb-500" aria-hidden="true" />
        </button>
      )}
    </li>
  );
  // Size, Transactions and History as one section, where the first of them
  // stood (ui-jobs 801); every other dimension keeps its row.
  const inSection = (d: FilterDimension<F>) => SECTION_GROUPS.includes(d.group ?? d.label);
  const sectioned = dims.filter(inSection);
  const section = sectioned.length > 1 ? sectioned : [];
  const plain = dims.filter((d) => !section.includes(d));
  const sizeDims = section.filter((d) => (d.group ?? d.label) === SECTION_GROUPS[0]);
  // In the page: the Size ranges in the middle column, the section's other
  // dimensions in the last.
  const sectionA = sizeDims.length > 0 && sizeDims.length < section.length ? sizeDims : section;
  const sectionB = section.filter((d) => !sectionA.includes(d));
  const listItems = dims.flatMap((dim) => {
    if (!section.includes(dim)) return [dimRow(dim)];
    if (dim !== section[0]) return [];
    return [
      <li key="section" data-filter-sheet-section="" data-anatomy="N1.8.10">
        <h3 className="pt-5 pb-1 text-xs font-semibold text-rb-500 dark:text-rb-400/75">{SECTION_TITLE}</h3>
        <ul>{section.map(dimRow)}</ul>
      </li>,
    ];
  });

  const title = openDim ? openDim.label : "Filters";

  if (typeof document === "undefined") return null;

  const resetOpenDim = openDim && isDimensionActive(openDim, filters) && (
    <button type="button" onClick={() => onChange(resetDim(openDim, filters))} className={`${RESET_LINK} px-3 py-2`}>
      Reset
    </button>
  );
  const showButton = (cls: string) => (
    <button
      type="button"
      onClick={apply}
      className={`${cls} text-sm ${PRIMARY_BUTTON}`}
      aria-busy={pending || undefined}
      data-filter-sheet-show={shown ?? ""}
    >
      <span aria-live="polite" className={`tabular-nums transition-opacity ${pending ? "opacity-60" : ""}`}>
        {showLabel}
      </span>
    </button>
  );

  if (inline && slot) {
    const sectionHead = <h3 className="pb-1 text-xs font-semibold text-rb-500 dark:text-rb-400/75">{SECTION_TITLE}</h3>;
    const columns = section.length === 0 ? "lg:grid-cols-2" : "lg:grid-cols-3";
    return createPortal(
      <div
        ref={panelRef}
        role="region"
        aria-labelledby="filter-sheet-title"
        className="mt-3 rounded-2xl bg-raised p-6 text-foreground dark:bg-rb-900 [&_.overlay-search]:bg-raised! dark:[&_.overlay-search]:bg-rb-900!"
        data-filter-sheet="inline"
        data-anatomy="N1.8"
      >
        <h2 id="filter-sheet-title" className="pb-4 text-base font-semibold" data-anatomy="N1.8.2">
          Filters
        </h2>
        <div className={`grid gap-y-4 ${columns} lg:divide-x lg:divide-rb-200 dark:lg:divide-rb-800`}>
          <div className="min-w-0 lg:pr-8">
            {openDim ? (
              <>
                <div className="flex h-12 items-center gap-1 border-b border-rb-200 dark:border-rb-800">
                  <button
                    type="button"
                    onClick={leaveSub}
                    className={`${CTRL_GHOST} ${CTRL_OFF} size-10 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    aria-label="Back to filters"
                    data-filter-sheet-back=""
                  >
                    <ChevronLeft className="w-5 h-5" aria-hidden="true" />
                  </button>
                  <h3 className="flex-1 truncate text-sm font-semibold">{openDim.label}</h3>
                  {resetOpenDim}
                </div>
                <div className="-mx-4 max-h-80 overflow-y-auto overscroll-contain">
                  <DimensionView dim={openDim} filters={filters} onChange={onChange} onPicked={leaveSub} />
                </div>
              </>
            ) : (
              <ul className={LAST_ROW_OPEN}>{plain.map(dimRow)}</ul>
            )}
          </div>
          {section.length > 0 && (
            <div className="min-w-0 lg:px-8" data-filter-sheet-section="" data-anatomy="N1.8.10">
              {sectionHead}
              <ul className={LAST_ROW_OPEN}>{sectionA.map(dimRow)}</ul>
            </div>
          )}
          <div className="flex min-w-0 flex-col lg:pl-8">
            {sectionB.length > 0 && (
              <>
                {/* The heading's line, kept so the two columns' rows start level. */}
                <div className="invisible max-lg:hidden" aria-hidden="true">
                  {sectionHead}
                </div>
                <ul className={LAST_ROW_OPEN}>{sectionB.map(dimRow)}</ul>
              </>
            )}
            <div className="mt-auto flex items-center justify-end gap-4 pt-6" data-anatomy="N1.8.8">
              {anyActive && (
                <button
                  type="button"
                  onClick={clearAll}
                  className={`${RESET_LINK} px-3 py-2`}
                  data-filter-sheet-clear=""
                >
                  Reset
                </button>
              )}
              {showButton("h-11 px-6")}
            </div>
          </div>
        </div>
      </div>,
      slot,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex flex-col justify-end sm:flex-row">
      {/* The scrim: a press on it closes the sheet and drops the draft. */}
      <div className="absolute inset-0 bg-[var(--backdrop-bg)]" onClick={() => closeSheet()} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-sheet-title"
        className="relative flex max-h-[88vh] flex-col rounded-t-2xl bg-raised text-foreground shadow-xl sm:h-full sm:max-h-none sm:w-[400px] sm:rounded-none sm:rounded-l-2xl dark:bg-rb-900 [&_.overlay-search]:bg-raised! dark:[&_.overlay-search]:bg-rb-900!"
        data-filter-sheet=""
        data-anatomy="N1.8"
      >
        <div className="flex h-5 shrink-0 items-center justify-center sm:h-2" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-rb-300 sm:hidden dark:bg-rb-600" />
        </div>
        <div
          className="flex h-12 shrink-0 items-center gap-1 border-b border-rb-200 dark:border-rb-700 px-2"
          data-anatomy="N1.8.2"
        >
          <button
            type="button"
            onClick={() => {
              if (openDim) leaveSub();
              else closeSheet();
            }}
            className={`${CTRL_GHOST} ${CTRL_OFF} size-10 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500`}
            aria-label={openDim ? "Back to filters" : "Close filters"}
            data-filter-sheet-back=""
          >
            {/* From sm the list closes on a ×; a sub-view keeps its back. */}
            <ChevronLeft className={`w-5 h-5 ${openDim ? "" : "sm:hidden"}`} aria-hidden="true" />
            {!openDim && <X className="w-5 h-5 max-sm:hidden" aria-hidden="true" />}
          </button>
          <h2 id="filter-sheet-title" className="flex-1 truncate text-base font-semibold">
            {title}
          </h2>
          {resetOpenDim}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {openDim ? (
            <SwipeBack key={openDim.id} onBack={leaveSub}>
              <DimensionView dim={openDim} filters={filters} onChange={onChange} onPicked={leaveSub} />
            </SwipeBack>
          ) : (
            <ul className="px-4">{listItems}</ul>
          )}
        </div>

        <div
          className="flex shrink-0 gap-3 border-t border-rb-200 dark:border-rb-700 px-4 pt-3"
          data-anatomy="N1.8.8"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={clearAll}
            disabled={!anyActive}
            className="flex-1 h-12 rounded-lg border border-rb-300 dark:border-rb-600 text-sm font-semibold text-foreground transition-colors hover:bg-rb-100 dark:hover:bg-rb-800 disabled:cursor-default disabled:text-rb-400 disabled:hover:bg-transparent dark:disabled:text-rb-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            data-filter-sheet-clear=""
          >
            Reset
          </button>
          {showButton("flex-1 h-12")}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** An on/off dimension drawn as a switch in its row. */
function ToggleRow<F>({
  dim,
  filters,
  onChange,
}: {
  dim: FilterDimension<F>;
  filters: F;
  onChange: (next: F) => void;
}) {
  const opt = dim.options[0];
  const on = dim.get(filters).includes(opt.value);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(on ? resetDim(dim, filters) : dim.set(filters, [opt.value]))}
      className="flex w-full min-h-14 items-center gap-3 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      data-filter-sheet-row={dim.id}
      data-anatomy="N1.8.5"
    >
      <span className="text-sm">{dim.label}</span>
      <span
        className={`ml-auto inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          on ? "bg-teal-700 dark:bg-teal-400" : "bg-rb-300 dark:bg-rb-600"
        }`}
        aria-hidden="true"
      >
        <span
          className={`size-5 rounded-full bg-white dark:bg-rb-900 shadow transition-transform ${on ? "translate-x-4" : ""}`}
        />
      </span>
    </button>
  );
}

/** A two-option dimension as a segmented radio group under its name: "Any"
 *  (the dimension's default) and the two options. Arrow keys move and pick,
 *  as in any radio group; Tab enters on the picked segment. */
function SegmentRow<F>({
  dim,
  filters,
  onChange,
}: {
  dim: FilterDimension<F>;
  filters: F;
  onChange: (next: F) => void;
}) {
  const cur = dim.get(filters);
  // A dimension resting on one of its options (a preset: "100+ holders" or
  // "Every vault") needs no "Any": its two options are the whole choice.
  const preset = (dim.defaultValues?.(filters) ?? []).length > 0;
  const options = dim.options.map((o) => ({ value: o.value as string | null, label: o.label }));
  const segments = preset ? options : [{ value: null as string | null, label: "Any" }, ...options];
  const picked = segments.findIndex((s) => s.value != null && cur.includes(s.value));
  const at = preset ? Math.max(picked, 0) : isDimensionActive(dim, filters) ? picked : 0;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const pick = (i: number) => {
    const v = segments[i].value;
    onChange(v == null ? resetDim(dim, filters) : dim.set(filters, [v]));
  };
  const onKeyDown = (e: ReactKeyboardEvent) => {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = (Math.max(at, 0) + step + segments.length) % segments.length;
    pick(i);
    refs.current[i]?.focus();
  };
  const labelId = `filter-sheet-seg-${dim.id}`;
  return (
    <div className="py-3" data-filter-sheet-segments={dim.id} data-anatomy="N1.8.4">
      <span id={labelId} className="block text-sm mb-2">
        {dim.label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={onKeyDown}
        className="flex rounded-lg border border-rb-300 dark:border-rb-700 p-0.5 gap-0.5"
      >
        {segments.map((s, i) => {
          const on = i === at;
          return (
            <button
              key={s.value ?? ""}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => pick(i)}
              className={`flex-auto h-10 whitespace-nowrap rounded-md px-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                on
                  ? "bg-rb-200 dark:bg-rb-600 text-foreground font-medium"
                  : "text-rb-500 hover:bg-rb-100 dark:hover:bg-rb-700 hover:text-foreground"
              }`}
              data-filter-sheet-segment={s.value ?? "any"}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A sub-view that returns to the list on a swipe to the right: the view
 *  follows the finger once the drag is mostly sideways (a mostly vertical
 *  one is left to scroll the list, `touch-action: pan-y`), and the release
 *  returns past a third of the width or on a flick, else snaps back. With
 *  reduced motion the view does not move; the release alone decides. */
function SwipeBack({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dx, setDx] = useState(0);
  const [settling, setSettling] = useState(false);
  const g = useRef<{
    id: number;
    x: number;
    y: number;
    mode: "pending" | "swipe" | "off";
    dx: number;
    lastX: number;
    lastT: number;
    v: number;
  } | null>(null);
  const swiped = useRef(false);
  const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const end = (cancelled: boolean) => {
    const s = g.current;
    g.current = null;
    if (!s || s.mode !== "swipe") return;
    const width = ref.current?.offsetWidth ?? window.innerWidth;
    const done = !cancelled && (s.dx > width * SWIPE_SHARE || (s.v > SWIPE_FLICK && s.dx > 24));
    if (done && !still()) {
      setSettling(true);
      setDx(width);
      window.setTimeout(onBack, SWIPE_MS);
    } else if (done) onBack();
    else {
      setSettling(true);
      setDx(0);
    }
  };

  return (
    <div
      ref={ref}
      className="min-h-full touch-pan-y"
      style={{
        transform: dx ? `translateX(${dx}px)` : undefined,
        transition: settling ? `transform ${SWIPE_MS}ms ease-out` : undefined,
      }}
      onTransitionEnd={() => setSettling(false)}
      data-filter-sheet-swipe=""
      data-anatomy="N1.8.9"
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        swiped.current = false;
        g.current = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          mode: "pending",
          dx: 0,
          lastX: e.clientX,
          lastT: e.timeStamp,
          v: 0,
        };
      }}
      onPointerMove={(e) => {
        const s = g.current;
        if (!s || s.id !== e.pointerId || s.mode === "off") return;
        const ddx = e.clientX - s.x;
        const ddy = e.clientY - s.y;
        if (s.mode === "pending") {
          if (Math.abs(ddx) < 10 && Math.abs(ddy) < 10) return;
          if (ddx > 0 && Math.abs(ddx) > Math.abs(ddy) * 1.5) {
            s.mode = "swipe";
            swiped.current = true;
            ref.current?.setPointerCapture?.(e.pointerId);
          } else {
            s.mode = "off";
            return;
          }
        }
        const dt = e.timeStamp - s.lastT;
        if (dt > 0) s.v = (e.clientX - s.lastX) / dt;
        s.lastX = e.clientX;
        s.lastT = e.timeStamp;
        s.dx = Math.max(0, ddx);
        if (!still()) {
          setSettling(false);
          setDx(s.dx);
        }
      }}
      onPointerUp={() => end(false)}
      onPointerCancel={() => end(true)}
      // A swipe that ends on an option does not also pick it.
      onClickCapture={(e) => {
        if (!swiped.current) return;
        swiped.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}

/** A range dimension in place: its name and current bounds as the heading,
 *  the slider and inputs across the row under it, then its one-line note. */
function RangeRow<F>({
  dim,
  filters,
  onChange,
  flushRef,
}: {
  dim: FilterDimension<F>;
  filters: F;
  onChange: (next: F) => void;
  flushRef: MutableRefObject<(() => void) | null>;
}) {
  const active = isDimensionActive(dim, filters);
  return (
    <div className="pt-3 pb-1" data-filter-sheet-range={dim.id} data-anatomy="N1.8.6">
      <div className="flex items-center gap-3">
        <span className="text-sm">{dim.label}</span>
        <span
          className={`ml-auto truncate text-sm tabular-nums ${active ? "text-foreground font-medium" : "text-rb-500"}`}
          data-filter-sheet-readout=""
        >
          {currentChoice(dim, filters)}
        </span>
      </div>
      <div className="-mx-4">
        <RangeControl dim={dim} filters={filters} onChange={onChange} wide flushRef={flushRef} />
      </div>
      {dim.panelNote != null && (
        <p className="pb-2 text-xs text-rb-500" data-prov-exempt="">
          {dim.panelNote}
        </p>
      )}
    </div>
  );
}

/** One dimension's options as radio or checkbox rows. A single pick returns
 *  to the list; a multi stays for the next tick. */
function DimensionView<F>({
  dim,
  filters,
  onChange,
  onPicked,
}: {
  dim: FilterDimension<F>;
  filters: F;
  onChange: (next: F) => void;
  onPicked: () => void;
}) {
  const [query, setQuery] = useState("");

  const multi = dim.cardinality === "multi";
  const selected = new Set(dim.get(filters));
  const searchable = isOptionSearchable(dim.options.length);
  const narrowed = searchable ? narrowOptions(dim.options, query, (o) => selected.has(o.value)) : null;
  const rows = narrowed ? [...narrowed.matched, ...narrowed.alsoSelected] : dim.options;

  const pick = (value: string) => {
    const cur = dim.get(filters);
    if (multi) {
      onChange(dim.set(filters, cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]));
      return;
    }
    const isSel = cur.length === 1 && cur[0] === value;
    onChange(dim.set(filters, isSel ? (dim.defaultValues?.(filters) ?? []) : [value]));
    onPicked();
  };

  return (
    <div className="pt-2" data-filter-sheet-view={dim.id} data-anatomy="N1.8.7">
      {searchable && <OptionSearchInput value={query} onChange={setQuery} />}
      <div role="group" aria-label={dim.label} className="px-4">
        {rows.map((opt, i) => {
          const row = (
            <SheetOption
              key={opt.value}
              opt={opt}
              multi={multi}
              checked={selected.has(opt.value)}
              onClick={() => pick(opt.value)}
              nested={multi && opt.parent != null}
            />
          );
          // An umbrella type's row above its first leg, as in the pill editor.
          if (!multi || !opt.parent || rows[i - 1]?.parent?.value === opt.parent.value) return row;
          const parent = opt.parent;
          const legs = dim.options.filter((o) => o.parent?.value === parent.value).map((o) => o.value);
          const on = legs.filter((v) => selected.has(v)).length;
          return (
            <Fragment key={opt.value}>
              <SheetOption
                opt={{ value: parent.value, label: parent.label, meta: parent.meta }}
                parentRow
                multi
                checked={on === legs.length}
                mixed={on > 0 && on < legs.length}
                onClick={() => {
                  const cur = dim.get(filters).filter((v) => !legs.includes(v));
                  onChange(dim.set(filters, on === legs.length ? cur : [...cur, ...legs]));
                }}
              />
              {row}
            </Fragment>
          );
        })}
      </div>
      {narrowed && rows.length === 0 && <OptionSearchNote>No options match.</OptionSearchNote>}
      {narrowed && narrowed.hiddenMatches > 0 && (
        <OptionSearchNote>{optionCapNote(narrowed.matched.length, narrowed.matchCount)}</OptionSearchNote>
      )}
    </div>
  );
}

function SheetOption({
  opt,
  multi,
  checked,
  onClick,
  mixed = false,
  nested = false,
  parentRow = false,
}: {
  opt: FilterOptionDef;
  multi: boolean;
  checked: boolean;
  onClick: () => void;
  mixed?: boolean;
  nested?: boolean;
  parentRow?: boolean;
}): ReactNode {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={mixed ? "mixed" : checked}
      onClick={onClick}
      className={`flex w-full min-h-12 items-center gap-3 border-b border-rb-200 dark:border-rb-800 py-2 ${nested ? "pl-7" : ""} text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
      data-filter-sheet-option={opt.value}
      data-pill-parent={parentRow ? "" : undefined}
      data-pill-nested={nested ? (opt.parent?.value ?? "") : undefined}
    >
      {multi ? (
        <span
          className={`inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0 transition-colors ${
            checked || mixed ? "bg-rb-500" : "border-2 border-rb-400 dark:border-rb-600"
          }`}
          aria-hidden="true"
        >
          {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
          {mixed && <Minus className="w-3 h-3 text-white" strokeWidth={3} />}
        </span>
      ) : (
        <span
          className={`inline-flex items-center justify-center w-5 h-5 rounded-full border-2 shrink-0 transition-colors ${
            checked ? "border-rb-500" : "border-rb-400 dark:border-rb-600"
          }`}
          aria-hidden="true"
        >
          {checked && <span className="w-2 h-2 rounded-full bg-rb-500" />}
        </span>
      )}
      {opt.icon && <span className="shrink-0 flex items-center">{opt.icon}</span>}
      <span className="flex-1 truncate">
        {opt.label}
        {opt.suffix && <span className="ml-1.5 inline-flex align-middle">{opt.suffix}</span>}
      </span>
      {opt.meta && <span className="shrink-0 text-xs text-rb-500 tabular-nums">{opt.meta}</span>}
    </button>
  );
}
