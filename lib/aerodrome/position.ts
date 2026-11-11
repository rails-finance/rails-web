// One Aerodrome Slipstream position on Base worked out from rails-server's
// reads at the head and 30 days back (rails-ops ui-jobs 566; the reads are
// lib/aerodrome/types.ts). A Slipstream position is Uniswap V3's shape, so the
// amounts, the price and the fee arithmetic are lib/uniswap/position.ts's.
// What differs: a staked position earns AERO from the pool's gauge in place
// of trading fees; the pool's fee counters grow per unit of unstaked
// liquidity, its reward counter per unit of staked liquidity; and a staked
// NFT is owned by the gauge, on its depositor's behalf.
//
// Pure: scripts/test/aerodrome.test.mjs reads it.

import { SPIKE, floorFor } from "../uniswap/pairs";
import {
  Pricer,
  STABLE,
  amountsFor,
  feesBetween,
  fullRangeShare,
  quoteIsToken0,
  sqrtFromX96,
  sub256,
  type Amounts,
} from "../uniswap/position";
import type { BlockRef, UniToken } from "../uniswap/types";
import { AERO_CONTRACTS, type AeroPositionRead, type AeroPriceLeg, type SlipstreamDeployment } from "./types";
import { AERODROME, siteOf, type SlipstreamSite } from "./sites";

const Q128 = BigInt(2) ** BigInt(128);
const ZERO = BigInt(0);
const MAX_BPS = BigInt(10_000);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
/** The site's reward token: AERO on Base, VELO on Optimism. */
const isReward = (t: Pick<UniToken, "address">, reward: string) => same(t.address, reward);

/** AERO a liquidity earned between two reward-growth readings, in wei. */
export const aeroBetween = (L: bigint, now: bigint, then: bigint): bigint => (L * sub256(now, then)) / Q128;

/** The gauge's early-unstake penalty, in force while the stake is younger than the minimum. */
export function penaltyNow(
  s: { depositTimestamp: number | null; penaltyBps: number | null; minStakeSeconds: number | null },
  time: number,
): { bps: number; until: number } | null {
  if (s.depositTimestamp === null || s.penaltyBps === null || s.minStakeSeconds === null) return null;
  if (s.penaltyBps <= 0) return null;
  const until = s.depositTimestamp + s.minStakeSeconds;
  return time < until ? { bps: s.penaltyBps, until } : null;
}

/** Claimable AERO at the head, in wei, as the gauge's `earned` works it: the rewards settled at its
 *  last update, plus the liquidity times the reward growth inside the range since, less the penalty. */
export function claimableWei(
  L: bigint,
  rewards: string,
  insideNow: string,
  insideLast: string,
  penaltyBps: number | null,
): bigint {
  const gross = BigInt(rewards) + aeroBetween(L, BigInt(insideNow), BigInt(insideLast));
  return penaltyBps ? gross - (gross * BigInt(penaltyBps)) / MAX_BPS : gross;
}

/** The reward's price from a v2 volatile pool's reserves: units of the other token per AERO (or VELO), human. */
export function legPrice(
  leg: AeroPriceLeg,
  otherDecimals: number,
  at: "now" | "then" = "now",
  reward: string = AERO_CONTRACTS.aero,
): number | null {
  const r = leg[at];
  if (!r) return null;
  const aeroIs0 = same(leg.token0, reward);
  const aero = Number(aeroIs0 ? r.reserve0 : r.reserve1) / 1e18;
  const other = Number(aeroIs0 ? r.reserve1 : r.reserve0) / 10 ** otherDecimals;
  return aero > 0 ? other / aero : null;
}

/** How AERO is priced in the quote token, and through which pools. */
export type AeroPriceRoute =
  | { via: "usdc-leg"; leg: AeroPriceLeg }
  | { via: "weth-leg"; leg: AeroPriceLeg }
  | { via: "is-quote" }
  | { via: "pool" }
  | { via: "weth-then-pool"; leg: AeroPriceLeg }
  | { via: "usdc-then-pool"; leg: AeroPriceLeg }
  | { via: "none" };

/** AERO (VELO on Optimism) in the quote token at the head: through the reward/USDC or reward/WETH leg
 *  that matches the quote; else the position's own pool where one of its tokens is the reward; else
 *  through WETH, then USDC, where the pool's base is one of them, and the pool's price from there; else
 *  no price. The legs are the site's (rails-server answers them under `aero` on every site). */
export function aeroInQuote(
  r: Pick<AeroPositionRead, "aero">,
  base: UniToken,
  quote: UniToken,
  price: number,
  site: SlipstreamSite = AERODROME,
): { price: number | null; route: AeroPriceRoute } {
  const reward = site.reward.address;
  if (same(quote.address, site.usdc)) {
    const leg = r.aero.usdc;
    return { price: legPrice(leg, 6, "now", reward), route: { via: "usdc-leg", leg } };
  }
  if (same(quote.address, site.weth)) {
    const leg = r.aero.weth;
    return { price: legPrice(leg, 18, "now", reward), route: { via: "weth-leg", leg } };
  }
  if (isReward(quote, reward)) return { price: 1, route: { via: "is-quote" } };
  if (isReward(base, reward)) return { price, route: { via: "pool" } };
  if (same(base.address, site.weth)) {
    const leg = r.aero.weth;
    const w = legPrice(leg, 18, "now", reward);
    return { price: w === null ? null : w * price, route: { via: "weth-then-pool", leg } };
  }
  if (same(base.address, site.usdc)) {
    const leg = r.aero.usdc;
    const u = legPrice(leg, 6, "now", reward);
    return { price: u === null ? null : u * price, route: { via: "usdc-then-pool", leg } };
  }
  return { price: null, route: { via: "none" } };
}

/** Why the pool's 30-day figure is set aside: 556's rule (lib/uniswap/pairs.ts) read at the two blocks. */
export type PoolAside =
  | { kind: "empty" }
  | { kind: "young" }
  | { kind: "thin"; floor: number; at: "now" | "then" }
  | { kind: "spike" };

/** The value a liquidity in range would hold spread full range (2·L·√P), in the quote token: an
 *  upper bound on the capital behind it, so liquidity under the floor is thin. */
export function inRangeValue(L: bigint, sqrtX96: string, d0: number, d1: number, quoteIs0: boolean): number {
  const sq = sqrtFromX96(sqrtX96);
  const in1 = (2 * Number(L) * sq) / 10 ** d1;
  return quoteIs0 ? in1 / (sq * sq * 10 ** (d0 - d1)) : in1;
}

/** The floor a quote token has: 20 for WETH, 50,000 for a stablecoin, none for any other. */
export function floorOf(quote: UniToken): number | null {
  if (quote.symbol === "WETH" || quote.symbol === "ETH") return floorFor("ETH");
  return STABLE.has(quote.symbol) ? floorFor(quote.symbol) : null;
}

/** The set-aside rule on one of the pool's figures: its liquidity now and then, and the figure. */
export function poolAside(
  liq: { now: bigint; then: bigint | null },
  value: { now: number; then: number | null },
  floor: number | null,
  figure: number | null,
): PoolAside | null {
  if (liq.now === ZERO) return { kind: "empty" };
  if (liq.then === null || figure === null) return { kind: "young" };
  if (floor !== null && value.now < floor) return { kind: "thin", floor, at: "now" };
  if (floor !== null && value.then !== null && value.then < floor) return { kind: "thin", floor, at: "then" };
  if (figure > SPIKE) return { kind: "spike" };
  return null;
}

/** Why the 30-day figure for the position is stated, or why not. */
export type AeroWindow =
  | { kind: "whole" }
  /** The NFT did not exist at the window's start; `firstSeen` is the first daily read that has it,
   *  `stakedAt` the gauge's deposit time where it keeps one. */
  | { kind: "minted"; firstSeen: number | null; stakedAt: number | null }
  | { kind: "liquidity-changed" }
  /** Staked now, unstaked at the window's start; `at` is the gauge's deposit time where it keeps one. */
  | { kind: "staked-inside"; at: number | null }
  /** Unstaked now, staked at the window's start. */
  | { kind: "unstaked-inside" }
  | { kind: "no-pool" };

export interface AeroPosition {
  /** Aerodrome on Base or Velodrome on Optimism, by the read's chain. */
  site: SlipstreamSite;
  deployment: SlipstreamDeployment;
  id: string;
  /** The wallet: the depositor while staked (null when none is found), else the NFT's owner. */
  holder: string | null;
  staked: boolean;
  gauge: string | null;
  pool: string;
  base: UniToken;
  quote: UniToken;
  quoteIs0: boolean;
  tickSpacing: number;
  head: BlockRef;
  then: BlockRef;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  /** Quote per base. */
  price: number;
  priceThen: number | null;
  range: { low: number; high: number; full: boolean };
  inRange: boolean;
  side: "below" | "above" | "in";
  holds: Amounts;
  valueNow: number;
  /** The swap fee and the unstaked fee, in pips, at both reads. */
  fees: { lp: number; lpThen: number | null; unstaked: number; unstakedThen: number | null };
  window: AeroWindow;
  /** Unstaked only: trading fees owed at the head. */
  uncollected: number | null;
  uncollectedAmounts: Amounts | null;
  /** Unstaked only, over the whole window. */
  fees30d: number | null;
  fees30dAmounts: Amounts | null;
  /** AERO's price in the quote token at the head, and how it was reached. */
  aeroPrice: { price: number | null; route: AeroPriceRoute };
  /** Staked only. AERO in human units; values in the quote token where AERO has a price. */
  aero: {
    earned30d: number | null;
    earned30dValue: number | null;
    claimable: number | null;
    claimableValue: number | null;
    /** The gauge's `earned` read, or the same arithmetic where no depositor was found. */
    claimableFrom: "earned" | "arithmetic";
    claimableArithmetic: number;
    penalty: { bps: number; until: number } | null;
    depositTimestamp: number | null;
  } | null;
  holdThen: number | null;
  againstHolding: number | null;
  /** With the window's fees, or its AERO valued now. */
  againstHoldingWithEarnings: number | null;
  /** The position's share of the liquidity in range that pays it: staked liquidity while staked, else
   *  unstaked; 0 out of range. */
  shareOfPaying: number;
  daysInRange: { inRange: number; read: number; from: number; to: number } | null;
  pool30d: {
    /** What a full-range unstaked position earned in fees, as a share of its value. */
    fullRangeFees: number | null;
    feesAside: PoolAside | null;
    /** What a full-range staked position earned in AERO, valued in the quote token, as a share of its value. */
    fullRangeAero: number | null;
    aeroAside: PoolAside | null;
    /** AERO a day to all staked liquidity at the head's rate. */
    aeroPerDay: number;
    unstakedLiquidity: { now: bigint; then: bigint | null };
    stakedLiquidity: { now: bigint; then: bigint | null };
    floor: number | null;
    balances: Amounts | null;
    balancesThen: Amounts | null;
  };
}

/** The position as the page draws it. */
export function aeroPosition(r: AeroPositionRead): AeroPosition {
  const quoteIs0 = quoteIsToken0(r.token0, r.token1);
  const base = quoteIs0 ? r.token1 : r.token0;
  const quote = quoteIs0 ? r.token0 : r.token1;
  const now = r.now;
  const past = r.past;
  const px = new Pricer(sqrtFromX96(now.sqrtPriceX96), r.token0.decimals, r.token1.decimals, quoteIs0);
  const L = BigInt(r.liquidity);
  const tl = r.tickLower;
  const tu = r.tickUpper;
  const staked = r.staked !== null;

  const [a0, a1] = amountsFor(L, px.sqrt, tl, tu);
  const valueNow = px.value(a0, a1);
  const price = px.priceAt(null, px.sqrt);
  const site = siteOf(r.chainId);
  const aeroPrice = aeroInQuote(r, base, quote, price, site);

  // Which part of the window can be measured.
  const window: AeroWindow = !past
    ? { kind: "no-pool" }
    : past.positionLiquidity === null || r.stakedThen === null
      ? {
          kind: "minted",
          firstSeen:
            r.daily
              .filter((d) => d.positionLiquidity !== null)
              .reduce<number | null>((m, d) => (m === null || d.time < m ? d.time : m), null) ?? null,
          stakedAt: r.staked?.depositTimestamp ?? null,
        }
      : BigInt(past.positionLiquidity) !== L
        ? { kind: "liquidity-changed" }
        : staked && !r.stakedThen
          ? { kind: "staked-inside", at: r.staked?.depositTimestamp ?? null }
          : !staked && r.stakedThen
            ? { kind: "unstaked-inside" }
            : { kind: "whole" };
  const whole = window.kind === "whole" && L > ZERO;

  // Trading fees: an unstaked position's, as Uniswap V3's.
  let uncollected: number | null = null;
  let uncollectedAmounts: Amounts | null = null;
  let fees30d: number | null = null;
  let fees30dAmounts: Amounts | null = null;
  if (!staked) {
    const o0 =
      BigInt(now.tokensOwed0) +
      feesBetween(L, BigInt(now.feeGrowthInside0X128), BigInt(now.positionFeeGrowthInside0LastX128));
    const o1 =
      BigInt(now.tokensOwed1) +
      feesBetween(L, BigInt(now.feeGrowthInside1X128), BigInt(now.positionFeeGrowthInside1LastX128));
    uncollected = px.value(Number(o0), Number(o1));
    uncollectedAmounts = px.amounts(Number(o0), Number(o1));
    if (whole && past) {
      const f0 = Number(feesBetween(L, BigInt(now.feeGrowthInside0X128), BigInt(past.feeGrowthInside0X128)));
      const f1 = Number(feesBetween(L, BigInt(now.feeGrowthInside1X128), BigInt(past.feeGrowthInside1X128)));
      fees30d = px.value(f0, f1);
      fees30dAmounts = px.amounts(f0, f1);
    }
  }

  // AERO: a staked position's.
  const valued = (x: number | null) => (x === null || aeroPrice.price === null ? null : x * aeroPrice.price);
  let aero: AeroPosition["aero"] = null;
  if (r.staked) {
    const s = r.staked;
    const penalty = penaltyNow(s, r.head.time);
    const arithmetic =
      Number(
        claimableWei(L, s.rewards, now.rewardGrowthInsideX128, s.rewardGrowthInsideLastX128, penalty?.bps ?? null),
      ) / 1e18;
    const claimable = s.earned !== null ? Number(BigInt(s.earned)) / 1e18 : arithmetic;
    const earned30d =
      whole && past
        ? Number(aeroBetween(L, BigInt(now.rewardGrowthInsideX128), BigInt(past.rewardGrowthInsideX128))) / 1e18
        : null;
    aero = {
      earned30d,
      earned30dValue: valued(earned30d),
      claimable,
      claimableValue: valued(claimable),
      claimableFrom: s.earned !== null ? "earned" : "arithmetic",
      claimableArithmetic: arithmetic,
      penalty,
      depositTimestamp: s.depositTimestamp,
    };
  }

  // Against holding: the same liquidity's tokens at the window's start, valued now.
  let holdThen: number | null = null;
  let againstHolding: number | null = null;
  let againstHoldingWithEarnings: number | null = null;
  if (whole && past) {
    const [h0, h1] = amountsFor(L, sqrtFromX96(past.sqrtPriceX96), tl, tu);
    holdThen = px.value(h0, h1);
    const earnings = staked ? (aero?.earned30dValue ?? null) : fees30d;
    if (holdThen > 0) {
      againstHolding = valueNow / holdThen - 1;
      againstHoldingWithEarnings = earnings === null ? null : (valueNow + earnings) / holdThen - 1;
    }
  }

  // The pool: fees per unit of unstaked liquidity, AERO per unit of staked liquidity.
  const active = BigInt(now.activeLiquidity);
  const stakedL = BigInt(now.stakedLiquidity);
  const unstakedL = active > stakedL ? active - stakedL : ZERO;
  const activeThen = past ? BigInt(past.activeLiquidity) : null;
  const stakedThenL = past ? BigInt(past.stakedLiquidity) : null;
  const unstakedThenL =
    activeThen !== null && stakedThenL !== null ? (activeThen > stakedThenL ? activeThen - stakedThenL : ZERO) : null;
  const value = (l: bigint, sqrt: string) => inRangeValue(l, sqrt, r.token0.decimals, r.token1.decimals, quoteIs0);
  const floor = floorOf(quote);

  const fullRangeFees = past
    ? fullRangeShare(
        now.feeGrowthGlobal0X128,
        now.feeGrowthGlobal1X128,
        past.feeGrowthGlobal0X128,
        past.feeGrowthGlobal1X128,
        px.sqrt,
      )
    : null;
  // A full-range unit of liquidity holds 1/√P of token0 and √P of token1 (raw).
  const unitValue = px.value(1 / px.sqrt, px.sqrt);
  const fullRangeAero =
    past && aeroPrice.price !== null && unitValue > 0
      ? ((Number(sub256(BigInt(now.rewardGrowthGlobalX128), BigInt(past.rewardGrowthGlobalX128))) / 2 ** 128 / 1e18) *
          aeroPrice.price) /
        unitValue
      : null;

  const feesAside = poolAside(
    { now: unstakedL, then: unstakedThenL },
    {
      now: value(unstakedL, now.sqrtPriceX96),
      then: past && unstakedThenL !== null ? value(unstakedThenL, past.sqrtPriceX96) : null,
    },
    floor,
    fullRangeFees,
  );
  const aeroAside = poolAside(
    { now: stakedL, then: stakedThenL },
    {
      now: value(stakedL, now.sqrtPriceX96),
      then: past && stakedThenL !== null ? value(stakedThenL, past.sqrtPriceX96) : null,
    },
    floor,
    fullRangeAero,
  );

  const days = r.daily.filter((d) => d.positionLiquidity !== null);
  const daysInRange = days.length
    ? {
        inRange: days.filter((d) => d.tick >= tl && d.tick < tu).length,
        read: days.length,
        from: Math.min(...days.map((d) => d.block)),
        to: Math.max(...days.map((d) => d.block)),
      }
    : null;

  const lowP = px.priceAt(tl);
  const highP = px.priceAt(tu);
  const low = Math.min(lowP, highP);
  const high = Math.max(lowP, highP);
  const inRange = now.tick >= tl && now.tick < tu;
  const paying = staked ? stakedL : unstakedL;
  return {
    site,
    deployment: r.deployment,
    id: r.id,
    holder: r.staked ? r.staked.depositor : r.owner,
    staked,
    gauge: r.staked?.gauge ?? null,
    pool: r.pool,
    base,
    quote,
    quoteIs0,
    tickSpacing: r.tickSpacing,
    head: r.head,
    then: r.then,
    tickLower: tl,
    tickUpper: tu,
    liquidity: r.liquidity,
    price,
    priceThen: past ? px.priceAt(null, sqrtFromX96(past.sqrtPriceX96)) : null,
    range: { low, high, full: tl <= -887000 && tu >= 887000 },
    inRange,
    side: inRange ? "in" : price < low ? "below" : "above",
    holds: px.amounts(a0, a1),
    valueNow,
    fees: {
      lp: now.lpFee,
      lpThen: past ? past.lpFee : null,
      unstaked: now.unstakedFee,
      unstakedThen: past ? past.unstakedFee : null,
    },
    window,
    uncollected,
    uncollectedAmounts,
    fees30d,
    fees30dAmounts,
    aeroPrice,
    aero,
    holdThen,
    againstHolding,
    againstHoldingWithEarnings,
    shareOfPaying: inRange && paying > ZERO ? Number(L) / Number(paying) : 0,
    daysInRange,
    pool30d: {
      fullRangeFees,
      feesAside,
      fullRangeAero,
      aeroAside,
      aeroPerDay: (Number(BigInt(now.rewardRate)) * 86_400) / 1e18,
      unstakedLiquidity: { now: unstakedL, then: unstakedThenL },
      stakedLiquidity: { now: stakedL, then: stakedThenL },
      floor,
      balances:
        now.balance0 !== null && now.balance1 !== null ? px.amounts(Number(now.balance0), Number(now.balance1)) : null,
      balancesThen:
        past && past.balance0 !== null && past.balance1 !== null
          ? px.amounts(Number(past.balance0), Number(past.balance1))
          : null,
    },
  };
}
