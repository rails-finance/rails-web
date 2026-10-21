// Basedollar trove listing filter registry (chain-state tier, IN-MEMORY). Basedollar is a small
// set (~91 Troves across 5 branches), so — like Maker / Morpho — the page fetches all
// of them once and filters client-side. Declares the categorical facets (Status,
// Collateral branch) as ListDimensions over the in-memory row set; sort + search are
// the non-categorical controls. All values are read from the chain (replayed status, raw
// collateral / BD debt, user-set interest rate).
//
// Size is the Debt range in BD and the Collateral range in USD
// (lib/shared/size-dimensions.ts): debt is the row's BD amount, since the
// listing reads no USD price for BD, and collateral is the row's collateralUsd at the branch's last indexed price, so an unpriced
// branch falls out of any Collateral bound (an emptied trove reads $0).
// Transactions is a range over the row's txCount
// (lib/shared/transactions-dimension.ts).

import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { DEBT_SYMBOL, indexZombie } from "@/lib/basedollar/asset-catalog";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { ListDimension, BaseListFilters, ApplyConfig } from "@/lib/shared/list-filter";
import type { BasedollarTroveSummary } from "@/lib/sources/api/basedollar-troves";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import { rangeAdmits, sizeDimensions } from "@/lib/shared/size-dimensions";
import { transactionsDimension } from "@/lib/shared/transactions-dimension";

export interface BasedollarListFilters extends BaseListFilters {
  status: string[];
  branches: string[];
  /** Debt range in BD, one encodeRange value or [] for no bound. */
  debt: string[];
  /** Collateral range in USD, as `debt`. */
  coll: string[];
  /** Transaction-count range, one encodeRange value or [] for no bound. */
  tx: string[];
}

export const BASEDOLLAR_LIST_DEFAULTS: BasedollarListFilters = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  status: [],
  branches: [],
  debt: [],
  coll: [],
  tx: [],
};

/** The Transactions slider's top: the round number above the busiest trove
 *  (39 transactions in the api's own count over all 47 troves, 20 Oct 2026). */
const BASEDOLLAR_TX_TOP = 50;

/** The Size panel's price line. */
const BASEDOLLAR_SIZE_NOTE = `Debt in ${DEBT_SYMBOL}; collateral at the branch's last indexed price.`;

export const BASEDOLLAR_SORT_OPTIONS: SortOption[] = [
  { value: "recent", label: RECENT_ACTIVITY_LABEL },
  { value: "collateral", label: "Collateral" },
  { value: "debt", label: "Debt (BD)" },
  { value: "rate", label: "Interest rate" },
];

// Zombie is a first-class bucket (V2-reference parity): the index derivation
// — an open Trove below the MIN_DEBT floor — is the same predicate the row
// pill renders, so the buckets are disjoint: a zombie row does not answer
// "Open". A zombie whose redemption escaped the captured record still reads
// Open (the index can't see it; incomplete, never false).
const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Open" },
  { value: "zombie", label: "Zombie" },
  { value: "closed", label: "Closed" },
  { value: "liquidated", label: "Liquidated" },
];

const lifecycleOf = (row: BasedollarTroveSummary): string =>
  indexZombie(row.status, row.debt) ? "zombie" : row.status;

/** Collateral in USD: $0 once the trove holds none, null while its branch is
 *  unpriced. */
const collUsdOf = (row: BasedollarTroveSummary): number | null => (row.collateral > 0 ? row.collateralUsd : 0);

export function basedollarListDimensions(
  rows: BasedollarTroveSummary[],
): ListDimension<BasedollarListFilters, BasedollarTroveSummary>[] {
  const branchSeen = new Map<string, FilterOptionDef>();
  for (const r of rows) {
    if (!branchSeen.has(r.collateralType)) {
      branchSeen.set(r.collateralType, {
        value: r.collateralType,
        label: r.collateralType,
        icon: <TokenChipIcon symbol={r.collateralType} size={16} filterable={false} />,
      });
    }
  }

  return [
    {
      id: "status",
      label: "Status",
      group: "Status",
      cardinality: "multi",
      param: "status",
      options: STATUS_OPTIONS,
      get: (f) => f.status,
      set: (f, v) => ({ ...f, status: v }),
      matches: (row, v) => v.includes(lifecycleOf(row)),
    },
    {
      id: "branches",
      label: "Collateral",
      group: "Collateral",
      cardinality: "multi",
      param: "branch",
      options: [...branchSeen.values()],
      get: (f) => f.branches,
      set: (f, v) => ({ ...f, branches: v }),
      matches: (row, v) => v.includes(row.collateralType),
    },
    ...sizeDimensions<BasedollarListFilters>({
      getDebt: (f) => f.debt,
      setDebt: (f, debt) => ({ ...f, debt }),
      getColl: (f) => f.coll,
      setColl: (f, coll) => ({ ...f, coll }),
      panelNote: BASEDOLLAR_SIZE_NOTE,
      debtUnit: DEBT_SYMBOL,
    }).map((d) => ({
      ...d,
      matches: (row: BasedollarTroveSummary, v: string[]) =>
        rangeAdmits(v, d.id === "debt" ? row.debt : collUsdOf(row)),
    })),
    {
      ...transactionsDimension<BasedollarListFilters>({
        get: (f) => f.tx,
        set: (f, tx) => ({ ...f, tx }),
        top: BASEDOLLAR_TX_TOP,
      }),
      matches: (row, v) => rangeAdmits(v, row.txCount),
    },
  ];
}

export const BASEDOLLAR_APPLY: ApplyConfig<BasedollarTroveSummary> = {
  // Search matches the trove id, branch, OR the owner (address or ENS) — so the
  // owner pill's `?q=<addr>` deep-link narrows the in-memory set to one wallet's
  // troves. `last_owner` counts too, so a closed trove still answers its owner.
  search: (row, q) =>
    row.id.toLowerCase().includes(q) ||
    row.collateralType.toLowerCase().includes(q) ||
    (row.owner?.toLowerCase().includes(q) ?? false) ||
    (row.lastOwner?.toLowerCase().includes(q) ?? false) ||
    (row.ownerEns?.toLowerCase().includes(q) ?? false),
  sort: {
    recent: (r) => r.lastActivityAt,
    collateral: (r) => r.collateral,
    debt: (r) => r.debt,
    rate: (r) => r.interestRate,
  },
};
