// Alchemix listing filter registry (SERVER-DRIVEN). rails-server does the
// structural work at the (lineKey, tokenId) grain, so these dimensions carry a
// `param` for the shareable URL and no in-memory `matches` predicate.
//
// Facets:
//   • Line   — the synthetics on THIS explorer's chain. Multi-select, because a
//     wallet can hold a position on more than one line of a chain. The options
//     are built from the chain, never from a flat line list, so one explorer
//     can never offer the other chain's line.
//   • Status — open / closed / refused / unknown, the API's whole vocabulary.
//     `refused` is the reducer declining a position outright and `unknown` is a
//     read-grade line with no current reading, and both are kept selectable:
//     hiding them would make the listing quietly claim a completeness the data
//     does not have.
//
// THERE IS NO GRADE FACET, although the API takes one. The grade is a property
// of the LINE, not of the position (rails-ops decisions/0032), so filtering by
// it would only be a second, less legible way to pick lines — and it would
// teach a reader that the grade is something a position has. The Line facet is
// the honest control, and the grade is stated in words beside the figures.
//
// THERE IS NO DEBT SORT ACROSS LINES YET. alUSD and alETH are different tokens,
// so ranking one page by "debt" would rank a dollar figure against an ether one
// as though they were one number. Debt and collateral sorts are offered once
// exactly one line is chosen; otherwise the sort is the position's own
// activity, which is a count of blocks and means the same thing on every line.

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { ChainId } from "@/lib/shared/chains";
import { isLineOnChain, linesForChain, type AlchemixDeployment } from "@/lib/alchemix/lines";
import type { FetchAlchemixPositionsParams } from "@/lib/api/fetch-alchemix-positions";

export const ALCHEMIX_ITEMS_PER_PAGE = 20;

export interface AlchemixListFilters extends BaseListFilters {
  /** Line keys on this explorer's chain. */
  line: string[];
  /** open / closed / refused / unknown — multi (OR). */
  status: string[];
}

export const ALCHEMIX_LIST_DEFAULTS: AlchemixListFilters = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  line: [],
  status: [],
};

const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "unknown", label: "No current reading" },
  { value: "refused", label: "Refused" },
];

const ACTIVITY_ONLY: SortOption[] = [{ value: "recent", label: RECENT_ACTIVITY_LABEL }];
const WITH_LINE: SortOption[] = [
  { value: "recent", label: RECENT_ACTIVITY_LABEL },
  { value: "debt", label: "Debt" },
  { value: "collateral", label: "Collateral" },
  { value: "tokenId", label: "Position id" },
];

/** Debt and collateral sorts appear once exactly one line is chosen — see the
 *  header. With none or several chosen the page spans two debt tokens. */
export function alchemixSortOptions(f: AlchemixListFilters): SortOption[] {
  return f.line.length === 1 ? WITH_LINE : ACTIVITY_ONLY;
}

export function alchemixListDimensions(chainId: ChainId): SerializableDimension<AlchemixListFilters>[] {
  const lineOptions: FilterOptionDef[] = linesForChain(chainId).map((l) => ({
    value: l.key,
    label: l.displayName,
  }));
  return [
    {
      id: "line",
      label: "Line",
      group: "Line",
      cardinality: "multi",
      param: "line",
      options: lineOptions,
      get: (f) => f.line,
      // A line key is only meaningful with its chain, so a key arriving from a
      // URL is tested against THIS chain's lines and dropped when it is not one
      // of them. Without the gate a link built on the other explorer would ask
      // this one for a line it does not serve, and the page would answer empty
      // as though the wallet held nothing.
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

/** Map the decoded selection + page onto the fetch params.
 *
 *  The search box names a position id or a holder. A debt or collateral sort
 *  without exactly one line falls back to activity — the wire never ranks two
 *  tokens as one number, whatever a stale URL says.
 *
 *  `chainId` always goes out, and the line filter is narrowed to this chain's
 *  lines before it does. Both halves of the position's identity are on every
 *  request, so this explorer cannot be served the other chain's rows. */
export function alchemixFiltersToFetchParams(
  deployment: AlchemixDeployment,
  filters: AlchemixListFilters,
  page: number,
): FetchAlchemixPositionsParams {
  const lines = filters.line.filter((key) => isLineOnChain(deployment.chainId, key));
  const oneLine = lines.length === 1;
  const sortBy =
    filters.sortBy === "debt" || filters.sortBy === "collateral"
      ? oneLine
        ? filters.sortBy
        : "lastActivity"
      : filters.sortBy === "tokenId"
        ? "tokenId"
        : "lastActivity";
  const q = filters.q.trim();
  return {
    chainId: deployment.chainId,
    lines,
    owner: /^0x[a-fA-F0-9]{40}$/.test(q) ? q.toLowerCase() : undefined,
    tokenId: /^\d+$/.test(q) ? q : undefined,
    status: filters.status,
    sortBy,
    sortOrder: filters.sortOrder,
    limit: ALCHEMIX_ITEMS_PER_PAGE,
    offset: (page - 1) * ALCHEMIX_ITEMS_PER_PAGE,
  };
}
