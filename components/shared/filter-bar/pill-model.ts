// The editable pills' model (N1.10, ui-jobs 681): what each pill of a listing's
// toolbar says and in which order the pills stand, worked out from the
// dimension registry and the URL-backed filters. One pill per dimension group,
// as the group buttons were. Pure functions, no React, so the unit tests read
// them (scripts/test/filter-pills.test.mjs, which resolves the `@/` alias).
//
// A pill is in one of three states:
//   unset    — every dimension in the group at its default, and the default
//              constrains nothing: a dashed "+ Market" that opens the editor.
//   set      — a dimension off its default: "Status Open", "Transactions ≥ 100",
//              with a × that puts the group back to its default.
//   default  — the group rests on a default that does constrain the list
//              ("Status: Open" on a directory): drawn as set, with a chevron in
//              place of the ×, and its editor offers "Reset to default".

import {
  type FilterDimension,
  defaultChipLabel,
  isDimensionActive,
  joinOptionLabels,
  rangeChipLabel,
} from "@/components/shared/filter-bar/types";

export type PillState = "unset" | "set" | "default";

export interface PillGroup<F> {
  /** The group's name: the pill's label and the editor's title. */
  name: string;
  dims: FilterDimension<F>[];
}

export interface PillModel<F> extends PillGroup<F> {
  state: PillState;
  /** True where the group rests on a constraining default; such a pill never
   *  shows a ×, whatever its state. */
  locked: boolean;
  /** The bold value after the label ("Open", "≥ 100", "USDC +2"); for a
   *  boolean, the whole text ("Liquidated before") with `label` empty. */
  value: string;
  /** The muted label before the value; "" when the value names itself. */
  label: string;
  /** The whole pill in words, for its accessible name. */
  spoken: string;
}

/** The unset pills' fixed order; a family's other groups keep their places. */
export const PILL_ORDER = ["Status", "Market", "Size", "Assets", "History", "Transactions"];

/** Bucket dimensions by `group` in registry order. A dimension hidden by
 *  `available` is dropped and an emptied group goes; an ungrouped dimension
 *  takes its own label as its group. */
export function groupDimensions<F>(dims: FilterDimension<F>[], filters: F): PillGroup<F>[] {
  const order: string[] = [];
  const byName = new Map<string, FilterDimension<F>[]>();
  for (const d of dims) {
    if (d.available && !d.available(filters)) continue;
    const name = d.group ?? d.label;
    if (!byName.has(name)) {
      byName.set(name, []);
      order.push(name);
    }
    byName.get(name)!.push(d);
  }
  return order.map((name) => ({ name, dims: byName.get(name)! }));
}

/** A dimension whose resting default narrows the list ("Status: Open", a
 *  "100+ holders" preset): a named default chip, or default values that are
 *  some of the options and not all of them. */
export function restsOnConstraint<F>(dim: FilterDimension<F>, f: F): boolean {
  if (dim.defaultChip?.(f)) return true;
  const def = dim.defaultValues?.(f) ?? [];
  return def.length > 0 && (dim.options.length === 0 || def.length < dim.options.length);
}

/** One option, on or off: "Liquidated before". */
export const isBoolean = <F>(dim: FilterDimension<F>) => dim.cardinality === "single" && dim.options.length === 1;

/** Text with a leading "Label: " taken off. */
const stripLabel = (text: string, label: string) =>
  text.startsWith(`${label}: `) ? text.slice(label.length + 2) : text;

/** A dimension's current choice in words, without its label: "Open", "≥ 100",
 *  "$1K–$50K", "USDC +2", "All". At rest on a named default, the default's
 *  words. */
export function dimValue<F>(dim: FilterDimension<F>, f: F): string {
  if (!isDimensionActive(dim, f)) {
    const chip = dim.defaultChip?.(f);
    if (chip) return stripLabel(chip, dim.label);
    const def = dim.defaultValues?.(f) ?? [];
    return def.length ? joinOptionLabels(def, dim.options, 1) : "";
  }
  const vals = dim.get(f);
  if (dim.cardinality === "range")
    return stripLabel(rangeChipLabel(dim.label, vals, dim.range?.usd, dim.range?.unit), dim.label);
  if (dim.chipLabel) return stripLabel(dim.chipLabel(vals, dim.options), dim.label);
  if (dim.cardinality === "multi" && vals.length > 1 && vals.length === dim.options.length) return "All";
  return joinOptionLabels(vals, dim.options, 1);
}

/** A group's pill: its state and its words. */
export function pillFor<F>(group: PillGroup<F>, f: F): PillModel<F> {
  const locked = group.dims.some((d) => restsOnConstraint(d, f));
  const active = group.dims.filter((d) => isDimensionActive(d, f));
  const state: PillState = active.length > 0 ? "set" : locked ? "default" : "unset";
  let label = group.name;
  let value = "";
  if (state === "set") {
    if (active.length === 1 && isBoolean(active[0])) {
      label = "";
      value = dimValue(active[0], f);
    } else if (group.dims.length === 1) {
      value = dimValue(active[0], f);
    } else {
      // Several dimensions in one group (Size: Debt and Collateral): each
      // active one says its own name.
      value = active.map((d) => `${d.label} ${dimValue(d, f)}`).join(", ");
    }
  } else if (state === "default") {
    value = group.dims
      .filter((d) => restsOnConstraint(d, f))
      .map((d) => dimValue(d, f))
      .join(", ");
  }
  const spoken = state === "unset" ? `Add ${group.name} filter` : [label, value].filter(Boolean).join(" ");
  return { ...group, state, locked, label, value, spoken };
}

/** Every dimension in the group back to its default. */
export function resetGroup<F>(group: PillGroup<F>, f: F): F {
  let next = f;
  for (const dim of group.dims) next = dim.set(next, dim.defaultValues?.(next) ?? []);
  return next;
}

/** How many groups stand off their default: the Filters badge, and whether
 *  "Clear all" shows. */
export function activeGroupCount<F>(groups: PillGroup<F>[], f: F): number {
  return groups.filter((g) => g.dims.some((d) => isDimensionActive(d, f))).length;
}

/** Every group back to its default, search and sort kept. */
export function resetAll<F>(groups: PillGroup<F>[], f: F): F {
  return groups.reduce((next, g) => resetGroup(g, next), f);
}

/** `names` in the fixed order where they are PILL_ORDER's, the others keeping
 *  their places. */
export function fixedOrder(names: string[]): string[] {
  const rank = (n: string) => PILL_ORDER.indexOf(n);
  const known = names.filter((n) => rank(n) >= 0).sort((a, b) => rank(a) - rank(b));
  let k = 0;
  return names.map((n) => (rank(n) >= 0 ? known[k++] : n));
}

/** The pills in their row's order: set and default pills first, in the order
 *  they were set (`applied`, oldest first; a group missing from it goes after,
 *  in fixed order), then the unset ones in fixed order. */
export function orderPills<F>(pills: PillModel<F>[], applied: string[]): PillModel<F>[] {
  const fixed = fixedOrder(pills.map((p) => p.name));
  const at = (p: PillModel<F>) => fixed.indexOf(p.name);
  const seen = (p: PillModel<F>) => {
    const i = applied.indexOf(p.name);
    return i < 0 ? applied.length + at(p) : i;
  };
  const on = pills.filter((p) => p.state !== "unset").sort((a, b) => seen(a) - seen(b));
  const off = pills.filter((p) => p.state === "unset").sort((a, b) => at(a) - at(b));
  return [...on, ...off];
}

/** The order the set groups were applied in, updated for the groups set now:
 *  a group newly set goes to the end, one no longer set leaves. */
export function nextAppliedOrder(prev: string[], setNow: string[]): string[] {
  const kept = prev.filter((n) => setNow.includes(n));
  return [...kept, ...setNow.filter((n) => !kept.includes(n))];
}

/** The sort pill's accessible name: "Sort: Recent activity, descending". */
export function sortSpoken(label: string, order: "asc" | "desc"): string {
  return `Sort: ${label}, ${order === "asc" ? "ascending" : "descending"}`;
}

/** A dimension's chip, in plain words ("Transactions: ≥ 10"). */
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
 *  521, Miles 7 Nov 2026), in registry order: "<value> <noun>" where the
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

/** The numeric editor's three modes for a count range. */
export type ThresholdMode = "min" | "max" | "between";

/** The mode a count range opens in: Between with both bounds, At most with a
 *  maximum alone, else At least. */
export function thresholdMode(min: number | null, max: number | null): ThresholdMode {
  if (min != null && max != null) return "between";
  if (max != null) return "max";
  return "min";
}
