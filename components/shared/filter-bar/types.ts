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
   *  "multi" → checkboxes (OR within; toggles, popover stays open). */
  cardinality: "single" | "multi";
  /** Selectable values. For async universes (assets) pass the resolved list in. */
  options: FilterOptionDef[];
  /** Current selection as a list of option keys ([] = inactive). */
  get: (f: F) => string[];
  /** Apply a new selection, returning the updated filter object. */
  set: (f: F, values: string[]) => F;
  /** The selection that counts as the contextual default — rendered as NO chip
   *  and treated as "inactive" (e.g. visibility relaxing to "all" on a wallet
   *  view, so it never shows a chip). Defaults to [] (empty). */
  defaultValues?: (f: F) => string[];
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
