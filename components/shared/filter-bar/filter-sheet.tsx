"use client";

/**
 * FilterSheet — the listing toolbar's facets below sm (ui-jobs 544): a Filters
 * button carrying the count of active filters, opening a full-screen sheet.
 * The sheet lists one row per dimension, its name at the left and the current
 * choice with a chevron at the right; a row opens that dimension's options
 * (multi, or single with three or more) as a sub-view with its own back
 * control. Short choices sit in the list: a single dimension with one option
 * is on or off, a switch in its row; one with two options is a segmented
 * "Any / A / B" under its name ("A / B" where the dimension rests on one of
 * them, a preset); a range draws its slider under its name.
 * The footer holds "Clear filters" (every dimension back to its default) and
 * the primary button with the count the edits would give.
 *
 * Edits are staged: the sheet holds a draft of the filters, and only the
 * primary button writes it, through the same `onChange` the desktop panels
 * use (so the URL, Save listing and Copy link follow). Its count is the
 * listing's own until the draft changes, then `countFor(draft)`, which runs
 * the listing's own filtering (in memory, or the server's total). Escape and
 * the back control at the top close the sheet and drop the draft; a facet's
 * back returns to the list keeping it.
 *
 * A modal dialog: focus is held inside while it is open and returns to the
 * Filters button on close; the page behind does not scroll.
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
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { CTRL_GHOST, CTRL_OFF, CTRL_ON, RESET_LINK } from "@/lib/shared/ui-grammar";
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
  /** The count a draft would give, with the listing's own filtering. Without
   *  it an edited draft's button reads "Show results". */
  countFor?: (draft: F) => number | Promise<number>;
  /** The noun for a draft, where the selection names it ("open positions"
   *  while Status rests on Open). Without it, `count.noun`. */
  nounFor?: (draft: F) => string;
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
}: FilterSheetProps<F>) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dims = dimensions.filter((d) => !d.available || d.available(filters));
  const active = dims.filter((d) => isDimensionActive(d, filters)).length;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          // The sheet's history entry, at the same URL (no query change, so
          // Copy link and the listing do not see it).
          window.history.pushState({ [SHEET_STATE]: "list" }, "");
          setOpen(true);
        }}
        className={`${CTRL_GHOST} ${active > 0 ? CTRL_ON : CTRL_OFF} sm:hidden h-8 gap-1.5 px-3 rounded-md text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={active > 0 ? `Filters, ${active} active` : "Filters"}
        data-filter-sheet-open=""
        data-anatomy="N1.8.1"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Filters</span>
        {active > 0 && (
          <span
            className="inline-flex min-w-4 h-4 px-1 items-center justify-center rounded-full bg-teal-700 text-white dark:bg-teal-400 dark:text-rb-900 text-[10px] font-bold tabular-nums"
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
  onClose,
}: {
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

  // Escape closes; Tab cycles inside the sheet; the page does not scroll.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        closeSheetRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
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
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, []);

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
    count && shown != null
      ? `Show ${shown.toLocaleString("en-US")} ${shown === 1 ? noun.replace(/s$/, "") : noun}`
      : "Show results";
  const apply = () => {
    flushRanges();
    closeSheet(draftRef.current !== applied ? draftRef.current : undefined);
  };

  const title = openDim ? openDim.label : "Filters";

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="filter-sheet-title"
      className="fixed inset-0 z-[var(--z-modal)] flex flex-col bg-background text-foreground sm:hidden"
      data-filter-sheet=""
      data-anatomy="N1.8"
    >
      <div
        className="flex h-14 shrink-0 items-center gap-1 border-b border-rb-200 dark:border-rb-700 px-2"
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
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <h2 id="filter-sheet-title" className="flex-1 truncate text-base font-semibold">
          {title}
        </h2>
        {openDim && isDimensionActive(openDim, filters) && (
          <button
            type="button"
            onClick={() => onChange(resetDim(openDim, filters))}
            className={`${RESET_LINK} px-3 py-2`}
          >
            Reset
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {openDim ? (
          <SwipeBack key={openDim.id} onBack={leaveSub}>
            <DimensionView dim={openDim} filters={filters} onChange={onChange} onPicked={leaveSub} />
          </SwipeBack>
        ) : (
          <ul className="px-4">
            {dims.map((dim) => (
              <li key={dim.id} className="border-b border-rb-200 dark:border-rb-800">
                {isToggle(dim) ? (
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
            ))}
          </ul>
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
          Clear filters
        </button>
        <button
          type="button"
          onClick={apply}
          className="flex-1 h-12 rounded-lg bg-teal-700 text-sm font-semibold text-white transition-colors hover:bg-teal-800 dark:bg-teal-400 dark:text-rb-900 dark:hover:bg-teal-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          aria-busy={pending || undefined}
          data-filter-sheet-show={shown ?? ""}
        >
          <span aria-live="polite" className={`tabular-nums transition-opacity ${pending ? "opacity-60" : ""}`}>
            {showLabel}
          </span>
        </button>
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
        {rows.map((opt) => (
          <SheetOption
            key={opt.value}
            opt={opt}
            multi={multi}
            checked={selected.has(opt.value)}
            onClick={() => pick(opt.value)}
          />
        ))}
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
}: {
  opt: FilterOptionDef;
  multi: boolean;
  checked: boolean;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={checked}
      onClick={onClick}
      className="flex w-full min-h-12 items-center gap-3 border-b border-rb-200 dark:border-rb-800 py-2 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      data-filter-sheet-option={opt.value}
    >
      {multi ? (
        <span
          className={`inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0 transition-colors ${
            checked ? "bg-rb-500" : "border-2 border-rb-400 dark:border-rb-600"
          }`}
          aria-hidden="true"
        >
          {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
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
      <span className="flex-1 truncate">{opt.label}</span>
      {opt.meta && <span className="shrink-0 text-xs text-rb-500 tabular-nums">{opt.meta}</span>}
    </button>
  );
}
