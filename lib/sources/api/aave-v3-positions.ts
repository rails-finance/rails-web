// Aave V3 positions listing — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// The rails-server route (/api/aave-v3/positions) does the structural work —
// filter, sort, paginate over mv_aave_v3_positions — and returns the page slice
// as RAW per-wallet rows (token addresses + balances + per-wallet scalars). This
// builder owns the presentation: resolve ERC20 symbol/decimals/LT (one cached
// multicall over the V3 reserve universe), pick the dominant supply/debt asset,
// and shape each AaveV3PositionRow.
//
// A listing row carries no health factor, threshold or USD totals (0018) — the
// rails route emits only its coverage flag (`chainHfStale`, true when the
// periodic chain snapshot hasn't covered the account); risk is read live on the
// position page. Per-asset amounts are the index's scaled-balance reduction
// (0008/0011): Σ scaled deltas from the account's own Pool events + aToken
// BalanceTransfers, × the reserve's current index — the current rebased
// balance, interest included, `balanceOf` at the indexed head.

import { resolveV3Tokens, scaleV3 } from "@/lib/sources/chain/aave-v3-tokens";
import { resolveAaveOraclePrices, aaveOraclePriceOf } from "@/lib/sources/chain/aave-oracle-prices";
import { sanityCheckAaveBalances } from "@/lib/sources/chain/aave-family-balances";
import { AAVE_V3_ORACLE, POOL_BY_MARKET, AAVE_V3_POOL } from "@/lib/aave-v3/asset-catalog";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

/** Which Aave-shaped deployment a page slice belongs to. The default is
 *  Ethereum's three-market Aave V3; a Base lender (Seamless, Aave V3 Base)
 *  names its own chain, oracle and Pool so symbols, oracle USD and the
 *  dev-only balance check all read the right chain. */
export interface AaveV3ListingDeployment {
  chainId: ChainId;
  oracle: string;
  /** One Pool for every row (a single-market deployment). Ethereum leaves it
   *  unset and resolves the Pool per row's market. */
  pool?: string;
}
const ETHEREUM_DEPLOYMENT: AaveV3ListingDeployment = { chainId: MAINNET_CHAIN_ID, oracle: AAVE_V3_ORACLE };
import type { AaveV3PositionRow, AaveV3ReserveSummary } from "@/lib/api/fetch-aave-v3-positions";

/** One open (wallet, reserve) balance pair as returned by the rails route. */
export interface RawV3Reserve {
  reserve: string;
  supplyBalanceRaw: string;
  debtBalanceRaw: string;
}

/** One (wallet, market, reserve) peak pair (highest-recorded supply/debt) from the
 *  route, present for closed / liquidated accounts. */
export interface RawV3PeakReserve {
  reserve: string;
  peakSupplyRaw: string;
  peakDebtRaw: string;
}

/** One (wallet, market) page-slice row from the rails route (pre-presentation).
 *  No health factor, threshold or USD totals ride the row (0018) — only the
 *  coverage flag `chainHfStale`. */
export interface RawV3WalletRow {
  wallet: string;
  /** Market this row belongs to — core | prime | etherfi. */
  market: string;
  /** Lifecycle status from mv_aave_v3_wallets (open/closed/liquidated). */
  status?: string;
  reserves: RawV3Reserve[];
  /** Per-reserve peaks (present for closed / liquidated accounts). */
  peakReserves?: RawV3PeakReserve[];
  lastActivityAt: number;
  lastBlockNumber: number;
  lastTxHash: string | null;
  txCount: number;
  liquidationCount: number;
  lastLiquidationAt: number | null;
  chainHfStale?: boolean;
  /** Base lenders only: the block every chain figure on the row was read at,
   *  and when. Ethereum rows carry neither (their overlay is a periodic sweep
   *  whose block the route does not surface). */
  chainBlock?: number | null;
  chainReadAt?: string | null;
}

function bigintOf(raw: string | null): bigint {
  if (raw == null || raw === "") return BigInt(0);
  try {
    return BigInt(raw);
  } catch {
    return BigInt(0);
  }
}

/** One held reserve on one side of a row, as the dominant pick compares it. */
interface Candidate {
  sym: string;
  addr: string;
  /** Balance in whole tokens (raw ÷ 10^decimals). */
  scaled: number;
  /** Oracle USD per whole token, null when the oracle did not answer. */
  price: number | null;
}

/** The side's dominant reserve: the largest by oracle USD when every candidate
 *  is priced, else the largest by whole-token amount. Raw units are never
 *  compared across reserves (18 decimals would outrank 6 or 8 whatever the
 *  amounts are worth). */
function dominant(cs: Candidate[]): Candidate | null {
  if (cs.length === 0) return null;
  const allPriced = cs.every((c) => c.price != null);
  const value = (c: Candidate) => (allPriced ? c.scaled * (c.price as number) : c.scaled);
  return cs.reduce((best, c) => (value(c) > value(best) ? c : best));
}

/** Assemble the listing rows from the rails route's raw page slice. Filtering,
 *  sorting and pagination already happened server-side, so this only resolves
 *  metadata and shapes the rows — order is preserved. */
export async function buildAaveV3PositionRows(
  raw: RawV3WalletRow[],
  deployment: AaveV3ListingDeployment = ETHEREUM_DEPLOYMENT,
): Promise<AaveV3PositionRow[]> {
  // One cached multicall over every referenced reserve address — including the
  // peak reserves (a closed account's only reserves live there), so their symbols
  // resolve too.
  const allAddrs = new Set<string>();
  for (const w of raw) {
    for (const r of w.reserves) allAddrs.add(r.reserve.toLowerCase());
    for (const r of w.peakReserves ?? []) allAddrs.add(r.reserve.toLowerCase());
  }
  const metas = await resolveV3Tokens([...allAddrs], deployment.chainId);
  const ZERO = BigInt(0);

  // On-chain oracle USD for every reserve on the page, from Aave's own
  // IAaveOracle (chain-derived). Batched into one multicall; degrades to an
  // empty map (token-only) if RPC is down, so callers never assert a partial.
  const oraclePrices = await resolveAaveOraclePrices(
    [{ oracle: deployment.oracle, assets: [...allAddrs] }],
    deployment.chainId,
  );

  // Dev-only reconciliation: the reduced balances the page renders should equal a
  // live aToken / variableDebtToken `balanceOf` (the retired overlay's demoted
  // role). Core / Prime / EtherFi are SEPARATE Pool contracts, so key each row off
  // its own market pool. Fire-and-forget, never on the production request path.
  const poolOf = (market: string) => deployment.pool ?? POOL_BY_MARKET[market] ?? AAVE_V3_POOL;
  sanityCheckAaveBalances(
    "aave-v3-positions",
    raw.flatMap((w) =>
      w.reserves.map((r) => ({
        pool: poolOf(w.market ?? "core"),
        wallet: w.wallet,
        reserve: r.reserve,
        supplyRaw: bigintOf(r.supplyBalanceRaw),
        debtRaw: bigintOf(r.debtBalanceRaw),
      })),
    ),
  );

  const priceOf = (addr: string) => aaveOraclePriceOf(oraclePrices, deployment.oracle, addr);

  return raw.map((w) => {
    const reserves: (AaveV3ReserveSummary & { _scaled: number })[] = [];
    const supplies: Candidate[] = [];
    const debts: Candidate[] = [];

    for (const r of w.reserves) {
      const addr = r.reserve.toLowerCase();
      // The route's reduced balance — current truth at the indexed head. A reduced
      // balance of 0 drops the reserve (exited / transferred-out — no phantom).
      const supplyRaw = bigintOf(r.supplyBalanceRaw);
      const debtRaw = bigintOf(r.debtBalanceRaw);
      const hasSupply = supplyRaw > ZERO;
      const hasDebt = debtRaw > ZERO;
      if (!hasSupply && !hasDebt) continue;
      const meta = metas.get(addr);
      const symbol = meta?.symbol ?? `${addr.slice(0, 6)}…${addr.slice(-4)}`;
      const decimals = meta?.decimals ?? 18;
      const price = priceOf(addr) ?? null;
      reserves.push({
        symbol,
        address: addr,
        decimals,
        supplyBalanceRaw: supplyRaw.toString(),
        debtBalanceRaw: debtRaw.toString(),
        // isCollateral is left off: the listing does not read the account's
        // configuration; the position page does (getUserConfiguration).
        lt: meta?.lt ?? null,
        usdPrice: null,
        // A Base lender's balance is a balanceOf at the row's chainBlock, not
        // the index's reduction — the row says which.
        balanceSource: w.chainBlock != null ? "chain" : "reduced",
        ...(meta == null || meta.unresolved ? { decimalsUnread: true as const } : {}),
        _scaled: scaleV3(supplyRaw + debtRaw, decimals),
      });
      if (hasSupply) supplies.push({ sym: symbol, addr, scaled: scaleV3(supplyRaw, decimals), price });
      if (hasDebt) debts.push({ sym: symbol, addr, scaled: scaleV3(debtRaw, decimals), price });
    }
    const domSupply = dominant(supplies);
    const domDebt = dominant(debts);

    // Same measure for the row's reserve order: USD when every reserve is priced.
    const allPriced = reserves.every((r) => priceOf(r.address) != null);
    const rank = (r: { address: string; _scaled: number }) =>
      allPriced ? r._scaled * (priceOf(r.address) as number) : r._scaled;
    reserves.sort((x, y) => rank(y) - rank(x));
    const cleanReserves: AaveV3ReserveSummary[] = reserves.map(({ _scaled, ...r }) => {
      void _scaled;
      return r;
    });

    // Peak (highest-recorded) reserve lines, reusing the reserve-summary shape:
    // peak supply in supplyBalanceRaw, peak debt in debtBalanceRaw. Only closed /
    // liquidated accounts carry them; the card renders them on its closed branch as
    // token amounts only (no USD — the Tier-3 rule), so no oracle price is attached.
    const peakReserves: (AaveV3ReserveSummary & { _scaled: number })[] = [];
    for (const r of w.peakReserves ?? []) {
      const addr = r.reserve.toLowerCase();
      const supplyRaw = bigintOf(r.peakSupplyRaw);
      const debtRaw = bigintOf(r.peakDebtRaw);
      if (supplyRaw <= ZERO && debtRaw <= ZERO) continue;
      const meta = metas.get(addr);
      const decimals = meta?.decimals ?? 18;
      peakReserves.push({
        symbol: meta?.symbol ?? `${addr.slice(0, 6)}…${addr.slice(-4)}`,
        address: addr,
        decimals,
        supplyBalanceRaw: r.peakSupplyRaw,
        debtBalanceRaw: r.peakDebtRaw,
        // Peak values are event-replay maxima, not reduced current balances.
        balanceSource: "replayed",
        lt: meta?.lt ?? null,
        usdPrice: null,
        ...(meta == null || meta.unresolved ? { decimalsUnread: true as const } : {}),
        _scaled: scaleV3(supplyRaw > debtRaw ? supplyRaw : debtRaw, decimals),
      });
    }
    peakReserves.sort((x, y) => y._scaled - x._scaled);
    const cleanPeakReserves: AaveV3ReserveSummary[] = peakReserves.map(({ _scaled, ...r }) => {
      void _scaled;
      return r;
    });

    // Prefer the route's authoritative lifecycle status (mv_aave_v3_wallets).
    // A Base row arrives with no status when its account has not been read
    // from the chain yet: with no reserves behind it that is "unread" — no
    // state recorded, never "closed" (0018). Only a row that carries reserves
    // with no status (an older route shape) still derives from openness.
    const hasOpen = cleanReserves.length > 0;
    const status: AaveV3PositionRow["status"] =
      w.status === "open" || w.status === "closed" || w.status === "liquidated"
        ? w.status
        : w.status == null && (w.reserves?.length ?? 0) === 0
          ? "unread"
          : hasOpen
            ? "open"
            : w.liquidationCount > 0
              ? "liquidated"
              : "closed";

    return {
      wallet: w.wallet,
      market: w.market ?? "core",
      status,
      // The route's coverage flag, passed straight through; stale when the
      // periodic snapshot hasn't covered this wallet.
      chainHfStale: w.chainHfStale ?? true,
      supplyAssetCount: supplies.length,
      debtAssetCount: debts.length,
      dominantSupplySymbol: domSupply?.sym ?? null,
      dominantSupplyAddress: domSupply?.addr ?? null,
      dominantDebtSymbol: domDebt?.sym ?? null,
      dominantDebtAddress: domDebt?.addr ?? null,
      lastActivityAt: w.lastActivityAt,
      lastBlockNumber: w.lastBlockNumber,
      lastTxHash: w.lastTxHash,
      liquidationCount: w.liquidationCount,
      lastLiquidationAt: w.lastLiquidationAt,
      txCount: w.txCount,
      ensName: null,
      chainBlock: w.chainBlock ?? null,
      chainReadAt: w.chainReadAt ?? null,
      reserves: cleanReserves,
      peakReserves: cleanPeakReserves,
      // On-chain oracle USD keyed by lowercased reserve address (for the card /
      // economics, which look values up by address). Omits any reserve the oracle
      // didn't price, so the strict per-total guard degrades honestly. Peaks are
      // included so a closed life's lifetime-flow lines stay priceable (the card's
      // peak rows stay token-only — PeakStack never looks prices up).
      priceByAddress: Object.fromEntries(
        [...cleanReserves, ...cleanPeakReserves]
          .map((r) => [r.address.toLowerCase(), aaveOraclePriceOf(oraclePrices, deployment.oracle, r.address)] as const)
          .filter((e): e is readonly [string, number] => e[1] != null),
      ),
    };
  });
}
