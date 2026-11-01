// Frankencoin listing filter registry (SERVER-DRIVEN). The listing pages
// against the backend: the selection here maps onto the
// /api/frankencoin/positions fetch params (filter + sort + offset), and
// rails-server does the structural work at the POSITION grain. So these
// dimensions carry a `param` (for the shareable URL) but no in-memory
// `matches` predicate — the backend is the filter.
//
// Facets:
//   • Status  — open / closed / denied, the API's WHOLE lifecycle vocabulary,
//     resting on a CONTEXTUAL default (lib/frankencoin/listing-visibility.ts).
//     `denied` is the governance veto during the init window (an indexed fact
//     — PositionDenied is not head-observable). There is deliberately NO
//     `expired` facet: expiration is a constructor fact no event carries, so
//     the zero-RPC serving tier cannot filter on it — expiry renders from the
//     chain overlay on the detail page instead. ⚠️ The backend silently
//     ignores unknown status values, and a csv that reduces to nothing
//     returns the UNFILTERED set — the fetch-params mapper sanitizes to the
//     known three so a stale URL can never widen the query.
//   • Hub     — V1 / V2. The two MintingHubs run side by side; every live
//     position is V2 today, but V1 holds the richer challenge history.
//   • History — Challenged before / Challenge succeeded (the orthogonal
//     flags): open SURVIVORS match too — a challenged position can survive
//     its auction.
//   • Size    — the Debt range alone, in ZCHF (`minDebt` / `maxDebt` over
//     the position's minted amount; lib/shared/size-dimensions.ts).
//     Frankencoin states no market price for collateral, so the panel draws
//     no Collateral range.
//   • Transactions — a range over the position's distinct transactions
//     (`minTx` / `maxTx`, inclusive; lib/shared/transactions-dimension.ts).
//   • Owner search (the `q` box → the `owner` param — "this owner's
//     positions", plural on purpose: one owner can hold many Position
//     contracts) + recency sort.
//
//   • Collateral — one chip per collateral token the index has seen, from the
//     collateral ROSTER (lib/api/fetch-frankencoin-collateral-roster, rails-server
//     `/api/frankencoin/collateral-roster`): anyone can open a position on any
//     ERC-20, so the list is what the index holds, fetched once and independent
//     of any filter. The registry is a function of that roster, consumed through
//     the shared driver's dynamic-dimensions seam (decision 0009), the shape the
//     MakerDAO and Morpho listings use. A chip's value is the token address
//     (`collateralTokens`), its label the symbol (a token with no resolved
//     symbol reads as its short address), and the panel's trailing figure the
//     token's open positions, the total the filter returns under the listing's resting Open status.

import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import type { FrankencoinCollateralRosterResponse } from "@/lib/api/fetch-frankencoin-collateral-roster";
import { transactionBounds, transactionsDimension } from "@/lib/shared/transactions-dimension";
import { sizeBounds, sizeDimensions } from "@/lib/shared/size-dimensions";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { FetchFrankencoinPositionsParams } from "@/lib/api/fetch-frankencoin-positions";
import type { FrankencoinPositionSort } from "@/lib/sources/api/frankencoin-positions";
import {
  canonicalStatuses,
  defaultStatuses,
  effectiveStatuses,
  isAllStatuses,
  sameStatusSet,
} from "@/lib/frankencoin/listing-visibility";

/** Backend caps `limit` at 100; 20 keeps the page light and the grid familiar. */
export const FRANKENCOIN_ITEMS_PER_PAGE = 20;

/** The Transactions slider's top: the round number above the busiest position
 *  (64 transactions, 20 Oct 2026). */
const FRANKENCOIN_TX_TOP = 100;

/** The Debt slider's top: the round number above the biggest position's
 *  minted amount (6,000,000 ZCHF in mv_frankencoin_positions, 21 Oct 2026). */
const FRANKENCOIN_SIZE_TOP = 10_000_000;

/** The Size panel's unit line. */
const FRANKENCOIN_SIZE_NOTE = "Debt in ZCHF; Frankencoin states no market price for collateral.";

export interface FrankencoinListFilters extends BaseListFilters {
  /** open / closed / denied — multi (OR); the API's whole vocabulary. */
  status: string[];
  /** "" | "v1" | "v2" — the hub generation. */
  hub: string[];
  /** "" | "challenged" | "challenge-succeeded" — the orthogonal challenge
   *  axis (open survivors included). */
  challenges: string[];
  /** Debt range in ZCHF, one encodeRange value (`1000-50000`, `-0` for no
   *  debt) or [] for no bound. URL param `debt`. */
  debt: string[];
  /** Transaction-count range, one encodeRange value or [] for no bound. */
  tx: string[];
  /** Collateral token addresses (lowercase) — multi (OR). URL param `collateral`. */
  collateral: string[];
}

// No status is written into the page defaults: an empty `status` is "no opinion", and
// listing-visibility.ts resolves it per context — the open positions on the bare directory,
// every status once the search names an identity. Because the default is contextual rather
// than a selection it draws no chip and no Reset link, and a cleared selection resolves back
// to what the context rests on.
export const FRANKENCOIN_LIST_DEFAULTS: FrankencoinListFilters = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  status: [],
  hub: [],
  challenges: [],
  debt: [],
  tx: [],
  collateral: [],
};

// Values match Liquity V2's (lib/liquity-v2/list-filter-dimensions.tsx) so the
// URL grammar (`?sortBy=debt`) is the same across explorers.
export const FRANKENCOIN_SORT_OPTIONS: SortOption[] = [
  { value: "recent", label: RECENT_ACTIVITY_LABEL },
  { value: "debt", label: "Debt" },
  { value: "coll", label: "Collateral" },
];

// The API's whole vocabulary — NO "expired" (see the header note).
const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "denied", label: "Denied" },
];

const HUB_OPTIONS: FilterOptionDef[] = [
  { value: "v1", label: "MintingHub V1" },
  { value: "v2", label: "MintingHub V2" },
];

const CHALLENGE_OPTIONS: FilterOptionDef[] = [
  { value: "challenged", label: "Challenged before" },
  { value: "challenge-succeeded", label: "Challenge succeeded" },
];

/** What the driver hands the registry: the roster once it has settled, and
 *  whether it ever will. `loading` and `unavailable` are kept apart because they
 *  call for opposite things: never prune a URL-provided selection while the
 *  answer is still in flight. */
export interface FrankencoinRosterState {
  status: "loading" | "ready" | "unavailable";
  roster: FrankencoinCollateralRosterResponse | null;
}

export const FRANKENCOIN_ROSTER_LOADING: FrankencoinRosterState = { status: "loading", roster: null };

const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Options standing in for a selection made before the roster landed (or made
 *  against a deployment that has none), so an active chip always has a row to
 *  un-tick. */
function selectionOptions(values: string[]): FilterOptionDef[] {
  return values.map((token) => ({ value: token, label: shortAddress(token) }));
}

export function frankencoinListDimensions(
  filters: FrankencoinListFilters = FRANKENCOIN_LIST_DEFAULTS,
  state?: FrankencoinRosterState,
): SerializableDimension<FrankencoinListFilters>[] {
  const roster = state?.status === "ready" ? state.roster : null;
  const offered = roster != null;
  const collateralOptions: FilterOptionDef[] = (roster?.tokens ?? []).map((t) => ({
    value: t.token,
    label: t.symbol,
    icon: <TokenChipIcon symbol={t.symbol} address={t.token} size={16} filterable={false} />,
    // Panel-only trailing figure, not part of the chip text.
    meta: t.openPositions.toLocaleString("en-US"),
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
    {
      id: "collateral",
      label: "Collateral",
      group: "Collateral",
      cardinality: "multi",
      param: "collateral",
      options: offered ? collateralOptions : selectionOptions(filters.collateral),
      get: (f) => f.collateral,
      set: (f, v) => ({ ...f, collateral: v.map((t) => t.toLowerCase()) }),
      available: (f) => offered || f.collateral.length > 0,
    },
    {
      id: "hub",
      label: "Hub",
      group: "Hub",
      cardinality: "single",
      param: "hub",
      options: HUB_OPTIONS,
      get: (f) => f.hub,
      set: (f, v) => ({ ...f, hub: v }),
    },
    {
      id: "challenges",
      label: "History",
      group: "History",
      cardinality: "single",
      param: "chal",
      options: CHALLENGE_OPTIONS,
      get: (f) => f.challenges,
      set: (f, v) => ({ ...f, challenges: v }),
    },
    ...sizeDimensions<FrankencoinListFilters>({
      getDebt: (f) => f.debt,
      setDebt: (f, debt) => ({ ...f, debt }),
      getColl: () => [],
      setColl: (f) => f,
      panelNote: FRANKENCOIN_SIZE_NOTE,
      top: FRANKENCOIN_SIZE_TOP,
      sides: ["debt"],
      debtUnit: "ZCHF",
    }),
    transactionsDimension<FrankencoinListFilters>({
      get: (f) => f.tx,
      set: (f, tx) => ({ ...f, tx }),
      top: FRANKENCOIN_TX_TOP,
    }),
  ];
}

/** Map the decoded selection + page onto the fetch params — the server-driven
 *  counterpart of the in-memory tier's ApplyConfig. */
export function frankencoinFiltersToFetchParams(
  filters: FrankencoinListFilters,
  page: number,
): FetchFrankencoinPositionsParams {
  const hub = filters.hub[0];
  const owner = filters.q.trim();
  return {
    owner: owner ? owner : undefined,
    // The full set maps to no status filter; a real subset is sent verbatim.
    // `effectiveStatuses` reduces to the backend's own vocabulary on the way —
    // it silently drops unknown values, and a csv that reduces to nothing
    // returns the UNFILTERED set, so a stale "expired" chip must never reach
    // the wire.
    status: isAllStatuses(filters) ? undefined : effectiveStatuses(filters),
    hub: hub === "v1" || hub === "v2" ? hub : undefined,
    collateralTokens: filters.collateral.length > 0 ? filters.collateral : undefined,
    everChallenged: filters.challenges.includes("challenged") ? true : undefined,
    challengeSucceeded: filters.challenges.includes("challenge-succeeded") ? true : undefined,
    ...sizeBounds(filters, { debt: "unit" }),
    ...transactionBounds(filters.tx),
    sortBy: filters.sortBy as FrankencoinPositionSort,
    sortOrder: filters.sortOrder,
    limit: FRANKENCOIN_ITEMS_PER_PAGE,
    offset: (page - 1) * FRANKENCOIN_ITEMS_PER_PAGE,
  };
}

/** Drop any collateral token the loaded roster does not offer, else it would sit
 *  in the URL as an invisible predicate no chip can clear. Only ever runs against
 *  a READY roster: pruning while the fetch is in flight, or because it failed,
 *  would wipe a selection a shared link legitimately carried. */
export function reconcileFrankencoinCollateral(
  filters: FrankencoinListFilters,
  state: FrankencoinRosterState | undefined,
): FrankencoinListFilters | null {
  if (state?.status !== "ready" || !state.roster) return null;
  const known = new Set(state.roster.tokens.map((t) => t.token));
  const collateral = filters.collateral.filter((t) => known.has(t));
  return collateral.length === filters.collateral.length ? null : { ...filters, collateral };
}
