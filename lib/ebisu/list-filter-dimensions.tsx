// Ebisu trove listing filter registry (chain-state tier, IN-MEMORY). Ebisu is a small
// set (~91 Troves across 5 branches), so — like Maker / Morpho — the page fetches all
// of them once and filters client-side. Declares the categorical facets (Status,
// Collateral branch) as ListDimensions over the in-memory row set; sort + search are
// the non-categorical controls. All values are read from the chain (replayed status, raw
// collateral / ebUSD debt, user-set interest rate). No collateral-ratio / USD facet —
// Ebisu ships no oracle here, so those interpreted axes can't be offered.

import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { indexZombie } from "@/lib/ebisu/asset-catalog";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { ListDimension, BaseListFilters, ApplyConfig } from "@/lib/shared/list-filter";
import type { EbisuTroveSummary } from "@/lib/sources/api/ebisu-troves";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";

export interface EbisuListFilters extends BaseListFilters {
  status: string[];
  branches: string[];
}

export const EBISU_LIST_DEFAULTS: EbisuListFilters = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  status: [],
  branches: [],
};

export const EBISU_SORT_OPTIONS: SortOption[] = [
  { value: "recent", label: RECENT_ACTIVITY_LABEL },
  { value: "collateral", label: "Collateral" },
  { value: "debt", label: "Debt (ebUSD)" },
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

const lifecycleOf = (row: EbisuTroveSummary): string => (indexZombie(row.status, row.debt) ? "zombie" : row.status);

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
