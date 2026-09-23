// Aave V4 listing filter registry (reference tier, SERVER-DRIVEN + DYNAMIC). Aave
// V4 pages against the backend like the rest of the server tier, but — uniquely —
// its facet OPTIONS depend on the live selection and on async external state:
//   • Spoke options are scoped to the selected Hub(s) (hub ⊃ spoke).
//   • Supplying / Borrowing options come from the asset universe fetched for the
//     selected market (spoke ⊃ asset), so each side lists only assets that
//     actually have positions there.
// So the dimension registry is a FUNCTION of (filters, universe), consumed through
// the shared driver's dynamic-dimensions seam (decision 0009). The codec fields
// (param / get / set) are invariant across those inputs — only `options` vary — so
// the driver's URL decode / encode / keying stay well-defined.
//
// This is the graduation of the old bespoke AaveV4ListFilters + list-query onto the
// shared ChainTruthListingPage driver: same facets (Status / position-state ladder
// / liquidation history / Hub / Spoke / Supplying / Borrowing / Dust), same market
// topology + pruning, now expressed as SerializableDimension. The wallet/ENS search
// rides the driver's `q`; `aaveV4FiltersToFetchParams` parses it back out.

import Link from "next/link";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import { joinOptionLabels } from "@/components/shared/filter-bar/types";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import {
  AAVE_V4_DUST_USD,
  effectiveAaveV4Show,
  type AaveV4Debt,
  type AaveV4Health,
  type AaveV4Liquidations,
  type AaveV4Show,
} from "@/lib/aave-v4/list-filter-types";
import {
  bucketsToWireStatuses,
  canonicalStatuses,
  defaultStatuses,
  effectiveStatuses,
  sameStatusSet,
  type AaveV4StatusBucket,
} from "@/lib/aave-v4/listing-visibility";
import { parseAaveV4Search } from "@/lib/aave-v4/search";
import type { AaveV4AssetUniverseEntry } from "@/lib/api/fetch-aave-v4-asset-universe";
import {
  type AaveV4SpokePositionSort,
  type FetchAaveV4SpokePositionsParams,
} from "@/lib/api/fetch-aave-v4-spoke-positions";

/** Backend caps `limit` at 100; 20 keeps the page light and the grid familiar. */
export const AAVE_V4_ITEMS_PER_PAGE = 20;

/** Filter selection for the Aave V4 listing. `q` (BaseListFilters) is the wallet /
 *  ENS search; the facet fields mirror the old AaveV4ListFilterParams (minus the
 *  identity fields, which now ride `q`). `statuses` / `show` carry RAW intent —
 *  undefined resolves to the contextual default via listing-visibility.ts. */
export interface AaveV4ListFilters extends BaseListFilters {
  spokes: string[];
  hubs: string[];
  supplyAssets: string[];
  borrowAssets: string[];
  debt: AaveV4Debt;
  health: AaveV4Health;
  liquidations: AaveV4Liquidations;
  statuses?: AaveV4StatusBucket[];
  show?: AaveV4Show;
}

// Resting view = every market, all sides, and the positions still open — the last of those a
// CONTEXTUAL default that relaxes to every status once the search names a holder
// (listing-visibility.ts). `statuses`/`show`/`debt`/`health`/`liquidations` at their defaults
// map to NO params + NO chips, so both views keep clean URLs.
export const AAVE_V4_LIST_DEFAULTS: AaveV4ListFilters = {
  q: "",
  sortBy: "lastActivity",
  sortOrder: "desc",
  spokes: [],
  hubs: [],
  supplyAssets: [],
  borrowAssets: [],
  debt: "all",
  health: "all",
  liquidations: "all",
};

// UI labels → backend sort fields.
export const AAVE_V4_SORT_OPTIONS: SortOption[] = [
  { value: "lastActivity", label: RECENT_ACTIVITY_LABEL },
  { value: "debtUsd", label: "Debt" },
  { value: "supplyUsd", label: "Supply" },
  { value: "healthFactor", label: "Health Factor" },
];

const HUB_OPTIONS: FilterOptionDef[] = [
  { value: "core", label: "Core" },
  { value: "plus", label: "Plus" },
  { value: "prime", label: "Prime" },
  { value: "paxos", label: "Global Dollar" },
];

const SPOKE_OPTIONS: FilterOptionDef[] = [
  { value: "main", label: "Main" },
  { value: "bluechip", label: "Bluechip" },
  { value: "ethena_corr", label: "Ethena Correlated" },
  { value: "ethena_eco", label: "Ethena Ecosystem" },
  { value: "etherfi", label: "EtherFi" },
  { value: "forex", label: "Forex" },
  { value: "gold", label: "Gold" },
  { value: "kelp", label: "Kelp" },
  { value: "lido", label: "Lido" },
  { value: "lombard", label: "Lombard BTC" },
  { value: "usdg_pendle", label: "Stablecoin Correlated" },
];

/** Each spoke belongs to exactly one hub — Aave V4 market topology, fixed at
 *  deployment (mirrors the backend's SPOKE_BY_KEY `hub` field). The hub→spoke
 *  layer of the parent-scopes-child logic the asset pills use; static structure,
 *  not chain config. */
const SPOKE_HUB: Record<string, string> = {
  main: "core",
  forex: "core",
  gold: "core",
  bluechip: "prime",
  ethena_corr: "plus",
  ethena_eco: "plus",
  etherfi: "core",
  kelp: "core",
  lido: "core",
  lombard: "core",
  usdg_pendle: "paxos",
};

/** Spoke options scoped to the selected hubs — all spokes when no hub is
 *  selected, else only the members of those hubs. */
export function spokeOptionsForHubs(hubs: string[]): FilterOptionDef[] {
  if (hubs.length === 0) return SPOKE_OPTIONS;
  const set = new Set(hubs);
  return SPOKE_OPTIONS.filter((o) => set.has(SPOKE_HUB[o.value]));
}

/** Drop selected spokes that don't belong to the selected hubs. Keeps the
 *  hub ∩ spoke filter from silently going empty when a hub change orphans a
 *  previously-picked spoke. */
export function pruneSpokesForHubs(spokes: string[], hubs: string[]): string[] {
  if (hubs.length === 0) return spokes;
  const set = new Set(hubs);
  return spokes.filter((s) => set.has(SPOKE_HUB[s]));
}

/** Chip label that uses the option labels verbatim (no `Dimension:` prefix). */
function bareLabel(values: string[], options: FilterOptionDef[]): string {
  return joinOptionLabels(values, options);
}

/** Asset options for the two sides, from the (market-scoped) universe. Each side
 *  lists exactly the assets that actually HAVE positions on it (asSupply / asDebt)
 *  — an empirical narrowing, so a frozen reserve that still holds debt stays
 *  filterable. "???" falls through to the unknown-token placeholder. */
function assetSideOptions(universe: AaveV4AssetUniverseEntry[]): {
  supplyOptions: FilterOptionDef[];
  borrowOptions: FilterOptionDef[];
} {
  const toOption = (e: AaveV4AssetUniverseEntry): FilterOptionDef => ({
    value: e.symbol,
    label: e.symbol === "???" ? "Unknown" : e.symbol,
    icon: <TokenChipIcon symbol={e.symbol} size={18} filterable={false} />,
  });
  return {
    supplyOptions: universe.filter((e) => e.asSupply).map(toOption),
    borrowOptions: universe.filter((e) => e.asDebt).map(toOption),
  };
}

/**
 * Aave V4 listing filter dimensions as a function of the live filters + the async
 * asset universe. Spoke options scope to `filters.hubs`; Supplying / Borrowing
 * options come from `universe`. Only `options` vary with these inputs — the codec
 * fields are constant — so the shared driver decodes / encodes / keys off any
 * evaluation of this builder identically.
 */
export function aaveV4ListDimensions(
  filters: AaveV4ListFilters,
  universe: AaveV4AssetUniverseEntry[] | undefined,
): SerializableDimension<AaveV4ListFilters>[] {
  const spokeOptions = spokeOptionsForHubs(filters.hubs);
  const { supplyOptions, borrowOptions } = assetSideOptions(universe ?? []);

  // Lifecycle status — the STRUCTURAL axis: open | closed. Liquidation is NOT a
  // status here (Aave liquidations are partial/survivable) — it's the orthogonal
  // History toggle below. The default is contextual (open while browsing, both
  // buckets once the search names a holder); `set` writes undefined when the
  // selection is empty or equals that default, keeping it out of the URL.
  const status: SerializableDimension<AaveV4ListFilters> = {
    id: "status",
    label: "Status",
    group: "Status",
    cardinality: "multi",
    param: "status",
    options: [
      { value: "open", label: "Open" },
      { value: "closed", label: "Closed" },
    ],
    get: (f) => effectiveStatuses(f),
    defaultValues: (f) => defaultStatuses(f),
    set: (f, values) => {
      const sel = canonicalStatuses(values);
      return { ...f, statuses: sel.length === 0 || sameStatusSet(sel, defaultStatuses(f)) ? undefined : sel };
    },
    chipLabel: (vals, opts) => `Status: ${joinOptionLabels(canonicalStatuses(vals), opts)}`,
  };

  // Position state — one mutually-exclusive axis off the health factor. Stored
  // across the internal `debt` + `health` fields and serialized to a single
  // `state` param (borrowing / supplyOnly / liquidatable), so the URL is clean and
  // the page→backend mapping (noDebt / hasDebt / healthBelow) is unchanged.
  const state: SerializableDimension<AaveV4ListFilters> = {
    id: "state",
    label: "Position state",
    group: "Status",
    cardinality: "single",
    param: "state",
    options: [
      { value: "supplyOnly", label: "Supply only" },
      { value: "borrowing", label: "Borrowing" },
      { value: "liquidatable", label: "Liquidatable" },
    ],
    get: (f) => {
      if (f.health === "underwater") return ["liquidatable"];
      if (f.debt === "noDebt") return ["supplyOnly"];
      if (f.debt === "withDebt") return ["borrowing"];
      return [];
    },
    set: (f, values) => {
      switch (values[0]) {
        case "liquidatable":
          return { ...f, debt: "all", health: "underwater" };
        case "supplyOnly":
          return { ...f, debt: "noDebt", health: "all" };
        case "borrowing":
          return { ...f, debt: "withDebt", health: "all" };
        default:
          return { ...f, debt: "all", health: "all" };
      }
    },
    chipLabel: bareLabel,
  };

  // Liquidation history — orthogonal to current state (a position can be Borrowing
  // now AND have been liquidated before). A lone toggle under a "History" header.
  const liquidated: SerializableDimension<AaveV4ListFilters> = {
    id: "liquidations",
    label: "History",
    group: "Status",
    cardinality: "single",
    param: "liquidations",
    options: [{ value: "with", label: "Liquidated before" }],
    get: (f) => (f.liquidations === "with" ? ["with"] : []),
    set: (f, values) => ({ ...f, liquidations: values[0] === "with" ? "with" : "all" }),
    chipLabel: bareLabel,
  };

  const hubs: SerializableDimension<AaveV4ListFilters> = {
    id: "hubs",
    label: "Hub",
    group: "Market",
    cardinality: "multi",
    param: "hubs",
    options: HUB_OPTIONS,
    labelAction: (
      <Link href="/ethereum/aave-v4/hubs" className={PAGE_LINK} onClick={(e) => e.stopPropagation()}>
        Compare
      </Link>
    ),
    get: (f) => f.hubs,
    // Selecting/changing hubs prunes any now-orphaned spoke selections so the
    // hub ∩ spoke intersection never silently empties.
    set: (f, values) => ({ ...f, hubs: values, spokes: pruneSpokesForHubs(f.spokes, values) }),
    chipLabel: (vals, opts) => `Hub: ${joinOptionLabels(vals, opts)}`,
  };

  const spokes: SerializableDimension<AaveV4ListFilters> = {
    id: "spokes",
    label: "Spoke",
    group: "Market",
    cardinality: "multi",
    param: "spokes",
    options: spokeOptions,
    get: (f) => f.spokes,
    set: (f, values) => ({ ...f, spokes: values }),
    chipLabel: (vals, opts) => `Spoke: ${joinOptionLabels(vals, opts)}`,
  };

  const supplying: SerializableDimension<AaveV4ListFilters> = {
    id: "supplyAssets",
    label: "Supplying",
    group: "Supply",
    cardinality: "multi",
    param: "supplyAssets",
    options: supplyOptions,
    get: (f) => f.supplyAssets,
    set: (f, values) => ({ ...f, supplyAssets: values }),
    chipLabel: (vals, opts) => `Supplying: ${joinOptionLabels(vals, opts)}`,
  };

  const borrowing: SerializableDimension<AaveV4ListFilters> = {
    id: "borrowAssets",
    label: "Borrowing",
    group: "Borrow",
    cardinality: "multi",
    param: "borrowAssets",
    options: borrowOptions,
    get: (f) => f.borrowAssets,
    set: (f, values) => ({ ...f, borrowAssets: values }),
    chipLabel: (vals, opts) => `Borrowing: ${joinOptionLabels(vals, opts)}`,
  };

  // Dust — a lone toggle, orthogonal to Status. On: hides positions under the dust
  // line (minTotalUsd). Off (absent) is the silent majority.
  const dust: SerializableDimension<AaveV4ListFilters> = {
    id: "show",
    label: "Dust",
    group: "View",
    cardinality: "single",
    param: "show",
    options: [{ value: "nodust", label: "Hide dust" }],
    get: (f) => (effectiveAaveV4Show(f) === "nodust" ? ["nodust"] : []),
    set: (f, values) => ({ ...f, show: values[0] === "nodust" ? "nodust" : undefined }),
    chipLabel: bareLabel,
  };

  return [status, state, liquidated, hubs, spokes, supplying, borrowing, dust];
}

/** Map the decoded selection + page onto the spoke-positions fetch params — the
 *  server-driven counterpart of the retired listFiltersToFetchParams. */
export function aaveV4FiltersToFetchParams(filters: AaveV4ListFilters, page: number): FetchAaveV4SpokePositionsParams {
  return {
    ...parseAaveV4Search(filters.q),
    spokes: filters.spokes,
    hubs: filters.hubs,
    supplyAssets: filters.supplyAssets,
    borrowAssets: filters.borrowAssets,
    hasDebt: filters.debt === "withDebt",
    noDebt: filters.debt === "noDebt",
    hasLiquidations: filters.liquidations === "with" ? true : filters.liquidations === "without" ? false : undefined,
    healthBelow: filters.health === "underwater" ? 1.0 : undefined,
    // Dust → server floor; the open/closed axis is the `status` filter, not a USD cut.
    minTotalUsd: effectiveAaveV4Show(filters) === "nodust" ? AAVE_V4_DUST_USD : undefined,
    // Lifecycle status buckets → wire statuses ("closed" expands to closed +
    // liquidated). Sent for every selection, the full set included. An absent
    // `status` does NOT mean "no restriction" on this index: api/src/routes/aaveV4.ts
    // rests an unscoped listing on ["open"], and its token for no restriction is the
    // explicit "all". Measured 2026-09-20 — no param and status=open both answer
    // 3,931; the three buckets answer 7,507 — so omitting it made Closed a chip that
    // changed the URL and not the list.
    status: bucketsToWireStatuses(effectiveStatuses(filters)),
    sortBy: filters.sortBy as AaveV4SpokePositionSort,
    sortOrder: filters.sortOrder,
    limit: AAVE_V4_ITEMS_PER_PAGE,
    offset: (page - 1) * AAVE_V4_ITEMS_PER_PAGE,
  };
}

/** Prune supply/borrow asset selections that aren't present on their side in the
 *  loaded (market-scoped) universe — else they'd be invisible active predicates
 *  guaranteeing zero results with no dropdown entry to clear them. Guarded on a
 *  loaded universe so an empty pre-fetch state can't wipe URL-provided selections.
 *  Returns the pruned filters, or null when nothing changes. The hub→spoke prune
 *  lives in the `hubs` dimension's `set` (an interaction, not async), so this only
 *  reconciles the asset layer. */
export function reconcileAaveV4Assets(
  filters: AaveV4ListFilters,
  universe: AaveV4AssetUniverseEntry[] | undefined,
): AaveV4ListFilters | null {
  if (!universe || universe.length === 0) return null;
  const supplyAvail = new Set(universe.filter((e) => e.asSupply).map((e) => e.symbol));
  const borrowAvail = new Set(universe.filter((e) => e.asDebt).map((e) => e.symbol));
  const nextSupply = filters.supplyAssets.filter((s) => supplyAvail.has(s));
  const nextBorrow = filters.borrowAssets.filter((s) => borrowAvail.has(s));
  if (nextSupply.length === filters.supplyAssets.length && nextBorrow.length === filters.borrowAssets.length) {
    return null;
  }
  return { ...filters, supplyAssets: nextSupply, borrowAssets: nextBorrow };
}
