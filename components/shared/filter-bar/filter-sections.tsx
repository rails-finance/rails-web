"use client";

/**
 * FilterSections — one dropdown per dimension group (Risk / Market / Supply /
 * …), shown up top alongside search + sort. Each group button opens a single
 * panel listing every dimension in that group with its options inline (radio for
 * single-select, checkbox for multi) — no second-level drill-in. A group whose
 * any dimension is active reads as "on" (the active control styling + a dot) so
 * you can see which sections carry filters at a glance; the removable chips live
 * separately in <FilterChips>.
 *
 * The panel follows the shared dropdown grammar (see ui-grammar OVERLAY_HEADING
 * + components/shared/filter-dropdown.tsx): an OVERLAY_HEADING title row with a
 * trailing RESET_LINK, a divider, then `overlay-item` rows — identical to the
 * sort menu and every other overlay-panel. Multi-dimension groups insert an
 * OVERLAY_SUBHEADING before each dimension's options.
 *
 * A dimension whose option list passes OPTION_SEARCH_THRESHOLD also gains a
 * type-to-filter input (see ./option-search) — under its OVERLAY_SUBHEADING in a
 * multi-dimension group, under the header divider when the group holds one. A
 * shorter dimension renders exactly as before.
 *
 * Like the rest of the filter grammar this holds no filter state — it reads and
 * writes the rail's URL-backed param object through the dimension registry
 * (see ./types).
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Check } from "lucide-react";
import {
  CTRL_GHOST,
  CTRL_OFF,
  CTRL_ON,
  RESET_LINK,
  OVERLAY_HEADING,
  OVERLAY_SUBHEADING,
} from "@/lib/shared/ui-grammar";
import { type FilterDimension, type FilterOptionDef, isDimensionActive } from "@/components/shared/filter-bar/types";
import {
  isOptionSearchable,
  narrowOptions,
  optionCapNote,
  OptionSearchInput,
  OptionSearchNote,
} from "@/components/shared/filter-bar/option-search";

interface FilterSectionsProps<F> {
  dimensions: FilterDimension<F>[];
  filters: F;
  onChange: (next: F) => void;
}

interface Group<F> {
  name: string;
  dims: FilterDimension<F>[];
}

/** Bucket dimensions by `group`, preserving registry order both across groups
 *  and within each. Dimensions hidden by `available` are dropped; an emptied
 *  group disappears. Ungrouped dimensions collect under a single "Filter" tab. */
function groupDimensions<F>(dims: FilterDimension<F>[], filters: F): Group<F>[] {
  const order: string[] = [];
  const byName = new Map<string, FilterDimension<F>[]>();
  for (const d of dims) {
    if (d.available && !d.available(filters)) continue;
    const name = d.group ?? "Filter";
    if (!byName.has(name)) {
      byName.set(name, []);
      order.push(name);
    }
    byName.get(name)!.push(d);
  }
  return order.map((name) => ({ name, dims: byName.get(name)! }));
}

export function FilterSections<F>({ dimensions, filters, onChange }: FilterSectionsProps<F>) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  // Per-dimension type-to-filter text, keyed by dimension id. Panel-local and
  // never serialized: it narrows what the panel offers, not what the listing
  // shows. Cleared whenever the open panel changes, so a panel always opens on
  // its full list.
  const [queries, setQueries] = useState<Record<string, string>>({});
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQueries({});
  }, [openGroup]);

  useEffect(() => {
    if (!openGroup) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenGroup(null);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenGroup(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [openGroup]);

  // Apply a value pick. Single: toggle (re-picking the sole selection clears it
  // to the dimension default), panel stays open so adjacent dimensions can be
  // set in one visit. Multi: toggle the value.
  const pickValue = (dim: FilterDimension<F>, value: string) => {
    const cur = dim.get(filters);
    if (dim.cardinality === "single") {
      const isSel = cur.length === 1 && cur[0] === value;
      onChange(dim.set(filters, isSel ? (dim.defaultValues?.(filters) ?? []) : [value]));
    } else {
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      onChange(dim.set(filters, next));
    }
  };

  // Reset every dimension in a group back to its default (the panel-header
  // RESET_LINK affordance — one verb, "Reset", per the grammar).
  const resetGroup = (group: Group<F>) => {
    let next = filters;
    for (const dim of group.dims) next = dim.set(next, dim.defaultValues?.(next) ?? []);
    onChange(next);
  };

  const groups = groupDimensions(dimensions, filters);

  return (
    <div className="flex flex-wrap items-center gap-2" ref={ref}>
      {groups.map((group) => {
        const open = openGroup === group.name;
        const groupActive = group.dims.some((d) => isDimensionActive(d, filters));
        const multiDim = group.dims.length > 1;
        // Exactly one input takes focus when a panel opens: the first dimension
        // in the group long enough to render one.
        const firstSearchableId = group.dims.find((d) => isOptionSearchable(d.options.length))?.id;
        return (
          <div key={group.name} className="relative">
            <button
              type="button"
              onClick={() => setOpenGroup((g) => (g === group.name ? null : group.name))}
              className={`${CTRL_GHOST} ${open || groupActive ? CTRL_ON : CTRL_OFF} h-8 gap-1.5 px-3 rounded-md text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500`}
              aria-expanded={open}
            >
              <span>{group.name}</span>
              {groupActive && <span className="w-1.5 h-1.5 rounded-full bg-teal-500" aria-hidden="true" />}
              <ChevronDown
                className={`w-3.5 h-3.5 text-rb-500 transition-transform ${open ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>

            {open && (
              <div
                className="absolute top-full left-0 mt-2 z-50 min-w-[220px] max-h-[420px] overflow-y-auto overlay-panel"
                role="menu"
              >
                {/* Canonical dropdown header: title + Reset, then a divider. */}
                <div className="flex items-center justify-between px-4 py-3">
                  <span className={OVERLAY_HEADING}>{group.name}</span>
                  {groupActive && (
                    <button type="button" onClick={() => resetGroup(group)} className={RESET_LINK}>
                      Reset
                    </button>
                  )}
                </div>
                <div className="my-1 mx-3 border-t border-rb-300 dark:border-rb-700" />

                {group.dims.map((dim) => {
                  const selected = new Set(dim.get(filters));
                  const searchable = isOptionSearchable(dim.options.length);
                  const query = queries[dim.id] ?? "";
                  // Long dimensions only: narrow by the typed text, cap the rows,
                  // and keep any selection the query or the cap displaced.
                  const narrowed = searchable ? narrowOptions(dim.options, query, (o) => selected.has(o.value)) : null;
                  const rows = narrowed ? [...narrowed.matched, ...narrowed.alsoSelected] : dim.options;
                  return (
                    <div key={dim.id} className="flex flex-col">
                      {/* Per-dimension sub-header only when the group holds more
                          than one dimension — otherwise the panel title names it. */}
                      {multiDim && (
                        <div className="flex items-center justify-between px-4 pt-2 pb-1">
                          <span className={OVERLAY_SUBHEADING}>{dim.label}</span>
                          {dim.labelAction}
                        </div>
                      )}
                      {searchable && (
                        <OptionSearchInput
                          value={query}
                          onChange={(next) => setQueries((q) => ({ ...q, [dim.id]: next }))}
                          autoFocus={dim.id === firstSearchableId}
                          onEscape={() => setOpenGroup(null)}
                        />
                      )}
                      {rows.map((opt) => (
                        <OptionRow
                          key={opt.value}
                          opt={opt}
                          multi={dim.cardinality === "multi"}
                          checked={selected.has(opt.value)}
                          onClick={() => pickValue(dim, opt.value)}
                        />
                      ))}
                      {narrowed && rows.length === 0 && <OptionSearchNote>No options match.</OptionSearchNote>}
                      {narrowed && narrowed.hiddenMatches > 0 && (
                        <OptionSearchNote>
                          {optionCapNote(narrowed.matched.length, narrowed.matchCount)}
                        </OptionSearchNote>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
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
}): ReactNode {
  // Item chrome matches components/shared/filter-dropdown.tsx: multi gets a
  // leading circular checkbox, single gets a radio dot. Both carry a leading
  // control glyph so checkbox and radio dimensions read consistently in the
  // same panel; single additionally keeps the overlay-item-active highlight.
  return (
    <button
      type="button"
      onClick={onClick}
      className={`overlay-item ${!multi && checked ? "overlay-item-active text-foreground" : ""} focus:outline-none focus:ring-2 focus:ring-blue-500`}
      role={multi ? "menuitemcheckbox" : "menuitemradio"}
      aria-checked={checked}
    >
      {multi ? (
        <span
          className={`inline-flex items-center justify-center w-5 h-5 rounded-full transition-colors shrink-0 ${
            checked ? "bg-rb-500" : "border-2 border-rb-400 dark:border-rb-600"
          }`}
          aria-hidden="true"
        >
          {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
        </span>
      ) : (
        <span
          className={`inline-flex items-center justify-center w-5 h-5 rounded-full border-2 transition-colors shrink-0 ${
            checked ? "border-rb-500" : "border-rb-400 dark:border-rb-600"
          }`}
          aria-hidden="true"
        >
          {checked && <span className="w-2 h-2 rounded-full bg-rb-500" aria-hidden="true" />}
        </span>
      )}
      {opt.icon && <span className="shrink-0 flex items-center">{opt.icon}</span>}
      <span className="flex-1 text-left truncate">{opt.label}</span>
      {opt.meta && <span className="shrink-0 text-xs text-rb-500 tabular-nums">{opt.meta}</span>}
    </button>
  );
}
