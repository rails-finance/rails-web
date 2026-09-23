// Liquity V2 listing filter registry (reference tier, SERVER-DRIVEN). Liquity V2
// keeps every Trove — open / zombie / closed / liquidated — so, like Spark /
// Compound / Aave V3 / Liquity V1, it pages against the backend: the URL-backed
// selection maps onto the /api/troves fetch params and rails-server does the
// filter / sort / paginate. Dimensions carry a `param` (for the shareable URL)
// but no in-memory `matches` — the backend filters.
//
// This is the graduation of the old bespoke TroveListFilters registry onto the
// shared ChainTruthListingPage driver (decision 0009): same four facets (Status /
// Collateral / Redemptions / Delegation), same contextual-default status logic
// (resolved through listing-visibility.ts so the listing keeps doubling as a
// wallet view), now expressed as SerializableDimension so the one shared driver
// owns the toolbar / URL / pagination.
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
import type { StatusBucket } from "@/lib/liquity-v2/listing-visibility";
import {
  canonicalStatuses,
  defaultStatuses,
  effectiveStatuses,
  isAllStatuses,
  sameStatusSet,
} from "@/lib/liquity-v2/listing-visibility";
import { parseTroveSearch } from "@/lib/liquity-v2/search";
import type { FetchTrovesParams } from "@/lib/api/fetch-troves";

/** Backend caps `limit` at 1000; 20 keeps the page light and the grid familiar. */
export const LIQUITY_V2_ITEMS_PER_PAGE = 20;

/** The collateral tokens the directory exposes as a facet. */
export const LIQUITY_V2_COLLATERAL_TYPES = ["WETH", "wstETH", "rETH"];

/** Filter selection for the Liquity V2 listing. `q` (BaseListFilters) is the
 *  tri-modal identity search; the facet fields mirror the old TroveListFilterParams
 *  (minus the identity fields, which now ride `q`). `statuses` carries RAW intent —
 *  undefined resolves to the contextual default via listing-visibility.ts. */
export interface LiquityV2ListFilters extends BaseListFilters {
  statuses?: StatusBucket[];
  collateralTypes?: string[];
  hasRedemptions?: boolean;
  batchOnly?: boolean;
  individualOnly?: boolean;
}

// No status is written into the page defaults: `statuses: undefined` is "no
// opinion", and listing-visibility.ts resolves it per context — the open troves
// (active + zombie) on the bare directory, every status once the search names a
// holder or a trove id. Because the default is contextual rather than a
// selection it draws no chip and no Reset link, and a cleared selection always
// resolves back to whatever the current context rests on.
export const LIQUITY_V2_LIST_DEFAULTS: LiquityV2ListFilters = {
  q: "",
  sortBy: "lastActivity",
  sortOrder: "desc",
};

// UI labels → backend sort fields (VALID_SORT_FIELDS in app/api/troves/route.ts).
export const LIQUITY_V2_SORT_OPTIONS: SortOption[] = [
  { value: "lastActivity", label: RECENT_ACTIVITY_LABEL },
  { value: "debt", label: "Debt" },
  { value: "coll", label: "Collateral" },
  { value: "ratio", label: "Ratio" },
  { value: "interestRate", label: "Interest Rate" },
];

/** Chip label that uses the option labels verbatim (no `Dimension:` prefix) —
 *  for self-describing single-select states like "Redeemed" / "Delegated". */
function bareLabel(values: string[], options: FilterOptionDef[]): string {
  return joinOptionLabels(values, options);
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
  // Status is a multi-select over four buckets. Zombie (an unredeemable
  // sub-min-debt trove) and Liquidated (terminal) are real protocol states shown
  // as first-class buckets alongside Open/Closed; the server resolves the
  // selection onto (status, is_zombie). All four selected = "show everything" (no
  // server filter). Empty = the contextual default (open troves while browsing,
  // everything on an identity search), so `set` writes undefined whenever the
  // choice equals that default — keeping the URL clean and the relax-on-search
  // behaviour intact.
  const status: SerializableDimension<LiquityV2ListFilters> = {
    id: "status",
    label: "Status",
    group: "Status",
    cardinality: "multi",
    param: "status",
    options: [
      // Label "Open" to match the roster-wide status vocabulary (every other
      // explorer's filter says Open/Closed/Liquidated); the wire value stays
      // "active" — it is what the server resolves.
      { value: "active", label: "Open" },
      { value: "zombie", label: "Zombie" },
      { value: "closed", label: "Closed" },
      { value: "liquidated", label: "Liquidated" },
    ],
    get: (f) => effectiveStatuses(f),
    defaultValues: (f) => defaultStatuses(f),
    set: (f, values) => {
      const sel = canonicalStatuses(values);
      const def = defaultStatuses(f);
      return {
        ...f,
        statuses: sel.length === 0 || sameStatusSet(sel, def) ? undefined : sel,
      };
    },
    chipLabel: (vals, opts) => `Status: ${joinOptionLabels(canonicalStatuses(vals), opts)}`,
  };

  const collateral: SerializableDimension<LiquityV2ListFilters> = {
    id: "collateralTypes",
    label: "Collateral",
    group: "Collateral",
    cardinality: "multi",
    param: "collateralTypes",
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

  return [status, collateral, redemptions, delegation];
}

/** Map the decoded selection + page onto the /api/troves fetch params — the
 *  server-driven counterpart of the retired buildSearchParams(forApi=true). */
export function liquityV2FiltersToFetchParams(filters: LiquityV2ListFilters, page: number): FetchTrovesParams {
  return {
    ...parseTroveSearch(filters.q),
    // The full set maps to no status filter; a real subset is sent verbatim.
    status: isAllStatuses(filters) ? undefined : effectiveStatuses(filters),
    collateralTypes:
      filters.collateralTypes && filters.collateralTypes.length > 0 ? filters.collateralTypes : undefined,
    hasRedemptions: filters.hasRedemptions,
    batchOnly: filters.batchOnly || undefined,
    individualOnly: filters.individualOnly || undefined,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    limit: LIQUITY_V2_ITEMS_PER_PAGE,
    offset: (page - 1) * LIQUITY_V2_ITEMS_PER_PAGE,
  };
}
