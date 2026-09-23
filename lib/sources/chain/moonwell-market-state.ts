// Moonwell per-market chain state — server-only.
// ----------------------------------------------------------------------------
// One batched multicall over the four fixed mToken markets:
//   • exchangeRateStored — mToken → underlying rate (scale 1e(18 + underlying
//     decimals − 8)); mTokens × rate = balanceOfUnderlying, the CURRENT supply
//     value including accrued interest. A chain slot read, so the product with
//     the exact replayed mToken balance is chain-derived.
//   • oracle getUnderlyingPrice(mToken) — the Chainlink wrapper the Comptroller
//     itself prices with; USD scale 1e(36 − underlying decimals). Chain-derived
//     USD, survives the on-chain-only gate.
//   • borrow/supplyRatePerTimestamp — per-SECOND rates (Moonwell's Base/
//     Moonbeam accrual convention), annualized here (× 31,536,000).
//
// Degrades to an empty map when RPC is unset/down — callers must treat an
// absent market as "unpriced/unrated" and fall back to amounts-only (never
// assert a partial total).
//
// SERVER-ONLY — imported from /api/* route handlers only (alchemy via rpc.ts).

import { getAddress, parseAbi } from "viem";
import { alchemyClient, chainClient } from "./rpc";
import { resolveErc20Meta, scaleRaw } from "./erc20-meta";
import {
  MOONWELL_MARKETS,
  MOONWELL_ADDRESSES,
  MOONWELL_DEPLOYMENT,
  MTOKEN_DECIMALS,
  type MoonwellDeployment,
} from "@/lib/moonwell/asset-catalog";

const MTOKEN_ABI = parseAbi([
  "function exchangeRateStored() view returns (uint256)",
  "function borrowRatePerTimestamp() view returns (uint256)",
  "function supplyRatePerTimestamp() view returns (uint256)",
]);
const ORACLE_ABI = parseAbi(["function getUnderlyingPrice(address mToken) view returns (uint256)"]);

const SECONDS_PER_YEAR = 31_536_000;

/** A per-TIMESTAMP rate (1e18 mantissa, Moonwell's per-second accrual) as an
 *  annualized simple fraction — one definition for every surface that states
 *  a Moonwell rate, on either deployment. */
export function annualizePerTimestamp(raw: bigint | string): number {
  return (Number(BigInt(raw)) / 1e18) * SECONDS_PER_YEAR;
}

export interface MoonwellMarketState {
  /** Market key ('weth' | 'usdc' | 'usdt' | 'cbbtc'). */
  market: string;
  /** mTokens (8 dp) → underlying (whole units): underlying = mTokens × this. */
  exchangeRate: number;
  /** The raw exchangeRateStored uint (scale 1e(18 + underlying dec − 8)). */
  exchangeRateRaw: string;
  /** Oracle USD per whole underlying token (chain-derived). */
  priceUsd: number | null;
  /** Annualized simple rates (fraction, e.g. 0.0135 = 1.35% APR). */
  borrowApr: number | null;
  supplyApr: number | null;
}

/** Keyed by market key. Empty when RPC is unavailable. */
export type MoonwellMarketStateMap = Map<string, MoonwellMarketState>;

export async function resolveMoonwellMarketState(): Promise<MoonwellMarketStateMap> {
  const out: MoonwellMarketStateMap = new Map();
  let client: ReturnType<typeof alchemyClient>;
  try {
    client = alchemyClient();
  } catch {
    return out; // ALCHEMY_URL unset — amounts-only.
  }

  const calls = MOONWELL_MARKETS.flatMap(
    (m) =>
      [
        { address: m.mtoken as `0x${string}`, abi: MTOKEN_ABI, functionName: "exchangeRateStored" },
        { address: m.mtoken as `0x${string}`, abi: MTOKEN_ABI, functionName: "borrowRatePerTimestamp" },
        { address: m.mtoken as `0x${string}`, abi: MTOKEN_ABI, functionName: "supplyRatePerTimestamp" },
        {
          address: MOONWELL_ADDRESSES.ORACLE as `0x${string}`,
          abi: ORACLE_ABI,
          functionName: "getUnderlyingPrice",
          args: [m.mtoken as `0x${string}`],
        },
      ] as const,
  );

  let results: { status: string; result?: unknown }[] = [];
  try {
    results = (await client.multicall({ allowFailure: true, contracts: calls })) as {
      status: string;
      result?: unknown;
    }[];
  } catch {
    return out;
  }

  MOONWELL_MARKETS.forEach((m, i) => {
    const [rate, borrowRate, supplyRate, price] = results.slice(i * 4, i * 4 + 4);
    if (rate?.status !== "success" || rate.result == null) return; // no rate → skip market entirely
    const rateRaw = rate.result as bigint;
    // exchangeRateStored scale: 1e(18 + underlyingDecimals − mTokenDecimals).
    const exchangeRate = Number(rateRaw) / 10 ** (18 + m.decimals - MTOKEN_DECIMALS);
    const priceUsd =
      price?.status === "success" && price.result != null
        ? Number(price.result as bigint) / 10 ** (36 - m.decimals)
        : null;
    const apr = (r: { status: string; result?: unknown } | undefined): number | null =>
      r?.status === "success" && r.result != null ? annualizePerTimestamp(r.result as bigint) : null;
    out.set(m.key, {
      market: m.key,
      exchangeRate,
      exchangeRateRaw: rateRaw.toString(),
      priceUsd: priceUsd != null && priceUsd > 0 ? priceUsd : null,
      borrowApr: apr(borrowRate),
      supplyApr: apr(supplyRate),
    });
  });

  return out;
}

// ═════════════════════════════════════════════════════════════════════════════
// Moonwell protocol view — every listed market, read at one head block.
// -----------------------------------------------------------------------------
// The source of /moonwell/markets and /moonwell-base/markets — the `views`
// cell of both Moonwell rows, from one reader over two deployments. Same shape
// as /compound-v2/markets, whose reader this ports. It answers
// "what is the protocol", where the position explorer answers "what happened
// to this wallet"; the two sit side by side and neither substitutes for the
// other. Read-only chain state: no index in the path, no history lane.
//
// The roster is the Comptroller's own getAllMarkets() and the oracle its own
// oracle() — neither is hardcoded, and the catalog above is deliberately NOT
// consulted for the market list. If governance lists another market, this
// reader carries it before any file here changes. That is also what lets one
// reader serve both deployments: Base's twenty-one markets arrive the same way
// Ethereum's four do, so the only per-deployment fact is which Comptroller to
// ask (see MoonwellDeployment).
//
// What survives the Compound V2 port unchanged, and what does not:
//   • Scales transfer whole (same fork): supplied underlying = totalSupply
//     (8dp mTokens) × exchangeRateStored / 1e18, then / 1e^underlyingDecimals;
//     oracle price is scaled 1e(36 − underlyingDecimals).
//   • Accrual does NOT transfer. Moonwell kept its Base/Moonbeam per-SECOND
//     convention: borrowRatePerTimestamp() answers and borrowRatePerBlock()
//     REVERTS (verified 2026-07-16, scripts/verify-moonwell-chain.mjs asserts
//     the same). Rates are annualized on the rate model's OWN
//     timestampsPerYear() — 31,536,000 on all four models — with the file's
//     SECONDS_PER_YEAR as the fallback when a model won't answer, because
//     per-timestamp is wall-clock seconds by definition. No blocksPerYear
//     notion appears anywhere in this lane.
//   • The oracle lane simplifies. Moonwell's oracle is one Chainlink wrapper
//     for every market (provenance grade: chain-derived) — there is no
//     getConfig() and no frozen-constant market, so the priceHasFeed split the
//     Compound V2 reader carries has nothing to describe here and is dropped.
//   • The Comptroller carries per-market supply/borrow CAPS (Compound V2
//     proper has none): governance ceilings in underlying units, 0 meaning
//     uncapped. A cap sits on the SUPPLY axis, not the utilisation axis — the
//     view states cap usage as text and never draws it on the utilisation bar.
//
// Every mToken names its own rate model, and a roster does not agree on a
// kink — 90% on Ethereum's three larger markets and 60% on cbBTC, and a wider
// spread again across Base's twenty-one. Read per market, never assumed.
//
// SERVER-ONLY — imported from /api/chain/* route handlers and the SSR page only.

const ROSTER_COMPTROLLER_ABI = parseAbi([
  "function getAllMarkets() view returns (address[])",
  "function oracle() view returns (address)",
  "function markets(address mToken) view returns (bool isListed, uint256 collateralFactorMantissa)",
  "function supplyCaps(address mToken) view returns (uint256)",
  "function borrowCaps(address mToken) view returns (uint256)",
  "function closeFactorMantissa() view returns (uint256)",
  "function liquidationIncentiveMantissa() view returns (uint256)",
]);

const ROSTER_MTOKEN_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function underlying() view returns (address)",
  "function totalSupply() view returns (uint256)",
  "function totalBorrows() view returns (uint256)",
  "function totalReserves() view returns (uint256)",
  "function getCash() view returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
  "function borrowRatePerTimestamp() view returns (uint256)",
  "function supplyRatePerTimestamp() view returns (uint256)",
  "function reserveFactorMantissa() view returns (uint256)",
  "function interestRateModel() view returns (address)",
]);

/** The model's own annualization constant and the utilisation its curve turns
 *  at. Per-model reads: the roster runs four JumpRateModel deployments and
 *  they do not share a kink. */
const ROSTER_IRM_ABI = parseAbi([
  "function kink() view returns (uint256)",
  "function timestampsPerYear() view returns (uint256)",
]);

export interface MoonwellMarketRow {
  /** The mToken address — the key. */
  mToken: string;
  /** The mToken's own symbol(). NOT unique: Base lists both the bridged and
   *  the native USDC market and both answer "mUSDC", so the address above is
   *  the key and this is a label. */
  mTokenSymbol: string;
  /** The underlying token address; every Moonwell market is an ERC-20 market
   *  (native ETH goes through the WETH Router, not a cETH-style market). */
  underlying: string | null;
  underlyingSymbol: string;
  underlyingDecimals: number;

  /** Supplied, borrowed and idle, in the market's OWN underlying token. */
  totalSupplyUnderlying: number;
  totalBorrowsUnderlying: number;
  cashUnderlying: number;
  totalReservesUnderlying: number;

  /** USD per whole underlying token from the Comptroller's own oracle — a
   *  Chainlink wrapper, so the grade is chain-derived. Null when it answers 0. */
  priceUsd: number | null;
  totalSupplyUsd: number | null;
  totalBorrowsUsd: number | null;

  /** Borrowed ÷ supplied, in the market's own token. Null without supply. */
  utilisation: number | null;

  /** The Comptroller's collateral factor as a fraction (0.8 = 80%), null when
   *  it is ZERO — which means the market is DISABLED as collateral, not a 0%
   *  limit (none of the four is today; the semantics port from Compound V2). */
  collateralFactor: number | null;
  collateralDisabled: boolean;
  isListed: boolean;

  /** Governance ceilings in the market's own underlying token; null when the
   *  Comptroller stores 0, which means UNCAPPED in the fork's convention. */
  supplyCap: number | null;
  borrowCap: number | null;
  /** Supplied ÷ supply cap and borrowed ÷ borrow cap — how much of the room
   *  governance opened has been taken. The SUPPLY axis, never the bar's. */
  supplyCapUsed: number | null;
  borrowCapUsed: number | null;
  /** True when the cap is exactly ONE base unit of the underlying (1 wei for
   *  an 18-decimal token, 1e-6 for USDC). Because 0 means uncapped, the
   *  fork's governance closes a market to new supply or borrowing by setting
   *  the smallest positive amount instead — after the 2026-08-27 MAMO
   *  incident Moonwell set every Base borrow cap and six supply caps so. A
   *  ceiling of one base unit is a closed door, not headroom: the surfaces
   *  name it as such and quote no share used (which runs to 1e23%). */
  supplyCapOneUnit: boolean;
  borrowCapOneUnit: boolean;

  /** Annual percent (5.2 = 5.2%) from the protocol's own per-SECOND rates on
   *  the model's own timestampsPerYear. (The overlay lane's
   *  MoonwellMarketState above reports fractions; this row matches the
   *  protocol view's rendering, which prints percents.) */
  supplyApr: number | null;
  borrowApr: number | null;
  reserveFactor: number | null;

  /** This market's interest rate model and the two things read from it. */
  interestRateModel: string | null;
  /** The seconds/year the model annualizes with — 31,536,000 on every model
   *  measured on both chains, but read rather than assumed. */
  timestampsPerYear: number | null;
  /** The utilisation the rate curve turns at, as a fraction — per-market,
   *  never assumed; the roster does not share one. */
  kink: number | null;
}

export interface MoonwellMarketsResponse {
  blockNumber: number;
  /** The oracle the Comptroller itself reads — read from it, not hardcoded. */
  oracle: string | null;
  markets: MoonwellMarketRow[];
  summary: {
    total: number;
    totalSuppliedUsd: number | null;
    totalBorrowedUsd: number | null;
    /** Borrowed ÷ supplied across every priced market. */
    utilisation: number | null;
    /** The largest share of any market's supply cap in use — the one number
     *  that states how far the caps sit from binding. It can exceed 1: a cap
     *  set BELOW what a market already holds is how governance closes a market
     *  to new deposits, not a ceiling that was breached. Two Base markets sit
     *  there today (USDbC and wrsETH, both deprecated), which is why the
     *  count below exists — on a roster containing one, "the fullest market
     *  uses N% of its cap" stops being a sentence about headroom.
     *  Ethereum's four markets are all far below theirs, so it reads 0 there
     *  and the surfaces keep their original wording. */
    supplyCapMaxUsed: number | null;
    /** How many markets are closed to new supply by their own cap: the cap
     *  is one base unit, or the market already holds at or above it.
     *  Counted, not inferred from the max, because the max says nothing
     *  about how many. */
    closedToSupply: number;
    /** The same count on the borrow side: a one-base-unit borrow cap, or
     *  borrowing already at or above the cap. */
    closedToBorrow: number;
    /** Protocol-wide liquidation constants, straight off the Comptroller. */
    closeFactor: number | null;
    /** As the contract states it: 1.10 = seize 110% of the repaid value. */
    liquidationIncentive: number | null;
  };
  /** True when the chain read failed and we returned an empty roster. */
  chainStale: boolean;
}

function emptyMarkets(): MoonwellMarketsResponse {
  return {
    blockNumber: 0,
    oracle: null,
    markets: [],
    summary: {
      total: 0,
      totalSuppliedUsd: null,
      totalBorrowedUsd: null,
      utilisation: null,
      supplyCapMaxUsed: null,
      closedToSupply: 0,
      closedToBorrow: 0,
      closeFactor: null,
      liquidationIncentive: null,
    },
    chainStale: true,
  };
}

const ZERO = BigInt(0);
const ONE = BigInt(1);
const isZeroAddr = (a: string | undefined | null) => !a || BigInt(a) === ZERO;

type Res = { status: string; result?: unknown };
const ok = <T>(r: Res | undefined): T | null => (r?.status === "success" && r.result != null ? (r.result as T) : null);

export async function loadMoonwellMarkets(
  deployment: MoonwellDeployment = MOONWELL_DEPLOYMENT,
): Promise<MoonwellMarketsResponse> {
  try {
    const client = chainClient(deployment.chainId);
    const comptroller = deployment.comptroller as `0x${string}`;

    // The Comptroller states its own roster, its own oracle and its own
    // liquidation constants — none of the four is hardcoded here.
    const [blockNumber, mTokens, oracle, closeFactorRaw, liqIncentiveRaw] = await Promise.all([
      client.getBlockNumber().then(Number),
      client.readContract({ address: comptroller, abi: ROSTER_COMPTROLLER_ABI, functionName: "getAllMarkets" }),
      client.readContract({ address: comptroller, abi: ROSTER_COMPTROLLER_ABI, functionName: "oracle" }),
      client.readContract({ address: comptroller, abi: ROSTER_COMPTROLLER_ABI, functionName: "closeFactorMantissa" }),
      client.readContract({
        address: comptroller,
        abi: ROSTER_COMPTROLLER_ABI,
        functionName: "liquidationIncentiveMantissa",
      }),
    ]);

    const PER_MARKET = 15;
    const results = (await client.multicall({
      allowFailure: true,
      contracts: mTokens.flatMap(
        (c) =>
          [
            { address: c, abi: ROSTER_MTOKEN_ABI, functionName: "symbol" },
            { address: c, abi: ROSTER_MTOKEN_ABI, functionName: "underlying" },
            { address: c, abi: ROSTER_MTOKEN_ABI, functionName: "totalSupply" },
            { address: c, abi: ROSTER_MTOKEN_ABI, functionName: "totalBorrows" },
            { address: c, abi: ROSTER_MTOKEN_ABI, functionName: "exchangeRateStored" },
            { address: c, abi: ROSTER_MTOKEN_ABI, functionName: "getCash" },
            { address: c, abi: ROSTER_MTOKEN_ABI, functionName: "totalReserves" },
            { address: c, abi: ROSTER_MTOKEN_ABI, functionName: "borrowRatePerTimestamp" },
            { address: c, abi: ROSTER_MTOKEN_ABI, functionName: "supplyRatePerTimestamp" },
            { address: c, abi: ROSTER_MTOKEN_ABI, functionName: "reserveFactorMantissa" },
            { address: c, abi: ROSTER_MTOKEN_ABI, functionName: "interestRateModel" },
            { address: comptroller, abi: ROSTER_COMPTROLLER_ABI, functionName: "markets", args: [c] },
            { address: comptroller, abi: ROSTER_COMPTROLLER_ABI, functionName: "supplyCaps", args: [c] },
            { address: comptroller, abi: ROSTER_COMPTROLLER_ABI, functionName: "borrowCaps", args: [c] },
            { address: oracle, abi: ORACLE_ABI, functionName: "getUnderlyingPrice", args: [c] },
          ] as const,
      ),
    })) as Res[];

    // Each market's own rate model: its per-second annualization constant and
    // its kink. Per-model reads — the four models do not share a kink.
    const irmOf = mTokens.map((_, i) => ok<string>(results[i * PER_MARKET + 10]));
    const irmRes = (await client.multicall({
      allowFailure: true,
      contracts: irmOf.flatMap((irm) => {
        const addr = (irm && !isZeroAddr(irm) ? irm : comptroller) as `0x${string}`;
        return [
          { address: addr, abi: ROSTER_IRM_ABI, functionName: "kink" },
          { address: addr, abi: ROSTER_IRM_ABI, functionName: "timestampsPerYear" },
        ] as const;
      }),
    })) as Res[];

    // Name the underlyings from the tokens themselves (cached multicall). All
    // four answer a string symbol() — Moonwell has no cETH-style native market
    // and no bytes32-symbol legacy tokens, so no hand-resolution lane exists.
    const wanted: string[] = [];
    mTokens.forEach((c, i) => {
      const und = ok<string>(results[i * PER_MARKET + 1]);
      if (und && !isZeroAddr(und)) wanted.push(und);
    });
    const meta = await resolveErc20Meta(wanted, deployment.chainId);

    const markets: MoonwellMarketRow[] = mTokens.map((c, i) => {
      const base = i * PER_MARKET;
      const mToken = getAddress(c).toLowerCase();
      const und = ok<string>(results[base + 1]);
      const underlying = und && !isZeroAddr(und) ? getAddress(und).toLowerCase() : null;
      const m = underlying ? meta.get(underlying) : undefined;
      const underlyingSymbol = m?.symbol ?? "—";
      const underlyingDecimals = m?.decimals ?? 18;

      const totalSupplyMTokens = ok<bigint>(results[base + 2]);
      const totalBorrowsRaw = ok<bigint>(results[base + 3]);
      const exchangeRate = ok<bigint>(results[base + 4]);
      const cashRaw = ok<bigint>(results[base + 5]);
      const reservesRaw = ok<bigint>(results[base + 6]);

      // Supplied underlying = mTokens × exchangeRateStored / 1e18, where the
      // rate is scaled 1e(18 + ud − 8): the mToken's 8dp and the rate's excess
      // decimals cancel, leaving underlying at its own scale.
      const totalSupplyUnderlying =
        totalSupplyMTokens != null && exchangeRate != null
          ? scaleRaw((totalSupplyMTokens * exchangeRate) / BigInt("1000000000000000000"), underlyingDecimals)
          : 0;
      const totalBorrowsUnderlying = totalBorrowsRaw != null ? scaleRaw(totalBorrowsRaw, underlyingDecimals) : 0;
      const cashUnderlying = cashRaw != null ? scaleRaw(cashRaw, underlyingDecimals) : 0;
      const totalReservesUnderlying = reservesRaw != null ? scaleRaw(reservesRaw, underlyingDecimals) : 0;

      // Oracle scale is the fork's own convention: 1e(36 − underlyingDecimals).
      const priceRaw = ok<bigint>(results[base + 14]);
      const priceUsd = priceRaw != null && priceRaw > ZERO ? Number(priceRaw) / 10 ** (36 - underlyingDecimals) : null;

      const mkt = ok<readonly [boolean, bigint]>(results[base + 11]);
      const cfMantissa = mkt ? mkt[1] : null;
      const collateralDisabled = cfMantissa != null && cfMantissa === ZERO;
      const collateralFactor = cfMantissa != null && cfMantissa > ZERO ? Number(cfMantissa) / 1e18 : null;

      // Caps are stored in underlying units; 0 means UNCAPPED, so it becomes
      // null rather than a ceiling of nothing.
      const capOf = (r: Res | undefined): number | null => {
        const v = ok<bigint>(r);
        return v != null && v > ZERO ? scaleRaw(v, underlyingDecimals) : null;
      };
      const supplyCap = capOf(results[base + 12]);
      const borrowCap = capOf(results[base + 13]);
      // Judged on the raw slot, before scaling: exactly 1 base unit.
      const oneUnit = (r: Res | undefined): boolean => ok<bigint>(r) === ONE;
      const supplyCapOneUnit = oneUnit(results[base + 12]);
      const borrowCapOneUnit = oneUnit(results[base + 13]);

      // Annualize the per-SECOND rates on the model's own timestampsPerYear;
      // fall back to the file's
      // SECONDS_PER_YEAR when a model won't answer — per-timestamp is
      // wall-clock seconds by definition, so the constant is the convention
      // itself, not a guess about block cadence.
      const kinkRaw = ok<bigint>(irmRes[i * 2]);
      const tpyRaw = ok<bigint>(irmRes[i * 2 + 1]);
      const timestampsPerYear = tpyRaw != null && tpyRaw > ZERO ? Number(tpyRaw) : null;
      const apr = (r: Res | undefined): number | null => {
        const v = ok<bigint>(r);
        return v != null ? (Number(v) / 1e18) * (timestampsPerYear ?? SECONDS_PER_YEAR) * 100 : null;
      };

      return {
        mToken,
        mTokenSymbol: ok<string>(results[base]) ?? "—",
        underlying,
        underlyingSymbol,
        underlyingDecimals,

        totalSupplyUnderlying,
        totalBorrowsUnderlying,
        cashUnderlying,
        totalReservesUnderlying,

        priceUsd,
        totalSupplyUsd: priceUsd != null ? totalSupplyUnderlying * priceUsd : null,
        totalBorrowsUsd: priceUsd != null ? totalBorrowsUnderlying * priceUsd : null,

        utilisation: totalSupplyUnderlying > 0 ? totalBorrowsUnderlying / totalSupplyUnderlying : null,

        collateralFactor,
        collateralDisabled,
        isListed: mkt ? mkt[0] : false,

        supplyCap,
        borrowCap,
        supplyCapUsed: supplyCap != null && supplyCap > 0 ? totalSupplyUnderlying / supplyCap : null,
        borrowCapUsed: borrowCap != null && borrowCap > 0 ? totalBorrowsUnderlying / borrowCap : null,
        supplyCapOneUnit,
        borrowCapOneUnit,

        supplyApr: apr(results[base + 8]),
        borrowApr: apr(results[base + 7]),
        reserveFactor: (() => {
          const v = ok<bigint>(results[base + 9]);
          return v != null ? Number(v) / 1e18 : null;
        })(),

        interestRateModel: irmOf[i] && !isZeroAddr(irmOf[i]) ? getAddress(irmOf[i]!).toLowerCase() : null,
        timestampsPerYear,
        kink: kinkRaw != null && kinkRaw > ZERO ? Number(kinkRaw) / 1e18 : null,
      };
    });

    // Largest first — the roster's own order is listing sequence.
    markets.sort((a, b) => (b.totalSupplyUsd ?? 0) - (a.totalSupplyUsd ?? 0));

    const priced = markets.filter((m) => m.totalSupplyUsd != null);
    const supplied = priced.length > 0 ? priced.reduce((t, r) => t + (r.totalSupplyUsd ?? 0), 0) : null;
    const borrowed = priced.length > 0 ? priced.reduce((t, r) => t + (r.totalBorrowsUsd ?? 0), 0) : null;
    // The fullest real cap: one-base-unit caps are closed doors, not headroom,
    // so they sit in the closed counts and out of the max.
    const capUses = markets
      .filter((m) => !m.supplyCapOneUnit)
      .map((m) => m.supplyCapUsed)
      .filter((v): v is number => v != null);
    const closedToSupply = markets.filter((m) => m.supplyCapOneUnit || (m.supplyCapUsed ?? 0) >= 1).length;
    const closedToBorrow = markets.filter((m) => m.borrowCapOneUnit || (m.borrowCapUsed ?? 0) >= 1).length;

    return {
      blockNumber,
      oracle: getAddress(oracle).toLowerCase(),
      markets,
      summary: {
        total: markets.length,
        totalSuppliedUsd: supplied,
        totalBorrowedUsd: borrowed,
        utilisation: supplied != null && borrowed != null && supplied > 0 ? borrowed / supplied : null,
        supplyCapMaxUsed: capUses.length > 0 ? Math.max(...capUses) : null,
        closedToSupply,
        closedToBorrow,
        closeFactor: closeFactorRaw > ZERO ? Number(closeFactorRaw) / 1e18 : null,
        liquidationIncentive: liqIncentiveRaw > ZERO ? Number(liqIncentiveRaw) / 1e18 : null,
      },
      chainStale: false,
    };
  } catch (error) {
    console.error("Moonwell markets chain read failed:", error);
    return emptyMarkets();
  }
}
