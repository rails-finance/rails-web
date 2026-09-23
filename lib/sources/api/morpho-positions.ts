// Morpho positions listing — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// The rails-server route (/api/morpho/positions) does the structural work —
// filter, sort, paginate over mv_morpho_positions — and returns the page slice
// as RAW per-(market, borrower) rows (the replayed collateral / borrowed-principal
// / borrow-shares + each market's decoded `market_params`). This builder owns the
// presentation: decode the params, resolve ERC20 symbol/decimals (one cached
// multicall over the page's token universe), scale the raw amounts, and shape
// each MorphoPositionSummary.
//
// Sourced from each row's own `market_params` (the live index carries it), so
// no DB-side market registry is needed.
//
// A second custody shares the builder: the Base listing (rails-server's
// /api/morpho-base/positions, mig 173), where a row is not a replay but a
// CHAIN READ of the (market, borrower) slots at a pinned Base block, with the
// market's own totals and oracle read at that same block beside it. Passing
// `listed` switches the builder to that reading: the figures are the slots
// (collateral, debt with interest), there is no principal and no peak, and
// each row carries the block it was read at and what the market's oracle at
// that block made of the collateral. No borrow limit or health factor rides a
// listing row (0018) — risk is read live on the position page.

import { resolveErc20Meta, scaleRaw, type Erc20Meta } from "@/lib/sources/chain/erc20-meta";
import { parseMarketParams, marketLabel } from "@/lib/morpho/asset-catalog";
import { morphoHasCollateralRaw, morphoHasDebt } from "@/lib/morpho/position-legs";
import type { ChainId } from "@/lib/shared/chains";

/** "unread" is a listed row whose account has not been read from the chain
 *  yet — no state recorded, never mapped to "closed" (0018). */
export type MorphoPositionStatus = "open" | "closed" | "liquidated" | "unread";
export type MorphoPositionSort = "lastActivity" | "events" | "created";

export interface MorphoPositionSummary {
  /** `${marketIdHex}-${owner}` — globally unique route key. */
  positionId: string;
  marketId: string;
  marketLabel: string;
  loanSymbol: string;
  collateralSymbol: string | null;
  /** The tokens' own addresses, straight off the decoded market params. The
   *  symbols above are resolved metadata; these are the identity, and the icon
   *  chip needs them — Morpho is permissionless, so the house symbol → address
   *  table cannot name most of what lists here (see MorphoPositionView). Idle
   *  markets have no collateral side, so `collateralToken` is undefined there
   *  rather than the zero address. */
  loanToken: string;
  collateralToken?: string;
  isIdle: boolean;
  owner: string;
  status: MorphoPositionStatus;
  /** Collateral held (exact, clamped >=0). */
  collateral: { amount: number; amountRaw: string; symbol: string | null };
  /** Net borrowed PRINCIPAL while open; 0 when closed (excludes accrued interest). */
  borrowed: { amount: number; amountRaw: string; symbol: string };
  /** Highest recorded collateral + borrowed principal over the position's life —
   *  MAX of the per-event balances. For a closed/liquidated position that now reads
   *  0, this is what it held at its height. Token amounts only, no USD (the Tier-4
   *  "highest recorded principal" rule). */
  peak: { collateral: number; collateralRaw: string; borrowed: number; borrowedRaw: string };
  borrowSharesRaw: string;
  /** Current debt WITH accrued interest — borrow shares converted to assets via
   *  the live per-market index (Morpho's toAssetsUp). `accruedAmount` is the
   *  interest above principal. null when the index wasn't supplied (so the
   *  interest layer stays gated rather than guessed). */
  currentDebt: MorphoCurrentDebt | null;
  /** Market liquidation-LTV as a 0..1 fraction. */
  lltv: number;
  /** Whether this position was ever liquidated (a permanent history marker,
   *  orthogonal to the current open/closed status). */
  everLiquidated: boolean;
  /** Σ bad debt written off across the position's liquidations, loan units —
   *  what the seized collateral could not cover, socialised to this market's
   *  lenders. 0 when none (the common case even among liquidated records). */
  badDebt: number;
  /** `lastTs` is the unix-seconds timestamp of the most recent event (null when
   *  the row carries none), for the card's time-ago meta. `txCount` is DISTINCT
   *  transactions of the position's own, excluding liquidation rows — the count
   *  the activity chip's title claims (a bundler tx lands several event rows). */
  activity: { firstBlock: number; lastBlock: number; eventCount: number; txCount: number; lastTs: number | null };
  /** Present only on a LISTED row (the Base listing): the pinned block every
   *  figure on the row was read at, and what the market's own oracle at that
   *  block makes of the collateral. Absent on a replayed (Ethereum) row. */
  listed?: MorphoListedRead;
}

/** Current debt with interest, and the market totals it was converted with. */
export interface MorphoCurrentDebt {
  amount: number;
  accruedAmount: number;
  totalBorrowAssets: string;
  totalBorrowShares: string;
  /** When the totals were read, where the source states it (the Ethereum
   *  listing). Absent on a head read made for the page. */
  index?: MorphoIndexRead;
}

/** The block and time a market's totals were read at. rails-server refreshes
 *  them every 5 minutes for the markets holding open debt; a market outside
 *  that set keeps its last read, and `stale` says so (also set when the read is
 *  older than the server's horizon). */
export interface MorphoIndexRead {
  block: number;
  /** ISO time the read was written, seconds after the block. */
  readAt: string;
  stale: boolean;
}

/** A listed row's chain read — the receipt every figure on it cites. */
export interface MorphoListedRead {
  /** The Base block the slots and the market were read at. */
  block: number;
  /** When the sweep wrote the row (ISO). */
  readAt: string;
  /** Collateral valued in the LOAN token at the market's own oracle, read at
   *  `block`; null when the oracle reverted there or the market is idle. */
  collateralValue: number | null;
  /** The market's borrow totals at `block` — the debt receipt's operands. */
  totalBorrowAssets: string | null;
  totalBorrowShares: string | null;
}

/** One market as the Base listing route reads it at the page's pinned block
 *  (rails-server `markets[]`): the immutable params plus the totals and the
 *  oracle price the position figures were valued with. Bigints as strings. */
export interface RawMorphoListedMarket {
  /** marketId hex, no 0x. */
  market: string;
  loanToken: string;
  collateralToken: string;
  oracle: string;
  irm: string;
  /** WAD (1e18). */
  lltv: string;
  block: number;
  totalSupplyAssets: string;
  totalSupplyShares: string;
  totalBorrowAssets: string;
  totalBorrowShares: string;
  lastUpdate: string;
  fee: string;
  /** IOracle.price() at `block`, 1e36-scaled (collateral × price ÷ 1e36 =
   *  loan-token units); null when the oracle reverted. */
  priceRaw: string | null;
  refreshedAt: string;
}

/** The listed custody's inputs: which chain the tokens live on (symbols and
 *  decimals resolve there) and the page's market reads. */
export interface MorphoListedLane {
  chainId: ChainId;
  markets: RawMorphoListedMarket[];
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

// Morpho SharesMathLib virtual offsets — added at conversion time so an empty
// market can't divide by zero and share inflation is bounded. toAssetsUp rounds
// against the borrower (the protocol's own rounding), so the figure matches what
// the contract would charge to close.
const VIRTUAL_ASSETS = BigInt(1);
const VIRTUAL_SHARES = BigInt(1_000_000);

/** shares → assets, rounded up, matching Morpho's `toAssetsUp`. */
function sharesToAssetsUp(shares: bigint, totalAssets: bigint, totalShares: bigint): bigint {
  const num = shares * (totalAssets + VIRTUAL_ASSETS);
  const den = totalShares + VIRTUAL_SHARES;
  if (den <= BigInt(0)) return BigInt(0);
  return (num + den - BigInt(1)) / den; // ceil
}

/** One (market, borrower) page-slice row from the rails route (pre-presentation).
 *  Amounts are decimal strings (numeric → text); scale by token decimals here. */
export interface RawMorphoPositionRow {
  /** marketId hex, no 0x. */
  market: string;
  borrower: string;
  /** Replayed collateral (clamped ≥0 server-side). */
  coll_raw: string;
  /** Net borrowed PRINCIPAL while open, 0 once closed (server-gated). */
  borr_raw: string;
  bsh_raw: string;
  status: string;
  liquidated: boolean;
  /** Decoded MarketParams tuple text — the same form the dump stores. */
  market_params: string;
  /** Null on a listed row (no event stream stands behind it). */
  event_count: string | null;
  first_block: string;
  last_block: string;
  last_ts: string | null;
  last_tx_hash: string | null;
  /** Live per-market index (current debt = bshare × assets / shares) — passed
   *  through for the detail-page interpreted layer; not used by the listing. */
  total_borrow_assets: string | null;
  total_borrow_shares: string | null;
  /** When the index above was read: its block, the time the row was written,
   *  and whether the market is outside the server's refresh set or the read is
   *  past its horizon. Null without an index; absent on older payloads. */
  state_block?: string | null;
  state_read_at?: string | null;
  state_stale?: boolean | null;
  /** Peak (highest-recorded) collateral / borrowed principal, raw (closed rows). */
  peak_coll_raw?: string | null;
  peak_borr_raw?: string | null;
  /** DISTINCT own transactions excluding liquidation rows (absent on payloads
   *  older than the route change — fall back to event_count). */
  tx_count?: number | null;
  /** Σ badDebtAssets over the position's Liquidate rows, raw loan units —
   *  the write-off socialised to the market's lenders. Null/absent when zero
   *  (or on payloads older than the route change). */
  bad_debt_raw?: string | null;
  /** Listed rows only (the Base route): the liquidation record as a count,
   *  and the chain read's receipt — the block the slots were read at and when. */
  liquidation_count?: number | null;
  last_liquidation_at?: string | null;
  chain_block?: number | null;
  chain_read_at?: string | null;
}

function bigintOf(raw: string | null): bigint {
  if (raw == null || raw === "") return BigInt(0);
  try {
    return BigInt(raw.split(".")[0]); // numeric may serialize with a fractional part
  } catch {
    return BigInt(0);
  }
}

/** The status the route filed — the word the filter selected the row by, so a
 *  card can never contradict the facet that returned it (`chain-truth-charter.md`
 *  §2; Miles, 2026-09-20). A row carrying no status word is an account the chain
 *  has not been read for yet — "unread", never "closed" (0018): the slot reads it
 *  would be derived from are the ones missing.
 *
 *  The last branch is for an older payload shape whose status word is outside the
 *  three, and it replays the SERVER'S rule rather than a second one: collateral is
 *  an exact clamped sum (`mig 045`), so any collateral at all is collateral, and
 *  the share leg's 1e6 is the same constant on both sides. Deciding it on DISPLAY
 *  tokens at 1e-6 was §46 — a factor of 10¹² at 18 decimals, and 532 rows served
 *  open that rendered as closed cards with their collateral hidden. */
function servedStatus(r: RawMorphoPositionRow): MorphoPositionStatus {
  if (r.status === "open" || r.status === "closed" || r.status === "liquidated") return r.status;
  if (r.status == null || r.status === "") return "unread";
  const open = morphoHasCollateralRaw(r.coll_raw) || morphoHasDebt(r.bsh_raw);
  if (open) return "open";
  return r.liquidated ? "liquidated" : "closed";
}

/** Assemble the listing rows from the rails route's raw page slice. Filtering,
 *  sorting and pagination already happened server-side, so this only decodes
 *  params, resolves metadata and shapes the rows — order is preserved. */
export async function buildMorphoPositionRows(
  raw: RawMorphoPositionRow[],
  listed?: MorphoListedLane,
): Promise<MorphoPositionSummary[]> {
  // Decode every row's params once, and collect the token universe for a single
  // cached multicall (the long tail of market tokens — no curated catalog).
  const params = raw.map((r) => parseMarketParams(r.market, r.market_params));
  const tokens = new Set<string>();
  for (const p of params) {
    if (!p) continue;
    if (p.loanToken && p.loanToken !== ZERO_ADDR) tokens.add(p.loanToken);
    if (p.collateralToken && p.collateralToken !== ZERO_ADDR) tokens.add(p.collateralToken);
  }
  const meta = await resolveErc20Meta([...tokens], listed?.chainId);
  const marketState = new Map((listed?.markets ?? []).map((m) => [m.market.replace(/^0x/, "").toLowerCase(), m]));
  const fallback = (addr: string): Erc20Meta => ({
    address: addr,
    symbol: `${addr.slice(0, 6)}…${addr.slice(-4)}`,
    decimals: 18,
  });

  const out: MorphoPositionSummary[] = [];
  raw.forEach((r, i) => {
    const p = params[i];
    // A row whose params don't decode can't be named/scaled — skip (the rails
    // route only returns indexed markets, so this is defensive).
    if (!p) return;
    const loan = meta.get(p.loanToken) ?? fallback(p.loanToken);
    const collateral = p.isIdle ? null : (meta.get(p.collateralToken) ?? fallback(p.collateralToken));
    const loanSym = loan.symbol;
    const collSym = collateral?.symbol ?? null;

    // Collateral clamped ≥0: the server already clamps, and the builder clamps
    // again defensively rather than trust the upstream row.
    const collRawBn = bigintOf(r.coll_raw);
    const coll = Math.max(0, scaleRaw(collRawBn < BigInt(0) ? BigInt(0) : collRawBn, collateral?.decimals ?? 18));
    const hasDebt = morphoHasDebt(r.bsh_raw);

    if (listed) {
      out.push(listedRow(r, p, loan, collateral, coll, hasDebt, marketState.get(r.market.toLowerCase())));
      return;
    }
    // Borrowed principal is meaningful only while the debt is open; 0 once repaid.
    const borrowedPrincipal = hasDebt ? Math.max(0, scaleRaw(bigintOf(r.borr_raw), loan.decimals)) : 0;

    // Current debt with interest: convert the open position's borrow shares to
    // assets via the live market index. Gated to open debt + a present index so
    // the interest segment is only ever shown when it's real.
    let currentDebt: MorphoPositionSummary["currentDebt"] = null;
    if (hasDebt && r.total_borrow_assets != null && r.total_borrow_shares != null) {
      const tba = bigintOf(r.total_borrow_assets);
      const tbs = bigintOf(r.total_borrow_shares);
      const debtRaw = sharesToAssetsUp(bigintOf(r.bsh_raw), tba, tbs);
      const amount = Math.max(0, scaleRaw(debtRaw, loan.decimals));
      currentDebt = {
        amount,
        accruedAmount: Math.max(0, amount - borrowedPrincipal),
        totalBorrowAssets: r.total_borrow_assets,
        totalBorrowShares: r.total_borrow_shares,
        index:
          r.state_block != null && r.state_read_at != null
            ? { block: Number(r.state_block), readAt: r.state_read_at, stale: r.state_stale === true }
            : undefined,
      };
    }

    out.push({
      positionId: `${r.market}-${r.borrower}`,
      marketId: p.marketId,
      marketLabel: marketLabel(loanSym, collSym ?? "—", p.isIdle),
      loanSymbol: loanSym,
      collateralSymbol: collSym,
      loanToken: p.loanToken,
      collateralToken: p.isIdle ? undefined : p.collateralToken,
      isIdle: p.isIdle,
      owner: r.borrower,
      status: servedStatus(r),
      collateral: { amount: coll, amountRaw: r.coll_raw, symbol: collSym },
      borrowed: { amount: borrowedPrincipal, amountRaw: r.borr_raw, symbol: loanSym },
      peak: {
        collateral: Math.max(0, scaleRaw(bigintOf(r.peak_coll_raw ?? "0"), collateral?.decimals ?? 18)),
        collateralRaw: r.peak_coll_raw ?? "0",
        borrowed: Math.max(0, scaleRaw(bigintOf(r.peak_borr_raw ?? "0"), loan.decimals)),
        borrowedRaw: r.peak_borr_raw ?? "0",
      },
      borrowSharesRaw: r.bsh_raw,
      currentDebt,
      lltv: p.lltvFraction,
      everLiquidated: r.liquidated,
      badDebt: Math.max(0, scaleRaw(bigintOf(r.bad_debt_raw ?? "0"), loan.decimals)),
      activity: {
        firstBlock: Number(r.first_block),
        lastBlock: Number(r.last_block),
        eventCount: Number(r.event_count),
        txCount: r.tx_count != null ? Number(r.tx_count) : Number(r.event_count),
        lastTs: r.last_ts != null && r.last_ts !== "" ? Number(r.last_ts) : null,
      },
    });
  });
  return out;
}

/** Morpho's ORACLE_PRICE_SCALE: collateral × price ÷ 1e36 = loan-token units. */
const ORACLE_PRICE_SCALE = BigInt("1000000000000000000000000000000000000");

/** A LISTED row — the Base listing's chain read of one (market, borrower)
 *  slot pair at a pinned block. No replay stands behind it, so:
 *    • `borrowed` is the DEBT the slots hold (shares → assets, rounded up as
 *      the contract rounds against the borrower — the route already converted
 *      at the row's block; the conversion is repeated here only when the route
 *      sent no figure), interest included. It is not a principal.
 *    • `currentDebt` is null — there is no principal for an interest split to
 *      stand above; the card renders the debt as one figure instead.
 *    • `peak` is zero and the card says the peaks are not recorded here.
 *    • `status` is the route's: the chain's own answer (anything held → open),
 *      the liquidation record for the closed/liquidated split. It is what the
 *      status facet filtered on, so a row never renders a state it was not
 *      selected by.
 *  The collateral value is the market's oracle at that block — collateral ×
 *  oracle price ÷ 1e36, in loan-token units. No borrow limit or health factor
 *  is computed here (0018). */
function listedRow(
  r: RawMorphoPositionRow,
  p: NonNullable<ReturnType<typeof parseMarketParams>>,
  loan: Erc20Meta,
  collateral: Erc20Meta | null,
  coll: number,
  hasDebt: boolean,
  m: RawMorphoListedMarket | undefined,
): MorphoPositionSummary {
  const loanSym = loan.symbol;
  const collSym = collateral?.symbol ?? null;

  let debtRaw = hasDebt ? bigintOf(r.borr_raw) : BigInt(0);
  if (hasDebt && debtRaw === BigInt(0) && r.total_borrow_assets != null && r.total_borrow_shares != null) {
    debtRaw = sharesToAssetsUp(bigintOf(r.bsh_raw), bigintOf(r.total_borrow_assets), bigintOf(r.total_borrow_shares));
  }
  const debt = Math.max(0, scaleRaw(debtRaw, loan.decimals));

  // The oracle's answer at the row's block, when it gave one and the market
  // has a collateral side to price.
  let collateralValue: number | null = null;
  const price = m?.priceRaw != null && m.priceRaw !== "" ? bigintOf(m.priceRaw) : null;
  if (price != null && !p.isIdle) {
    const collRawBn = bigintOf(r.coll_raw);
    const valueRaw = ((collRawBn < BigInt(0) ? BigInt(0) : collRawBn) * price) / ORACLE_PRICE_SCALE;
    collateralValue = Math.max(0, scaleRaw(valueRaw, loan.decimals));
  }

  const status = servedStatus(r);
  const txCount = r.tx_count != null ? Number(r.tx_count) : 0;

  return {
    positionId: `${r.market}-${r.borrower}`,
    marketId: p.marketId,
    marketLabel: marketLabel(loanSym, collSym ?? "—", p.isIdle),
    loanSymbol: loanSym,
    collateralSymbol: collSym,
    loanToken: p.loanToken,
    collateralToken: p.isIdle ? undefined : p.collateralToken,
    isIdle: p.isIdle,
    owner: r.borrower,
    status,
    collateral: { amount: coll, amountRaw: r.coll_raw, symbol: collSym },
    borrowed: { amount: debt, amountRaw: debtRaw.toString(), symbol: loanSym },
    peak: { collateral: 0, collateralRaw: "0", borrowed: 0, borrowedRaw: "0" },
    borrowSharesRaw: r.bsh_raw,
    currentDebt: null,
    lltv: p.lltvFraction,
    everLiquidated: r.liquidated || (r.liquidation_count ?? 0) > 0,
    badDebt: 0,
    activity: {
      firstBlock: Number(r.first_block),
      lastBlock: Number(r.last_block),
      eventCount: txCount,
      txCount,
      lastTs: r.last_ts != null && r.last_ts !== "" ? Number(r.last_ts) : null,
    },
    listed: {
      block: Number(r.chain_block ?? m?.block ?? 0),
      readAt: r.chain_read_at ?? m?.refreshedAt ?? "",
      collateralValue,
      totalBorrowAssets: r.total_borrow_assets ?? m?.totalBorrowAssets ?? null,
      totalBorrowShares: r.total_borrow_shares ?? m?.totalBorrowShares ?? null,
    },
  };
}
