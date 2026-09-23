// Dolomite protocol view — every listed market, read at one head block.
// ----------------------------------------------------------------------------
// The source of /dolomite/markets, the `views` cell of Dolomite's row. It
// answers "what is the protocol"; the position explorer beside it answers
// "what happened to this account" — neither substitutes for the other.
//
// The roster is the core's own: getNumMarkets() → getMarketTokenAddress(id),
// never a hardcoded 21 — admin can list markets (LogAddMarket), and a view
// that hardcoded the list would assert a roster rather than read one. Markets
// key on their NUMERIC id, Dolomite's own key (the symbol space here collides
// on purpose: rUSD / srUSD / wsrUSD / cUSD / stcUSD).
//
// What the view claims is the RISK LADDER — Dolomite's own minimum
// collateralisation per market. The global margin ratio (getMarginRatio,
// 17.65% → 117.65% minimum) is the base; per-market margin premiums are
// MULTIPLICATIVE, dYdX Solo semantics reproduced wei-exact on 103/107 accounts:
// adjusted supply = raw ÷ (1 + premium), adjusted borrow = raw × (1 + premium).
// So a market's effective minimum as collateral is 1.17647 × (1 + premium) —
// WLFI's 27.5% premium lands at ≈150.0%, NOT the 145.15% an additive read
// would claim. Margin ratio and premium genuinely share this one axis
// (both are minimum-collateralisation requirements), which is what makes a
// ladder legitimate here.
//
// ⚠️ THE CARVE-OUT, which gates how universal the ladder is: the core names a
// DefaultAccountRiskOverrideSetter, and getAccountRiskOverrideByAccount gives
// some accounts (observed: wstETH/WETH and weETH/WETH pairs — an e-mode-like
// category) an override of marginRatio 11.11% (minimum 111.11%) and spread 4%,
// with the premiums SKIPPED (their getAdjustedAccountValues equals raw). The
// view must state this: rendering the premium ladder as universal would
// misstate every LST/ETH-pair account. The per-account truth is the position
// page's chain lane, which reads the override per account.
//
// Scales (all verified in scripts/verify-dolomite-chain.mjs):
//   • par × index ÷ 1e18 = wei (token units): getMarketTotalPar's uint128 pair
//     × getMarketCurrentIndex's (borrow, supply) legs. The index accrues ON
//     READ (lastUpdate is a timestamp — interest is per-second), so these
//     totals are current at the head block, never a stored stale figure.
//   • getMarketPrice is USD scaled 1e(36 − decimals) — live feeds, not pins
//     (anti-pin proven: USDC ≠ 1e30 exactly). One nuance stated below: wsrUSD
//     reuses srUSD's price to the wei — a 1:1 alias through the shared oracle,
//     live but not independent.
//   • getMarketInterestRate is the BORROW rate per SECOND at 1e18; suppliers
//     earn borrow × utilisation × earningsRate (getEarningsRate, 0.8).
//
// SERVER-ONLY — imported from /api/chain/* route handlers and the SSR page only.

import { getAddress, parseAbi } from "viem";
import { alchemyClient } from "./rpc";
import { resolveErc20Meta, scaleRaw } from "./erc20-meta";
import { DOLOMITE_ADDRESSES, DOLOMITE_BASE, SECONDS_PER_YEAR } from "@/lib/dolomite/asset-catalog";

const ZERO = BigInt(0);
const BASE = BigInt("1000000000000000000"); // 1e18 (viem targets ES2017 — no BigInt literals)

const MARGIN_ABI = parseAbi([
  "function getNumMarkets() view returns (uint256)",
  "function getMarketTokenAddress(uint256 marketId) view returns (address)",
  "function getMarketPrice(uint256 marketId) view returns ((uint256 value))",
  "function getMarketMarginPremium(uint256 marketId) view returns ((uint256 value))",
  "function getMarketSpreadPremium(uint256 marketId) view returns ((uint256 value))",
  "function getMarketTotalPar(uint256 marketId) view returns ((uint128 borrow, uint128 supply))",
  "function getMarketCurrentIndex(uint256 marketId) view returns ((uint112 borrow, uint112 supply, uint32 lastUpdate))",
  "function getMarketInterestRate(uint256 marketId) view returns ((uint256 value))",
  "function getMarketIsClosing(uint256 marketId) view returns (bool)",
  "function getMarginRatio() view returns ((uint256 value))",
  "function getLiquidationSpread() view returns ((uint256 value))",
  "function getEarningsRate() view returns ((uint256 value))",
  "function getDefaultAccountRiskOverrideSetter() view returns (address)",
]);

export interface DolomiteMarketRow {
  /** Dolomite's own market key — THE identity. Symbols collide by design on
   *  this roster; nothing keys on them. */
  marketId: number;
  /** The market's token contract (the core's own getMarketTokenAddress). */
  token: string;
  /** The token's own symbol()/decimals() answers (display only). */
  symbol: string;
  decimals: number;

  /** Supplied / borrowed in the market's own token — totalPar × the market's
   *  CURRENT index (which accrues on read; per-second interest). */
  totalSupplyUnderlying: number;
  totalBorrowUnderlying: number;
  /** Raw par totals (uint128 strings) — the slot figures behind the above. */
  totalSupplyParRaw: string;
  totalBorrowParRaw: string;
  /** The CURRENT interest index legs (1e18 raw strings; accrue on read).
   *  par × index ÷ 1e18 = wei, each side on its own leg. */
  supplyIndexRaw: string;
  borrowIndexRaw: string;
  /** Index.lastUpdate — a unix TIMESTAMP: interest is per-second. */
  indexLastUpdate: number;

  /** The core's own oracle price for one whole token, USD (getMarketPrice,
   *  scale 1e(36 − decimals)). Null when the oracle answers 0. */
  priceUsd: number | null;
  totalSupplyUsd: number | null;
  totalBorrowUsd: number | null;

  /** Borrowed ÷ supplied in the market's own token. Null without supply. */
  utilisation: number | null;

  /** Per-market margin premium (getMarketMarginPremium, 1e18 → fraction).
   *  MULTIPLICATIVE with the global ratio — see minCollateralization. */
  marginPremium: number;
  /** The market's effective minimum collateralisation AS COLLATERAL:
   *  (1 + global marginRatio) × (1 + marginPremium). The ladder's rung. A
   *  borrowed market's premium multiplies in the same way on the debt side. */
  minCollateralization: number;
  /** Per-market liquidation-spread premium (multiplies the global 5% spread). */
  spreadPremium: number;
  /** The liquidation spread for seizing this market's collateral (against a
   *  zero-premium debt market): global spread × (1 + spreadPremium). */
  liquidationSpread: number;

  /** Borrow APR (%): getMarketInterestRate (per second, 1e18) × seconds/year.
   *  The protocol's own rate at head — the index accrues on read. */
  borrowAprPct: number | null;
  /** Supply APR (%): borrow × utilisation × earningsRate — Dolomite's own
   *  formula, every input the core's. */
  supplyAprPct: number | null;

  /** getMarketIsClosing — governance has switched NEW BORROWING off; existing
   *  debt still runs. 11 of 21 markets at last verification. */
  isClosing: boolean;
  /** Markets whose getMarketPrice equals another market's answer to the wei —
   *  a shared-oracle alias (wsrUSD reuses srUSD's price). Names the sibling. */
  priceAliasOf: { marketId: number; symbol: string } | null;
}

export interface DolomiteMarketsResponse {
  blockNumber: number;
  markets: DolomiteMarketRow[];
  /** Global risk constants, the core's own. */
  risk: {
    /** getMarginRatio (fraction, e.g. 0.17647). Minimum = 1 + this. */
    marginRatio: number;
    /** getLiquidationSpread (fraction, e.g. 0.05). */
    liquidationSpread: number;
    /** getEarningsRate — the share of borrow interest suppliers earn (0.8). */
    earningsRate: number;
    /** The DefaultAccountRiskOverrideSetter the core names — the carve-out:
     *  overridden accounts get this marginRatio/spread and SKIP the premiums. */
    overrideSetter: string | null;
  };
  summary: {
    total: number;
    totalSuppliedUsd: number | null;
    totalBorrowedUsd: number | null;
    utilisation: number | null;
    /** Markets with new borrowing switched off (isClosing). */
    closing: number;
    /** Markets carrying a nonzero margin premium. */
    withPremium: number;
  };
  chainStale: boolean;
}

function empty(): DolomiteMarketsResponse {
  return {
    blockNumber: 0,
    markets: [],
    risk: { marginRatio: 0, liquidationSpread: 0, earningsRate: 0, overrideSetter: null },
    summary: {
      total: 0,
      totalSuppliedUsd: null,
      totalBorrowedUsd: null,
      utilisation: null,
      closing: 0,
      withPremium: 0,
    },
    chainStale: true,
  };
}

type Res = { status: string; result?: unknown };
const ok = <T>(r: Res | undefined): T | null => (r?.status === "success" && r.result != null ? (r.result as T) : null);

const MARGIN = DOLOMITE_ADDRESSES.MARGIN as `0x${string}`;

export async function loadDolomiteMarkets(): Promise<DolomiteMarketsResponse> {
  try {
    const client = alchemyClient();

    // The core states its own roster and its own risk constants.
    const [blockNumber, head] = await Promise.all([
      client.getBlockNumber().then(Number),
      client.multicall({
        allowFailure: true,
        contracts: [
          { address: MARGIN, abi: MARGIN_ABI, functionName: "getNumMarkets" },
          { address: MARGIN, abi: MARGIN_ABI, functionName: "getMarginRatio" },
          { address: MARGIN, abi: MARGIN_ABI, functionName: "getLiquidationSpread" },
          { address: MARGIN, abi: MARGIN_ABI, functionName: "getEarningsRate" },
          { address: MARGIN, abi: MARGIN_ABI, functionName: "getDefaultAccountRiskOverrideSetter" },
        ] as const,
      }) as Promise<Res[]>,
    ]);

    const numMarkets = ok<bigint>(head[0]);
    const marginRatioRaw = ok<{ value: bigint }>(head[1]);
    if (numMarkets == null || marginRatioRaw == null) return empty();
    const n = Number(numMarkets);
    const marginRatio = Number(marginRatioRaw.value) / DOLOMITE_BASE;
    const liquidationSpread = Number(ok<{ value: bigint }>(head[2])?.value ?? ZERO) / DOLOMITE_BASE;
    const earningsRate = Number(ok<{ value: bigint }>(head[3])?.value ?? ZERO) / DOLOMITE_BASE;
    const setter = ok<string>(head[4]);

    const PER_MARKET = 8;
    const results = (await client.multicall({
      allowFailure: true,
      contracts: Array.from({ length: n }, (_, i) => BigInt(i)).flatMap(
        (id) =>
          [
            { address: MARGIN, abi: MARGIN_ABI, functionName: "getMarketTokenAddress", args: [id] },
            { address: MARGIN, abi: MARGIN_ABI, functionName: "getMarketPrice", args: [id] },
            { address: MARGIN, abi: MARGIN_ABI, functionName: "getMarketMarginPremium", args: [id] },
            { address: MARGIN, abi: MARGIN_ABI, functionName: "getMarketSpreadPremium", args: [id] },
            { address: MARGIN, abi: MARGIN_ABI, functionName: "getMarketTotalPar", args: [id] },
            { address: MARGIN, abi: MARGIN_ABI, functionName: "getMarketCurrentIndex", args: [id] },
            { address: MARGIN, abi: MARGIN_ABI, functionName: "getMarketInterestRate", args: [id] },
            { address: MARGIN, abi: MARGIN_ABI, functionName: "getMarketIsClosing", args: [id] },
          ] as const,
      ),
    })) as Res[];

    // Name the tokens in one cached multicall (the shared resolver).
    const tokens: (string | null)[] = Array.from({ length: n }, (_, i) => {
      const t = ok<string>(results[i * PER_MARKET]);
      return t ? getAddress(t).toLowerCase() : null;
    });
    const meta = await resolveErc20Meta(tokens.filter((t): t is string => t != null));

    const markets: DolomiteMarketRow[] = [];
    for (let i = 0; i < n; i++) {
      const base = i * PER_MARKET;
      const token = tokens[i];
      if (!token) continue;
      const m = meta.get(token);
      const symbol = m?.symbol ?? `market #${i}`;
      const decimals = m?.decimals ?? 18;

      const priceRaw = ok<{ value: bigint }>(results[base + 1]);
      const premiumRaw = ok<{ value: bigint }>(results[base + 2]);
      const spreadPremRaw = ok<{ value: bigint }>(results[base + 3]);
      const totalPar = ok<{ borrow: bigint; supply: bigint }>(results[base + 4]);
      const index = ok<{ borrow: bigint; supply: bigint; lastUpdate: number }>(results[base + 5]);
      const rateRaw = ok<{ value: bigint }>(results[base + 6]);
      const isClosing = ok<boolean>(results[base + 7]) ?? false;

      // wei = par × index ÷ 1e18, each side on its own index leg. The index
      // accrues on read, so this is the current total, not a stored one.
      const supplyWeiRaw = totalPar != null && index != null ? (totalPar.supply * index.supply) / BASE : ZERO;
      const borrowWeiRaw = totalPar != null && index != null ? (totalPar.borrow * index.borrow) / BASE : ZERO;
      const totalSupplyUnderlying = scaleRaw(supplyWeiRaw, decimals);
      const totalBorrowUnderlying = scaleRaw(borrowWeiRaw, decimals);

      // getMarketPrice scale is the protocol's own: 1e(36 − decimals).
      const priceUsd =
        priceRaw != null && priceRaw.value > ZERO ? Number(priceRaw.value) / 10 ** (36 - decimals) : null;

      const marginPremium = premiumRaw != null ? Number(premiumRaw.value) / DOLOMITE_BASE : 0;
      const spreadPremium = spreadPremRaw != null ? Number(spreadPremRaw.value) / DOLOMITE_BASE : 0;

      const borrowAprPct = rateRaw != null ? (Number(rateRaw.value) / DOLOMITE_BASE) * SECONDS_PER_YEAR * 100 : null;
      const utilisation = totalSupplyUnderlying > 0 ? totalBorrowUnderlying / totalSupplyUnderlying : null;
      const supplyAprPct =
        borrowAprPct != null && utilisation != null ? borrowAprPct * utilisation * earningsRate : null;

      markets.push({
        marketId: i,
        token,
        symbol,
        decimals,
        totalSupplyUnderlying,
        totalBorrowUnderlying,
        totalSupplyParRaw: (totalPar?.supply ?? ZERO).toString(),
        totalBorrowParRaw: (totalPar?.borrow ?? ZERO).toString(),
        supplyIndexRaw: (index?.supply ?? BASE).toString(),
        borrowIndexRaw: (index?.borrow ?? BASE).toString(),
        indexLastUpdate: index?.lastUpdate ?? 0,
        priceUsd,
        totalSupplyUsd: priceUsd != null ? totalSupplyUnderlying * priceUsd : null,
        totalBorrowUsd: priceUsd != null ? totalBorrowUnderlying * priceUsd : null,
        utilisation,
        marginPremium,
        // MULTIPLICATIVE (Solo semantics): 1.17647 × (1 + premium). WLFI's
        // 27.5% premium → ≈150.0%, not the additive 145.15%.
        minCollateralization: (1 + marginRatio) * (1 + marginPremium),
        spreadPremium,
        liquidationSpread: liquidationSpread * (1 + spreadPremium),
        borrowAprPct,
        supplyAprPct,
        isClosing,
        priceAliasOf: null, // filled below from raw price equality
      });
    }

    // Shared-oracle aliases: two DIFFERENT tokens whose getMarketPrice answers
    // are equal TO THE WEI (same decimals) — live but not independent (wsrUSD
    // reuses srUSD's feed). Read from the answers themselves, not assumed.
    const rawPriceOf = new Map<number, string>();
    for (let i = 0; i < n; i++) {
      const p = ok<{ value: bigint }>(results[i * PER_MARKET + 1]);
      if (p != null && p.value > ZERO) rawPriceOf.set(i, p.value.toString());
    }
    for (const row of markets) {
      const mine = rawPriceOf.get(row.marketId);
      if (mine == null) continue;
      const sibling = markets.find(
        (s) =>
          s.marketId !== row.marketId &&
          s.marketId < row.marketId && // the earlier listing is the original
          s.token !== row.token &&
          s.decimals === row.decimals &&
          rawPriceOf.get(s.marketId) === mine,
      );
      if (sibling) row.priceAliasOf = { marketId: sibling.marketId, symbol: sibling.symbol };
    }

    // Canonical order = market ID, Dolomite's own key. Sorting the ladder by
    // premium would be Rails ranking by risk; the ID order is the protocol's.
    const priced = markets.filter((m) => m.totalSupplyUsd != null);
    const supplied = priced.length > 0 ? priced.reduce((t, m) => t + (m.totalSupplyUsd ?? 0), 0) : null;
    const borrowed = priced.length > 0 ? priced.reduce((t, m) => t + (m.totalBorrowUsd ?? 0), 0) : null;

    return {
      blockNumber,
      markets,
      risk: {
        marginRatio,
        liquidationSpread,
        earningsRate,
        overrideSetter: setter ? getAddress(setter).toLowerCase() : null,
      },
      summary: {
        total: markets.length,
        totalSuppliedUsd: supplied,
        totalBorrowedUsd: borrowed,
        utilisation: supplied != null && borrowed != null && supplied > 0 ? borrowed / supplied : null,
        closing: markets.filter((m) => m.isClosing).length,
        withPremium: markets.filter((m) => m.marginPremium > 0).length,
      },
      chainStale: false,
    };
  } catch (error) {
    console.error("Dolomite markets chain read failed:", error);
    return empty();
  }
}

// ── Market-state map for the position surfaces ────────────────────────────────
// The positions listing needs, per market id: identity, the CURRENT index legs
// (par → wei), the oracle price and the live rates. Same read as the view —
// one loader, one shape — projected into a map keyed by Dolomite's own numeric
// id. Empty when RPC is down: callers degrade to par-only (never a partial
// USD total).

export interface DolomiteMarketState {
  marketId: number;
  token: string;
  symbol: string;
  decimals: number;
  /** Current index legs (1e18 raw strings) — par × index ÷ 1e18 = wei. */
  supplyIndexRaw: string;
  borrowIndexRaw: string;
  priceUsd: number | null;
  borrowAprPct: number | null;
  supplyAprPct: number | null;
  marginPremium: number;
  minCollateralization: number;
  isClosing: boolean;
}

export type DolomiteMarketStateMap = Map<number, DolomiteMarketState>;

export async function resolveDolomiteMarketState(): Promise<{
  state: DolomiteMarketStateMap;
  blockNumber: number;
}> {
  const data = await loadDolomiteMarkets();
  const state: DolomiteMarketStateMap = new Map();
  if (data.chainStale) return { state, blockNumber: 0 };
  for (const m of data.markets) {
    state.set(m.marketId, {
      marketId: m.marketId,
      token: m.token,
      symbol: m.symbol,
      decimals: m.decimals,
      supplyIndexRaw: m.supplyIndexRaw,
      borrowIndexRaw: m.borrowIndexRaw,
      priceUsd: m.priceUsd,
      borrowAprPct: m.borrowAprPct,
      supplyAprPct: m.supplyAprPct,
      marginPremium: m.marginPremium,
      minCollateralization: m.minCollateralization,
      isClosing: m.isClosing,
    });
  }
  return { state, blockNumber: data.blockNumber };
}
