// Morpho Blue Base listing — the filter registry (SERVER-DRIVEN).
// ----------------------------------------------------------------------------
// The Ethereum Morpho listing filters in memory over a 500-row fetch, with
// Market / Loan / Collateral chips derived from the rows on screen. The Base
// listing pages against rails-server's /api/morpho-base/positions (mig 173):
// the selection here maps onto that route's params and the route does the
// structural work, so these dimensions carry a `param` for the shareable URL
// and no in-memory predicate.
//
// What is offered, and what deliberately is not:
//   • Status   — open / closed / liquidated, the route's own derivation from
//                the chain read (anything held → open) and the liquidation
//                record.
//   • Position — Borrowing (hasDebt) / Collateral only (noDebt).
//   • History  — Liquidated before (hasLiquidations).
//   • Search   — a wallet address restricts to that borrower; a 64-hex market
//                id restricts to that market.
//   • No Market / Loan / Collateral PICKER: the route accepts token addresses
//                for those facets, but a chip needs a roster to offer, and the
//                4,306-market census (lib/morpho-base/market-catalog.ts) is
//                873 KB this client bundle does not carry. A wallet page or a
//                market id in the search box reaches the same rows.
//   • Loan token (`loanTokens`, URL param `loan`) IS a real dimension, and DOES
//                have a picker despite the note above — not the 4,306-market
//                census, but a short hand-curated roster of the loan tokens
//                that actually carry meaningful borrow on Base (below). What
//                it is FOR: UI job 2's Debt/Collateral sort (rails-ops
//                TO-DO-ui-jobs.md §2) is CHAIN-PURE — this lane has no
//                loan-token USD anywhere, only the market oracle's
//                collateral→loan price — so ranking only means something once
//                the loan token is pinned to ONE address (every market on it
//                then shares its decimals). A sort by Debt/Collateral is
//                offered (`morphoBaseSortOptions`) only while `loanTokens`
//                holds exactly one address. A selection outside the curated
//                roster (a shared URL from before it grew, or a market this
//                roster hasn't caught up to) still renders — labelled by its
//                own shortened address, same as before the roster existed.
//   • Collateral token (`collateralTokens`, URL param `coll`) — the same
//                shape: a short curated roster, not a census, so a reader
//                reaches the Coinbase tokenised-stock positions in one click.
//                It narrows the rows only; the sort gate stays on the loan
//                token alone. Combines with the loan token as AND.

import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import { RECENT_ACTIVITY_LABEL, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { FetchMorphoPositionsParams } from "@/lib/api/fetch-morpho-positions";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { BASE_TOKEN_ADDRESSES } from "@/lib/shared/token-addresses.base";
import {
  canonicalStatuses,
  defaultStatuses,
  effectiveStatuses,
  isAllStatuses,
  sameStatusSet,
} from "@/lib/morpho-base/listing-visibility";

export const MORPHO_BASE_POSITIONS_ROUTE = "/api/morpho-base/positions";

/** Backend caps `limit` at 100; 20 keeps the page light and the grid familiar. */
export const MORPHO_BASE_ITEMS_PER_PAGE = 20;

export interface MorphoBaseListFilters extends BaseListFilters {
  /** open / closed / liquidated — multi (OR). */
  status: string[];
  /** "" | "borrowing" | "collateral-only" — the debt side of the position. */
  state: string[];
  /** "" | "liquidated" — positions liquidated at least once. */
  liquidations: string[];
  /** Loan-token ERC-20 addresses (CSV on the wire, `loan`). Headless — see the
   *  file header — but its LENGTH gates the Debt/Collateral sort. */
  loanTokens: string[];
  /** Collateral-token ERC-20 addresses (CSV on the wire, `coll`). */
  collateralTokens: string[];
}

// No status is written into the page defaults: an empty `status` is "no opinion", and
// listing-visibility.ts resolves it per context — the open positions on the bare directory,
// every status once the search names an identity. Because the default is contextual rather
// than a selection it draws no chip and no Reset link, and a cleared selection resolves back
// to what the context rests on.
export const MORPHO_BASE_LIST_DEFAULTS: MorphoBaseListFilters = {
  q: "",
  sortBy: "recent",
  sortOrder: "desc",
  status: [],
  state: [],
  liquidations: [],
  loanTokens: [],
  collateralTokens: [],
};

/** Sort menu as a function of the live selection — Debt/Collateral rank in
 *  loan-token raw units (this lane's oracle only answers collateral→loan, no
 *  cross-token USD to rank on), so they mean something only once `loanTokens`
 *  has narrowed to exactly one address; any other state offers Recent activity
 *  alone, matching what rails-server's /positions actually honours. */
export function morphoBaseSortOptions(filters: MorphoBaseListFilters): SortOption[] {
  const recent: SortOption = { value: "recent", label: RECENT_ACTIVITY_LABEL };
  if (filters.loanTokens.length !== 1) return [recent];
  return [recent, { value: "debt", label: "Debt" }, { value: "coll", label: "Collateral" }];
}

/** An ERC-20 address as a chip can show it without a symbol roster — the
 *  fallback for a selection outside the curated roster below (an older
 *  shared URL, or a market the roster hasn't caught up to). */
const shortAddr = (v: string): string =>
  v.startsWith("0x") && v.length === 42 ? `${v.slice(0, 6)}…${v.slice(-4)}` : v;

/** A CURATED roster, not a census: the loan tokens carrying meaningful borrow
 *  on Base's Morpho markets, hand-picked rather than derived from the
 *  4,306-market catalog this bundle deliberately doesn't carry (file header).
 *  Re-curated 2026-09-06 from the box's own census (open borrowers per loan
 *  token across morpho_base_position_chain): every token with ≥ 50 open
 *  borrowers is in, in that order — USDC 65k, KITE 8.2k, WETH 2.7k, cbBTC
 *  839, EURC 342, jEUR 95, eUSD 66, msETH 54. The 2026-09-03 first cut had
 *  named USDbC / wstETH / cbETH / USDS / AERO, none of which is the loan
 *  token of any Base market with a borrower. Addresses come from the
 *  generated Base symbol table (lib/shared/token-addresses.base.ts,
 *  scripts/audit-token-icons.mjs) — the same source the token chip's own CDN
 *  lookup uses — so a chip here draws the real logo where one exists (KITE
 *  and jEUR have no mark on any CDN and draw as their initial). Re-curate by
 *  hand if a new loan token's borrow book becomes worth a chip; this is
 *  deliberately short (≤ ~12), not exhaustive — a roster miss still filters
 *  correctly by typing the address into a URL (`?loan=0x…`), just without a
 *  chip to pick it from. */
const LOAN_TOKEN_ROSTER_SYMBOLS = ["USDC", "KITE", "WETH", "cbBTC", "EURC", "jEUR", "eUSD", "msETH"] as const;

const LOAN_TOKEN_OPTIONS: FilterOptionDef[] = LOAN_TOKEN_ROSTER_SYMBOLS.map((symbol) => {
  const address = BASE_TOKEN_ADDRESSES[symbol];
  return {
    value: address,
    label: symbol,
    icon: <TokenChipIcon symbol={symbol} address={address} size={18} filterable={false} />,
  };
});

/** The collateral roster: the five Coinbase tokenised stocks (the Morpho
 *  Blue Base markets in rails-ops reference/tokenised-stock-collateral-
 *  pricing.md), then cbBTC and WETH. The stocks are not in the generated
 *  symbol table, so their addresses are written here — each is the
 *  collateral token of its market in lib/morpho-base/market-catalog.ts, and
 *  its symbol() read AAPLc / GOOGLc / NVDAc / METAc / SPCXc on Base
 *  (2026-09-19). */
const COLLATERAL_TOKEN_ROSTER: readonly { symbol: string; address: string }[] = [
  { symbol: "AAPLc", address: "0xb200000000000000000000c2e324d24d7eecd1fb" },
  { symbol: "GOOGLc", address: "0xb2000000000000000000002d0ba3164cc74f58b7" },
  { symbol: "NVDAc", address: "0xb20000000000000000000078ee7ce2fe4908108c" },
  { symbol: "METAc", address: "0xb2000000000000000000008bc8786b856e61707c" },
  { symbol: "SPCXc", address: "0xb2000000000000000000007b9fcbd005511acbd5" },
  { symbol: "cbBTC", address: BASE_TOKEN_ADDRESSES.cbBTC },
  { symbol: "WETH", address: BASE_TOKEN_ADDRESSES.WETH },
];

const COLLATERAL_TOKEN_OPTIONS: FilterOptionDef[] = COLLATERAL_TOKEN_ROSTER.map(({ symbol, address }) => ({
  value: address,
  label: symbol,
  icon: <TokenChipIcon symbol={symbol} address={address} size={18} filterable={false} />,
}));

/** Roster option, or (for a value the roster doesn't name) the shortened
 *  address fallback — so an out-of-roster selection still has a row to
 *  un-tick. */
function tokenOptions(roster: FilterOptionDef[], selected: string[]): FilterOptionDef[] {
  const known = new Set(roster.map((o) => o.value));
  const extra = selected.filter((v) => !known.has(v)).map((v) => ({ value: v, label: shortAddr(v) }));
  return [...roster, ...extra];
}

const STATUS_OPTIONS: FilterOptionDef[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "liquidated", label: "Liquidated" },
];

const STATE_OPTIONS: FilterOptionDef[] = [
  { value: "borrowing", label: "Borrowing" },
  { value: "collateral-only", label: "Collateral only" },
];

const LIQUIDATION_OPTIONS: FilterOptionDef[] = [{ value: "liquidated", label: "Liquidated before" }];

export function morphoBaseListDimensions(
  filters: MorphoBaseListFilters,
): SerializableDimension<MorphoBaseListFilters>[] {
  return [
    {
      id: "loanTokens",
      label: "Loan token",
      group: "Assets",
      cardinality: "multi",
      param: "loan",
      // The curated roster, plus a fallback row for any selection outside it
      // (see tokenOptions) — always offered, no `available` gate.
      options: tokenOptions(LOAN_TOKEN_OPTIONS, filters.loanTokens),
      get: (f) => f.loanTokens,
      set: (f, v) => ({ ...f, loanTokens: v }),
    },
    {
      id: "collateralTokens",
      label: "Collateral token",
      group: "Assets",
      cardinality: "multi",
      param: "coll",
      options: tokenOptions(COLLATERAL_TOKEN_OPTIONS, filters.collateralTokens),
      get: (f) => f.collateralTokens,
      set: (f, v) => ({ ...f, collateralTokens: v }),
    },
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
      id: "state",
      label: "Position",
      group: "Position",
      cardinality: "single",
      param: "state",
      options: STATE_OPTIONS,
      get: (f) => f.state,
      set: (f, v) => ({ ...f, state: v }),
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
  ];
}

const WALLET_RE = /^0x[0-9a-f]{40}$/;
const MARKET_RE = /^(0x)?[0-9a-f]{64}$/;

/** What the search box is asking for: a borrower, a market, or nothing usable. */
export function morphoBaseSearchTarget(q: string): { wallet?: string; market?: string } {
  const s = q.trim().toLowerCase();
  if (WALLET_RE.test(s)) return { wallet: s };
  if (MARKET_RE.test(s)) return { market: s.replace(/^0x/, "") };
  return {};
}

/** Map the decoded selection + page onto the fetch params — the server-driven
 *  counterpart of the in-memory tier's ApplyConfig. */
export function morphoBaseFiltersToFetchParams(
  filters: MorphoBaseListFilters,
  page: number,
): FetchMorphoPositionsParams {
  const state = filters.state[0];
  const target = morphoBaseSearchTarget(filters.q);
  return {
    user: target.wallet,
    market: target.market,
    loan: filters.loanTokens.length > 0 ? filters.loanTokens.join(",") : undefined,
    coll: filters.collateralTokens.length > 0 ? filters.collateralTokens.join(",") : undefined,
    // The full set maps to no status filter; a real subset is sent verbatim.
    status: isAllStatuses(filters) ? undefined : effectiveStatuses(filters),
    hasDebt: state === "borrowing" ? true : undefined,
    noDebt: state === "collateral-only" ? true : undefined,
    hasLiquidations: filters.liquidations.includes("liquidated") ? true : undefined,
    // Sent as-is (recent/debt/coll) — the reconcile hook on the listing keeps
    // sortBy off debt/coll once loanTokens stops being exactly one address, and
    // the Base proxy re-checks the same gate at the wire regardless.
    sortBy: filters.sortBy as FetchMorphoPositionsParams["sortBy"],
    sortOrder: filters.sortOrder,
    limit: MORPHO_BASE_ITEMS_PER_PAGE,
    offset: (page - 1) * MORPHO_BASE_ITEMS_PER_PAGE,
    route: MORPHO_BASE_POSITIONS_ROUTE,
  };
}

// ── fixed to one market ──────────────────────────────────────────────────────
//
// The same listing on one market's own page (/base/morpho/markets/<loan>/<id>).
// The market is not a chip the reader can clear: it rides every fetch as
// `market`, and the two token facets are not offered, because the market names
// both. Its loan token is fixed with it in the defaults, so the Debt/Collateral
// sort — gated on exactly one loan token — is offered as it is on a listing
// narrowed to that token. Status, Position and History work as they do here.

/** The resting selection on a market's page. */
export function morphoBaseMarketDefaults(loanToken: string): MorphoBaseListFilters {
  return { ...MORPHO_BASE_LIST_DEFAULTS, loanTokens: [loanToken.toLowerCase()] };
}

/** The registry without the token facets. */
export function morphoBaseMarketDimensions(
  filters: MorphoBaseListFilters,
): SerializableDimension<MorphoBaseListFilters>[] {
  return morphoBaseListDimensions(filters).filter((d) => d.id !== "loanTokens" && d.id !== "collateralTokens");
}

/** The fetch, with the market fixed — a market id typed into the search box
 *  cannot widen it to another. */
export function morphoBaseMarketFetchParams(
  filters: MorphoBaseListFilters,
  page: number,
  marketId: string,
): FetchMorphoPositionsParams {
  return { ...morphoBaseFiltersToFetchParams(filters, page), market: marketId.toLowerCase().replace(/^0x/, "") };
}
