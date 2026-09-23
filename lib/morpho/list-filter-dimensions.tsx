// Morpho Blue L1 listing — the filter registry (SERVER-DRIVEN, roster-backed).
// ----------------------------------------------------------------------------
// Until 2026-08-28 this listing was the in-memory tier: it fetched 500 of the
// index's 46,815 positions, derived the Market / Loan / Collateral options from
// the rows that came back, and filtered them in the browser. Every facet and the
// search box therefore ran over ~1% of the data, and the menus could only offer
// markets that happened to have recent activity. A reader searching a market by
// name got an answer drawn from the slice and no sign that the rest existed.
//
// Now it pages against rails-server like the rest of the server tier, and the
// facet options come from the market ROSTER (lib/api/fetch-morpho-market-roster)
// — every market the index holds, fetched once and independent of any filter. So
// the registry is a FUNCTION of that roster, consumed through the shared driver's
// dynamic-dimensions seam (decision 0009), the same shape Aave V4 uses for its
// asset universe. Only `options` vary with it: the codec fields (param / get /
// set) are invariant, so the driver's URL decode / encode / keying stay
// well-defined whether or not the roster has landed.
//
// How a selection reaches the backend:
//   • Status            → `status` (CSV, OR within).
//   • Market picks, and free text matched against roster labels → `market`
//     (CSV of market ids, capped — see MORPHO_MARKET_CSV_CAP).
//   • Loan / Collateral → `loan` / `coll` (CSV of ERC-20 ADDRESSES). Not market
//     ids: USDC alone is the loan token of ~503 markets, and a market-id CSV for
//     it would be a 33 KB query string. A symbol can name more than one
//     contract, so every address under it is sent.
//   • A wallet address in the search box → `user`; a 64-hex id → `market`.
//
// Degrading while the roster is absent: the roster route and the `market` CSV /
// `loan` / `coll` params ship together, so a roster in hand is the signal that
// the backend understands them. Without one the listing still pages, still
// filters by status, and still finds a wallet or a market id — it just offers no
// Market / Loan / Collateral chips. See morphoFiltersToFetchParams for what is
// deliberately NOT sent in that state.

import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { MorphoPositionSort } from "@/lib/sources/api/morpho-positions";
import type { FetchMorphoPositionsParams } from "@/lib/api/fetch-morpho-positions";
import type { MorphoMarketRosterEntry, MorphoMarketRosterResponse } from "@/lib/api/fetch-morpho-market-roster";
import { shortMarketId } from "@/lib/morpho/asset-catalog";
import {
  canonicalStatuses,
  defaultStatuses,
  effectiveStatuses,
  isAllStatuses,
  sameStatusSet,
} from "@/lib/morpho/listing-visibility";

/** The backend caps `limit` at 500; 20 keeps the page light and the grid familiar. */
export const MORPHO_ITEMS_PER_PAGE = 20;

/** Market ids one request may carry. rails-server accepts up to 300, but the
 *  binding limit is the URL: a 64-hex id plus its separator is 65 bytes, so 300
 *  ids is a ~19.5 KB query string — past the 16 KB request-line + header budget
 *  Node and Vercel enforce, which would fail as a 431 rather than as a filter.
 *  150 lands at ~9.8 KB with room for the rest of the request. Only a very broad
 *  free-text search can reach the cap at all, and that path states what it left
 *  off (morphoSearchTruncation). */
export const MORPHO_MARKET_CSV_CAP = 150;

export interface MorphoListFilters extends BaseListFilters {
  status: string[];
  /** 0x-prefixed market ids, as a position row carries them. */
  markets: string[];
  /** Loan token SYMBOLS; mapped to addresses through the roster. */
  loanAssets: string[];
  /** Collateral token symbols; mapped the same way. */
  collateralAssets: string[];
}

// No status is written into the page defaults: an empty `status` is "no opinion", and
// listing-visibility.ts resolves it per context — the open positions on the bare directory,
// every status once the search names an identity. Because the default is contextual rather
// than a selection it draws no chip and no Reset link, and a cleared selection resolves back
// to what the context rests on.
export const MORPHO_LIST_DEFAULTS: MorphoListFilters = {
  q: "",
  sortBy: "lastActivity",
  sortOrder: "desc",
  status: [],
  markets: [],
  loanAssets: [],
  collateralAssets: [],
};

// Only the orderings rails-server actually applies. The retired in-memory tier
// also offered Collateral / Borrowed / LLTV; those sorted the 500-row slice in
// the browser and the route has no equivalent, so offering them against a paged
// index would order one page rather than the index it claims to order.
export const MORPHO_SORT_OPTIONS: SortOption[] = [
  { value: "lastActivity", label: RECENT_ACTIVITY_LABEL },
  { value: "created", label: "First seen" },
  { value: "events", label: "Event count" },
];

const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "liquidated", label: "Liquidated" },
];

/** What the driver hands the registry: the roster once it has settled, and
 *  whether it ever will. `loading` and `unavailable` are kept apart because they
 *  call for opposite things — never prune a URL-provided selection while the
 *  answer is still in flight. */
export interface MorphoRosterState {
  status: "loading" | "ready" | "unavailable";
  roster: MorphoMarketRosterResponse | null;
}

export const MORPHO_ROSTER_LOADING: MorphoRosterState = { status: "loading", roster: null };

/** Distinct symbols on one side of the roster, in first-seen order. */
function symbolOptions(markets: MorphoMarketRosterEntry[], side: "loan" | "collateral"): FilterOptionDef[] {
  const seen = new Map<string, FilterOptionDef>();
  for (const m of markets) {
    const symbol = side === "loan" ? m.loanSymbol : m.collateralSymbol;
    // An idle market's collateral side is null — never offered as a chip.
    if (!symbol || seen.has(symbol)) continue;
    seen.set(symbol, {
      value: symbol,
      label: symbol,
      icon: <TokenChipIcon symbol={symbol} size={16} filterable={false} />,
    });
  }
  return [...seen.values()];
}

/** Options standing in for a selection made before the roster landed (or made
 *  against a deployment that has none). Without them an active chip would have
 *  no row to un-tick, which strands the reader with a filter they cannot clear. */
function selectionOptions(values: string[], label: (v: string) => string): FilterOptionDef[] {
  return values.map((v) => ({ value: v, label: label(v) }));
}

/**
 * The registry as a function of the roster. Always returns all four dimensions —
 * the codec must not depend on whether the roster landed, or a shared URL's
 * `market` / `loan` / `coll` params would decode on one render and not the next.
 * What the roster changes is the OPTIONS, and whether the group is offered at
 * all (`available`).
 */
export function morphoListDimensions(
  filters: MorphoListFilters,
  state: MorphoRosterState | undefined,
): SerializableDimension<MorphoListFilters>[] {
  const roster = state?.status === "ready" ? state.roster : null;
  const markets = roster?.markets ?? [];
  const offered = roster != null;

  const marketOptions: FilterOptionDef[] = markets.map((m) => ({
    value: m.marketId,
    label: m.label,
    // Panel-only trailing figure: how many positions the market holds. Not part
    // of the chip text and not matched by the panel's type-to-filter box.
    meta: m.positions.toLocaleString("en-US"),
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
      set: (f, v) => {
        const sel = canonicalStatuses(v);
        return { ...f, status: sel.length === 0 || sameStatusSet(sel, defaultStatuses(f)) ? [] : sel };
      },
    },
    {
      id: "markets",
      label: "Market",
      group: "Market",
      cardinality: "multi",
      param: "market",
      options: offered ? marketOptions : selectionOptions(filters.markets, shortMarketId),
      get: (f) => f.markets,
      set: (f, v) => ({ ...f, markets: v }),
      available: (f) => offered || f.markets.length > 0,
    },
    {
      id: "loanAssets",
      label: "Loan",
      group: "Asset",
      cardinality: "multi",
      param: "loan",
      options: offered ? symbolOptions(markets, "loan") : selectionOptions(filters.loanAssets, (s) => s),
      get: (f) => f.loanAssets,
      set: (f, v) => ({ ...f, loanAssets: v }),
      available: (f) => offered || f.loanAssets.length > 0,
    },
    {
      id: "collateralAssets",
      label: "Collateral",
      group: "Asset",
      cardinality: "multi",
      param: "coll",
      options: offered ? symbolOptions(markets, "collateral") : selectionOptions(filters.collateralAssets, (s) => s),
      get: (f) => f.collateralAssets,
      set: (f, v) => ({ ...f, collateralAssets: v }),
      available: (f) => offered || f.collateralAssets.length > 0,
    },
  ];
}

const WALLET_RE = /^0x[0-9a-f]{40}$/;
const MARKET_RE = /^(0x)?[0-9a-f]{64}$/;

export interface MorphoSearchTarget {
  /** An exact borrower address. */
  wallet?: string;
  /** An exact market id, 64 hex without the 0x prefix. */
  market?: string;
  /** Anything else typed — matched against roster market labels. */
  text?: string;
}

/** What the search box is asking for: a borrower, a market, or a name to look up. */
export function morphoSearchTarget(q: string): MorphoSearchTarget {
  const s = q.trim().toLowerCase();
  if (!s) return {};
  if (WALLET_RE.test(s)) return { wallet: s };
  if (MARKET_RE.test(s)) return { market: s.replace(/^0x/, "") };
  return { text: s };
}

/** True when a selection can only be expressed with the roster in hand — a
 *  market searched by name, either token facet, or more than one market picked.
 *  The SSR half asks this before deciding whether it may render a first paint at
 *  all: rendering one from a roster the browser then disagrees with would seed
 *  the driver with rows for a different question, and the key match would stop
 *  it fetching the right ones. */
export function morphoSelectionNeedsRoster(filters: MorphoListFilters): boolean {
  return (
    morphoSearchTarget(filters.q).text != null ||
    filters.loanAssets.length > 0 ||
    filters.collateralAssets.length > 0 ||
    filters.markets.length > 1
  );
}

/** The markets whose label contains `text` (the case the report came from:
 *  "reusd" reaching all 215 positions of USDC / PT-reUSD-10DEC2026, not the 29
 *  that happened to be in the old 500-row slice). */
function marketsMatchingText(roster: MorphoMarketRosterResponse, text: string): MorphoMarketRosterEntry[] {
  return roster.markets.filter((m) => m.label.toLowerCase().includes(text));
}

/** Every ERC-20 address the roster has seen under these symbols. */
function addressesForSymbols(roster: MorphoMarketRosterResponse, symbols: string[]): string[] {
  const out: string[] = [];
  for (const s of symbols) for (const a of roster.tokens[s] ?? []) if (!out.includes(a)) out.push(a);
  return out;
}

/** A free-text search that names one SIDE of every market it matched can be
 *  asked of the backend exactly, by token address, however many markets that is
 *  — `loan=` / `coll=` carry a handful of addresses where the market ids would
 *  be hundreds. Returns null when the matches straddle both sides (a symbol like
 *  USDC, which is a loan token in some markets and collateral in others): the
 *  route's params are ANDed, so there is no way to ask for the union. */
function textAsTokenSide(
  roster: MorphoMarketRosterResponse,
  matched: MorphoMarketRosterEntry[],
  text: string,
): { loan?: string[]; coll?: string[] } | null {
  const hits = (s: string | null) => s != null && s.toLowerCase().includes(text);
  if (matched.every((m) => hits(m.loanSymbol))) {
    return { loan: addressesForSymbols(roster, [...new Set(matched.map((m) => m.loanSymbol))]) };
  }
  if (matched.every((m) => hits(m.collateralSymbol))) {
    return { coll: addressesForSymbols(roster, [...new Set(matched.map((m) => m.collateralSymbol!))]) };
  }
  return null;
}

/** What a free-text search could not carry, for the listing to state rather than
 *  quietly drop. Null when nothing was truncated. */
export function morphoSearchTruncation(
  filters: MorphoListFilters,
  state: MorphoRosterState | undefined,
): { matched: number; carried: number } | null {
  if (state?.status !== "ready" || !state.roster) return null;
  const text = morphoSearchTarget(filters.q).text;
  if (!text) return null;
  const matched = marketsMatchingText(state.roster, text);
  if (matched.length <= MORPHO_MARKET_CSV_CAP) return null;
  if (textAsTokenSide(state.roster, matched, text)) return null;
  return { matched: matched.length, carried: MORPHO_MARKET_CSV_CAP };
}

/** Market ids, most-populated first — the order truncation keeps. */
function idsByPopulation(markets: MorphoMarketRosterEntry[]): string[] {
  return [...markets].sort((a, b) => b.positions - a.positions).map((m) => m.marketId);
}

/**
 * Map the decoded selection + page onto the fetch params — the server-driven
 * counterpart of the retired in-memory ApplyConfig.
 *
 * Returns null when the selection can match nothing, which is a different thing
 * from an unconstrained fetch: rails-server IGNORES a param it does not
 * understand and drops an unmatched market id, so a request built from a
 * question it cannot answer comes back as the whole 46,815-row index — a search
 * for "reusd" answered with everything. Null means the caller skips the request
 * and renders the empty state, which is the truthful answer to "no market is
 * named that".
 *
 * The same reasoning governs the no-roster path. The roster route ships with the
 * `market` CSV / `loan` / `coll` params, so a roster in hand is the signal that
 * they are understood. Without one, only what the route has always honoured goes
 * out — `user`, `status`, `sortBy` and a SINGLE `market` id — and any facet
 * needing more resolves to null rather than to a silently unfiltered page. The
 * listing states that case on its face rather than leaving the empty result to
 * read as a fact about the index.
 */
export function morphoFiltersToFetchParams(
  filters: MorphoListFilters,
  page: number,
  state: MorphoRosterState | undefined,
): FetchMorphoPositionsParams | null {
  const roster = state?.status === "ready" ? state.roster : null;
  const target = morphoSearchTarget(filters.q);

  const base: FetchMorphoPositionsParams = {
    user: target.wallet,
    // The full set maps to no status filter; a real subset is sent verbatim.
    status: isAllStatuses(filters) ? undefined : effectiveStatuses(filters),
    sortBy: filters.sortBy as MorphoPositionSort,
    sortOrder: filters.sortOrder,
    limit: MORPHO_ITEMS_PER_PAGE,
    offset: (page - 1) * MORPHO_ITEMS_PER_PAGE,
  };

  // An exact market id needs no roster: the route has always taken one.
  if (target.market) return { ...base, market: target.market };

  const facetsActive =
    filters.markets.length > 0 || filters.loanAssets.length > 0 || filters.collateralAssets.length > 0;

  if (!roster) {
    // Pre-deploy (or a failed roster fetch). One picked market is still
    // expressible; a name search and the token facets are not.
    if (target.text) return null;
    if (filters.markets.length === 1 && filters.loanAssets.length === 0 && filters.collateralAssets.length === 0) {
      return { ...base, market: filters.markets[0].replace(/^0x/, "") };
    }
    return facetsActive ? null : base;
  }

  let loan = filters.loanAssets.length > 0 ? addressesForSymbols(roster, filters.loanAssets) : null;
  let coll = filters.collateralAssets.length > 0 ? addressesForSymbols(roster, filters.collateralAssets) : null;
  // A symbol the roster no longer carries has no address to filter by; asking
  // anyway would drop the constraint.
  if ((loan && loan.length === 0) || (coll && coll.length === 0)) return null;

  // Market ids: the explicit picks, intersected with a free-text label match
  // when both are present (chips and search stack, as they do everywhere else).
  let ids: string[] | null = filters.markets.length > 0 ? filters.markets : null;
  if (target.text) {
    const matched = marketsMatchingText(roster, target.text);
    if (matched.length === 0) return null;
    // Over the cap, a search naming one side of every match is asked by token
    // address instead — exact, and a few addresses rather than hundreds of ids.
    const side = matched.length > MORPHO_MARKET_CSV_CAP ? textAsTokenSide(roster, matched, target.text) : null;
    if (side) {
      if (side.loan) loan = loan ? loan.filter((a) => side.loan!.includes(a)) : side.loan;
      if (side.coll) coll = coll ? coll.filter((a) => side.coll!.includes(a)) : side.coll;
      if ((loan && loan.length === 0) || (coll && coll.length === 0)) return null;
    } else {
      const textIds = idsByPopulation(matched);
      ids = ids ? ids.filter((id) => textIds.includes(id)) : textIds;
      if (ids.length === 0) return null;
    }
  }

  // Past the cap the request carries the markets holding the most positions and
  // morphoSearchTruncation states what was left off — only a text search this
  // broad can reach here.
  const market = ids
    ? ids
        .slice(0, MORPHO_MARKET_CSV_CAP)
        .map((id) => id.replace(/^0x/, ""))
        .join(",")
    : undefined;

  return { ...base, market, loan: loan?.join(","), coll: coll?.join(",") };
}

/** Drop any facet value the loaded roster does not offer — else it would sit in
 *  the URL as an invisible predicate no chip can clear. Only ever runs against a
 *  READY roster: pruning while the fetch is in flight, or because it failed,
 *  would wipe a selection a shared link legitimately carried. */
export function reconcileMorphoFacets(
  filters: MorphoListFilters,
  state: MorphoRosterState | undefined,
): MorphoListFilters | null {
  if (state?.status !== "ready" || !state.roster) return null;
  const roster = state.roster;
  const ids = new Set(roster.markets.map((m) => m.marketId));
  const loanSymbols = new Set(roster.markets.map((m) => m.loanSymbol));
  const collSymbols = new Set(roster.markets.map((m) => m.collateralSymbol).filter((s): s is string => s != null));

  const markets = filters.markets.filter((m) => ids.has(m));
  const loanAssets = filters.loanAssets.filter((s) => loanSymbols.has(s));
  const collateralAssets = filters.collateralAssets.filter((s) => collSymbols.has(s));
  const same =
    markets.length === filters.markets.length &&
    loanAssets.length === filters.loanAssets.length &&
    collateralAssets.length === filters.collateralAssets.length;
  return same ? null : { ...filters, markets, loanAssets, collateralAssets };
}

// ── fixed to one market ──────────────────────────────────────────────────────
//
// The same listing on one market's own page (/ethereum/morpho/markets/<loan>/
// <id>). The market rides every fetch as the one `market` id the route has
// always taken, so no roster is needed, and the facets that pick markets or
// tokens are not offered — only Status. The search box takes a wallet.

/** The registry on a market's page: Status alone. */
export function morphoMarketDimensions(filters: MorphoListFilters): SerializableDimension<MorphoListFilters>[] {
  return morphoListDimensions(filters, undefined).filter((d) => d.id === "status");
}

/** The fetch, with the market fixed. Null — nothing asked, the empty state
 *  shown — for a search that is not a wallet: a name or another market's id
 *  cannot narrow one market's positions, and dropping it would answer a
 *  different question than the box shows. */
export function morphoMarketFetchParams(
  filters: MorphoListFilters,
  page: number,
  marketId: string,
): FetchMorphoPositionsParams | null {
  const target = morphoSearchTarget(filters.q);
  const id = marketId.toLowerCase().replace(/^0x/, "");
  if (target.text || (target.market && target.market !== id)) return null;
  return {
    user: target.wallet,
    market: id,
    // The full set maps to no status filter; a real subset is sent verbatim.
    status: isAllStatuses(filters) ? undefined : effectiveStatuses(filters),
    sortBy: filters.sortBy as MorphoPositionSort,
    sortOrder: filters.sortOrder,
    limit: MORPHO_ITEMS_PER_PAGE,
    offset: (page - 1) * MORPHO_ITEMS_PER_PAGE,
  };
}
