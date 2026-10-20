// The Size panel every listing shares (ui-jobs 354): two USD ranges, Debt and
// Collateral, over a position's current balances valued on the server. One
// range value each in the URL (`?debt=1000-50000`, `?coll=10000-`), the chips
// "Debt: $1K–$50K" / "Collateral: ≥ $10K", and the bounds sent to the backend
// as minDebtUsd / maxDebtUsd / minCollUsd / maxCollUsd (`usdBounds`). A
// registry passes how to read and write its filters' `debt` and `coll` fields
// and the panel's one line naming the price the figures are valued at.
//
// Debt with a maximum of $0 is the no-debt set (supply or collateral only),
// and at least $1 is the borrowing set, so the Debt range replaces a
// Borrowing / Supply only dropdown. `debtRangeFromUrl` reads that dropdown's
// old values, so a shared link keeps its meaning: `borrowing` is at least $1,
// `supply-only` and `collateral-only` are $0. A registry that had the dropdown
// on another param names it in the Debt dimension's `aliases`.

import type { ReactNode } from "react";
import { decodeRange, normalizeRange, rangeChipLabel } from "@/components/shared/filter-bar/types";
import type { SerializableDimension } from "@/lib/shared/list-filter";

/** The sliders' default top: $1M. A typed bound past it is still honoured. */
export const SIZE_USD_TOP = 1_000_000;

/** A Debt selection from the URL: the old dropdown's values as their range,
 *  anything else as a range value. */
export function debtRangeFromUrl(values: string[]): string[] {
  if (values.includes("collateral-only") || values.includes("supply-only")) return ["-0"];
  if (values.includes("borrowing")) return ["1-"];
  return normalizeRange(values);
}

export function sizeDimensions<F>(opts: {
  getDebt: (f: F) => string[];
  setDebt: (f: F, debt: string[]) => F;
  getColl: (f: F) => string[];
  setColl: (f: F, coll: string[]) => F;
  /** One line at the foot of the panel naming the price source. */
  panelNote?: ReactNode;
  /** The sliders' top, in dollars. */
  top?: number;
  /** Older params the Debt range reads when `debt` is absent (Aave V3's
   *  `state`). */
  debtAliases?: readonly string[];
}): SerializableDimension<F>[] {
  const range = { min: 0, max: opts.top ?? SIZE_USD_TOP, usd: true };
  return [
    {
      id: "debt",
      label: "Debt (USD)",
      group: "Size",
      cardinality: "range",
      range,
      param: "debt",
      ...(opts.debtAliases ? { aliases: opts.debtAliases } : {}),
      options: [],
      get: opts.getDebt,
      set: (f, v) => opts.setDebt(f, debtRangeFromUrl(v)),
      chipLabel: (v) => rangeChipLabel("Debt", v, true),
    },
    {
      id: "coll",
      label: "Collateral (USD)",
      group: "Size",
      cardinality: "range",
      range,
      param: "coll",
      options: [],
      get: opts.getColl,
      set: (f, v) => opts.setColl(f, normalizeRange(v)),
      chipLabel: (v) => rangeChipLabel("Collateral", v, true),
      panelNote: opts.panelNote,
    },
  ];
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
