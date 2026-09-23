"use client";

/**
 * Type-to-filter for long option lists — the shared half of the overlay filter
 * grammar, used by both surfaces that render an option list inside a popover:
 * the listing facet panels (components/shared/filter-bar/filter-sections.tsx)
 * and the overlay menus (components/shared/filter-dropdown.tsx).
 *
 * Why it exists: a dimension's options are whatever the data offers, and that
 * is not always a handful. The Morpho market roster is 1,283 markets; mounting
 * one button per market gives a list nobody can reach the bottom of and no way
 * to look one up. So past a threshold the panel gains an input that narrows the
 * list by substring, and the rendered rows are capped — the cap is what keeps
 * the DOM small at roster scale, and the input is what makes the cap harmless.
 *
 * Quiet at rest: below OPTION_SEARCH_THRESHOLD nothing here renders and the
 * panel is byte-identical to what it was — no input, no cap, no notes.
 *
 * The one invariant worth naming: a currently-selected option is never removed
 * from view. A query that hid an active selection would strand the reader with
 * a filter they can neither see nor clear, so `narrowOptions` returns those
 * separately (`alsoSelected`) for the caller to append below the matches.
 */

import type { ReactNode } from "react";

/** Option count past which a dimension gains the filter input. Twelve rows is
 *  about where a panel stops being scannable in one look. */
export const OPTION_SEARCH_THRESHOLD = 12;

/** Rows rendered at once once the input is present. Everything past this is
 *  reachable by typing, and the count is stated in the panel rather than
 *  silently cut. Fifty keeps the panel a couple of screens deep — enough to
 *  browse, short enough that the sticky input stays the fastest way through. */
export const OPTION_RENDER_CAP = 50;

/** The shape `narrowOptions` needs — both call sites' option types satisfy it
 *  (FilterOptionDef's `value` / FilterOption's `key` differ, so identity is the
 *  caller's business and matching keys only on `label`). */
export interface LabelledOption {
  label: string;
}

export interface NarrowedOptions<T> {
  /** Options matching the query, capped at OPTION_RENDER_CAP. */
  matched: T[];
  /** Selected options the query or the cap pushed out of `matched`. Rendered
   *  below them so an active selection stays visible and clearable. */
  alsoSelected: T[];
  /** Matches beyond the cap — stated in the panel, never silently dropped. */
  hiddenMatches: number;
  /** How many options the query matched before the cap applied (the whole
   *  dimension when the query is empty) — the denominator of the cap note. */
  matchCount: number;
}

/** Narrow `options` by a case-insensitive substring of the option label, cap the
 *  result, and separate out any selected option that neither survived. */
export function narrowOptions<T extends LabelledOption>(
  options: T[],
  query: string,
  isSelected: (option: T) => boolean,
): NarrowedOptions<T> {
  const q = query.trim().toLowerCase();
  const matches = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const matched = matches.slice(0, OPTION_RENDER_CAP);
  const shown = new Set(matched);
  return {
    matched,
    alsoSelected: options.filter((o) => isSelected(o) && !shown.has(o)),
    hiddenMatches: matches.length - matched.length,
    matchCount: matches.length,
  };
}

/** True when a dimension is long enough to warrant the input. */
export function isOptionSearchable(optionCount: number): boolean {
  return optionCount > OPTION_SEARCH_THRESHOLD;
}

export interface OptionSearchInputProps {
  value: string;
  onChange: (next: string) => void;
  /** Focused on mount. The caller passes true for the first input a panel
   *  renders, so opening a panel lands the caret in it and only in it. */
  autoFocus?: boolean;
  /** Escape inside the input closes the panel, matching the panel's own
   *  document-level Escape handling. */
  onEscape?: () => void;
}

/** The input row itself. Sits under the panel header divider (single-dimension
 *  panel) or under a dimension's OVERLAY_SUBHEADING (multi-dimension panel). */
export function OptionSearchInput({ value, onChange, autoFocus, onEscape }: OptionSearchInputProps): ReactNode {
  return (
    <div className="overlay-search px-4 pt-1 pb-2">
      <input
        type="text"
        value={value}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- the panel just opened at the reader's own click; the caret belongs in the one input it renders
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onEscape?.();
        }}
        placeholder="Filter options"
        aria-label="Filter options"
        className="w-full h-7 px-2 rounded-md text-xs bg-transparent border border-rb-300 dark:border-rb-700 text-foreground placeholder:text-rb-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

/** A quiet statement row in the panel's muted register — "no matches", or the
 *  count the cap left off. Never an option, so it carries no menu role. */
export function OptionSearchNote({ children }: { children: ReactNode }): ReactNode {
  return <div className="px-4 py-2 text-xs text-rb-500">{children}</div>;
}

/** The note under a capped list: what is rendered, out of how many matched. */
export function optionCapNote(rendered: number, matchCount: number): string {
  return `Showing ${rendered.toLocaleString("en-US")} of ${matchCount.toLocaleString("en-US")}. Type to narrow.`;
}
