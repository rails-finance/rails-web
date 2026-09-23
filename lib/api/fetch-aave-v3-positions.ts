// ============================================================================
// FETCH AAVE V3 POSITIONS
// ============================================================================
//
// Discovery list for the /aave-v3 page. Aave V3 is a single cross-collateralised
// account per wallet (no V4 spokes), so it's ONE row per wallet — keyed by wallet
// alone. Served by the LIVE rails-server index (structural filter/sort/paginate
// over mv_aave_v3_positions, symbols + assembly client-side). A listing row
// carries no health factor or USD totals (0018) — risk is read live on the
// position page.

/** Per-reserve breakdown shipped with every listing row. Balances are token-wei
 *  strings (numeric(78,0)); scale by `decimals` at render time. */
export interface AaveV3ReserveSummary {
  symbol: string;
  address: string;
  decimals: number;
  supplyBalanceRaw: string;
  debtBalanceRaw: string;
  isCollateral: boolean;
  lt: number | null;
  usdPrice: number | null;
  /** How the balances were obtained. `"reduced"` — the index's scaled-balance
   *  reduction (0008/0011): the current rebased balance, interest included, equal
   *  to aToken/variableDebtToken `balanceOf` at the indexed head. `"replayed"` —
   *  an event-replay figure (only the PEAK lines, which are per-event maxima).
   *  `"chain"` — a balanceOf read at the row's `chainBlock` (the Base lenders,
   *  which have no replay lane at all). */
  balanceSource: "reduced" | "replayed" | "chain";
}

export interface AaveV3PositionRow {
  wallet: string;
  /** Which Aave V3 market this position belongs to (core | prime | etherfi).
   *  A wallet active in several markets yields one row per market. */
  market: string;
  /** The server's coverage flag: true when the periodic chain sweep has not
   *  covered this account. A listing row carries no health factor, threshold
   *  or USD totals (0018) — risk is read live on the position page. */
  chainHfStale: boolean;
  supplyAssetCount: number;
  debtAssetCount: number;
  dominantSupplySymbol: string | null;
  dominantSupplyAddress: string | null;
  dominantDebtSymbol: string | null;
  dominantDebtAddress: string | null;
  lastActivityAt: number;
  lastBlockNumber: number;
  lastTxHash: string | null;
  /** Lifetime liquidation count for this wallet (the listing renders a LIQUIDATED
   *  badge whenever > 0). */
  liquidationCount: number;
  lastLiquidationAt: number | null;
  /** Distinct non-liquidation transaction count. */
  txCount: number;
  /** Base lenders only: the block every chain figure on this row was read at,
   *  and when — the row's receipt. Null on Ethereum rows. */
  chainBlock?: number | null;
  chainReadAt?: string | null;
  ensName: string | null;
  /** Lifecycle status of this (wallet, market) account, from mv_aave_v3_wallets
   *  (mig 076). "open" carries live reserves; "closed" / "liquidated" carry none —
   *  their card shows the peak (highest-recorded) balances instead. "unread" is
   *  a Base row whose account has not been read from the chain yet: no state
   *  recorded, never mapped to "closed" (0018). */
  status: "open" | "closed" | "liquidated" | "unread";
  reserves: AaveV3ReserveSummary[];
  /** Highest recorded per-reserve supply / debt over the account's life (MAX of the
   *  per-event balances, per asset), reusing the reserve-summary shape:
   *  `supplyBalanceRaw` = peak supply, `debtBalanceRaw` = peak debt. Populated for
   *  closed / liquidated accounts (whose current `reserves` are empty). Chain-state
   *  token amounts only, no USD (the Tier-3 rule). */
  peakReserves: AaveV3ReserveSummary[];
  /** Chain-state USD layer: Aave's own on-chain oracle price (IAaveOracle
   *  getAssetPrice, chain-derived) per reserve, keyed by lowercased token address.
   *  Resolved server-side in the positions route; omits any reserve the oracle
   *  didn't price. Feeds the card's USD footnotes and the valued economics tower. */
  priceByAddress: Record<string, number>;
}

/** How complete a Base lender's listing lane is right now — what the server's
 *  base_lending_coverage row says. Absent on Ethereum responses. */
export interface BaseLendingCoverage {
  deployBlock: number;
  /** The history backfill on the Base box has reached the block Sieve took
   *  over at: [deploy, backfillTo] from the backfill, then Sieve, no gap. */
  historyComplete: boolean;
  backfillNextBlock: number | null;
  backfillTo: number | null;
  sourceCheckpoint: number | null;
  /** Accounts in the set, and how many the chain sweep has read so far. */
  accountsTotal: number;
  accountsRead: number;
  refreshedAt: string;
}

export interface AaveV3PositionsResponse {
  rows: AaveV3PositionRow[];
  total: number;
  limit: number;
  offset: number;
  coverage?: BaseLendingCoverage | null;
}

// Mirrors the rails routes' sortBy allowlist — Ethereum's mv_aave_v3_wallet_markets
// (mig 182's debt_usd/collateral_usd) and the Base pair's baseLending.ts
// (aave-v3-base, seamless: total_debt_usd/total_collateral_usd) speak the same
// three values, Liquity V2's URL grammar. "lastActivity" | "supplyUsd" |
// "debtUsd" | "healthFactor" was the prior shape — grepped with no caller, so
// this is a rename, not a widening.
export type AaveV3PositionSort = "recent" | "debt" | "coll";

/** Debt-side facet: `"borrowing"` (has debt) | `"supply-only"` (no debt) | absent
 *  (no filter). Deliberately a tri-state, NOT a `hasDebt`/`noDebt` boolean pair:
 *  rails-server parses those params as "present and equal to 'true'", so a literal
 *  `hasDebt=false` is "not true" → NO filter → it silently returns the FULL set (a
 *  plausible large number, not an error). The tri-state makes that false value —
 *  and the contradictory both-true pair — unrepresentable: the client only ever
 *  emits `hasDebt=true`, `noDebt=true`, or neither. */
export type AaveV3DebtFacet = "borrowing" | "supply-only";

export interface FetchAaveV3PositionsParams {
  wallet?: string;
  ownerEns?: string;
  /** Borrowing / Supply-only facet — see {@link AaveV3DebtFacet}. */
  debt?: AaveV3DebtFacet;
  hasLiquidations?: boolean;
  /** Lifecycle Status facet — any subset of open/closed/liquidated (mv_aave_v3_wallets).
   *  Omit = all statuses. */
  status?: ("open" | "closed" | "liquidated")[];
  excludeClosed?: boolean;
  /** Restrict to one market (core | prime | etherfi). Omit = all markets. */
  market?: string;
  supplyAssets?: string[];
  borrowAssets?: string[];
  sortBy?: AaveV3PositionSort;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  baseUrl?: string;
  /** Cancels the request — the listing SSR passes its timeout here. */
  signal?: AbortSignal;
  /** The signed reader headers the SSR hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
  /** The listing route to hit — this deployment's Aave V3 proxy by default; a
   *  Base lender names its own (`/api/seamless/positions`). */
  route?: string;
}

export async function fetchAaveV3Positions(p: FetchAaveV3PositionsParams): Promise<AaveV3PositionsResponse> {
  const qs = new URLSearchParams();
  if (p.wallet) qs.set("wallet", p.wallet);
  if (p.ownerEns) qs.set("ownerEns", p.ownerEns);
  if (p.debt === "borrowing") qs.set("hasDebt", "true");
  if (p.debt === "supply-only") qs.set("noDebt", "true");
  if (p.hasLiquidations === true) qs.set("hasLiquidations", "true");
  if (p.hasLiquidations === false) qs.set("hasLiquidations", "false");
  if (p.status && p.status.length > 0) qs.set("status", p.status.join(","));
  if (p.excludeClosed) qs.set("excludeClosed", "true");
  if (p.market) qs.set("market", p.market);
  if (p.supplyAssets && p.supplyAssets.length > 0) qs.set("supplyAssets", p.supplyAssets.join(","));
  if (p.borrowAssets && p.borrowAssets.length > 0) qs.set("borrowAssets", p.borrowAssets.join(","));
  if (p.sortBy) qs.set("sortBy", p.sortBy);
  if (p.sortOrder) qs.set("sortOrder", p.sortOrder);
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));

  const url = `${p.baseUrl ?? ""}${p.route ?? "/api/aave-v3/positions"}?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store", signal: p.signal, headers: p.headers });
  if (!res.ok) throw new Error(`fetchAaveV3Positions failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as AaveV3PositionsResponse;
}
