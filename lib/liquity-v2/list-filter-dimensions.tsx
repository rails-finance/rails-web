// Liquity V2 listing filter registry (reference tier, SERVER-DRIVEN). Liquity V2
// keeps every Trove — open / zombie / closed / liquidated — so, like Spark /
// Compound / Aave V3 / Liquity V1, it pages against the backend: the URL-backed
// selection maps onto the /api/troves fetch params and rails-server does the
// filter / sort / paginate. Dimensions carry a `param` (for the shareable URL)
// but no in-memory `matches` — the backend filters.
//
// This is the graduation of the old bespoke TroveListFilters registry onto the
// shared ChainTruthListingPage driver (decision 0009): the facets Status /
// Collateral / Redemptions / Delegation, the contextual-default status logic
// (resolved through listing-visibility.ts so the listing keeps doubling as a
// wallet view), now expressed as SerializableDimension so the one shared driver
// owns the toolbar / URL / pagination.
//
// Size is the Debt range in BOLD and the Collateral range in USD
// (lib/shared/size-dimensions.ts): the listing reads no USD price for BOLD, so
// debt is the token amount (minDebt / maxDebt), and collateral is valued at the
// Liquity oracle's latest read, the trove's coll_usd (minCollUsd / maxCollUsd).
//
// Transactions is a range over the trove's distinct transactions
// (activity.transactionCount), sent as minTx / maxTx
// (lib/shared/transactions-dimension.ts).
//
// The free-text search is the driver's `q`; it carries the tri-modal identity
// lookup (trove ID / owner address / ENS), parsed in lib/liquity-v2/search.ts and
// mapped onto the right fetch param by liquityV2FiltersToFetchParams below. That
// same parse decides the resting status default (listing-visibility.ts), which is
// why it lives in its own module rather than here.

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import { joinOptionLabels } from "@/components/shared/filter-bar/types";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import {
  defaultStatusChoice,
  DORMANT,
  DORMANT_PARAM,
  dormantOnly,
  endedByLiquidation,
  OPEN_ACTIVE,
  setTroveDormant,
  setTroveStatus,
  statusChoice,
  troveStatusBuckets,
  troveStatusValue,
} from "@/lib/liquity-v2/listing-visibility";
import { ENDED_BY_LIQUIDATION, STATUS_CHOICE_OPTIONS } from "@/lib/shared/status-choice";
import { parseTroveSearch } from "@/lib/liquity-v2/search";
import type { FetchTrovesParams } from "@/lib/api/fetch-troves";
import { transactionBounds, transactionsDimension } from "@/lib/shared/transactions-dimension";
import { sizeBounds, sizeDimensions } from "@/lib/shared/size-dimensions";

/** The Transactions slider's top: the round number above the busiest trove
 *  (937 transactions, 20 Oct 2026). */
const LIQUITY_V2_TX_TOP = 1000;

/** The Size sliders' top: the round number above the larger of the biggest
 *  trove's debt (6,759,911 BOLD) and collateral ($21,379,625) in
 *  trove_current_state_mv, 21 Oct 2026. */
const LIQUITY_V2_SIZE_TOP = 25_000_000;

/** The Size panel's unit and price line. */
const LIQUITY_V2_SIZE_NOTE = "Debt in BOLD; collateral at the Liquity oracle's latest read.";

/** Backend caps `limit` at 1000; 20 keeps the page light and the grid familiar. */
export const LIQUITY_V2_ITEMS_PER_PAGE = 20;

/** The collateral tokens the directory exposes as a facet. */
export const LIQUITY_V2_COLLATERAL_TYPES = ["WETH", "wstETH", "rETH"];

/** Filter selection for the Liquity V2 listing. `q` (BaseListFilters) is the
 *  tri-modal identity search; the facet fields mirror the old TroveListFilterParams
 *  (minus the identity fields, which now ride `q`). */
export interface LiquityV2ListFilters extends BaseListFilters {
  /** One of open / closed / all, or [] for the resting choice (ui-jobs 805). */
  status: string[];
  /** "" | "dormant" — with Open, the dormant troves. URL param `open`. */
  dormant: string[];
  /** "" | "liquidated" — with Closed, the troves that ended by liquidation.
   *  URL param `ended`. */
  ended: string[];
  collateralTypes?: string[];
  hasRedemptions?: boolean;
  batchOnly?: boolean;
  individualOnly?: boolean;
  /** Debt range in BOLD, one encodeRange value (`1000-50000`, `-0` for no
   *  debt) or [] for no bound. URL param `debt`. */
  debt: string[];
  /** Collateral range in USD, as `debt`. URL param `coll`. */
  coll: string[];
  /** Transaction-count range, one encodeRange value or [] for no bound. */
  tx: string[];
}

// No status is written into the page defaults: an empty `status` is "no
// opinion", and listing-visibility.ts resolves it per context — the open troves
// on the bare directory, every status once the search names a holder or a
// trove id.
export const LIQUITY_V2_LIST_DEFAULTS: LiquityV2ListFilters = {
  q: "",
  sortBy: "lastActivity",
  sortOrder: "desc",
  status: [],
  dormant: [],
  ended: [],
  debt: [],
  coll: [],
  tx: [],
};

// UI labels → backend sort fields (VALID_SORT_FIELDS in app/api/troves/route.ts).
export const LIQUITY_V2_SORT_OPTIONS: SortOption[] = [
  { value: "lastActivity", label: RECENT_ACTIVITY_LABEL },
  { value: "debt", label: "Debt" },
  { value: "coll", label: "Collateral" },
  // LTV, the docs' figure (decision 0065). The backend sorts by the
  // collateral ratio, its inverse: `ltv` goes out as `ratio` in the other
  // order.
  { value: "ltv", label: "LTV" },
  { value: "interestRate", label: "Interest Rate" },
];

/** Chip label that uses the option labels verbatim (no `Dimension:` prefix) —
 *  for self-describing single-select states like "Redeemed" / "Delegated". */
function bareLabel(values: string[], options: FilterOptionDef[]): string {
  return joinOptionLabels(values, options);
}

/** Status (Open / Closed / All, ui-jobs 805) and its two switches: Dormant with
 *  Open, Closed by liquidation with Closed. The forks' listings take the same
 *  three, with their own `matches` and, on Ebisu, the docs' word for Dormant. */
export function troveStatusDimensions<
  F extends BaseListFilters & { status: string[]; dormant: string[]; ended: string[] },
>(dormantLabel = "Dormant"): [SerializableDimension<F>, SerializableDimension<F>, SerializableDimension<F>] {
  return [
    {
      id: "status",
      label: "Status",
      group: "Status",
      cardinality: "single",
      param: "status",
      options: STATUS_CHOICE_OPTIONS,
      segmented: true,
      // The choice, or the link-only `active` (Open without Dormant).
      get: (f) => [troveStatusValue(f)],
      defaultValues: (f) => [defaultStatusChoice(f)],
      // Takes the choice, or an old link's list of buckets (ui-jobs 805).
      set: (f, v) => setTroveStatus(f, v),
      // `active` reads as Open.
      chipLabel: (v) => `Status: ${v[0] === OPEN_ACTIVE ? "Open" : joinOptionLabels(v, STATUS_CHOICE_OPTIONS)}`,
    },
    {
      id: "dormant",
      label: dormantLabel,
      // Its own group, for its pill; in the panel it sits under Status.
      group: dormantLabel,
      cardinality: "single",
      param: DORMANT_PARAM,
      options: [{ value: DORMANT, label: dormantLabel }],
      // Offered with Open, which it narrows.
      available: (f) => statusChoice(f) === "open",
      get: (f) => (dormantOnly(f) ? [DORMANT] : []),
      set: (f, v) => setTroveDormant(f, v),
      chipLabel: () => dormantLabel,
    },
    {
      id: "ended",
      label: "Closed by liquidation",
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
  ];
}

/**
 * Liquity V2 listing filter dimensions. Collateral options can be injected with
 * token icons for the client toolbar; the SSR decode path calls this bare (options
 * don't affect the URL codec / listKey, only the toolbar's chrome), so both halves
 * derive an identical key.
 */
export function liquityV2ListDimensions(
  collateralOptions: FilterOptionDef[] = LIQUITY_V2_COLLATERAL_TYPES.map((t) => ({ value: t, label: t })),
): SerializableDimension<LiquityV2ListFilters>[] {
  const [status, dormant, ended] = troveStatusDimensions<LiquityV2ListFilters>();

  const collateral: SerializableDimension<LiquityV2ListFilters> = {
    id: "collateralTypes",
    label: "Collateral",
    group: "Collateral",
    cardinality: "multi",
    param: "collateralTypes",
    // The pre-0016 stats page linked each collateral as `?collateralType=rETH`.
    aliases: ["collateralType"],
    options: collateralOptions,
    get: (f) => f.collateralTypes ?? [],
    set: (f, values) => ({ ...f, collateralTypes: values.length > 0 ? values : undefined }),
    chipLabel: (vals, opts) => `Collateral: ${joinOptionLabels(vals, opts)}`,
  };

  const redemptions: SerializableDimension<LiquityV2ListFilters> = {
    id: "redemptions",
    label: "Redemptions",
    group: "Redemptions",
    cardinality: "single",
    property: true,
    param: "redemptions",
    options: [
      { value: "with", label: "Redeemed" },
      { value: "without", label: "Never redeemed" },
    ],
    get: (f) => (f.hasRedemptions === true ? ["with"] : f.hasRedemptions === false ? ["without"] : []),
    set: (f, values) => ({
      ...f,
      hasRedemptions: values[0] === "with" ? true : values[0] === "without" ? false : undefined,
    }),
    chipLabel: bareLabel,
  };

  // batchOnly (delegated to a batch manager) vs individualOnly (self-managed
  // interest rate) — mutually exclusive, mapped onto the two boolean fields.
  const delegation: SerializableDimension<LiquityV2ListFilters> = {
    id: "delegation",
    label: "Delegation",
    group: "Delegation",
    cardinality: "single",
    property: true,
    param: "delegation",
    options: [
      { value: "delegated", label: "Delegated" },
      { value: "individual", label: "Individual" },
    ],
    get: (f) => (f.batchOnly ? ["delegated"] : f.individualOnly ? ["individual"] : []),
    set: (f, values) => ({
      ...f,
      batchOnly: values[0] === "delegated" ? true : undefined,
      individualOnly: values[0] === "individual" ? true : undefined,
    }),
    chipLabel: bareLabel,
  };

  const transactions = transactionsDimension<LiquityV2ListFilters>({
    get: (f) => f.tx,
    set: (f, tx) => ({ ...f, tx }),
    top: LIQUITY_V2_TX_TOP,
  });

  const size = sizeDimensions<LiquityV2ListFilters>({
    getDebt: (f) => f.debt,
    setDebt: (f, debt) => ({ ...f, debt }),
    getColl: (f) => f.coll,
    setColl: (f, coll) => ({ ...f, coll }),
    panelNote: LIQUITY_V2_SIZE_NOTE,
    top: LIQUITY_V2_SIZE_TOP,
    debtUnit: "BOLD",
  });

  return [status, dormant, ended, collateral, ...size, redemptions, delegation, transactions];
}

/** Map the decoded selection + page onto the /api/troves fetch params — the
 *  server-driven counterpart of the retired buildSearchParams(forApi=true). */
export function liquityV2FiltersToFetchParams(filters: LiquityV2ListFilters, page: number): FetchTrovesParams {
  return {
    ...parseTroveSearch(filters.q),
    // All maps to no status filter; Closed asks for closed and liquidated.
    status: troveStatusBuckets(filters),
    collateralTypes:
      filters.collateralTypes && filters.collateralTypes.length > 0 ? filters.collateralTypes : undefined,
    hasRedemptions: filters.hasRedemptions,
    batchOnly: filters.batchOnly || undefined,
    individualOnly: filters.individualOnly || undefined,
    ...sizeBounds(filters, { debt: "unit", coll: "usd" }),
    ...transactionBounds(filters.tx),
    sortBy: filters.sortBy === "ltv" ? "ratio" : filters.sortBy,
    sortOrder: filters.sortBy === "ltv" ? (filters.sortOrder === "asc" ? "desc" : "asc") : filters.sortOrder,
    limit: LIQUITY_V2_ITEMS_PER_PAGE,
    offset: (page - 1) * LIQUITY_V2_ITEMS_PER_PAGE,
  };
}
