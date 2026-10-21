import type { ReactNode } from "react";

/**
 * Generic, registry-driven filter grammar for listing pages.
 *
 * A filter is a predicate over the rail's filter-param object `F`. Each
 * dimension declares how to read its current selection out of `F`, how to write
 * a new selection back, and how to render itself as a chip. The FilterBar holds
 * no state of its own beyond which popover is open — the param object (which
 * lives in the URL) is the single source of truth.
 *
 * Expressiveness model: OR within a dimension (multi-select values), AND across
 * dimensions (stacked chips). No boolean nesting — that's a deliberate non-goal
 * (it fights the minimal aim). See memory `feedback-minimal-filter-ux`.
 */

export interface FilterOptionDef {
  value: string;
  label: string;
  /** Optional leading glyph (e.g. a token chip for asset dimensions). */
  icon?: ReactNode;
  /** Optional trailing figure shown muted at the end of the option row — how
   *  many rows the option would reach (Morpho's per-market position count).
   *  Panel-only: it is not part of the chip text, and the panel's type-to-filter
   *  box matches `label` alone, so a count can never be searched by accident. */
  meta?: string;
}

export interface FilterDimension<F> {
  /** Stable id — React key + popover drill-in target. */
  id: string;
  /** Human label: shown in the + Filter menu and (by default) the chip prefix. */
  label: string;
  /** "single" → radio (one value; picking applies + closes; re-picking clears).
   *  "multi" → checkboxes (OR within; toggles, popover stays open).
   *  "range" → a numeric range: a two-handle slider plus Min / Max inputs
   *  (./range-control). Its selection is one `encodeRange` string, or [] when
   *  neither bound is set. Needs `range`; `options` is []. */
  cardinality: "single" | "multi" | "range";
  /** Selectable values. For async universes (assets) pass the resolved list in. */
  options: FilterOptionDef[];
  /** The slider's span, for a "range" dimension. A handle at either end means
   *  no bound on that side; the inputs take values past `max`. */
  range?: RangeSpec;
  /** Current selection as a list of option keys ([] = inactive). */
  get: (f: F) => string[];
  /** Apply a new selection, returning the updated filter object. */
  set: (f: F, values: string[]) => F;
  /** The selection that counts as the contextual default — rendered as NO chip
   *  and treated as "inactive" (e.g. visibility relaxing to "all" on a wallet
   *  view, so it never shows a chip). Defaults to [] (empty). */
  defaultValues?: (f: F) => string[];
  /** Chip text for the default selection, where the default is a
   *  constraint worth naming ("Status: in escrow"). Drawn while the dimension is
   *  inactive; fixed unless `clearDefault` is set. Null or unset draws nothing. */
  defaultChip?: (f: F) => string | null;
  /** Gives the default chip a remove control: returns the filters with the
   *  dimension widened to an explicit selection of every option. Reset then
   *  returns to the resting default. */
  clearDefault?: (f: F) => F;
  /** Chip text for an active selection. Default: `${label}: a, b (+N)`. */
  chipLabel?: (values: string[], options: FilterOptionDef[]) => string;
  /** Optional grouping header in the + Filter menu (insertion order preserved). */
  group?: string;
  /** Optional node rendered to the right of this dimension's sub-header inside a
   *  multi-dimension group panel (e.g. a "compare" link beside the Hub title).
   *  Only shown when the group holds more than one dimension. */
  labelAction?: ReactNode;
  /** Hide from the + Filter menu when false (e.g. Borrowing while Supply-only). */
  available?: (f: F) => boolean;
  /** One short line at the foot of the dimension's group panel (the price
   *  source a USD range is valued at). A group draws the first one it holds. */
  panelNote?: ReactNode;
}

/** Active iff the current selection differs from the dimension's default. */
export function isDimensionActive<F>(dim: FilterDimension<F>, f: F): boolean {
  const cur = dim.get(f);
  const def = dim.defaultValues?.(f) ?? [];
  if (cur.length !== def.length) return true;
  const defSet = new Set(def);
  return cur.some((v) => !defSet.has(v));
}

/** Default chip text: `Label: first, second (+N)`. */
export function defaultChipLabel(label: string, values: string[], options: FilterOptionDef[]): string {
  return `${label}: ${joinOptionLabels(values, options)}`;
}

/** Join option labels, truncating past two to `a, b +N`. */
export function joinOptionLabels(values: string[], options: FilterOptionDef[], max = 2): string {
  const byVal = new Map(options.map((o) => [o.value, o.label]));
  const labels = values.map((v) => byVal.get(v) ?? v);
  const shown = labels.slice(0, max).join(", ");
  const extra = labels.length > max ? ` +${labels.length - max}` : "";
  return `${shown}${extra}`;
}

/** The span a "range" dimension's slider covers. The slider steps through the
 *  1-2-2.5-3-4-5 series between the two ends, so it reads on a log scale. */
export interface RangeSpec {
  min: number;
  max: number;
  /** Values are US dollars: the ends, the chip and the inputs read `$1.5K`. */
  usd?: boolean;
  /** Values are in a protocol's own unit, written after the figure: `1.5K BOLD`.
   *  The inputs take the bare number. */
  unit?: string;
}

/** A range value for display: `1,500`; `$1.5K` on a USD range; `1.5K BOLD`
 *  on a range in a unit. */
export function formatRangeValue(v: number, usd?: boolean, unit?: string): string {
  if (!usd && !unit) return v.toLocaleString("en-US");
  const n =
    v < 1000
      ? v.toLocaleString("en-US")
      : Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(v);
  return usd ? `$${n}` : `${n} ${unit}`;
}

/** A range selection; null is no bound on that side. */
export interface RangeBounds {
  min: number | null;
  max: number | null;
}

/** One range as its selection value: `10-500`, `10-` or `-500`; [] when both
 *  sides are open. A single string, so the URL codec carries it as any other
 *  value (`?tx=10-500`). */
export function encodeRange(b: RangeBounds): string[] {
  if (b.min == null && b.max == null) return [];
  return [`${b.min ?? ""}-${b.max ?? ""}`];
}

/** The inverse of encodeRange. A side that is not a non-negative integer reads
 *  as open, and a pair given high-low is put in order. */
export function decodeRange(values: string[]): RangeBounds {
  const m = /^(\d*)-(\d*)$/.exec(values[0] ?? "");
  if (!m) return { min: null, max: null };
  const min = m[1] ? Number(m[1]) : null;
  const max = m[2] ? Number(m[2]) : null;
  if (min != null && max != null && min > max) return { min: max, max: min };
  return { min, max };
}

/** Canonical form of a range selection: decoded, ordered, re-encoded. */
export function normalizeRange(values: string[]): string[] {
  return encodeRange(decodeRange(values));
}

/** Chip text for a range: `Transactions: 10–500`, `Transactions: ≥ 10`,
 *  `Transactions: ≤ 500`; `Debt: $1K–$50K` on a USD range. A maximum of 0
 *  alone reads as the one value it allows. */
export function rangeChipLabel(label: string, values: string[], usd?: boolean, unit?: string): string {
  const { min, max } = decodeRange(values);
  const n = (v: number) => formatRangeValue(v, usd, unit);
  if (min != null && max != null) return min === max ? `${label}: ${n(min)}` : `${label}: ${n(min)}–${n(max)}`;
  if (max === 0) return `${label}: ${n(0)}`;
  if (min != null) return `${label}: ≥ ${n(min)}`;
  if (max != null) return `${label}: ≤ ${n(max)}`;
  return label;
}
