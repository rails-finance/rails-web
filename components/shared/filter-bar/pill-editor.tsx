"use client";

/**
 * The editor a filter pill opens (N1.11, ui-jobs 681): from sm a popover
 * anchored under the pill, about 320px wide; below sm the same content in a
 * bottom sheet (MobileSheet) with a grab handle, the group's name as title and
 * its Remove at the top right. It holds the group's controls as the facet
 * panels did (option rows with type-to-filter, RangeControl for a USD or unit
 * range), and a count range (Transactions) gets At least / At most / Between
 * with quick values (N1.12).
 *
 * Edits are staged on a draft of the filters; the primary button writes it
 * through the toolbar's `onChange`, so the URL, the list and the count follow
 * as before. The button reads "Show {n}" only where the listing counts a draft
 * from rows it holds (`countFor`, the in-memory listings); elsewhere
 * "Apply", since a count would be a new read. Escape and a press outside close
 * without applying; focus goes in on open and back to the pill on close.
 */

import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Check } from "lucide-react";
import { PHONE_QUERY } from "@/hooks/useMediaQuery";
import { MobileSheet } from "@/components/shared/mobile-sheet";
import { OVERLAY_HEADING, OVERLAY_SUBHEADING } from "@/lib/shared/ui-grammar";
import {
  type FilterDimension,
  type FilterOptionDef,
  decodeRange,
  encodeRange,
  isDimensionActive,
} from "@/components/shared/filter-bar/types";
import {
  isOptionSearchable,
  narrowOptions,
  optionCapNote,
  OptionSearchInput,
  OptionSearchNote,
} from "@/components/shared/filter-bar/option-search";
import { RangeControl } from "@/components/shared/filter-bar/range-control";
import { PILL_SET_TONE } from "@/components/shared/filter-bar/filter-pill";
import {
  type PillGroup,
  type ThresholdMode,
  resetGroup,
  thresholdMode,
} from "@/components/shared/filter-bar/pill-model";

const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
/** The primary button: teal-700 with white text, teal-400 with rb-900 in dark
 *  (the filter sheet's Show, N1.8.8). */
export const PRIMARY_BUTTON = `rounded-lg bg-teal-700 font-semibold text-white transition-colors hover:bg-teal-800 dark:bg-teal-400 dark:text-rb-900 dark:hover:bg-teal-300 ${FOCUS} focus-visible:ring-offset-2`;
/** A quiet text control in the editor's footer: Remove, Reset to default. */
const QUIET_TEXT = `text-sm text-rb-500 dark:text-rb-400/75 hover:text-foreground transition-colors ${FOCUS} rounded`;

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** Whether the viewport is a phone's, or null until that is known: an editor
 *  draws nothing until then, so a phone never mounts (and focuses) the
 *  popover for one frame before the sheet. */
export function usePhone(): boolean | null {
  const [phone, setPhone] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    setPhone(mq.matches);
    const onChange = () => setPhone(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return phone;
}

/** Below sm, leave through the sheet (its slide and its history entry), then
 *  run `then`; from sm, close and run it at once. A write to the URL goes in
 *  `then`, so it lands after the sheet's entry has left. */
export type EditorLeave = (then?: () => void) => void;

/** The shell: a popover from sm, a bottom sheet below it. */
export function EditorShell({
  title,
  onClose,
  anchorRef,
  topAction,
  footer,
  children,
  anatomy = "N1.11",
  align = "start",
  sheetCloseRef,
}: {
  title: string;
  onClose: () => void;
  /** The pill's container: a press inside it is not "outside". */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Below sm, the header's right-hand control (Remove filter). */
  topAction?: ReactNode;
  /** The foot: from sm a row (Remove left, primary right); below sm the
   *  primary alone, full width. */
  footer?: { left?: ReactNode; primary?: ReactNode };
  children: ReactNode;
  anatomy?: string;
  /** The popover's edge under the pill: its left (a filter) or its right (the
   *  sort, at the row's end). */
  align?: "start" | "end";
  /** Set to the sheet's own close below sm (MobileSheet `closeRef`). */
  sheetCloseRef?: MutableRefObject<EditorLeave | null>;
}) {
  const isPhone = usePhone();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Desktop: Escape and a press outside the pill and the popover close it.
  useEffect(() => {
    if (isPhone !== false) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        closeRef.current();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isPhone, anchorRef]);

  // Desktop: under the pill, left-aligned, moved left until it fits the
  // viewport; focus goes to its first control.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el || isPhone !== false) return;
    el.style.transform = "";
    const r = el.getBoundingClientRect();
    const over = r.right - (window.innerWidth - 8);
    if (over > 0) el.style.transform = `translateX(-${Math.max(0, Math.min(over, r.left - 8))}px)`;
    el.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [isPhone]);

  if (isPhone == null) return null;
  if (isPhone) {
    return (
      <MobileSheet
        label={title}
        onClose={onClose}
        dismiss="handle"
        backCloses
        closeRef={sheetCloseRef}
        header={
          <div className="flex items-center justify-between gap-3 pb-3">
            <h2 className="text-lg font-semibold">{title}</h2>
            {topAction}
          </div>
        }
      >
        <div className="pb-1" data-pill-editor={title} data-anatomy={anatomy}>
          {children}
          {footer?.primary && <div className="mt-5">{footer.primary}</div>}
        </div>
      </MobileSheet>
    );
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={title}
      className={`absolute ${align === "end" ? "right-0" : "left-0"} top-full z-[var(--z-dropdown)] mt-2 w-80 max-w-[calc(100vw-16px)] overlay-panel p-4`}
      data-pill-editor={title}
      data-anatomy={anatomy}
    >
      <div className={`${OVERLAY_HEADING} text-rb-500 dark:text-rb-400/75`}>{title}</div>
      <div className="mt-3 max-h-[min(60vh,420px)] overflow-y-auto">{children}</div>
      {footer && (footer.left || footer.primary) && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <span>{footer.left}</span>
          {footer.primary}
        </div>
      )}
    </div>
  );
}

/** A count range drawn with the threshold editor: a range in neither dollars
 *  nor a unit (Transactions). */
const isCountRange = <F,>(dim: FilterDimension<F>) =>
  dim.cardinality === "range" && !dim.range?.usd && !dim.range?.unit;

/** One group's editor. */
export function GroupEditor<F>({
  group,
  locked,
  filters: applied,
  onChange,
  onClose,
  anchorRef,
  count,
  countFor,
  nounFor,
}: {
  group: PillGroup<F>;
  locked: boolean;
  filters: F;
  onChange: (next: F) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  count?: { total: number; noun: string };
  countFor?: (draft: F) => number | Promise<number>;
  nounFor?: (draft: F) => string;
}) {
  const [draft, setDraftState] = useState<F>(applied);
  // The newest draft, for a slider write that lands after another edit and
  // for Apply in the same tick as a flush.
  const draftRef = useRef<F>(applied);
  const setDraft = (next: F) => {
    draftRef.current = next;
    setDraftState(next);
  };
  const flushers = useRef(new Map<string, React.MutableRefObject<(() => void) | null>>());
  const flushFor = (id: string) => {
    let r = flushers.current.get(id);
    if (!r) flushers.current.set(id, (r = { current: null }));
    return r;
  };
  const isPhone = usePhone() === true;
  const sheetClose = useRef<EditorLeave | null>(null);
  const leave: EditorLeave = (then) => {
    if (isPhone && sheetClose.current) sheetClose.current(then);
    else {
      onClose();
      then?.();
    }
  };

  // The draft's count, where counting it costs no read.
  const dirty = draft !== applied;
  const [draftCount, setDraftCount] = useState<number | null>(count?.total ?? null);
  const countForRef = useRef(countFor);
  countForRef.current = countFor;
  useEffect(() => {
    if (!dirty || !countForRef.current) return;
    let cancelled = false;
    Promise.resolve(countForRef.current(draft)).then(
      (n) => !cancelled && setDraftCount(n),
      () => !cancelled && setDraftCount(null),
    );
    return () => {
      cancelled = true;
    };
  }, [draft, dirty]);
  const shown = dirty ? draftCount : (count?.total ?? null);
  const noun = count ? (nounFor ? nounFor(draft) : count.noun) : "";
  const one = (n: number) => (n === 1 ? noun.replace(/s$/, "") : noun);
  const label =
    countFor && shown != null
      ? isPhone
        ? `Show ${shown.toLocaleString("en-US")} ${one(shown)}`
        : `Show ${shown.toLocaleString("en-US")}`
      : "Apply";

  const appliedActive = group.dims.some((d) => isDimensionActive(d, applied));
  const apply = () => {
    flushers.current.forEach((r) => r.current?.());
    const next = draftRef.current;
    leave(next !== applied ? () => onChange(next) : undefined);
  };
  const remove = () => leave(() => onChange(resetGroup(group, applied)));
  const removeLabel = locked ? "Reset to default" : isPhone ? "Remove filter" : "Remove";
  const removeButton =
    locked || appliedActive ? (
      <button
        type="button"
        onClick={remove}
        disabled={locked && !appliedActive}
        className={`${QUIET_TEXT} disabled:cursor-default disabled:opacity-50 disabled:hover:text-rb-500`}
        data-pill-editor-remove=""
      >
        {removeLabel}
      </button>
    ) : null;
  const primary = (
    <button
      type="button"
      onClick={apply}
      className={`${PRIMARY_BUTTON} ${isPhone ? "h-12 w-full text-base" : "h-9 px-4 text-sm"}`}
      data-pill-editor-apply={countFor && shown != null ? shown : ""}
    >
      <span aria-live="polite" className="tabular-nums">
        {label}
      </span>
    </button>
  );

  const multiDim = group.dims.length > 1;
  return (
    <EditorShell
      title={group.name}
      onClose={onClose}
      anchorRef={anchorRef}
      topAction={removeButton}
      sheetCloseRef={sheetClose}
      footer={{ left: isPhone ? undefined : removeButton, primary }}
    >
      <div className="flex flex-col gap-4">
        {group.dims.map((dim) => (
          <div key={dim.id} className="flex flex-col">
            {multiDim && (
              <div className="flex items-center justify-between pb-1">
                <span className={OVERLAY_SUBHEADING}>{dim.label}</span>
                {dim.labelAction}
              </div>
            )}
            {isCountRange(dim) ? (
              <ThresholdEditor dim={dim} filters={draft} onChange={setDraft} />
            ) : dim.cardinality === "range" ? (
              <div className="-mx-4">
                <RangeControl
                  dim={dim}
                  filters={draft}
                  // A delayed slider write lands on the newest draft.
                  onChange={(next) => setDraft(dim.set(draftRef.current, dim.get(next)))}
                  wide
                  flushRef={flushFor(dim.id)}
                />
              </div>
            ) : (
              <OptionList dim={dim} filters={draft} onChange={setDraft} />
            )}
          </div>
        ))}
        {(() => {
          const note = group.dims.find((d) => d.panelNote != null)?.panelNote;
          return note != null ? (
            <p className="text-[11px] text-rb-500 dark:text-rb-400/75" data-prov-exempt="">
              {note}
            </p>
          ) : null;
        })()}
      </div>
    </EditorShell>
  );
}

/** A single or multi dimension's options as radio or checkbox rows, with
 *  type-to-filter past the threshold (./option-search). */
function OptionList<F>({
  dim,
  filters,
  onChange,
}: {
  dim: FilterDimension<F>;
  filters: F;
  onChange: (next: F) => void;
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
  };
  return (
    <div className="flex flex-col">
      {searchable && (
        <div className="-mx-4">
          <OptionSearchInput value={query} onChange={setQuery} />
        </div>
      )}
      <div role="group" aria-label={dim.label} className="flex flex-col">
        {rows.map((opt) => (
          <OptionRow
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

function OptionRow({
  opt,
  multi,
  checked,
  onClick,
}: {
  opt: FilterOptionDef;
  multi: boolean;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={checked}
      onClick={onClick}
      className={`flex w-full min-h-11 sm:min-h-9 items-center gap-3 rounded-md px-1 text-left text-sm hover:bg-rb-100 dark:hover:bg-rb-800 ${FOCUS}`}
      data-pill-option={opt.value}
    >
      {multi ? (
        <span
          className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full transition-colors ${
            checked ? "bg-rb-500" : "border-2 border-rb-400 dark:border-rb-600"
          }`}
          aria-hidden="true"
        >
          {checked && <Check className="size-3 text-white" strokeWidth={3} />}
        </span>
      ) : (
        <span
          className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            checked ? "border-rb-500" : "border-rb-400 dark:border-rb-600"
          }`}
          aria-hidden="true"
        >
          {checked && <span className="size-2 rounded-full bg-rb-500" />}
        </span>
      )}
      {opt.icon && <span className="flex shrink-0 items-center">{opt.icon}</span>}
      <span className="flex-1 truncate">{opt.label}</span>
      {opt.meta && <span className="shrink-0 text-xs tabular-nums text-rb-500 dark:text-rb-400/75">{opt.meta}</span>}
    </button>
  );
}

/** The quick values a count range offers. */
const QUICK = [10, 100, 1000, 10000];

/** A count typed in: digits with optional commas, or a k / M suffix. */
function parseCount(text: string): number | null | undefined {
  const t = text.replace(/[,\s]/g, "");
  if (t === "") return null;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(\d+(?:\.\d+)?)([km])$/i.exec(t);
  return m ? Math.round(Number(m[1]) * (m[2].toLowerCase() === "k" ? 1e3 : 1e6)) : undefined;
}

const SEGMENTS: { mode: ThresholdMode; label: string }[] = [
  { mode: "min", label: "At least" },
  { mode: "max", label: "At most" },
  { mode: "between", label: "Between" },
];

/** A count range as a threshold (N1.12): At least / At most / Between, the
 *  quick values, and a typed value. Writes the same one range value
 *  (`?tx=100-`) the slider wrote. */
function ThresholdEditor<F>({
  dim,
  filters,
  onChange,
}: {
  dim: FilterDimension<F>;
  filters: F;
  onChange: (next: F) => void;
}) {
  const bounds = decodeRange(dim.get(filters));
  const [mode, setMode] = useState<ThresholdMode>(() => thresholdMode(bounds.min, bounds.max));
  const write = (min: number | null, max: number | null) => onChange(dim.set(filters, encodeRange({ min, max })));
  const single = mode === "min" ? bounds.min : mode === "max" ? bounds.max : null;
  const setSingle = (v: number | null) => (mode === "min" ? write(v, null) : write(null, v));
  const noun = dim.label.toLowerCase();

  const pickMode = (m: ThresholdMode) => {
    setMode(m);
    // The value carries across: At least 100 becomes At most 100.
    const v = bounds.min ?? bounds.max;
    if (m === "min") write(v, null);
    else if (m === "max") write(null, v);
    else write(bounds.min, bounds.max);
  };
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const at = SEGMENTS.findIndex((s) => s.mode === mode);

  return (
    <div className="flex flex-col gap-3" data-threshold-editor={dim.id} data-anatomy="N1.12">
      <div
        role="radiogroup"
        aria-label={`${dim.label} comparison`}
        className="grid grid-cols-3 gap-1 rounded-xl bg-rb-100 p-1 dark:bg-rb-900"
        onKeyDown={(e) => {
          const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          if (!step) return;
          e.preventDefault();
          const i = (at + step + SEGMENTS.length) % SEGMENTS.length;
          pickMode(SEGMENTS[i].mode);
          refs.current[i]?.focus();
        }}
      >
        {SEGMENTS.map((s, i) => (
          <button
            key={s.mode}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={s.mode === mode}
            tabIndex={s.mode === mode ? 0 : -1}
            onClick={() => pickMode(s.mode)}
            className={`h-10 sm:h-9 rounded-lg text-sm transition-colors ${FOCUS} ${
              s.mode === mode
                ? "bg-background font-semibold text-foreground shadow-sm dark:bg-rb-700"
                : "text-rb-500 dark:text-rb-400/75 hover:text-foreground"
            }`}
            data-threshold-mode={s.mode}
          >
            {s.label}
          </button>
        ))}
      </div>
      {mode === "between" ? (
        <div className="flex items-center gap-2">
          <CountInput
            label={`Minimum ${noun}`}
            placeholder="Min"
            value={bounds.min}
            onCommit={(v) => write(v, bounds.max)}
          />
          <span className="text-rb-500 dark:text-rb-400/75" aria-hidden="true">
            –
          </span>
          <CountInput
            label={`Maximum ${noun}`}
            placeholder="Max"
            value={bounds.max}
            onCommit={(v) => write(bounds.min, v)}
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => {
              const on = single === q;
              return (
                <button
                  key={q}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSingle(on ? null : q)}
                  className={`h-11 sm:h-9 rounded-full px-4 text-sm tabular-nums transition-colors ${FOCUS} ${
                    on
                      ? `${PILL_SET_TONE} font-semibold text-foreground`
                      : "border border-rb-300 text-foreground hover:bg-rb-100 dark:border-rb-600 dark:hover:bg-rb-800"
                  }`}
                  data-threshold-quick={q}
                >
                  {q.toLocaleString("en-US")}
                </button>
              );
            })}
          </div>
          <CountInput
            label={`${mode === "min" ? "At least" : "At most"}, custom ${noun}`}
            prefix="Custom"
            value={single}
            onCommit={setSingle}
          />
        </>
      )}
    </div>
  );
}

/** A typed count, written on Enter, blur, or each valid keystroke. */
function CountInput({
  label,
  prefix,
  placeholder,
  value,
  onCommit,
}: {
  label: string;
  prefix?: string;
  placeholder?: string;
  value: number | null;
  onCommit: (v: number | null) => void;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const committed = useRef(value);
  // A change from outside (a quick value, the mode) replaces the text.
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(value == null ? "" : String(value));
    }
  }, [value]);
  const commit = (t: string) => {
    const v = parseCount(t);
    if (v === undefined) return;
    committed.current = v;
    onCommit(v);
  };
  return (
    <label className="flex h-12 sm:h-10 flex-1 items-center gap-3 rounded-lg bg-rb-100 px-3 text-sm text-rb-500 dark:text-rb-400/75 focus-within:ring-2 focus-within:ring-blue-500 dark:bg-rb-900">
      {prefix && <span aria-hidden="true">{prefix}</span>}
      <input
        type="text"
        inputMode="numeric"
        value={text}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => {
          setText(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => {
          const v = parseCount(text);
          if (v === undefined) setText(committed.current == null ? "" : String(committed.current));
        }}
        className={`min-w-0 flex-1 bg-transparent font-mono text-base sm:text-sm tabular-nums text-foreground placeholder:text-rb-500 focus:outline-none ${prefix ? "text-right" : ""}`}
        data-threshold-input=""
      />
    </label>
  );
}
