"use client";

/**
 * FilterSheet — the listing toolbar's facets below sm (ui-jobs 544): a Filters
 * button carrying the count of active filters, opening a full-screen sheet.
 * The sheet lists one row per dimension, its name at the left and the current
 * choice with a chevron at the right; a row opens that dimension's options
 * (single, multi, range) as a sub-view with its own back control. Short
 * choices sit in the list: a single dimension with one option is on or off,
 * a switch in its row; one with two options is a segmented "Any / A / B"
 * under its name.
 * The footer holds "Clear filters" (every dimension back to its default) and
 * the primary button with the count the edits would give.
 *
 * Edits are staged: the sheet holds a draft of the filters, and only the
 * primary button writes it, through the same `onChange` the desktop panels
 * use (so the URL, Save this view and Copy link follow). Its count is the
 * listing's own until the draft changes, then `countFor(draft)`, which runs
 * the listing's own filtering (in memory, or the server's total). Escape and
 * the back control at the top close the sheet and drop the draft; a facet's
 * back returns to the list keeping it.
 *
 * A modal dialog: focus is held inside while it is open and returns to the
 * Filters button on close; the page behind does not scroll.
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
}

/** Wait after a draft edit before counting it, so a run of taps costs one read. */
const COUNT_DELAY_MS = 250;

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

export function FilterSheet<F>({ dimensions, filters, onChange, count, countPending, countFor }: FilterSheetProps<F>) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dims = dimensions.filter((d) => !d.available || d.available(filters));
  const active = dims.filter((d) => isDimensionActive(d, filters)).length;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        className={`${CTRL_GHOST} ${active > 0 ? CTRL_ON : CTRL_OFF} sm:hidden h-8 gap-1.5 px-3 rounded-md text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={active > 0 ? `Filters, ${active} active` : "Filters"}
        data-filter-sheet-open=""
      >
        <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Filters</span>
        {active > 0 && (
          <span
            className="inline-flex min-w-4 h-4 px-1 items-center justify-center rounded-full bg-teal-700 text-white dark:bg-teal-400 dark:text-rb-900 text-[10px] font-bold tabular-nums"
            aria-hidden="true"
            data-filter-sheet-count={active}
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
  onClose,
}: {
  dimensions: FilterDimension<F>[];
  applied: F;
  onApply: (next: F) => void;
  count?: { total: number; noun: string };
  countPending?: boolean;
  countFor?: (draft: F) => number | Promise<number>;
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
  // A range sub-view's pending slider move.
  const flushRange = useRef<(() => void) | null>(null);
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

  // Escape closes; Tab cycles inside the sheet; the page does not scroll.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        closeRef.current();
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
  const showLabel =
    count && shown != null
      ? `Show ${shown.toLocaleString("en-US")} ${shown === 1 ? count.noun.replace(/s$/, "") : count.noun}`
      : "Show results";
  const apply = () => {
    flushRange.current?.();
    if (draftRef.current !== applied) onApply(draftRef.current);
    onClose();
  };
  const backToList = (id: string) => {
    flushRange.current?.();
    returnTo.current = id;
    setOpenId(null);
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
    >
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-rb-200 dark:border-rb-700 px-2">
        <button
          type="button"
          onClick={() => {
            if (openDim) backToList(openDim.id);
            else onClose();
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
          <DimensionView
            key={openDim.id}
            dim={openDim}
            filters={filters}
            onChange={onChange}
            flushRef={flushRange}
            onPicked={() => backToList(openDim.id)}
          />
        ) : (
          <ul className="px-4">
            {dims.map((dim) => (
              <li key={dim.id} className="border-b border-rb-200 dark:border-rb-800">
                {isToggle(dim) ? (
                  <ToggleRow dim={dim} filters={filters} onChange={onChange} />
                ) : isSegmented(dim) ? (
                  <SegmentRow dim={dim} filters={filters} onChange={onChange} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenId(dim.id)}
                    className="flex w-full min-h-14 items-center gap-3 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    data-filter-sheet-row={dim.id}
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
  const active = isDimensionActive(dim, filters);
  const cur = dim.get(filters);
  const segments = [
    { value: null as string | null, label: "Any" },
    ...dim.options.map((o) => ({ value: o.value as string | null, label: o.label })),
  ];
  const at = active ? segments.findIndex((s) => s.value != null && cur.includes(s.value)) : 0;
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
    <div className="py-3" data-filter-sheet-segments={dim.id}>
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

/** One dimension's options: radio or checkbox rows, or the range control. A
 *  single pick returns to the list; a multi stays for the next tick. */
function DimensionView<F>({
  dim,
  filters,
  onChange,
  flushRef,
  onPicked,
}: {
  dim: FilterDimension<F>;
  filters: F;
  onChange: (next: F) => void;
  flushRef: MutableRefObject<(() => void) | null>;
  onPicked: () => void;
}) {
  const [query, setQuery] = useState("");

  if (dim.cardinality === "range") {
    return (
      <div className="pt-4" data-filter-sheet-view={dim.id}>
        <RangeControl dim={dim} filters={filters} onChange={onChange} wide flushRef={flushRef} />
        {dim.panelNote != null && (
          <p className="px-4 pt-1 pb-3 text-xs text-rb-500" data-prov-exempt="">
            {dim.panelNote}
          </p>
        )}
      </div>
    );
  }

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
    <div className="pt-2" data-filter-sheet-view={dim.id}>
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
