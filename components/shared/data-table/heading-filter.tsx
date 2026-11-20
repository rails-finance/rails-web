"use client";

// A roster's column filter in its heading (anatomy D9; rails-ops decision 0070
// point 2, ui-jobs 786). A roster (bounded, chosen by Rails, every row loaded:
// /protocols, a protocol's Assets) filters a column from its heading in place
// of the listing toolbar's "+ <facet>" chips: "Category ▾" opens a menu of the
// column's values with counts; a choice reads "Lending ×" in the heading, the
// name reopening the menu and the × clearing it.
//
// The menu is a real menu (`role="menu"`, `menuitemradio`), drawn in a portal
// fixed under its button so a table frame that scrolls sideways (D3) cannot
// clip it. The button carries `aria-expanded`; Escape, a press outside, a
// scroll or a resize closes it, Escape handing focus back; the arrow keys,
// Home and End move through it.
//
// Below sm a stacked table (D6) draws no heading: the page's one search
// matches every text column, and a filter the URL sets shows as a removable
// chip (`HeadingFilterChip`).

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X } from "lucide-react";

export interface HeadingFilterOption {
  value: string;
  label: string;
  count: number;
}

export interface HeadingFilterProps {
  /** The column's name: "Category". */
  label: string;
  options: HeadingFilterOption[];
  /** The value chosen; null shows every row. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** A hook for the verifiers: `data-heading-filter=<name>`. */
  name: string;
  /** The menu's first item, no choice: "Every category" by default. */
  allLabel?: string;
}

const n = (v: number) => v.toLocaleString("en-US");
const BUTTON = "inline-flex items-center gap-1 rounded-sm cursor-pointer transition-colors focus-ring";

export function HeadingFilter({ label, options, value, onChange, name, allLabel }: HeadingFilterProps) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const stateId = useId();
  // A value the rows hold no more (a tab switched, a stale URL) still filters
  // them, so it is drawn as chosen and offered in the menu, at 0, to clear.
  const listed = withChosen(options, value);
  const chosen = listed.find((o) => o.value === value) ?? null;

  const place = useCallback(() => {
    const r = button.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 248)) });
  }, []);
  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!button.current?.contains(t) && !menu.current?.contains(t)) close(false);
    };
    const shut = () => close(false);
    // Escape closes it wherever focus is: the menu may not have taken focus
    // yet (it moves in after the menu is placed), or the reader stayed on
    // the button.
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      close(true);
    };
    document.addEventListener("keydown", esc);
    document.addEventListener("mousedown", away);
    window.addEventListener("scroll", shut, true);
    window.addEventListener("resize", shut);
    return () => {
      document.removeEventListener("keydown", esc);
      document.removeEventListener("mousedown", away);
      window.removeEventListener("scroll", shut, true);
      window.removeEventListener("resize", shut);
    };
  }, [open, close]);
  // The chosen item, else the first, takes focus as the menu opens.
  useEffect(() => {
    if (!open || !at) return;
    const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]") ?? [])];
    (items.find((i) => i.getAttribute("aria-checked") === "true") ?? items[0])?.focus();
  }, [open, at]);

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (k: number) => {
      e.preventDefault();
      items[(k + items.length) % items.length]?.focus();
    };
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Tab") close(false);
  };
  const choose = (v: string | null) => {
    onChange(v);
    close(true);
  };

  const size = "text-xs";
  const tone = chosen ? "font-semibold text-foreground" : "text-rb-500 hover:text-foreground";
  return (
    <span className="inline-flex items-center gap-0.5" data-heading-filter={name} data-anatomy="D9">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-describedby={stateId}
        onClick={() => (open ? close(false) : setOpen(true))}
        className={`${BUTTON} ${size} ${tone}`}
        data-heading-filter-button=""
      >
        {/* Named by the column, the choice after it: "Category: Lending". */}
        {chosen ? (
          <>
            <span className="sr-only">{label}: </span>
            {chosen.label}
          </>
        ) : (
          label
        )}
        {!chosen && <ChevronDown className="size-3.5 shrink-0" aria-hidden />}
      </button>
      <span id={stateId} className="sr-only">
        {chosen ? `Filtered to ${chosen.label}. Opens a menu to change it.` : "Opens a menu to filter by it."}
      </span>
      {chosen && (
        <button
          type="button"
          aria-label={`Clear the ${label.toLowerCase()} filter`}
          onClick={() => {
            onChange(null);
            // The × goes with the choice: focus to the filter's button.
            requestAnimationFrame(() => button.current?.focus());
          }}
          className={`${BUTTON} p-0.5 text-rb-500 hover:text-foreground`}
          data-heading-filter-clear=""
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
      {open &&
        at &&
        createPortal(
          <div
            ref={menu}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKey}
            style={{ top: at.top, left: at.left }}
            className="fixed z-50 min-w-48 max-w-60 rounded-lg border border-rb-200 bg-raised py-1 text-sm shadow-lg dark:border-rb-700"
            data-heading-filter-menu={name}
          >
            {[{ value: null, label: allLabel ?? `Every ${label.toLowerCase()}`, count: null }, ...listed].map((o) => {
              const on = o.value === value;
              return (
                <button
                  key={o.value ?? ""}
                  type="button"
                  role="menuitemradio"
                  aria-checked={on}
                  tabIndex={-1}
                  onClick={() => choose(o.value)}
                  className={`flex min-h-11 w-full items-center gap-2 px-3 text-left hover:bg-[var(--surface-hover)] focus:bg-[var(--surface-hover)] focus:outline-none sm:min-h-9 ${
                    on ? "font-semibold text-foreground" : "text-foreground"
                  }`}
                  data-heading-filter-option={o.value ?? ""}
                >
                  <Check className={`size-3.5 shrink-0 ${on ? "" : "invisible"}`} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.count != null && <span className="text-xs text-rb-500 tabular-nums">{n(o.count)}</span>}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </span>
  );
}

/** A heading filter set (by the URL or a choice) as a chip, below sm where the
 *  stacked table draws no heading (D9): "Category: Lending ×", the × clearing
 *  it. */
export function HeadingFilterChip({ label, options, value, onChange, name }: HeadingFilterProps) {
  const chosen = withChosen(options, value).find((o) => o.value === value);
  if (!value) return null;
  const text = chosen?.label ?? value;
  return (
    <span
      className="inline-flex min-h-9 items-center gap-1 rounded-full border border-rb-200 bg-raised pr-1 pl-3 text-sm text-foreground dark:border-rb-700"
      data-heading-filter-chip={name}
    >
      <span className="text-rb-500">{label}:</span> {text}
      <button
        type="button"
        aria-label={`Clear the ${label.toLowerCase()} filter`}
        onClick={(e) => {
          // Focus to the next chip's ×, else the page's search, as this chip goes.
          const row = e.currentTarget.closest("[data-roster-controls]");
          const next = [...(row?.querySelectorAll<HTMLElement>("[data-heading-filter-chip] button") ?? [])].find(
            (b) => b !== e.currentTarget,
          );
          const search = row?.querySelector<HTMLElement>("input");
          onChange(null);
          requestAnimationFrame(() => (next?.isConnected ? next : search)?.focus());
        }}
        className={`${BUTTON} min-h-9 min-w-9 justify-center text-rb-500 hover:text-foreground`}
        data-heading-filter-clear=""
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </span>
  );
}

/** The options with the chosen value among them: a value the rows hold no
 *  more is listed at 0, under the label the caller gives it in `options`
 *  elsewhere or its own value. */
function withChosen(options: HeadingFilterOption[], value: string | null): HeadingFilterOption[] {
  if (value == null || options.some((o) => o.value === value)) return options;
  return [...options, { value, label: value, count: 0 }];
}
