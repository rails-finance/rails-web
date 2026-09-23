// Polaris listing filter registry (SERVER-DRIVEN). The listing pages against
// the backend: the selection here maps onto the /api/polaris/positions fetch
// params (filter + sort + offset), and rails-server does the structural work
// at the (market, cdpId) grain. So these dimensions carry a `param` (for the
// shareable URL) but no in-memory `matches` predicate — the backend is the
// filter.
//
// Facets:
//   • Market  — USDp / GOLDp (single). Every CDP lives in exactly one.
//   • Status  — open / closed / liquidated, the API's whole lifecycle
//     vocabulary, resting on a CONTEXTUAL default (listing-visibility.ts).
//   • Debt    — "Borrowing" (the last state carries debt) or "Collateral
//     only" (pETH deposited, nothing minted — 213 of 5,428 open CDPs on
//     2026-09-10). A CDP with no debt has no ratio and sorts last in both
//     directions of every sort, so the second option is the only way to see
//     that set. Single-select: one chip, no negation.
//   • (There is no "Liquidated before" facet. On Polaris a liquidation clears
//     the whole CDP and burns the NFT, and the id is never reused, so "ever
//     liquidated" is the Status bucket "Liquidated" — the two-axis shape
//     belongs to the lenders where a position survives a partial liquidation.
//     Retired 2026-09-10; it had been a server no-op since it shipped.)
//   • Identity search (the `q` box) + recency sort.
//
// The free-text search is the driver's `q`; it carries the tri-modal identity
// lookup (CDP number / holder address / ENS), parsed in lib/polaris/search.ts
// and mapped onto the right fetch param by polarisFiltersToFetchParams below.
// That same parse decides the resting status default (listing-visibility.ts),
// which is why it lives in its own module rather than here.
//
// Debt, collateral and ratio sorts are offered only once a market is chosen:
// the two markets' debts are different tokens, and a mixed page sorted by
// "debt" would rank USDp against GOLDp as if they were one number. The ratio
// sort is the index's own coll ÷ debt — within one market the collateral
// ratio is that quotient times one price, so the ORDER needs no price (the
// figure each card shows is valued from the market board; see
// polaris-position-card.tsx). Ascending surfaces the CDPs nearest the floor,
// which is what a reviewer's first look asked for (2026-09-10).

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { FetchPolarisPositionsParams } from "@/lib/api/fetch-polaris-positions";
import type { PolarisPositionSort } from "@/lib/sources/api/polaris-positions";
import { normalizeMarket } from "@/lib/polaris/asset-catalog";
import { parsePolarisSearch } from "@/lib/polaris/search";
import {
  canonicalStatuses,
  defaultStatuses,
  effectiveStatuses,
  isAllStatuses,
  sameStatusSet,
} from "@/lib/polaris/listing-visibility";

export const POLARIS_ITEMS_PER_PAGE = 20;

export interface PolarisListFilters extends BaseListFilters {
  /** "" | "usdp" | "goldp" */
  market: string[];
  /** open / closed / liquidated — multi (OR). RAW intent: empty is "no
   *  opinion" and resolves to the contextual default (listing-visibility.ts). */
  status: string[];
  /** "" | "borrowing" | "collateral-only" */
  debt: string[];
}

// No status is written into the page defaults: an empty `status` is "no
// opinion", and listing-visibility.ts resolves it per context — the open CDPs on
// the bare directory, every status once the search names a holder or a CDP
// number. Because the default is contextual rather than a selection it draws no
// chip and no Reset link, and a cleared selection always resolves back to
// whatever the current context rests on.
export const POLARIS_LIST_DEFAULTS: PolarisListFilters = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  market: [],
  status: [],
  debt: [],
};

const RECENT_ONLY: SortOption[] = [{ value: "recent", label: RECENT_ACTIVITY_LABEL }];
const WITH_MARKET: SortOption[] = [
  { value: "recent", label: RECENT_ACTIVITY_LABEL },
  { value: "debt", label: "Debt" },
  { value: "coll", label: "Collateral" },
  { value: "ratio", label: "Ratio" },
];

/** Debt / Collateral / Ratio sorts appear once a market is chosen (see the header). */
export function polarisSortOptions(f: PolarisListFilters): SortOption[] {
  return normalizeMarket(f.market[0]) ? WITH_MARKET : RECENT_ONLY;
}

/** The bare options — the SSR decode path's default. The client toolbar
 *  passes the same two with the stable's token glyph (polaris-listing.tsx). */
export const MARKET_OPTIONS: FilterOptionDef[] = [
  { value: "usdp", label: "USDp" },
  { value: "goldp", label: "GOLDp" },
];

const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "liquidated", label: "Liquidated" },
];

const DEBT_OPTIONS: FilterOptionDef[] = [
  { value: "borrowing", label: "Borrowing" },
  { value: "collateral-only", label: "Collateral only" },
];

/**
 * Market options can be injected with token glyphs for the client toolbar;
 * the SSR decode path calls this bare. Options do not enter the URL codec or
 * the list key, only the toolbar's chrome, so both halves derive an identical
 * key (Liquity V2's own split, liquity-v2-listing.tsx).
 */
export function polarisListDimensions(
  marketOptions: FilterOptionDef[] = MARKET_OPTIONS,
): SerializableDimension<PolarisListFilters>[] {
  return [
    {
      id: "market",
      label: "Market",
      group: "Market",
      cardinality: "single",
      param: "market",
      options: marketOptions,
      get: (f) => f.market,
      set: (f, v) => ({ ...f, market: v }),
    },
    // Status is a multi-select over the three lifecycle buckets. All three
    // selected = "show everything" (no server filter). Empty = the contextual
    // default (open CDPs while browsing, everything on an identity search), so
    // `set` writes the empty intent whenever the choice equals that default —
    // keeping the URL clean and the relax-on-search behaviour intact.
    {
      id: "status",
      label: "Status",
      group: "Status",
      cardinality: "multi",
      param: "status",
      options: STATUS_OPTIONS,
      get: (f) => effectiveStatuses(f),
      defaultValues: (f) => defaultStatuses(f),
      set: (f, v) => {
        const sel = canonicalStatuses(v);
        const def = defaultStatuses(f);
        return { ...f, status: sel.length === 0 || sameStatusSet(sel, def) ? [] : sel };
      },
    },
    {
      id: "debt",
      label: "Debt",
      group: "Debt",
      cardinality: "single",
      param: "debt",
      options: DEBT_OPTIONS,
      get: (f) => f.debt,
      set: (f, v) => ({ ...f, debt: v }),
    },
  ];
}

/** Map the decoded selection + page onto the fetch params. A debt/coll sort
 *  without a market falls back to recent — the wire never ranks two tokens
 *  as one number, whatever a stale URL says.
 *
 *  The search box dispatches by what it names: a CDP number goes out as `id`, a
 *  holder address as `wallet`. An `id` needs NO market — measured 2026-09-10,
 *  the index answers a bare `id` with that number in BOTH markets (usdp/27 +
 *  goldp/27, total 2), so the search fans out server-side and the web makes one
 *  call; a chosen Market facet narrows it as any other filter does. An ENS name
 *  resolves to an address one step earlier (listing-fetch.ts) — this route does
 *  not resolve names, and a non-address `wallet` is a 400 — so it leaves
 *  `wallet` unset here. Free text that names no identity filters nothing. */
export function polarisFiltersToFetchParams(filters: PolarisListFilters, page: number): FetchPolarisPositionsParams {
  const market = normalizeMarket(filters.market[0]);
  const { cdpId, ownerAddress } = parsePolarisSearch(filters.q);
  const sortBy = (
    filters.sortBy === "debt" || filters.sortBy === "coll" || filters.sortBy === "ratio"
      ? market
        ? filters.sortBy
        : "recent"
      : "recent"
  ) as PolarisPositionSort;
  return {
    market: market ?? undefined,
    cdpId,
    wallet: ownerAddress,
    // The full set maps to no status filter; a real subset is sent verbatim.
    status: isAllStatuses(filters) ? undefined : effectiveStatuses(filters),
    hasDebt: filters.debt.includes("borrowing") ? true : filters.debt.includes("collateral-only") ? false : undefined,
    sortBy,
    sortOrder: filters.sortOrder,
    limit: POLARIS_ITEMS_PER_PAGE,
    offset: (page - 1) * POLARIS_ITEMS_PER_PAGE,
  };
}
