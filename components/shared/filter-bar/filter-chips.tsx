"use client";

/**
 * FilterChips — the active-predicate row. One removable chip per active
 * dimension (AND across), reading in plain words; a trailing Reset clears them
 * all. Sits between the filter controls and the first listing row. Editing a
 * value happens up top in <FilterSections>; a chip here only displays and
 * removes, so it renders nothing when no filters are active (keeping the
 * wallet-view resting state quiet).
 */

import { X } from "lucide-react";
import { RESET_LINK } from "@/lib/shared/ui-grammar";
import { type FilterDimension, isDimensionActive, defaultChipLabel } from "@/components/shared/filter-bar/types";

interface FilterChipsProps<F> {
  dimensions: FilterDimension<F>[];
  filters: F;
  onChange: (next: F) => void;
}

export function FilterChips<F>({ dimensions, filters, onChange }: FilterChipsProps<F>) {
  const activeDims = dimensions.filter((d) => isDimensionActive(d, filters));
  if (activeDims.length === 0) return null;

  const chipText = (dim: FilterDimension<F>) => {
    const vals = dim.get(filters);
    return dim.chipLabel ? dim.chipLabel(vals, dim.options) : defaultChipLabel(dim.label, vals, dim.options);
  };

  const removeDim = (dim: FilterDimension<F>) => onChange(dim.set(filters, dim.defaultValues?.(filters) ?? []));

  const resetAll = () => {
    let next = filters;
    for (const dim of activeDims) next = dim.set(next, dim.defaultValues?.(next) ?? []);
    onChange(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
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
      <button type="button" onClick={resetAll} className={`${RESET_LINK} ml-0.5`}>
        Reset
      </button>
    </div>
  );
}
