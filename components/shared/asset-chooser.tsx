"use client";

// AssetChooser: an opt-in token filter whose selection is drawn as the tokens.
// A row of pills (icon, symbol, ×) and a dashed add pill; the add pill opens a
// picker of the tokens the data holds, each with its count, keyed by address.
// One list, by count, then by the latest use. A token whose symbol was not read shows its short address,
// the unknown glyph and "Symbol not read". Past OPTION_SEARCH_THRESHOLD the list narrows by symbol or address
// and renders OPTION_RENDER_CAP rows, chosen tokens always in view
// (filter-bar/option-search.tsx). Below `sm` the picker is a live bottom sheet
// (MobileSheet), as FilterDropdown's is. With two tokens chosen the caller may
// offer "Only between X and Y".
//
// Keyboard: in the search field, arrow keys move through the list, Enter picks
// the highlighted token (or the only match), Escape closes and returns focus to
// the add pill, Backspace in an empty field removes the last chosen token.
//
// The selection lives with the caller (the CoW wallet page keeps it in the URL
// as ?token=0x…). An option with a `chain` is keyed `chain:address` (the asset
// preference's chooser, ui-jobs 557, offers one token on several chains); CoW's
// options carry none and are keyed by address. Tried on CoW first (rails-ops decisions/0058); its use for
// the timeline's Assets filter and the roster's Token facet is Miles's call.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, Plus, X } from "lucide-react";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { UnknownTokenSvg } from "@/components/shared/unknown-token-svg";
import { MobileSheet, MobileSheetFilterHeader } from "@/components/shared/mobile-sheet";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import {
  isOptionSearchable,
  narrowOptions,
  optionCapNote,
  OptionSearchNote,
} from "@/components/shared/filter-bar/option-search";
import { OVERLAY_HEADING, OVERLAY_SUBHEADING, RESET_LINK } from "@/lib/shared/ui-grammar";

export interface AssetChooserOption {
  /** Lowercased; the option's identity, with `chain` where given. */
  address: string;
  /** The token's chain; the option is then keyed `chain:address`. */
  chain?: number;
  /** null where the token's symbol was not read. */
  symbol: string | null;
  /** What the option reaches (the wallet's trades in this token). */
  count: number;
  /** The latest use (a block), which orders equal counts. */
  last?: number;
}

export interface AssetChooserProps {
  options: AssetChooserOption[];
  /** Chosen keys (`optionKey`), in the order they were chosen. */
  selected: string[];
  onChange: (next: string[]) => void;
  /** "Only between X and Y", offered while exactly two are chosen. */
  pair?: boolean;
  onPairChange?: (next: boolean) => void;
  /** The control's name: the add pill's accessible name and the panel's heading. */
  label?: string;
  /** What a count counts, for its tip ("trades"); null draws no counts. */
  countNoun?: string | null;
  /** Draws the chosen tokens as pills; false where the caller lists them. */
  pills?: boolean;
  /** The heading over the most counted options. */
  topLabel?: string;
  /** The add pill's words with nothing chosen. */
  addLabel?: string;
  /** Chain names, for options with a `chain` that share a symbol. */
  chainName?: (chain: number) => string;
  /** The count line, pinned in the phone sheet where the list behind is covered. */
  sheetStatus?: ReactNode;
  anatomy?: string;
}

/** The most counted options offered as chips above the list, of those
 *  counted at least ASSET_CHOOSER_TOP_MIN times. */
export const ASSET_CHOOSER_TOP = 8;
export const ASSET_CHOOSER_TOP_MIN = 3;

const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** An option's identity: `chain:address` where it names its chain. */
export const optionKey = (o: Pick<AssetChooserOption, "address" | "chain">) =>
  o.chain == null ? o.address : `${o.chain}:${o.address}`;

/** By count, most first, then by the latest use, then by address (a stable order, never shown as one). */
function byCount(a: AssetChooserOption, b: AssetChooserOption): number {
  return b.count - a.count || (b.last ?? 0) - (a.last ?? 0) || optionKey(a).localeCompare(optionKey(b));
}

function TokenMark({ o, size = 16 }: { o: AssetChooserOption; size?: number }) {
  return o.symbol ? (
    <TokenChipIcon symbol={o.symbol} address={o.address} size={size} filterable={false} untitled />
  ) : (
    <UnknownTokenSvg size={size} untitled />
  );
}

export function AssetChooser({
  options,
  selected,
  onChange,
  pair = false,
  onPairChange,
  label = "Tokens",
  countNoun = "trades",
  pills = true,
  addLabel = "Filter by token",
  topLabel = "Most traded",
  chainName,
  sheetStatus,
  anatomy,
}: AssetChooserProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const listId = useId();

  const sorted = useMemo(() => [...options].sort(byCount), [options]);
  const byAddress = useMemo(() => new Map(sorted.map((o) => [optionKey(o), o])), [sorted]);
  // A symbol two tokens share: the pill and the row add the short address.
  const shared = useMemo(() => {
    const n = new Map<string, number>();
    for (const o of sorted) if (o.symbol) n.set(o.symbol, (n.get(o.symbol) ?? 0) + 1);
    return new Set([...n].filter(([, c]) => c > 1).map(([s]) => s));
  }, [sorted]);
  const chosen = new Set(selected);
  const top = useMemo(
    () =>
      options
        .filter((o) => o.count >= ASSET_CHOOSER_TOP_MIN)
        .sort(byCount)
        .slice(0, ASSET_CHOOSER_TOP),
    [options],
  );

  const searchable = isOptionSearchable(sorted.length);
  const narrowed = useMemo(() => {
    const labelled = sorted.map((o) => ({ o, label: `${o.symbol ?? ""} ${o.address}` }));
    const n = narrowOptions(labelled, searchable ? query : "", (x) => chosen.has(optionKey(x.o)));
    return {
      matched: n.matched.map((x) => x.o),
      also: n.alsoSelected.map((x) => x.o),
      hidden: n.hiddenMatches,
      shown: n.matched.length,
      matchCount: n.matchCount,
    };
    // `chosen` is derived from `selected`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, query, searchable, selected]);
  const flat = [...narrowed.matched, ...narrowed.also];

  useEffect(() => {
    setActive(0);
  }, [query, open]);
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Close on a press outside (desktop; the sheet's backdrop closes it on a phone).
  useEffect(() => {
    if (!open || isPhone) return;
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open, isPhone]);

  // The highlighted row stays in view as the arrows move it.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-option-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const nameOf = (o: AssetChooserOption) =>
    o.symbol
      ? shared.has(o.symbol)
        ? `${o.symbol} ${o.chain != null && chainName ? `on ${chainName(o.chain)}` : shortAddress(o.address)}`
        : o.symbol
      : shortAddress(o.address);

  function toggle(address: string) {
    onChange(chosen.has(address) ? selected.filter((a) => a !== address) : [...selected, address]);
    setQuery("");
  }

  function close() {
    setOpen(false);
    addRef.current?.focus();
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(0, flat.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = flat.length === 1 ? flat[0] : flat[active];
      if (pick) toggle(optionKey(pick));
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Backspace" && query === "" && selected.length) {
      onChange(selected.slice(0, -1));
    }
  }

  const pairTokens = selected.length === 2 ? selected.map((a) => byAddress.get(a)) : null;

  return (
    <div ref={ref} className="relative" data-anatomy={anatomy} data-asset-chooser="">
      <div className="flex flex-wrap items-center gap-2">
        {(pills ? selected : []).map((a) => {
          const o = byAddress.get(a) ?? { address: a, symbol: null, count: 0 };
          const name = nameOf(o);
          return (
            <span
              key={a}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-rb-300 pl-1.5 pr-1 text-xs text-foreground dark:border-rb-700"
              data-asset-pill={a}
              title={a}
            >
              <TokenMark o={o} />
              <span className="font-semibold">{name}</span>
              <button
                type="button"
                onClick={() => toggle(a)}
                aria-label={`Remove ${name}`}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-rb-500 transition-colors hover:bg-teal-500/15 hover:text-teal-600 dark:hover:text-teal-400"
              >
                <X className="h-3 w-3" strokeWidth={2.5} />
              </button>
            </span>
          );
        })}
        <button
          ref={addRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={selected.length && pills ? `Add a token to the filter` : addLabel}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-teal-500/60 px-2.5 text-xs font-semibold text-teal-600 transition-colors hover:bg-teal-500/10 dark:text-teal-400"
          data-asset-chooser-add=""
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          {(selected.length === 0 || !pills) && <span>{addLabel}</span>}
        </button>
        {pills && selected.length >= 2 && (
          <button type="button" onClick={() => onChange([])} className={RESET_LINK}>
            Clear
          </button>
        )}
        {pairTokens && pairTokens[0] && pairTokens[1] && onPairChange && (
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-rb-500" data-asset-pair="">
            <input
              type="checkbox"
              checked={pair}
              onChange={(e) => onPairChange(e.target.checked)}
              className="h-3.5 w-3.5 accent-teal-500"
            />
            Only between {nameOf(pairTokens[0])} and {nameOf(pairTokens[1])}
          </label>
        )}
      </div>

      {open &&
        (isPhone ? (
          <MobileSheet
            label={label}
            mode="live"
            onClose={() => setOpen(false)}
            header={
              <MobileSheetFilterHeader
                label={label}
                status={sheetStatus}
                onReset={selected.length ? () => onChange([]) : undefined}
              />
            }
          >
            {renderBody()}
          </MobileSheet>
        ) : (
          <div className="overlay-panel absolute left-0 top-full z-[var(--z-dropdown)] mt-1 flex max-h-[440px] w-[22rem] max-w-[calc(100vw-2rem)] flex-col">
            <div className="flex items-center justify-between px-4 py-3">
              <span className={OVERLAY_HEADING}>{label}</span>
              {selected.length > 0 && (
                <button type="button" onClick={() => onChange([])} className={RESET_LINK}>
                  Reset
                </button>
              )}
            </div>
            {renderBody()}
          </div>
        ))}
    </div>
  );

  function renderBody() {
    let index = -1;
    const row = (o: AssetChooserOption) => {
      index += 1;
      const i = index;
      const key = optionKey(o);
      const on = chosen.has(key);
      return (
        <div
          key={key}
          id={`${listId}-${i}`}
          role="option"
          aria-selected={on}
          data-option-index={i}
          data-asset-option={key}
          onClick={() => toggle(key)}
          onPointerMove={() => setActive(i)}
          className={`overlay-item !gap-2 !py-1.5 ${i === active ? "overlay-item-active" : ""}`}
        >
          <span className="inline-flex w-4 shrink-0 justify-center">
            {on && <Check className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" strokeWidth={3} />}
          </span>
          <TokenMark o={o} />
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            {o.symbol ? (
              <span className="truncate text-foreground">{o.symbol}</span>
            ) : (
              <span className="shrink-0 text-rb-500">Symbol not read</span>
            )}
            {o.chain != null && chainName && (
              <span className="shrink-0 text-[11px] text-rb-500">{chainName(o.chain)}</span>
            )}
            <span className="shrink-0 font-mono text-[11px] text-rb-500">{shortAddress(o.address)}</span>
          </span>
          {countNoun != null && (
            <span
              className="shrink-0 text-xs tabular-nums text-rb-500"
              title={`${o.count.toLocaleString("en-US")} ${countNoun}`}
            >
              {o.count.toLocaleString("en-US")}
            </span>
          )}
        </div>
      );
    };
    const showTop = query.trim() === "" && top.length > 0 && sorted.length > ASSET_CHOOSER_TOP;
    return (
      <>
        <div className="overlay-search px-4 pb-2 pt-1">
          <input
            type="text"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={flat.length ? `${listId}-${Math.min(active, flat.length - 1)}` : undefined}
            aria-autocomplete="list"
            aria-label="Search by symbol or address"
            placeholder="Search by symbol or address"
            value={query}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- the panel just opened at the reader's own press; the caret belongs in its one input
            autoFocus={!isPhone}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            className="h-8 w-full rounded-md border border-rb-300 bg-transparent px-2 text-base text-foreground placeholder:text-rb-500 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-xs dark:border-rb-700"
          />
        </div>
        {showTop && (
          <div className="px-4 pb-2">
            <div className={`${OVERLAY_SUBHEADING} mb-1.5`}>{topLabel}</div>
            <div className="flex flex-wrap gap-1.5">
              {top.map((o) => (
                <button
                  key={optionKey(o)}
                  type="button"
                  onClick={() => toggle(optionKey(o))}
                  aria-pressed={chosen.has(optionKey(o))}
                  className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition-colors ${
                    chosen.has(optionKey(o))
                      ? "border-teal-500/60 bg-teal-500/15 text-teal-700 dark:text-teal-300"
                      : "border-rb-300 text-foreground hover:bg-rb-100 dark:border-rb-700 dark:hover:bg-rb-800"
                  }`}
                  data-asset-top={optionKey(o)}
                >
                  <TokenMark o={o} size={14} />
                  {nameOf(o)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          aria-multiselectable
          className="overflow-y-auto pb-1"
        >
          {narrowed.matched.map(row)}
          {narrowed.also.length > 0 && (
            <div className={`${OVERLAY_SUBHEADING} mx-3 mt-1 border-t border-rb-300 px-1 pb-1 pt-2 dark:border-rb-700`}>
              Chosen
            </div>
          )}
          {narrowed.also.map(row)}
          {flat.length === 0 && <OptionSearchNote>No token matches.</OptionSearchNote>}
          {narrowed.hidden > 0 && (
            <OptionSearchNote>{optionCapNote(narrowed.shown, narrowed.matchCount)}</OptionSearchNote>
          )}
        </div>
      </>
    );
  }
}
