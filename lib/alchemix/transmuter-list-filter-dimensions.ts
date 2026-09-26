// Transmuter listing filter registry (SERVER-DRIVEN), the twin of
// list-filter-dimensions.ts for the other position type.
//
// Facets:
//   • Line   — the synthetics on THIS explorer's chain, gated against the chain
//     the way the Alchemist facet is, so a link from the other explorer cannot
//     ask this one for a line it does not serve.
//   • Status — maturing / matured / claimed. The backend splits outstanding in
//     two against the line's indexed frontier, so the three never overlap.
//
// THE AMOUNT SORT NEEDS ONE LINE, for the reason the Alchemist debt sort does:
// alUSD and alETH are different tokens, and ranking a page of both by "amount"
// would rank a dollar figure against an ether one. Maturity, creation and id
// are block counts and ids, which mean the same thing on every line.

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import type { SortOption } from "@/components/shared/filter-bar/sort-control";
import type { ChainId } from "@/lib/shared/chains";
import { isLineOnChain, linesForChain, type AlchemixDeployment } from "@/lib/alchemix/lines";
import type {
  AlchemixTransmuterSort,
  FetchAlchemixTransmuterPositionsParams,
} from "@/lib/sources/api/alchemix-transmuter-backend";

export const TRANSMUTER_ITEMS_PER_PAGE = 20;

export interface TransmuterListFilters extends BaseListFilters {
  line: string[];
  status: string[];
}

export const TRANSMUTER_LIST_DEFAULTS: TransmuterListFilters = {
  q: "",
  sortBy: "maturity",
  sortOrder: "desc",
  line: [],
  status: [],
};

const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "maturing", label: "Maturing" },
  { value: "matured", label: "Matured, not claimed" },
  { value: "claimed", label: "Claimed" },
];

const ANY_LINE: SortOption[] = [
  { value: "maturity", label: "Maturity" },
  { value: "created", label: "Created" },
  { value: "nftId", label: "Position id" },
];
const ONE_LINE: SortOption[] = [...ANY_LINE, { value: "amount", label: "Amount staked" }];

export function transmuterSortOptions(f: TransmuterListFilters): SortOption[] {
  return f.line.length === 1 ? ONE_LINE : ANY_LINE;
}

export function transmuterListDimensions(chainId: ChainId): SerializableDimension<TransmuterListFilters>[] {
  return [
    {
      id: "line",
      label: "Line",
      group: "Line",
      cardinality: "multi",
      param: "line",
      options: linesForChain(chainId).map((l) => ({ value: l.key, label: l.displayName })),
      get: (f) => f.line,
      set: (f, v) => ({ ...f, line: v.filter((key) => isLineOnChain(chainId, key)) }),
    },
    {
      id: "status",
      label: "Status",
      group: "Status",
      cardinality: "multi",
      param: "status",
      options: STATUS_OPTIONS,
      get: (f) => f.status,
      set: (f, v) => ({ ...f, status: v }),
    },
  ];
}

/** The decoded selection onto the fetch params. The search box names a
 *  position id or a holder; `chainId` always goes out. */
export function transmuterFiltersToFetchParams(
  deployment: AlchemixDeployment,
  filters: TransmuterListFilters,
  page: number,
): FetchAlchemixTransmuterPositionsParams {
  const lines = filters.line.filter((key) => isLineOnChain(deployment.chainId, key));
  const sorts: AlchemixTransmuterSort[] = ["maturity", "created", "nftId"];
  const sortBy: AlchemixTransmuterSort =
    filters.sortBy === "amount"
      ? lines.length === 1
        ? "amount"
        : "maturity"
      : sorts.includes(filters.sortBy as AlchemixTransmuterSort)
        ? (filters.sortBy as AlchemixTransmuterSort)
        : "maturity";
  const q = filters.q.trim();
  return {
    chainId: deployment.chainId,
    lines,
    owner: /^0x[a-fA-F0-9]{40}$/.test(q) ? q.toLowerCase() : undefined,
    nftId: /^\d+$/.test(q) ? q : undefined,
    status: filters.status,
    sortBy,
    sortOrder: filters.sortOrder,
    limit: TRANSMUTER_ITEMS_PER_PAGE,
    offset: (page - 1) * TRANSMUTER_ITEMS_PER_PAGE,
  };
}
