// SparkLend listing filter registry (chain-state tier, SERVER-DRIVEN). Unlike the
// small chain-state listings (Morpho / Maker / PWN / Liquity V1) — which fetch the
// whole set once and filter it in memory — SparkLend has ~6k positions, so it pages
// against the backend: the selection here maps onto the /api/spark/positions fetch
// params (filter + sort + offset), and rails-server does the structural work over
// mv_spark_positions. So these dimensions carry a `param` (for the shareable URL)
// but no in-memory `matches` predicate — the backend is the filter.
//
// This is the template for the larger chain-state protocols (Compound, Aave V3):
// author a registry + a `*FiltersToFetchParams` mapping, and the shared
// <ChainTruthListing> server-body wires the toolbar + pagination.
//
// Facets that ship LIVE (backend + proxy honor the params):
//   • Status   — Open / Closed / All (ui-jobs 805), over mv_spark_wallets,
//     resting on a CONTEXTUAL default (lib/spark/listing-visibility.ts), and
//     Closed by liquidation with Closed.
//   • Size: Debt and Collateral ranges in USD (lib/shared/size-dimensions.ts),
//     sent as minDebtUsd / maxDebtUsd / minCollUsd / maxCollUsd. The Debt range
//     replaces the old Position dropdown: its `?state=borrowing` reads as at
//     least $1 and `?state=supply-only` as $0. Those two exact ranges also send
//     the old hasDebt / noDebt flags, which say the same thing to a server that
//     predates the USD bounds.
//   • History  — Liquidated before (hasLiquidations, = ever liquidated).
//   • Transactions — a range over tx_count (`minTx` / `maxTx`, inclusive), the
//     distinct transactions on the wallet, liquidations included
//     (lib/shared/transactions-dimension.ts).
//   • Wallet search (exact address → the `wallet` param) and Recent activity /
//     Debt / Collateral sort (mig 183's debt_usd/collateral_usd on
//     mv_spark_wallets — a ranking aid, never displayed; the card's HF/USD
//     stays chain-truth/overlay-derived).
//   • Supplying / Borrowing — per-asset facets over the SPARK_CATALOG reserve
//     universe (the full Pool.getReservesList set); chips carry symbols, the
//     proxy maps them to addresses, the backend matches within the position.

import { transactionBounds, transactionsDimension } from "@/lib/shared/transactions-dimension";
import { sizeDimensions, usdBounds } from "@/lib/shared/size-dimensions";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { FetchSparkPositionsParams } from "@/lib/api/fetch-spark-positions";
import type { SparkPositionSort } from "@/lib/sources/api/spark-positions";
import { SPARK_CATALOG } from "@/lib/spark/asset-catalog";
import {
  sparkStatusBuckets,
  defaultStatusChoice,
  endedByLiquidation,
  statusChoice,
} from "@/lib/spark/listing-visibility";
import { ENDED_BY_LIQUIDATION, readStatusParam, STATUS_CHOICE_OPTIONS } from "@/lib/shared/status-choice";

/** The Transactions slider's top: the round number above the busiest listed
 *  wallet (27,023 transactions, 16 Oct 2026). */
const SPARK_TX_TOP = 30000;

/** Backend caps `limit` at 100; 20 keeps the page light and the grid familiar. */
export const SPARK_ITEMS_PER_PAGE = 20;

export interface SparkListFilters extends BaseListFilters {
  /** One of open / closed / all, or [] for the resting choice (ui-jobs 805). */
  status: string[];
  /** "" | "liquidated" — with Closed, the positions that ended by liquidation.
   *  URL param `ended`. */
  ended: string[];
  /** Debt range in USD, one encodeRange value (`1000-50000`, `-0` for no
   *  debt) or [] for no bound. URL param `debt`, read from `state` too. */
  debt: string[];
  /** Collateral range in USD, as `debt`. URL param `coll`. */
  coll: string[];
  /** "" | "liquidated" — positions that were liquidated at least once. */
  liquidations: string[];
  /** Reserve symbols the position must be SUPPLYING (multi, OR). */
  supplying: string[];
  /** Reserve symbols the position must be BORROWING (multi, OR). */
  borrowing: string[];
  /** Transaction-count range, one encodeRange value or [] for no bound. */
  tx: string[];
}

// No status is written into the page defaults: an empty `status` is "no opinion",
// and listing-visibility.ts resolves it per context — the open wallets on the
// bare directory, every status once the search names an holder.
export const SPARK_LIST_DEFAULTS: SparkListFilters = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  status: [],
  ended: [],
  debt: [],
  coll: [],
  liquidations: [],
  supplying: [],
  borrowing: [],
  tx: [],
};

// Values match Liquity V2's (lib/liquity-v2/list-filter-dimensions.tsx) so the
// URL grammar (`?sortBy=debt`) is the same across explorers.
export const SPARK_SORT_OPTIONS: SortOption[] = [
  { value: "recent", label: RECENT_ACTIVITY_LABEL },
  { value: "debt", label: "Debt" },
  { value: "coll", label: "Collateral" },
];

/** The Size panel's price line. */
const SPARK_SIZE_NOTE = "At the latest indexed price per asset, as of the listing's last refresh.";

const LIQUIDATION_OPTIONS: FilterOptionDef[] = [{ value: "liquidated", label: "Liquidated before" }];

// One chip per catalog reserve (the full on-chain reserve set, frozen included —
// closed/liquidated history references them).
const ASSET_OPTIONS: FilterOptionDef[] = SPARK_CATALOG.map((a) => ({ value: a.symbol, label: a.symbol }));

export function sparkListDimensions(): SerializableDimension<SparkListFilters>[] {
  return [
    {
      id: "status",
      label: "Status",
      group: "Status",
      cardinality: "single",
      param: "status",
      options: STATUS_CHOICE_OPTIONS,
      segmented: true,
      get: (f) => [statusChoice(f)],
      defaultValues: (f) => [defaultStatusChoice(f)],
      // Takes the choice, or an old link's list of statuses (ui-jobs 805).
      set: (f, v) => {
        const read = readStatusParam(v);
        const choice = read.choice ?? defaultStatusChoice(f);
        return {
          ...f,
          status: choice === defaultStatusChoice(f) ? [] : [choice],
          ended: choice !== "closed" ? [] : read.endedByLiquidation ? [ENDED_BY_LIQUIDATION] : f.ended,
        };
      },
    },
    {
      id: "ended",
      label: "Closed by liquidation",
      // Its own group, for its pill; in the panel it sits under Status.
      group: "Closed by liquidation",
      cardinality: "single",
      param: "ended",
      options: [{ value: ENDED_BY_LIQUIDATION, label: "Closed by liquidation" }],
      // Offered with Closed, which it narrows.
      available: (f) => statusChoice(f) === "closed",
      get: (f) => (endedByLiquidation(f) ? [ENDED_BY_LIQUIDATION] : []),
      set: (f, v) => ({ ...f, ended: v }),
      chipLabel: () => "Closed by liquidation",
    },
    ...sizeDimensions<SparkListFilters>({
      getDebt: (f) => f.debt,
      setDebt: (f, debt) => ({ ...f, debt }),
      getColl: (f) => f.coll,
      setColl: (f, coll) => ({ ...f, coll }),
      panelNote: SPARK_SIZE_NOTE,
      debtAliases: ["state"],
    }),
    {
      id: "supplying",
      label: "Supplying",
      group: "Assets",
      cardinality: "multi",
      param: "supply",
      options: ASSET_OPTIONS,
      get: (f) => f.supplying,
      set: (f, v) => ({ ...f, supplying: v }),
    },
    {
      id: "borrowing",
      label: "Borrowing",
      group: "Assets",
      cardinality: "multi",
      param: "borrow",
      options: ASSET_OPTIONS,
      get: (f) => f.borrowing,
      set: (f, v) => ({ ...f, borrowing: v }),
    },
    {
      id: "liquidations",
      label: "Liquidated before",
      group: "History",
      cardinality: "single",
      param: "liq",
      options: LIQUIDATION_OPTIONS,
      get: (f) => f.liquidations,
      set: (f, v) => ({ ...f, liquidations: v }),
      chipLabel: () => "Liquidated before",
    },
    transactionsDimension<SparkListFilters>({
      get: (f) => f.tx,
      set: (f, tx) => ({ ...f, tx }),
      top: SPARK_TX_TOP,
    }),
  ];
}

/** Map the decoded selection + page onto the spoke fetch params. This is the
 *  server-driven counterpart of the in-memory tier's ApplyConfig. */
export function sparkFiltersToFetchParams(filters: SparkListFilters, page: number): FetchSparkPositionsParams {
  const wallet = filters.q.trim();
  return {
    wallet: wallet ? wallet : undefined,
    // All maps to no status filter; Closed asks for closed and liquidated.
    status: sparkStatusBuckets(filters) as FetchSparkPositionsParams["status"],
    // The old Position dropdown's flags, for the two Debt ranges it maps to.
    hasDebt: filters.debt[0] === "1-" ? true : undefined,
    noDebt: filters.debt[0] === "-0" ? true : undefined,
    ...usdBounds(filters),
    hasLiquidations: filters.liquidations.includes("liquidated") ? true : undefined,
    supplyAssets: filters.supplying.length > 0 ? filters.supplying : undefined,
    borrowAssets: filters.borrowing.length > 0 ? filters.borrowing : undefined,
    ...transactionBounds(filters.tx),
    sortBy: filters.sortBy as SparkPositionSort,
    sortOrder: filters.sortOrder,
    limit: SPARK_ITEMS_PER_PAGE,
    offset: (page - 1) * SPARK_ITEMS_PER_PAGE,
  };
}
