// Compound V3 (Comet) positions listing — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// The rails-server route (/api/compound/positions) does the structural work —
// filter, sort, paginate over mv_compound_v3_positions, join the per-asset
// collateral lines — and returns the page slice as RAW per-(market, account)
// rows (signed base + collateral token addresses + per-position scalars). This
// builder resolves COLLATERAL ERC20 symbol/decimals (one cached multicall over
// the page's collateral universe — the BASE symbol/decimals are fixed per market,
// so no lookup), scales the signed base and each collateral line, and shapes a
// CompoundPositionSummary. Chain-direct amounts only — no HF, no USD (layers).

import { resolveErc20Meta, scaleRaw, type Erc20Meta } from "@/lib/sources/chain/erc20-meta";
import { resolveCometPrices, cometPriceOf, type CometPriceRequest } from "@/lib/sources/chain/compound-prices";
import { marketOf, COMPOUND_DEPLOYMENT, type CometDeployment, type CometMarket } from "@/lib/compound/asset-catalog";

/** "unread" is a row whose account has not been read from the chain yet — no
 *  state recorded, never mapped to "closed" (0018). The Comet lane holds an
 *  unread account back rather than listing it, so the value is a guard here. */
export type CompoundPositionStatus = "open" | "closed" | "liquidated" | "unread";
// Mirrors the rails route's sortBy allowlist (mig 185's debt_usd/collateral_usd
// on mv_compound_v3_positions, per (market, account) row). "lastActivity" |
// "events" was the prior shape — grepped with no caller, so this is a rename,
// not a widening. Ethereum only: the Base lane's rails route does not read
// sortBy yet (lib/compound-base/list-filter-dimensions.ts keeps its own
// one-entry sort constant).
export type CompoundPositionSort = "recent" | "debt" | "coll";

/** One collateral asset the position holds, exact + scaled. */
export interface CompoundAssetAmount {
  symbol: string;
  address: string;
  decimals: number;
  amount: number;
  amountRaw: string;
}

/** The signed base position for a market. */
export interface CompoundBaseAmount {
  symbol: string;
  address: string;
  decimals: number;
  /** Signed: > 0 lending, < 0 borrowing. */
  amount: number;
  amountRaw: string;
}

/** The live present-value base (Slice-2 chain overlay), incl. accrued interest. */
export interface CompoundCurrentBase {
  /** Signed present value: > 0 lent, < 0 borrowed. */
  amount: number;
  amountRaw: string;
  side: "lend" | "borrow" | "flat";
  /** Block the chain read was taken at. */
  block: number | null;
}

export interface CompoundPositionSummary {
  market: string;
  marketLabel: string;
  /** The Comet proxy address (provenance contract). */
  comet: string;
  account: string;
  status: CompoundPositionStatus;
  /** Signed base PRINCIPAL flow (amounts-only, from the event fold). */
  base: CompoundBaseAmount;
  /** Which side the principal sits on, derived from its sign. */
  side: "lend" | "borrow" | "flat";
  /** Slice-2 chain overlay: the CURRENT present-value base WITH interest. null
   *  when the chain refresher hasn't covered this position yet (or it's stale) —
   *  then only the amounts-only principal is known. Authoritative for the current
   *  state (the principal's sign is unreliable near zero — interest phantom). */
  current: CompoundCurrentBase | null;
  /** Open collateral lines, ranked by raw balance. */
  collateral: CompoundAssetAmount[];
  /** Highest recorded amounts over the position's life (closed/liquidated cards).
   *  `borrowedBase` / `lentBase` are the peak signed-base magnitudes (from
   *  MIN/MAX base_after); `collateral` the per-asset MAX. Token amounts only, no
   *  USD — the Tier-4 "highest recorded principal" rule. */
  peak: {
    collateral: CompoundAssetAmount[];
    lentBase: number;
    lentBaseRaw: string;
    borrowedBase: number;
    borrowedBaseRaw: string;
  };
  everLiquidated: boolean;
  liquidationCount: number;
  lastActivityAt: number | null;
  lastBlockNumber: number;
  lastTxHash: string | null;
  txCount: number;
  /** On-chain oracle USD price per whole token, keyed by lowercased token address
   *  (base + each collateral), read live from this market's Comet feeds
   *  (`getPrice`). Chain-derived — survives the chain-state gate. Absent entries
   *  mean the token wasn't priceable (RPC down); callers degrade to token-only. */
  priceByAddress: Record<string, number>;
}

/** One collateral line as returned by the rails route. */
export interface RawCompoundCollateral {
  asset: string;
  amountRaw: string;
}

/** One (market, account) page-slice row from the rails route (pre-presentation). */
export interface RawCompoundPositionRow {
  market: string;
  account: string;
  baseFinalRaw: string;
  status: CompoundPositionStatus;
  everLiquidated: boolean;
  collateral: RawCompoundCollateral[];
  collateralAssets: number;
  eventCount: number;
  firstBlock: number;
  lastActivityAt: number | null;
  lastBlockNumber: number;
  lastTxHash: string | null;
  liquidationCount: number;
  lastLiquidationAt: number | null;
  /** Distinct transactions of the account's own, absorb legs excluded — the
   *  figure the activity meta titles "Transactions (excludes liquidations)".
   *  Optional while the API deploys; absent falls back to eventCount. */
  txCount?: number;
  /** Slice-2 chain overlay (compound_v3_position_chain): signed present-value
   *  base in raw base units, the block it was read at, and whether stale. */
  currentBaseRaw?: string | null;
  chainBlock?: number | null;
  chainStale?: boolean;
  /** Peak (highest-recorded) base magnitudes + per-asset collateral (closed rows). */
  peakBorrowRaw?: string;
  peakLendRaw?: string;
  peakCollateral?: RawCompoundCollateral[];
}

const ZERO = BigInt(0);
/** Below this many display units a balance is treated as dust = zero. */
const DUST = 1e-9;

function bigintOf(raw: string | null): bigint {
  if (raw == null || raw === "") return ZERO;
  try {
    return BigInt(raw.split(".")[0]);
  } catch {
    return ZERO;
  }
}

/** Assemble the listing rows from the rails route's raw page slice. Filtering,
 *  sorting and pagination already happened server-side, so this only resolves
 *  collateral metadata and scales — order is preserved. */
/** Which Comet deployment the rows belong to — decides the roster the market
 *  slug resolves against (Base's `usdc` is NOT Ethereum's), the chain symbols
 *  and decimals are read on, and the Comets prices come from. Defaults to
 *  Ethereum, so every existing caller resolves what it always did. */
export async function buildCompoundPositionRows(
  raw: RawCompoundPositionRow[],
  deployment: CometDeployment = COMPOUND_DEPLOYMENT,
): Promise<CompoundPositionSummary[]> {
  const market = (key: string): CometMarket => deployment.markets.find((m) => m.key === key) ?? marketOf(key);
  // One cached multicall over every referenced collateral address — including the
  // peak collateral (a closed position's only collateral lives there), so their
  // symbols resolve too.
  const allAddrs = new Set<string>();
  for (const p of raw) {
    for (const c of p.collateral) allAddrs.add(c.asset.toLowerCase());
    for (const c of p.peakCollateral ?? []) allAddrs.add(c.asset.toLowerCase());
  }
  const metas = await resolveErc20Meta([...allAddrs], deployment.chainId);
  const fallback = (addr: string): Erc20Meta => ({
    address: addr,
    symbol: `${addr.slice(0, 6)}…${addr.slice(-4)}`,
    decimals: 18,
  });

  // Read this page's on-chain oracle USD prices (base + collateral per market),
  // batched. Chain-derived, so the card / economics can value in USD and stay in
  // the chain-state view. Degrades to an empty map (token-only) if RPC is down.
  const priceReqs: CometPriceRequest[] = raw.map((p) => {
    const m = market(p.market);
    return { comet: m.comet, baseToken: m.baseToken, collateral: p.collateral.map((c) => c.asset) };
  });
  const cometPrices = await resolveCometPrices(priceReqs, deployment);

  return raw.map((p) => {
    const m = market(p.market);
    const baseRaw = bigintOf(p.baseFinalRaw);
    const baseAmount = scaleRaw(baseRaw, m.baseDecimals);
    const side: "lend" | "borrow" | "flat" = baseAmount > DUST ? "lend" : baseAmount < -DUST ? "borrow" : "flat";

    // Slice-2 chain overlay: the current present-value base (incl. interest).
    let current: CompoundCurrentBase | null = null;
    if (p.currentBaseRaw != null && p.chainStale !== true) {
      const curRaw = bigintOf(p.currentBaseRaw);
      const curAmount = scaleRaw(curRaw, m.baseDecimals);
      current = {
        amount: curAmount,
        amountRaw: p.currentBaseRaw,
        side: curAmount > DUST ? "lend" : curAmount < -DUST ? "borrow" : "flat",
        block: p.chainBlock ?? null,
      };
    }

    const collateral: (CompoundAssetAmount & { _rank: bigint })[] = [];
    for (const c of p.collateral) {
      const addr = c.asset.toLowerCase();
      const meta = metas.get(addr) ?? fallback(addr);
      const rawAmt = bigintOf(c.amountRaw);
      if (rawAmt <= ZERO) continue;
      const amount = scaleRaw(rawAmt, meta.decimals);
      if (amount <= DUST) continue;
      collateral.push({
        symbol: meta.symbol,
        address: addr,
        decimals: meta.decimals,
        amount,
        amountRaw: c.amountRaw,
        _rank: rawAmt,
      });
    }
    collateral.sort((a, b) => (b._rank > a._rank ? 1 : b._rank < a._rank ? -1 : 0));
    const strip = ({ _rank, ...c }: CompoundAssetAmount & { _rank: bigint }): CompoundAssetAmount => {
      void _rank;
      return c;
    };

    // Peak (highest-recorded) collateral lines — same shape as the open collateral,
    // built from the route's per-asset MAX. Token amounts only (no USD).
    const peakCollateral: (CompoundAssetAmount & { _rank: bigint })[] = [];
    for (const c of p.peakCollateral ?? []) {
      const addr = c.asset.toLowerCase();
      const meta = metas.get(addr) ?? fallback(addr);
      const rawAmt = bigintOf(c.amountRaw);
      if (rawAmt <= ZERO) continue;
      const amount = scaleRaw(rawAmt, meta.decimals);
      if (amount <= DUST) continue;
      peakCollateral.push({
        symbol: meta.symbol,
        address: addr,
        decimals: meta.decimals,
        amount,
        amountRaw: c.amountRaw,
        _rank: rawAmt,
      });
    }
    peakCollateral.sort((a, b) => (b._rank > a._rank ? 1 : b._rank < a._rank ? -1 : 0));
    const peakBorrowRaw = p.peakBorrowRaw ?? "0";
    const peakLendRaw = p.peakLendRaw ?? "0";

    // This market's on-chain oracle prices, keyed by token address for the card /
    // economics (which look values up by address).
    const priceByAddress: Record<string, number> = {};
    const putPrice = (token: string) => {
      const u = cometPriceOf(cometPrices, m.comet, token);
      if (u != null) priceByAddress[token.toLowerCase()] = u;
    };
    putPrice(m.baseToken);
    for (const c of collateral) putPrice(c.address);
    // Peaks too, so a closed life's lifetime-flow lines stay priceable — any
    // asset that ever flowed has a nonzero peak. The card's peak rows stay
    // token-only regardless.
    for (const c of peakCollateral) putPrice(c.address);

    return {
      market: p.market,
      marketLabel: m.label,
      comet: m.comet,
      account: p.account,
      // A row with no status word is an account not yet read — "unread", never
      // "closed" (0018).
      status: p.status === "open" || p.status === "closed" || p.status === "liquidated" ? p.status : "unread",
      base: {
        symbol: m.baseSymbol,
        address: m.baseToken,
        decimals: m.baseDecimals,
        amount: baseAmount,
        amountRaw: p.baseFinalRaw,
      },
      side,
      current,
      collateral: collateral.map(strip),
      peak: {
        collateral: peakCollateral.map(strip),
        lentBase: scaleRaw(bigintOf(peakLendRaw), m.baseDecimals),
        lentBaseRaw: peakLendRaw,
        borrowedBase: scaleRaw(bigintOf(peakBorrowRaw), m.baseDecimals),
        borrowedBaseRaw: peakBorrowRaw,
      },
      everLiquidated: p.everLiquidated,
      liquidationCount: p.liquidationCount,
      lastActivityAt: p.lastActivityAt,
      lastBlockNumber: p.lastBlockNumber,
      lastTxHash: p.lastTxHash,
      // The account's own distinct transactions (absorb legs excluded) — what
      // the meta's title asserts. eventCount is the raw row tally and includes
      // the absorb legs done TO the account, so it only stands in when an older
      // API hasn't served txCount yet.
      txCount: p.txCount ?? p.eventCount,
      priceByAddress,
    };
  });
}
