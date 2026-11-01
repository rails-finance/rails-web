// Dolomite listing filter registry (SERVER-DRIVEN). The listing pages against
// the backend: the selection here maps onto the /api/dolomite/positions fetch
// params (filter + sort + offset), and rails-server does the structural work
// over mv_dolomite_positions at the (owner, account_number) grain. So these
// dimensions carry a `param` (for the shareable URL) but no in-memory
// `matches` predicate — the backend is the filter.
//
// Facets:
//   • Status   — open / closed / liquidated (lifecycle). 'liquidated' names
//     only a CLOSED account — the two-axis status model.
//   • Size: Debt and Collateral ranges in USD (lib/shared/size-dimensions.ts),
//     sent as minDebtUsd / maxDebtUsd / minCollUsd / maxCollUsd. The Debt range
//     replaces the old Position dropdown: its `?state=borrowing` reads as at
//     least $1 and `?state=lending-only` as $0. Those two exact ranges also send
//     the old hasDebt / noDebt flags (any negative par / none), which say the
//     same thing to a server that predates the USD bounds.
//   • Account  — Dolomite Balance (account 0) vs isolated Borrow Positions —
//     Dolomite's own account vocabulary, a facet no other explorer has
//     because no other subject has the two-kind account grain.
//   • History  — Liquidated before (the orthogonal flag): open SURVIVORS
//     match too.
//   • Transactions — a range over tx_count (`minTx` / `maxTx`, inclusive;
//     lib/shared/transactions-dimension.ts).
//   • Owner search (the `q` box → the `owner` param — "this owner's
//     accounts", plural on purpose: the grain is the pair) + recency sort.
//
//   • Assets   — Supplied and Borrowed, one chip per market the core holds,
//     from the market ROSTER (lib/api/fetch-dolomite-market-roster, rails-server
//     `/api/dolomite/market-roster`), fetched once and independent of any
//     filter. The registry is a function of that roster, consumed through the
//     shared driver's dynamic-dimensions seam (decision 0009), the shape the
//     MakerDAO and Morpho listings use. A chip's value is the core's numeric
//     market id (`supplyMarkets` / `borrowMarkets`: par above / below zero),
//     its label the symbol, and the panel's trailing figure the accounts
//     holding the market on that side now (`supplyOpen` / `borrowOpen`), the
//     count the one-sided filter returns for an open account.

import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import type { DolomiteMarketRosterResponse } from "@/lib/api/fetch-dolomite-market-roster";
import { transactionBounds, transactionsDimension } from "@/lib/shared/transactions-dimension";
import { sizeDimensions, usdBounds } from "@/lib/shared/size-dimensions";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { FetchDolomitePositionsParams } from "@/lib/api/fetch-dolomite-positions";
import type { DolomitePositionSort } from "@/lib/sources/api/dolomite-positions";
import {
  canonicalStatuses,
  defaultStatuses,
  effectiveStatuses,
  isAllStatuses,
  sameStatusSet,
} from "@/lib/dolomite/listing-visibility";

/** The Transactions slider's top: the round number above the busiest listed
 *  account (357 transactions, 20 Oct 2026). */
const DOLOMITE_TX_TOP = 400;

/** The Size panel's price line. */
const DOLOMITE_SIZE_NOTE = "At the latest Dolomite oracle price per market, as of the listing's last refresh.";

/** Backend caps `limit` at 100; 20 keeps the page light and the grid familiar. */
export const DOLOMITE_ITEMS_PER_PAGE = 20;

export interface DolomiteListFilters extends BaseListFilters {
  /** open / closed / liquidated — multi (OR). */
  status: string[];
  /** Debt range in USD, one encodeRange value (`1000-50000`, `-0` for no
   *  debt) or [] for no bound. URL param `debt`, read from `state` too. */
  debt: string[];
  /** Collateral range in USD, as `debt`. URL param `coll`. */
  coll: string[];
  /** "" | "dolomite-balance" | "borrow-position" — the account kind. */
  accountKind: string[];
  /** "" | "liquidated" — accounts liquidated at least once (the orthogonal
   *  flag; open survivors included). */
  liquidations: string[];
  /** Transaction-count range, one encodeRange value or [] for no bound. */
  tx: string[];
  /** Market ids the account supplies (par above zero) — multi (OR). URL param `supply`. */
  supply: string[];
  /** Market ids the account borrows (par below zero) — multi (OR). URL param `borrow`. */
  borrow: string[];
}

// No status is written into the page defaults: an empty `status` is "no opinion", and
// listing-visibility.ts resolves it per context — the open accounts on the bare directory,
// every status once the search names an identity. Because the default is contextual rather
// than a selection it draws no chip and no Reset link, and a cleared selection resolves back
// to what the context rests on.
export const DOLOMITE_LIST_DEFAULTS: DolomiteListFilters = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  status: [],
  debt: [],
  coll: [],
  accountKind: [],
  liquidations: [],
  tx: [],
  supply: [],
  borrow: [],
};

// Values match Liquity V2's (lib/liquity-v2/list-filter-dimensions.tsx) so the
// URL grammar (`?sortBy=debt`) is the same across explorers.
export const DOLOMITE_SORT_OPTIONS: SortOption[] = [
  { value: "recent", label: RECENT_ACTIVITY_LABEL },
  { value: "debt", label: "Debt" },
  { value: "coll", label: "Collateral" },
];

const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "liquidated", label: "Liquidated" },
];

const ACCOUNT_KIND_OPTIONS: FilterOptionDef[] = [
  { value: "dolomite-balance", label: "Dolomite Balance" },
  { value: "borrow-position", label: "Borrow Position" },
];

const LIQUIDATION_OPTIONS: FilterOptionDef[] = [{ value: "liquidated", label: "Liquidated before" }];

/** What the driver hands the registry: the roster once it has settled, and
 *  whether it ever will. `loading` and `unavailable` are kept apart because they
 *  call for opposite things: never prune a URL-provided selection while the
 *  answer is still in flight. */
export interface DolomiteRosterState {
  status: "loading" | "ready" | "unavailable";
  roster: DolomiteMarketRosterResponse | null;
}

export const DOLOMITE_ROSTER_LOADING: DolomiteRosterState = { status: "loading", roster: null };

/** Options standing in for a selection made before the roster landed (or made
 *  against a deployment that has none), so an active chip always has a row to
 *  un-tick. */
function selectionOptions(values: string[]): FilterOptionDef[] {
  return values.map((id) => ({ value: id, label: `Market ${id}` }));
}

export function dolomiteListDimensions(
  filters: DolomiteListFilters = DOLOMITE_LIST_DEFAULTS,
  state?: DolomiteRosterState,
): SerializableDimension<DolomiteListFilters>[] {
  const roster = state?.status === "ready" ? state.roster : null;
  const offered = roster != null;
  const marketOptions = (side: "supplyOpen" | "borrowOpen"): FilterOptionDef[] =>
    (roster?.markets ?? []).map((m) => ({
      value: m.marketId,
      label: m.symbol,
      icon: <TokenChipIcon symbol={m.symbol} address={m.token} size={16} filterable={false} />,
      // Panel-only trailing figure, not part of the chip text.
      meta: m[side].toLocaleString("en-US"),
    }));
  return [
    {
      id: "status",
      label: "Status",
      group: "Status",
      cardinality: "multi",
      param: "status",
      options: STATUS_OPTIONS,
      get: (f) => effectiveStatuses(f),
      defaultValues: (f) => defaultStatuses(f),
      defaultChip: (f) => (defaultStatuses(f).length < STATUS_OPTIONS.length ? "Status: Open" : null),
      clearDefault: (f) => ({ ...f, status: STATUS_OPTIONS.map((o) => o.value) }),
      set: (f, v) => {
        const sel = canonicalStatuses(v);
        return { ...f, status: sel.length === 0 || sameStatusSet(sel, defaultStatuses(f)) ? [] : sel };
      },
    },
    ...sizeDimensions<DolomiteListFilters>({
      getDebt: (f) => f.debt,
      setDebt: (f, debt) => ({ ...f, debt }),
      getColl: (f) => f.coll,
      setColl: (f, coll) => ({ ...f, coll }),
      panelNote: DOLOMITE_SIZE_NOTE,
      debtAliases: ["state"],
    }),
    {
      id: "supply",
      label: "Supplied",
      group: "Assets",
      cardinality: "multi",
      param: "supply",
      options: offered ? marketOptions("supplyOpen") : selectionOptions(filters.supply),
      get: (f) => f.supply,
      set: (f, v) => ({ ...f, supply: v }),
      available: (f) => offered || f.supply.length > 0,
    },
    {
      id: "borrow",
      label: "Borrowed",
      group: "Assets",
      cardinality: "multi",
      param: "borrow",
      options: offered ? marketOptions("borrowOpen") : selectionOptions(filters.borrow),
      get: (f) => f.borrow,
      set: (f, v) => ({ ...f, borrow: v }),
      available: (f) => offered || f.borrow.length > 0,
    },
    {
      id: "accountKind",
      label: "Account",
      group: "Account",
      cardinality: "single",
      param: "kind",
      options: ACCOUNT_KIND_OPTIONS,
      get: (f) => f.accountKind,
      set: (f, v) => ({ ...f, accountKind: v }),
    },
    {
      id: "liquidations",
      label: "History",
      group: "History",
      cardinality: "single",
      param: "liq",
      options: LIQUIDATION_OPTIONS,
      get: (f) => f.liquidations,
      set: (f, v) => ({ ...f, liquidations: v }),
      chipLabel: () => "Liquidated before",
    },
    transactionsDimension<DolomiteListFilters>({
      get: (f) => f.tx,
      set: (f, tx) => ({ ...f, tx }),
      top: DOLOMITE_TX_TOP,
    }),
  ];
}

/** Map the decoded selection + page onto the fetch params — the server-driven
 *  counterpart of the in-memory tier's ApplyConfig. */
export function dolomiteFiltersToFetchParams(filters: DolomiteListFilters, page: number): FetchDolomitePositionsParams {
  const kind = filters.accountKind[0];
  const owner = filters.q.trim();
  return {
    owner: owner ? owner : undefined,
    // The full set maps to no status filter; a real subset is sent verbatim.
    status: isAllStatuses(filters) ? undefined : effectiveStatuses(filters),
    // The old Position dropdown's flags, for the two Debt ranges it maps to.
    hasDebt: filters.debt[0] === "1-" ? true : undefined,
    noDebt: filters.debt[0] === "-0" ? true : undefined,
    ...usdBounds(filters),
    kind: kind === "dolomite-balance" ? "balance" : kind === "borrow-position" ? "borrow" : undefined,
    hasLiquidations: filters.liquidations.includes("liquidated") ? true : undefined,
    supplyMarkets: filters.supply.length > 0 ? filters.supply : undefined,
    borrowMarkets: filters.borrow.length > 0 ? filters.borrow : undefined,
    ...transactionBounds(filters.tx),
    sortBy: filters.sortBy as DolomitePositionSort,
    sortOrder: filters.sortOrder,
    limit: DOLOMITE_ITEMS_PER_PAGE,
    offset: (page - 1) * DOLOMITE_ITEMS_PER_PAGE,
  };
}

/** Drop any market id the loaded roster does not offer, else it would sit in the
 *  URL as an invisible predicate no chip can clear. Only ever runs against a
 *  READY roster: pruning while the fetch is in flight, or because it failed,
 *  would wipe a selection a shared link legitimately carried. */
export function reconcileDolomiteMarkets(
  filters: DolomiteListFilters,
  state: DolomiteRosterState | undefined,
): DolomiteListFilters | null {
  if (state?.status !== "ready" || !state.roster) return null;
  const known = new Set(state.roster.markets.map((m) => m.marketId));
  const supply = filters.supply.filter((i) => known.has(i));
  const borrow = filters.borrow.filter((i) => known.has(i));
  return supply.length === filters.supply.length && borrow.length === filters.borrow.length
    ? null
    : { ...filters, supply, borrow };
}
