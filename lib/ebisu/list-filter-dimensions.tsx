// Ebisu trove listing filter registry (chain-state tier, IN-MEMORY). Ebisu is a small
// set (~91 Troves across 5 branches), so — like Maker / Morpho — the page fetches all
// of them once and filters client-side. Declares the categorical facets (Status,
// Collateral branch) as ListDimensions over the in-memory row set; sort + search are
// the non-categorical controls. All values are read from the chain (replayed status, raw
// collateral / ebUSD debt, user-set interest rate).
//
// Size is the Debt and Collateral ranges in USD (lib/shared/size-dimensions.ts):
// debt is ebUSD at face value, a dollar a coin for this facet, and collateral is
// the row's collateralUsd at the branch's last indexed price, so an unpriced
// branch falls out of any Collateral bound (an emptied trove reads $0).
// Transactions is a range over the row's txCount
// (lib/shared/transactions-dimension.ts).

import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { ListDimension, BaseListFilters, ApplyConfig } from "@/lib/shared/list-filter";
import type { EbisuTroveSummary } from "@/lib/sources/api/ebisu-troves";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import { rangeAdmits, sizeDimensions } from "@/lib/shared/size-dimensions";
import { transactionsDimension } from "@/lib/shared/transactions-dimension";

export interface EbisuListFilters extends BaseListFilters {
  status: string[];
  branches: string[];
  /** Debt range in USD, one encodeRange value or [] for no bound. */
  debt: string[];
  /** Collateral range in USD, as `debt`. */
  coll: string[];
  /** Transaction-count range, one encodeRange value or [] for no bound. */
  tx: string[];
}

export const EBISU_LIST_DEFAULTS: EbisuListFilters = {
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
 *  (209 transactions in the api's own count over all 91 troves, 20 Oct 2026). */
const EBISU_TX_TOP = 250;

/** The Size panel's price line. */
const EBISU_SIZE_NOTE = "Collateral at the branch's last indexed price; debt in ebUSD at face value.";

export const EBISU_SORT_OPTIONS: SortOption[] = [
  { value: "recent", label: RECENT_ACTIVITY_LABEL },
  { value: "collateral", label: "Collateral" },
  { value: "debt", label: "Debt (ebUSD)" },
  { value: "rate", label: "Interest rate" },
];

// Zombie is a first-class bucket (Liquity V2 parity): an open Trove the server
// marks zombie (`isZombie` on the served row) answers "Zombie" and not "Open",
// the predicate the card's pill reads, so the buckets are disjoint. The web does
// not derive the state from debt: an Ebisu redemption can leave a Trove below
// MIN_DEBT that the chain still reads Active (ui-jobs 420).
const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Open" },
  { value: "zombie", label: "Zombie" },
  { value: "closed", label: "Closed" },
  { value: "liquidated", label: "Liquidated" },
];

const lifecycleOf = (row: EbisuTroveSummary): string => (row.status === "open" && row.isZombie ? "zombie" : row.status);

/** Collateral in USD: $0 once the trove holds none, null while its branch is
 *  unpriced. */
const collUsdOf = (row: EbisuTroveSummary): number | null => (row.collateral > 0 ? row.collateralUsd : 0);

export function ebisuListDimensions(rows: EbisuTroveSummary[]): ListDimension<EbisuListFilters, EbisuTroveSummary>[] {
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
    ...sizeDimensions<EbisuListFilters>({
      getDebt: (f) => f.debt,
      setDebt: (f, debt) => ({ ...f, debt }),
      getColl: (f) => f.coll,
      setColl: (f, coll) => ({ ...f, coll }),
      panelNote: EBISU_SIZE_NOTE,
    }).map((d) => ({
      ...d,
      matches: (row: EbisuTroveSummary, v: string[]) => rangeAdmits(v, d.id === "debt" ? row.debt : collUsdOf(row)),
    })),
    {
      ...transactionsDimension<EbisuListFilters>({
        get: (f) => f.tx,
        set: (f, tx) => ({ ...f, tx }),
        top: EBISU_TX_TOP,
      }),
      matches: (row, v) => rangeAdmits(v, row.txCount),
    },
  ];
}

export const EBISU_APPLY: ApplyConfig<EbisuTroveSummary> = {
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
