"use client";

/**
 * FilterChips — the active-predicate row. One removable chip per active
 * dimension (AND across), reading in plain words; a trailing Reset clears them
 * all. Sits between the filter controls and the first listing row. Editing a
 * value happens up top in <FilterSections>; a chip here only displays and
 * removes, so it renders nothing when no filters are active (keeping the
 * wallet-view resting state quiet). Given a `count`, the row also ends in the
 * listing's result count at the far right, and is drawn even with no chip.
 */

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { RESET_LINK } from "@/lib/shared/ui-grammar";
import {
  type FilterDimension,
  isDimensionActive,
  defaultChipLabel,
  joinOptionLabels,
  rangeChipLabel,
} from "@/components/shared/filter-bar/types";

interface FilterChipsProps<F> {
  dimensions: FilterDimension<F>[];
  filters: F;
  onChange: (next: F) => void;
  /** The listing's result count, drawn at the far right of the row. */
  count?: { total: number; noun: string };
  /** In place of `count`: a count line the page writes, drawn in the same spot. */
  countNode?: ReactNode;
  /** A chip the reader cannot remove here, drawn first: AIM's (ui-jobs 557),
   *  set outside the listing and narrowed within by the chips after it. */
  lead?: ReactNode;
}

/** A dimension's chip, in plain words ("WETH collateral"). */
export function filterChipText<F>(dim: FilterDimension<F>, filters: F): string {
  const vals = dim.get(filters);
  if (dim.chipLabel) return dim.chipLabel(vals, dim.options);
  return dim.cardinality === "range"
    ? rangeChipLabel(dim.label, vals, dim.range?.usd, dim.range?.unit)
    : defaultChipLabel(dim.label, vals, dim.options);
}

/** Dimensions whose values name a thing the dimension is a noun for: a
 *  saved view names them "<value> <noun>" ("WETH collateral", "USDC loan",
 *  "Core market"). The noun is the label's first word in lower case. */
const NOUN_DIMENSION = /^(collateral|loan|market|pool|hub|spoke|line|vault|borrowed|supplied)(?: token| type)?$/i;

/** The active filters as a saved view's default name ends in them (ui-jobs
 *  521, Miles 7 Nov 2026), in the row's order: "<value> <noun>" where the
 *  dimension has a natural noun, else the chip's text. */
export function savedViewFilterNames<F>(dimensions: FilterDimension<F>[], filters: F): string[] {
  return dimensions
    .filter((d) => isDimensionActive(d, filters))
    .map((d) => {
      const noun = d.cardinality === "range" ? null : NOUN_DIMENSION.exec(d.label.trim());
      return noun
        ? `${joinOptionLabels(d.get(filters), d.options)} ${noun[1].toLowerCase()}`
        : filterChipText(d, filters);
    });
}

export function FilterChips<F>({ dimensions, filters, onChange, count, countNode, lead }: FilterChipsProps<F>) {
  const activeDims = dimensions.filter((d) => isDimensionActive(d, filters));
  // A dimension resting on a default that constrains the list names it in a
  // fixed chip (FilterDimension.defaultChip).
  const defaultChips = dimensions
    .filter((d) => !isDimensionActive(d, filters))
    .map((d) => ({ id: d.id, text: d.defaultChip?.(filters) ?? null, clear: d.clearDefault }))
    .filter((c): c is { id: string; text: string; clear: ((f: F) => F) | undefined } => c.text != null);
  if (activeDims.length === 0 && defaultChips.length === 0 && !count && countNode == null && lead == null) return null;

  const chipText = (dim: FilterDimension<F>) => filterChipText(dim, filters);

  const removeDim = (dim: FilterDimension<F>) => onChange(dim.set(filters, dim.defaultValues?.(filters) ?? []));

  const resetAll = () => {
    let next = filters;
    for (const dim of activeDims) next = dim.set(next, dim.defaultValues?.(next) ?? []);
    onChange(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-anatomy="N1.4">
      {lead}
      {defaultChips.map((c) => (
        <span
          key={c.id}
          data-default-chip={c.id}
          className="inline-flex items-center rounded-full bg-rb-100 dark:bg-rb-800 text-xs text-foreground"
          title="The list's default view"
        >
          <span className={c.clear ? "pl-2.5 pr-1.5 py-1" : "px-2.5 py-1"}>{c.text}</span>
          {c.clear && (
            <button
              type="button"
              onClick={() => onChange(c.clear!(filters))}
              className="pr-1.5 pl-0.5 py-1 rounded-r-full text-rb-500 hover:text-foreground hover:bg-rb-200/60 dark:hover:bg-rb-700/60 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={`Remove ${c.text}`}
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </span>
      ))}
      {activeDims.map((dim) => (
        <span
          key={dim.id}
          className="inline-flex items-center rounded-full bg-rb-100 dark:bg-rb-800 text-xs text-foreground"
        >
          <span className="pl-2.5 pr-1.5 py-1">{chipText(dim)}</span>
          <button
            type="button"
            onClick={() => removeDim(dim)}
            className="pr-1.5 pl-0.5 py-1 rounded-r-full text-rb-500 hover:text-foreground hover:bg-rb-200/60 dark:hover:bg-rb-700/60 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label={`Remove ${dim.label} filter`}
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </span>
      ))}
      {activeDims.length > 0 && (
        <button type="button" onClick={resetAll} className={`${RESET_LINK} ml-0.5`}>
          Reset
        </button>
      )}
      {/* The result count is the list's chrome: how many rows the filter
          returns, the same total the pagination states. The tripwire skips it
          (data-prov-exempt); a protocol's own count carries its receipt where
          the page states it as a figure. */}
      {countNode != null && (
        <span className="ml-auto text-xs text-rb-500 tabular-nums" data-anatomy="N1.6" data-prov-exempt="">
          {countNode}
        </span>
      )}
      {countNode == null && count && (
        <span
          className="ml-auto text-xs text-rb-500 tabular-nums"
          data-anatomy="N1.6"
          data-result-count={count.total}
          data-prov-exempt=""
        >
          {count.total.toLocaleString("en-US")} {count.total === 1 ? count.noun.replace(/s$/, "") : count.noun}
        </span>
      )}
    </div>
  );
}
