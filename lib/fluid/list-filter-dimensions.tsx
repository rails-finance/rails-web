// Fluid listing filter registry (SERVER-DRIVEN). Like Moonwell/Spark, the
// listing pages against the backend: the selection here maps onto the
// /api/fluid/positions fetch params (filter + sort + offset), and rails-server
// does the structural work over mv_fluid_positions. So these dimensions carry
// a `param` (for the shareable URL) but no in-memory `matches` predicate — the
// backend is the filter.
//
// Facets that ship LIVE (backend + proxy honor the params):
//   • Status     — Open / Closed / All (ui-jobs 805), over mv_fluid_positions.
//   • Size       — a Debt range in the vault's borrow token
//     (lib/shared/size-dimensions.ts), sent as minDebt / maxDebt. A smart
//     vault with no single borrow token has no figure and sits outside any
//     bound. There is no Collateral range: the listing reads no price for it.
//     The Debt range replaces the old Position dropdown: `?state=borrowing`
//     reads as at least 1 and `?state=collateral-only` as 0, and those two
//     exact ranges also send the old hasDebt / noDebt flags, which say the same
//     thing to a server that predates the unit bounds.
//   • History    — Liquidated before / Never liquidated (wasLiquidated).
//   • Vault kind — Standard pairs (T1) / Smart vaults (DEX-share legs).
//   • Supplying  — the vault's supply token by symbol (`supply` → supplyAssets,
//     matched without case). Fluid has no fixed vault list, so the facet offers
//     only what the URL selected (/start's Borrowing results link here) and
//     shows only while something is.
//   • Transactions — a range over the position's distinct transactions
//     (`minTx` / `maxTx`, inclusive; lib/shared/transactions-dimension.ts).
//   • Owner search (address → the `wallet` param; a bare integer → the `nft`
//     param — positions are NFTs) and the four sort orders.

import { transactionBounds, transactionsDimension } from "@/lib/shared/transactions-dimension";
import { sizeBounds, sizeDimensions } from "@/lib/shared/size-dimensions";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { FetchFluidPositionsParams } from "@/lib/api/fetch-fluid-positions";
import { defaultStatusChoice, fluidStatusBuckets, statusChoice } from "@/lib/fluid/listing-visibility";
import { setStatusChoice, STATUS_CHOICE_OPTIONS } from "@/lib/shared/status-choice";

/** Backend caps `limit` at 100; 20 keeps the page light and the grid familiar. */
export const FLUID_ITEMS_PER_PAGE = 20;

/** The Transactions slider's top: the round number above the busiest position.
 *  The MV stores events, not transactions, so its largest event count stands in
 *  (1,468 events, 20 Oct 2026). */
const FLUID_TX_TOP = 2000;

/** The Debt slider's top, in borrow-token units: the round number above the
 *  largest debt (19,768,582 USDT, 21 Oct 2026). */
const FLUID_DEBT_TOP = 20_000_000;

const FLUID_SIZE_NOTE =
  "Debt in the vault's borrow token; smart vaults with no single borrow token sit outside any bound.";

export interface FluidListFilters extends BaseListFilters {
  /** One of open / closed / all, or [] for the resting choice (ui-jobs 805). */
  status: string[];
  /** Debt range in the borrow token, one encodeRange value or [] for no
   *  bound. URL param `debt`, read from the old `state` too. */
  debt: string[];
  /** "" | "liquidated" | "never" — the wasLiquidated flag (orthogonal history). */
  liquidations: string[];
  /** "" | "t1" | "smart" — plain token pairs vs DEX-share-legged smart vaults. */
  vaultKind: string[];
  /** Transaction-count range, one encodeRange value or [] for no bound. */
  tx: string[];
  /** Supply-token symbols (multi, OR). URL param `supply`. */
  supplying: string[];
}

// No status is written into the page defaults: an empty `status` is "no opinion", and
// listing-visibility.ts resolves it per context — the open positions on the bare directory,
// every status once the search names an identity.
export const FLUID_LIST_DEFAULTS: FluidListFilters = {
  q: "",
  sortBy: "lastActivity",
  sortOrder: "desc",
  status: [],
  debt: [],
  liquidations: [],
  vaultKind: [],
  tx: [],
  supplying: [],
};

export const FLUID_SORT_OPTIONS: SortOption[] = [
  { value: "lastActivity", label: RECENT_ACTIVITY_LABEL },
  { value: "debt", label: "Debt size" },
  { value: "collateral", label: "Collateral size" },
  { value: "events", label: "Event count" },
];

const LIQUIDATION_OPTIONS: FilterOptionDef[] = [
  { value: "liquidated", label: "Liquidated before" },
  { value: "never", label: "Never liquidated" },
];

const VAULT_KIND_OPTIONS: FilterOptionDef[] = [
  { value: "t1", label: "Standard pairs" },
  { value: "smart", label: "Smart vaults" },
];

export function fluidListDimensions(
  filters: FluidListFilters = FLUID_LIST_DEFAULTS,
): SerializableDimension<FluidListFilters>[] {
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
      set: (f, v) => ({ ...f, status: setStatusChoice(v, defaultStatusChoice(f), []).status }),
    },
    ...sizeDimensions<FluidListFilters>({
      getDebt: (f) => f.debt,
      setDebt: (f, debt) => ({ ...f, debt }),
      getColl: () => [],
      setColl: (f) => f,
      sides: ["debt"],
      debtUnit: "borrow token",
      debtAliases: ["state"],
      top: FLUID_DEBT_TOP,
      panelNote: FLUID_SIZE_NOTE,
    }),
    {
      id: "vaultKind",
      label: "Vault kind",
      group: "Vault kind",
      cardinality: "single",
      param: "kind",
      options: VAULT_KIND_OPTIONS,
      get: (f) => f.vaultKind,
      set: (f, v) => ({ ...f, vaultKind: v }),
    },
    {
      id: "supplying",
      label: "Supplying",
      group: "Assets",
      cardinality: "multi",
      param: "supply",
      options: filters.supplying.map((s) => ({ value: s, label: s })),
      get: (f) => f.supplying,
      set: (f, v) => ({ ...f, supplying: v }),
      available: (f) => f.supplying.length > 0,
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
    },
    transactionsDimension<FluidListFilters>({
      get: (f) => f.tx,
      set: (f, tx) => ({ ...f, tx }),
      top: FLUID_TX_TOP,
    }),
  ];
}

const SORT_VALUES = new Set(FLUID_SORT_OPTIONS.map((o) => o.value));

/** Map the decoded selection + page onto the fetch params — the server-driven
 *  counterpart of the in-memory tier's ApplyConfig. */
export function fluidFiltersToFetchParams(filters: FluidListFilters, page: number): FetchFluidPositionsParams {
  const liq = filters.liquidations[0];
  const kind = filters.vaultKind[0];
  // Positions are NFTs: a bare integer looks up the NFT id, anything else the
  // owner wallet (the backend filters by the NFT's current owner).
  const q = filters.q.trim();
  return {
    wallet: q && !/^\d+$/.test(q) ? q : undefined,
    nft: q && /^\d+$/.test(q) ? q : undefined,
    // All maps to no status filter.
    status: fluidStatusBuckets(filters),
    // The old Position dropdown's flags for the two Debt ranges it maps to.
    hasDebt: filters.debt[0] === "1-" ? true : undefined,
    noDebt: filters.debt[0] === "-0" ? true : undefined,
    ...sizeBounds(filters, { debt: "unit" }),
    wasLiquidated: liq === "liquidated" ? true : liq === "never" ? false : undefined,
    vaultKind: kind === "t1" || kind === "smart" ? kind : undefined,
    supplyAssets: filters.supplying.length > 0 ? filters.supplying : undefined,
    ...transactionBounds(filters.tx),
    sortBy: SORT_VALUES.has(filters.sortBy)
      ? (filters.sortBy as NonNullable<FetchFluidPositionsParams["sortBy"]>)
      : undefined,
    sortOrder: filters.sortOrder,
    limit: FLUID_ITEMS_PER_PAGE,
    offset: (page - 1) * FLUID_ITEMS_PER_PAGE,
  };
}
