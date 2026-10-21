// Liquity V1 listing filter registry (chain-state tier, SERVER-DRIVEN). Liquity V1
// keeps every Trove ever opened (~7.2k, open + closed + liquidated), so — like
// Spark / Compound / Aave V3 — it pages against the backend: the URL-backed
// selection maps onto the /api/liquity-v1/positions fetch params and rails-server
// does the filter / sort / paginate over mv_liquity_v1_positions. Dimensions carry a
// `param` (for the shareable URL) but no in-memory `matches` — the backend filters.
//
// All values are read from the chain: the replayed open/closed/liquidated status, and the
// raw liquidation / redemption event counts. The two History axes are ORTHOGONAL to
// current status (a Trove liquidated or redeemed against can be reopened), so they
// map to the backend's ever-liquidated / ever-redeemed filters, not the status enum.
// Size is the Debt range in LUSD and the Collateral range in USD
// (lib/shared/size-dimensions.ts). Debt is the token amount (minDebt /
// maxDebt), since the listing reads no USD price for LUSD. Collateral is valued
// on the server at the latest PriceFeed row the index stores
// (liquity_v1_historic_prices, PriceFeed.lastGoodPrice), sent as minCollUsd /
// maxCollUsd; that row is the last price the filler indexed. The Ratio sort
// reads no price: coll/debt is the quotient of two emitted balances, and it is the PROTOCOL'S ordering key — V1 sorts its
// redemption queue by nominal ICR (price-free by construction), which with one
// collateral asset is the same order a collateral ratio would give. Facets + sorts
// that ship LIVE:
//   • Status  — open / closed / liquidated (mv_liquity_v1_positions.status).
//   • Size    — Debt (LUSD) and Collateral (USD), as above.
//   • History — Liquidated before / Redeemed before (ever, from the event stream).
//   • Transactions — a range over the Trove's distinct transactions (`minTx` /
//     `maxTx`, inclusive; lib/shared/transactions-dimension.ts).
//   • Wallet search + sort by recency / ETH collateral / LUSD debt / ratio
//     (all chain-direct).

import { transactionBounds, transactionsDimension } from "@/lib/shared/transactions-dimension";
import { sizeBounds, sizeDimensions } from "@/lib/shared/size-dimensions";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { FetchLiquityV1PositionsParams } from "@/lib/api/fetch-liquity-v1-positions";
import type { LiquityV1PositionStatus, LiquityV1PositionSort } from "@/lib/sources/api/liquity-v1-positions";

/** Backend caps `limit` at 100; 20 keeps the page light and the grid familiar. */
export const LIQUITY_V1_ITEMS_PER_PAGE = 20;

/** The Transactions slider's top: the round number above the busiest Trove
 *  (1,019 transactions, 20 Oct 2026). */
const LIQUITY_V1_TX_TOP = 2000;

/** The Size sliders' top: the round number above the larger of the biggest
 *  Trove's debt (7,176,480 LUSD) and collateral ($41,213,327 at the latest
 *  stored PriceFeed row, $2,388.50) in mv_liquity_v1_positions, 21 Oct 2026. */
const LIQUITY_V1_SIZE_TOP = 50_000_000;

/** The Size panel's unit and price line. */
const LIQUITY_V1_SIZE_NOTE = "Debt in LUSD; collateral at the Liquity PriceFeed's latest indexed price.";

export interface LiquityV1ListFilters extends BaseListFilters {
  status: string[];
  /** ["with"] = Troves liquidated at least once (orthogonal to current status). */
  liquidations: string[];
  /** ["with"] = Troves redeemed against at least once. */
  redemptions: string[];
  /** Debt range in LUSD, one encodeRange value (`1000-50000`, `-0` for no
   *  debt) or [] for no bound. URL param `debt`. */
  debt: string[];
  /** Collateral range in USD, as `debt`. URL param `coll`. */
  coll: string[];
  /** Transaction-count range, one encodeRange value or [] for no bound. */
  tx: string[];
}

// Resting view = the live Troves (84 of ~7,239). Status defaults to ["open"] as an
// ACTIVE selection (a clearable chip, not the dimension's inactive default), so the
// listing renders the open set at rest and only broadens when the user opts in.
const LIQUITY_V1_LIST_DEFAULTS: LiquityV1ListFilters = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  status: ["open"],
  liquidations: [],
  redemptions: [],
  debt: [],
  coll: [],
  tx: [],
};

// A search for a wallet asks about that wallet's Troves, and most of them are
// closed: the listing a wallet chip opens (`?q=<address>`) drops the Open
// default and shows every life, whatever its status. A status the reader picks
// still applies.
const LIQUITY_V1_WALLET_DEFAULTS: LiquityV1ListFilters = { ...LIQUITY_V1_LIST_DEFAULTS, status: [] };
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** The resting selection for a search: every status when it names a wallet. */
export function liquityV1ListDefaults(q: string): LiquityV1ListFilters {
  return ADDRESS.test(q.trim()) ? LIQUITY_V1_WALLET_DEFAULTS : LIQUITY_V1_LIST_DEFAULTS;
}

export const LIQUITY_V1_SORT_OPTIONS: SortOption[] = [
  { value: "recent", label: RECENT_ACTIVITY_LABEL },
  { value: "collateral", label: "Collateral" },
  { value: "debt", label: "Debt" },
  // Ascending is the redemption queue's own direction — lowest ratio first is
  // the Trove redeemers reach first.
  { value: "ratio", label: "Ratio" },
];

const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "liquidated", label: "Liquidated" },
];

export function liquityV1ListDimensions(): SerializableDimension<LiquityV1ListFilters>[] {
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
    },
    ...sizeDimensions<LiquityV1ListFilters>({
      getDebt: (f) => f.debt,
      setDebt: (f, debt) => ({ ...f, debt }),
      getColl: (f) => f.coll,
      setColl: (f, coll) => ({ ...f, coll }),
      panelNote: LIQUITY_V1_SIZE_NOTE,
      top: LIQUITY_V1_SIZE_TOP,
      debtUnit: "LUSD",
    }),
    {
      id: "liquidations",
      label: "Liquidations",
      group: "History",
      cardinality: "single",
      param: "liq",
      options: [{ value: "with", label: "Liquidated before" }],
      get: (f) => f.liquidations,
      set: (f, v) => ({ ...f, liquidations: v }),
      chipLabel: () => "Liquidated before",
    },
    {
      id: "redemptions",
      label: "Redemptions",
      group: "History",
      cardinality: "single",
      param: "redeem",
      options: [{ value: "with", label: "Redeemed before" }],
      get: (f) => f.redemptions,
      set: (f, v) => ({ ...f, redemptions: v }),
      chipLabel: () => "Redeemed before",
    },
    transactionsDimension<LiquityV1ListFilters>({
      get: (f) => f.tx,
      set: (f, tx) => ({ ...f, tx }),
      top: LIQUITY_V1_TX_TOP,
    }),
  ];
}

/** Map the decoded selection + page onto the V1 fetch params — the server-driven
 *  counterpart of the retired in-memory ApplyConfig. */
export function liquityV1FiltersToFetchParams(
  filters: LiquityV1ListFilters,
  page: number,
): FetchLiquityV1PositionsParams {
  const wallet = filters.q.trim();
  return {
    wallet: wallet ? wallet : undefined,
    status: filters.status.length > 0 ? (filters.status as LiquityV1PositionStatus[]) : undefined,
    hasLiquidations: filters.liquidations.includes("with") ? true : undefined,
    hasRedemptions: filters.redemptions.includes("with") ? true : undefined,
    ...sizeBounds(filters, { debt: "unit", coll: "usd" }),
    ...transactionBounds(filters.tx),
    sortBy: filters.sortBy as LiquityV1PositionSort,
    sortOrder: filters.sortOrder,
    limit: LIQUITY_V1_ITEMS_PER_PAGE,
    offset: (page - 1) * LIQUITY_V1_ITEMS_PER_PAGE,
  };
}
