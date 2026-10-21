// The Size panel every listing shares (ui-jobs 354): two ranges, Debt and
// Collateral, over a position's current balances. On most explorers both are
// valued in USD on the server: one range value each in the URL
// (`?debt=1000-50000`, `?coll=10000-`), the chips "Debt: $1K–$50K" /
// "Collateral: ≥ $10K", and the bounds sent to the backend as minDebtUsd /
// maxDebtUsd / minCollUsd / maxCollUsd. Where the explorer reads no USD price
// for a side, the range is in the protocol's own unit instead (`debtUnit`,
// `collUnit`): the loan token for debt (BOLD, LUSD, fxUSD, ZCHF, a Morpho
// market's loan token), labelled "Debt (BOLD)", the chip "Debt: ≥ 1K BOLD",
// and the bounds sent as minDebt / maxDebt / minColl / maxColl. `sizeBounds`
// writes whichever four a registry's sides take. A registry passes how to
// read and write its filters' `debt` and `coll` fields and the panel's one
// line naming the price or the unit the figures are read in.
//
// Debt with a maximum of 0 is the no-debt set (supply or collateral only),
// and at least 1 is the borrowing set, so the Debt range replaces a
// Borrowing / Supply only dropdown. `debtRangeFromUrl` reads that dropdown's
// old values, so a shared link keeps its meaning: `borrowing` is at least 1,
// `supply-only` (Aave V4's `supplyOnly`), `collateral-only` and `lending-only`
// are 0. A registry that had the dropdown on another param names it in the
// Debt dimension's `aliases`.
// A listing with one side (a lender's deposits, a spoke's supply) passes
// `sides` and `collLabel`; the note sits on the last range drawn. A registry
// whose `coll` param is taken (the collateral-asset facet on Morpho) passes
// `collId`. An in-memory listing filters its rows with `rangeAdmits`.

import type { ReactNode } from "react";
import { decodeRange, normalizeRange, rangeChipLabel } from "@/components/shared/filter-bar/types";
import type { SerializableDimension } from "@/lib/shared/list-filter";

/** The sliders' default top: $1M, or 1M of the unit. A typed bound past it is
 *  still honoured. */
export const SIZE_USD_TOP = 1_000_000;

/** A Debt selection from the URL: the old dropdown's values as their range,
 *  anything else as a range value. */
export function debtRangeFromUrl(values: string[]): string[] {
  const noDebt = ["collateral-only", "supply-only", "supplyOnly", "lending-only"];
  if (values.some((v) => noDebt.includes(v))) return ["-0"];
  if (values.includes("borrowing")) return ["1-"];
  return normalizeRange(values);
}

export function sizeDimensions<F>(opts: {
  getDebt: (f: F) => string[];
  setDebt: (f: F, debt: string[]) => F;
  getColl: (f: F) => string[];
  setColl: (f: F, coll: string[]) => F;
  /** One line at the foot of the panel naming the price source, or the unit. */
  panelNote?: ReactNode;
  /** The sliders' top, in dollars or in the unit. */
  top?: number;
  /** Older params the Debt range reads when `debt` is absent (Aave V3's
   *  `state`). */
  debtAliases?: readonly string[];
  /** Which ranges to draw; both by default. */
  sides?: readonly ("debt" | "coll")[];
  /** The second range's word where "Collateral" is wrong: "Deposited",
   *  "Supply". The label adds the unit; the chip reads "Deposited: ≥ $1K". */
  collLabel?: string;
  /** The Debt range in the loan token rather than USD: "BOLD" draws
   *  "Debt (BOLD)" and "Debt: ≥ 1K BOLD"; a phrase ("loan token") reads the
   *  same way. */
  debtUnit?: string;
  /** The Collateral range in the protocol's own unit rather than USD. */
  collUnit?: string;
  /** The Collateral range's id and URL param where `coll` is taken. */
  collId?: string;
}): SerializableDimension<F>[] {
  const top = opts.top ?? SIZE_USD_TOP;
  const spec = (unit?: string) => (unit ? { min: 0, max: top, unit } : { min: 0, max: top, usd: true });
  const sides = opts.sides ?? ["debt", "coll"];
  const collWord = opts.collLabel ?? "Collateral";
  const collId = opts.collId ?? "coll";
  const debt: SerializableDimension<F> = {
    id: "debt",
    label: `Debt (${opts.debtUnit ?? "USD"})`,
    group: "Size",
    cardinality: "range",
    range: spec(opts.debtUnit),
    param: "debt",
    ...(opts.debtAliases ? { aliases: opts.debtAliases } : {}),
    options: [],
    get: opts.getDebt,
    set: (f, v) => opts.setDebt(f, debtRangeFromUrl(v)),
    chipLabel: (v) => rangeChipLabel("Debt", v, !opts.debtUnit, opts.debtUnit),
  };
  const coll: SerializableDimension<F> = {
    id: collId,
    label: `${collWord} (${opts.collUnit ?? "USD"})`,
    group: "Size",
    cardinality: "range",
    range: spec(opts.collUnit),
    param: collId,
    options: [],
    get: opts.getColl,
    set: (f, v) => opts.setColl(f, normalizeRange(v)),
    chipLabel: (v) => rangeChipLabel(collWord, v, !opts.collUnit, opts.collUnit),
  };
  const dims = [...(sides.includes("debt") ? [debt] : []), ...(sides.includes("coll") ? [coll] : [])];
  const last = dims[dims.length - 1];
  if (last) last.panelNote = opts.panelNote;
  return dims;
}

export interface UsdBounds {
  minDebtUsd: number | undefined;
  maxDebtUsd: number | undefined;
  minCollUsd: number | undefined;
  maxCollUsd: number | undefined;
}

/** The selection as the backend's inclusive USD bounds; undefined when a side
 *  is open. */
export function usdBounds(filters: { debt: string[]; coll: string[] }): UsdBounds {
  const debt = decodeRange(filters.debt);
  const coll = decodeRange(filters.coll);
  return {
    minDebtUsd: debt.min ?? undefined,
    maxDebtUsd: debt.max ?? undefined,
    minCollUsd: coll.min ?? undefined,
    maxCollUsd: coll.max ?? undefined,
  };
}

export interface SizeBounds {
  minDebtUsd?: number;
  maxDebtUsd?: number;
  minCollUsd?: number;
  maxCollUsd?: number;
  minDebt?: number;
  maxDebt?: number;
  minColl?: number;
  maxColl?: number;
}

/**
 * The selection as the backend's inclusive bounds, each side under the four
 * names its measure takes: `usd` → minDebtUsd / maxDebtUsd (minCollUsd /
 * maxCollUsd), `unit` → minDebt / maxDebt (minColl / maxColl). A side the
 * registry does not draw is left out. Only set bounds are present, so the
 * result spreads into a fetch params object as is.
 */
export function sizeBounds(
  filters: { debt?: string[]; coll?: string[] },
  measure: { debt?: "usd" | "unit"; coll?: "usd" | "unit" },
): SizeBounds {
  const out: SizeBounds = {};
  if (measure.debt) {
    const { min, max } = decodeRange(filters.debt ?? []);
    const [lo, hi] =
      measure.debt === "usd" ? (["minDebtUsd", "maxDebtUsd"] as const) : (["minDebt", "maxDebt"] as const);
    if (min != null) out[lo] = min;
    if (max != null) out[hi] = max;
  }
  if (measure.coll) {
    const { min, max } = decodeRange(filters.coll ?? []);
    const [lo, hi] =
      measure.coll === "usd" ? (["minCollUsd", "maxCollUsd"] as const) : (["minColl", "maxColl"] as const);
    if (min != null) out[lo] = min;
    if (max != null) out[hi] = max;
  }
  return out;
}

/** An in-memory listing's predicate for one range selection: does `figure`
 *  sit within the inclusive bounds? A null figure falls out of any bound. */
export function rangeAdmits(values: string[], figure: number | null | undefined): boolean {
  const { min, max } = decodeRange(values);
  if (min == null && max == null) return true;
  if (figure == null || !Number.isFinite(figure)) return false;
  return (min == null || figure >= min) && (max == null || figure <= max);
}
