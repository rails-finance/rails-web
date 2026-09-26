// V2 listing filter registry (SERVER-DRIVEN), the twin of
// list-filter-dimensions.ts for the closed version.
//
// Facets:
//   • Line: the two V2 lines, gated against the chain.
//   • Debt: the sign of the frozen debt: debt, credit, none. A credit is a
//     negative debt, and the facet keeps the two apart rather than netting.
//
// THE DEBT SORT NEEDS ONE LINE, for the reason the V3 debt sort does: alUSD and
// alETH are different tokens.

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import type { SortOption } from "@/components/shared/filter-bar/sort-control";
import type { ChainId } from "@/lib/shared/chains";
import { isV2LineOnChain, v2LinesForChain, type AlchemixDeployment } from "@/lib/alchemix/lines";
import type { AlchemixV2Sort, FetchAlchemixV2PositionsParams } from "@/lib/sources/api/alchemix-v2-backend";

export const V2_ITEMS_PER_PAGE = 20;

export interface V2ListFilters extends BaseListFilters {
  line: string[];
  status: string[];
}

export const V2_LIST_DEFAULTS: V2ListFilters = {
  q: "",
  sortBy: "lastActivity",
  sortOrder: "desc",
  line: [],
  status: [],
};

const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "debt", label: "Left owing" },
  { value: "credit", label: "Left in credit" },
  { value: "none", label: "Nothing owed" },
];

const ANY_LINE: SortOption[] = [
  { value: "lastActivity", label: "Last activity" },
  { value: "created", label: "First activity" },
  { value: "events", label: "Events" },
];
const ONE_LINE: SortOption[] = [...ANY_LINE, { value: "debt", label: "Debt at close" }];

export function v2SortOptions(f: V2ListFilters): SortOption[] {
  return f.line.length === 1 ? ONE_LINE : ANY_LINE;
}

export function v2ListDimensions(chainId: ChainId): SerializableDimension<V2ListFilters>[] {
  return [
    {
      id: "line",
      label: "Line",
      group: "Line",
      cardinality: "multi",
      param: "line",
      options: v2LinesForChain(chainId).map((l) => ({ value: l.key, label: l.displayName })),
      get: (f) => f.line,
      set: (f, v) => ({ ...f, line: v.filter((key) => isV2LineOnChain(chainId, key)) }),
    },
    {
      id: "status",
      label: "At close",
      group: "At close",
      cardinality: "multi",
      param: "status",
      options: STATUS_OPTIONS,
      get: (f) => f.status,
      set: (f, v) => ({ ...f, status: v }),
    },
  ];
}

/** The decoded selection onto the fetch params. The search box names the
 *  account. */
export function v2FiltersToFetchParams(
  deployment: AlchemixDeployment,
  filters: V2ListFilters,
  page: number,
): FetchAlchemixV2PositionsParams {
  const lines = filters.line.filter((key) => isV2LineOnChain(deployment.chainId, key));
  const sorts: AlchemixV2Sort[] = ["lastActivity", "created", "events"];
  const sortBy: AlchemixV2Sort =
    filters.sortBy === "debt"
      ? lines.length === 1
        ? "debt"
        : "lastActivity"
      : sorts.includes(filters.sortBy as AlchemixV2Sort)
        ? (filters.sortBy as AlchemixV2Sort)
        : "lastActivity";
  const q = filters.q.trim();
  return {
    lines,
    owner: /^0x[a-fA-F0-9]{40}$/.test(q) ? q.toLowerCase() : undefined,
    status: filters.status,
    sortBy,
    sortOrder: filters.sortOrder,
    limit: V2_ITEMS_PER_PAGE,
    offset: (page - 1) * V2_ITEMS_PER_PAGE,
  };
}
