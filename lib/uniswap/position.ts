// One Uniswap V3 or V4 position worked out from rails-server's reads at the
// head and 30 days back (rails-ops ui-jobs 556, door 1; the reads are
// lib/uniswap/types.ts). Every value is in the pool's quote token, priced by
// the pool at the head. Fees over the window are the position's liquidity
// times the change in its range's fee growth between the two blocks, exact
// while its liquidity did not change.
//
// Pure, with type imports only: scripts/test/uniswap.test.mjs reads it.

import { nativeSymbols, uniDeployment, type UniChainId, type UniProtocol } from "./deployments";
import type { BlockRef, UniPositionRead, UniToken, UniswapVersion } from "./types";

const Q128 = BigInt(2) ** BigInt(128);
const U256 = BigInt(2) ** BigInt(256);
const ZERO = BigInt(0);

/** v4-core `Hooks.sol`, bit 13 down to bit 0 of the hook's address. */
export const HOOK_FLAGS = [
  "beforeInitialize",
  "afterInitialize",
  "beforeAddLiquidity",
  "afterAddLiquidity",
  "beforeRemoveLiquidity",
  "afterRemoveLiquidity",
  "beforeSwap",
  "afterSwap",
  "beforeDonate",
  "afterDonate",
  "beforeSwapReturnsDelta",
  "afterSwapReturnsDelta",
  "afterAddLiquidityReturnsDelta",
  "afterRemoveLiquidityReturnsDelta",
] as const;
export type HookFlag = (typeof HOOK_FLAGS)[number];

/** V4's PoolKey fee that hands the fee to the hook. */
export const DYNAMIC_FEE = 0x800000;

/** The stablecoins a pool quotes in before ETH. */
export const STABLE: ReadonlySet<string> = new Set([
  "USDC",
  "USDT",
  "DAI",
  "USDS",
  "EURC",
  "PYUSD",
  "RLUSD",
  "FRAX",
  "GHO",
  "USDe",
  "USD₮0",
  "USDbC",
]);
const ETH_SYMBOLS: readonly string[] = ["ETH", "WETH"];
const rank = (s: string, natives: readonly string[]) => (STABLE.has(s) ? 3 : natives.includes(s) ? 2 : 1);

/** Is token0 the quote? A stablecoin quotes the chain's native coin (ETH and WETH unless named), and
 *  that coin quotes everything else. */
export const quoteIsToken0 = (t0: UniToken, t1: UniToken, natives: readonly string[] = ETH_SYMBOLS): boolean =>
  rank(t0.symbol, natives) > rank(t1.symbol, natives);

/** a − b in uint256, wrapping as the pools' fee growth does. */
export const sub256 = (a: bigint, b: bigint): bigint => (((a - b) % U256) + U256) % U256;
export const sqrtFromX96 = (x: string | bigint): number => Number(BigInt(x)) / 2 ** 96;
const sqrtAtTick = (t: number) => Math.pow(1.0001, t / 2);

/** The two token amounts (raw) a liquidity holds over [tl, tu) at a square-root price. */
export function amountsFor(L: bigint, sqrtP: number, tl: number, tu: number): [number, number] {
  const sa = sqrtAtTick(tl);
  const sb = sqrtAtTick(tu);
  const l = Number(L);
  if (sqrtP <= sa) return [(l * (sb - sa)) / (sa * sb), 0];
  if (sqrtP >= sb) return [0, l * (sb - sa)];
  return [(l * (sb - sqrtP)) / (sqrtP * sb), l * (sqrtP - sa)];
}

export interface Amounts {
  base: number;
  quote: number;
}

/** Everything priced in token1 raw units first, then turned into the quote token. */
export class Pricer {
  readonly sqrt: number;
  readonly d0: number;
  readonly d1: number;
  readonly quoteIs0: boolean;
  constructor(sqrt: number, d0: number, d1: number, quoteIs0: boolean) {
    this.sqrt = sqrt;
    this.d0 = d0;
    this.d1 = d1;
    this.quoteIs0 = quoteIs0;
  }
  get P(): number {
    return this.sqrt * this.sqrt;
  }
  /** Human token1 per token0. */
  get p01(): number {
    return this.P * 10 ** (this.d0 - this.d1);
  }
  /** Raw token0 and token1, valued in the quote token (human units). */
  value(a0: number, a1: number): number {
    const in1 = (a0 * this.P + a1) / 10 ** this.d1;
    return this.quoteIs0 ? in1 / this.p01 : in1;
  }
  amounts(a0: number, a1: number): Amounts {
    const h0 = a0 / 10 ** this.d0;
    const h1 = a1 / 10 ** this.d1;
    return this.quoteIs0 ? { base: h1, quote: h0 } : { base: h0, quote: h1 };
  }
  /** Quote per base at a tick, or at a square-root price. */
  priceAt(tick: number | null, sqrt?: number): number {
    const p01 =
      tick === null ? sqrt! * sqrt! * 10 ** (this.d0 - this.d1) : Math.pow(1.0001, tick) * 10 ** (this.d0 - this.d1);
    return this.quoteIs0 ? 1 / p01 : p01;
  }
}

/** Fees a liquidity earned between two fee-growth readings, raw per token. */
export const feesBetween = (L: bigint, now: bigint, then: bigint): bigint => (L * sub256(now, then)) / Q128;

/** The hook's permissions from the low 14 bits of its address. */
export function hookPermissions(hooks: string | null): HookFlag[] {
  if (!hooks || BigInt(hooks) === ZERO) return [];
  const bits = BigInt(hooks) & BigInt(0x3fff);
  return HOOK_FLAGS.filter((_, i) => ((bits >> BigInt(13 - i)) & BigInt(1)) === BigInt(1));
}

/** What a full-range position earned in fees between two fee-growth readings,
 *  as a share of its value at the price `sqrt`. */
export function fullRangeShare(g0Now: string, g1Now: string, g0Then: string, g1Then: string, sqrt: number): number {
  const d0 = Number(sub256(BigInt(g0Now), BigInt(g0Then))) / 2 ** 128;
  const d1 = Number(sub256(BigInt(g1Now), BigInt(g1Then))) / 2 ** 128;
  return (d0 * sqrt * sqrt + d1) / (2 * sqrt);
}

/** The protocol's cut, read from the pool. */
export type ProtocolCut =
  | { version: "v3"; /** 1/n of the LPs' fee in token0 and token1; 0 is none. */ d0: number; d1: number }
  | { version: "v4"; /** Pips (millionths) added to each swap, by direction. */ p0: number; p1: number }
  | {
      version: "pancake-v3";
      /** Ten-thousandths of the swap fee taken, for swaps paying token0 and token1; 0 is none. */
      s0: number;
      s1: number;
    };

/** Uniswap V3's feeProtocol is a uint8, two 4-bit denominators; V4's protocolFee two 12-bit pips.
 *  PancakeSwap V3's feeProtocol is a uint32, two 16-bit shares in ten-thousandths of the fee
 *  (pancake-v3-contracts, v3-core PancakeV3Pool.sol: `feeProtocol % 65536` and `feeProtocol >> 16`,
 *  over PROTOCOL_FEE_DENOMINATOR 10,000). */
export function protocolCut(
  version: UniswapVersion,
  protocolFee: number,
  protocol: UniProtocol = "uniswap",
): ProtocolCut {
  if (protocol === "pancakeswap")
    return { version: "pancake-v3", s0: protocolFee % 65536, s1: Math.floor(protocolFee / 65536) };
  return version === "v3"
    ? { version, d0: protocolFee & 15, d1: protocolFee >> 4 }
    : { version, p0: protocolFee & 0xfff, p1: protocolFee >> 12 };
}

/** A PancakeSwap position staked in the farm: CAKE not yet harvested, in CAKE. */
export interface PoolStake {
  masterChef: string;
  user: string;
  pid: string;
  pendingCake: number;
  cake: UniToken;
}

export interface PoolPosition {
  protocol: UniProtocol;
  chainId: UniChainId;
  version: UniswapVersion;
  id: string;
  /** The NFT's holder on record: the farm where the position is staked. */
  owner: string;
  /** Whose position it is: the staker where it is staked, else the owner. */
  holder: string;
  /** PancakeSwap: the stake, or null where it is not staked; undefined elsewhere. */
  staked?: PoolStake | null;
  /** Whether the chain's reads include the position's history (its deposits and the day it opened). */
  historyRead: boolean;
  /** The pool's contract (V3) or its id in the PoolManager (V4). */
  pool: string;
  base: UniToken;
  quote: UniToken;
  quoteIs0: boolean;
  fee: number;
  dynamicFee: boolean;
  /** The LP fee now, in percent. */
  lpFeePct: number;
  hooks: string | null;
  hookPermissions: HookFlag[];
  hasSubscriber: boolean;
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
  /** The position's own amounts at the past block (its liquidity then, at the price then); null where
   *  it did not exist then. */
  holdsThen: Amounts | null;
  valueNow: number;
  uncollected: number;
  uncollectedAmounts: Amounts;
  /** The position's liquidity over the pool's in-range liquidity; 0 out of range. */
  shareOfActive: number;
  fees30d: number | null;
  fees30dAmounts: Amounts | null;
  /** The same liquidity's tokens at the window's start, valued now. */
  holdThen: number | null;
  againstHolding: number | null;
  againstHoldingWithFees: number | null;
  /** Null where the position or the pool did not exist 30 days back. */
  liquidityChanged: boolean | null;
  opened: BlockRef | null;
  /** Opened after the window's start. */
  openedInWindow: boolean;
  daysInRange: { inRange: number; read: number; from: number; to: number } | null;
  sinceDeposit: {
    deposited: Amounts;
    collected: Amounts;
    withdrawn: Amounts;
    holdValue: number;
    nowWithEverything: number;
    events: { increase: number; decrease: number; collect: number };
  } | null;
  pool30d: {
    fullRangeFees: number | null;
    balances: Amounts | null;
    balancesThen: Amounts | null;
  };
  protocolCut: ProtocolCut;
}

const sumLogs = (xs: { amount0: string; amount1: string }[]): [number, number] => [
  xs.reduce((s, x) => s + Number(x.amount0), 0),
  xs.reduce((s, x) => s + Number(x.amount1), 0),
];

/** The position as the page draws it. */
export function poolPosition(r: UniPositionRead, protocol: UniProtocol = "uniswap"): PoolPosition {
  const d = uniDeployment(protocol, r.chainId);
  const quoteIs0 = quoteIsToken0(r.token0, r.token1, nativeSymbols(d));
  const now = r.now;
  const px = new Pricer(sqrtFromX96(now.sqrtPriceX96), r.token0.decimals, r.token1.decimals, quoteIs0);
  const L = BigInt(r.liquidity);
  const tl = r.tickLower;
  const tu = r.tickUpper;

  const owed0 =
    BigInt(now.tokensOwed0) +
    feesBetween(L, BigInt(now.feeGrowthInside0X128), BigInt(now.positionFeeGrowthInside0LastX128));
  const owed1 =
    BigInt(now.tokensOwed1) +
    feesBetween(L, BigInt(now.feeGrowthInside1X128), BigInt(now.positionFeeGrowthInside1LastX128));
  const [a0, a1] = amountsFor(L, px.sqrt, tl, tu);
  const valueNow = px.value(a0, a1);

  const past = r.past;
  let fees30d: number | null = null;
  let fees30dAmounts: Amounts | null = null;
  let holdThen: number | null = null;
  let againstHolding: number | null = null;
  let againstHoldingWithFees: number | null = null;
  let liquidityChanged: boolean | null = null;
  if (past && past.positionLiquidity !== null) {
    liquidityChanged = BigInt(past.positionLiquidity) !== L;
    if (!liquidityChanged && L > ZERO) {
      const f0 = Number(feesBetween(L, BigInt(now.feeGrowthInside0X128), BigInt(past.feeGrowthInside0X128)));
      const f1 = Number(feesBetween(L, BigInt(now.feeGrowthInside1X128), BigInt(past.feeGrowthInside1X128)));
      fees30d = px.value(f0, f1);
      fees30dAmounts = px.amounts(f0, f1);
      const [h0, h1] = amountsFor(L, sqrtFromX96(past.sqrtPriceX96), tl, tu);
      holdThen = px.value(h0, h1);
      if (holdThen > 0) {
        againstHolding = valueNow / holdThen - 1;
        againstHoldingWithFees = (valueNow + fees30d) / holdThen - 1;
      }
    }
  }
  const fullRangeFees = past
    ? fullRangeShare(
        now.feeGrowthGlobal0X128,
        now.feeGrowthGlobal1X128,
        past.feeGrowthGlobal0X128,
        past.feeGrowthGlobal1X128,
        px.sqrt,
      )
    : null;

  const uncollected = px.value(Number(owed0), Number(owed1));
  const h = r.history;
  const sinceDeposit =
    h && h.increase.length
      ? (() => {
          const [d0, d1] = sumLogs(h.increase);
          const [w0, w1] = sumLogs(h.decrease);
          const [c0, c1] = sumLogs(h.collect);
          return {
            deposited: px.amounts(d0, d1),
            withdrawn: px.amounts(w0, w1),
            collected: px.amounts(c0, c1),
            holdValue: px.value(d0, d1),
            // Collect pays out withdrawn tokens and fees together, so value now,
            // unpaid fees and every collection make the whole.
            nowWithEverything: valueNow + uncollected + px.value(c0, c1),
            events: { increase: h.increase.length, decrease: h.decrease.length, collect: h.collect.length },
          };
        })()
      : null;

  const days = r.daily.filter((d) => r.opened === null || d.block >= r.opened.block);
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
  const price = px.priceAt(null, px.sqrt);
  const dynamicFee = r.version === "v4" && r.fee === DYNAMIC_FEE;
  const hooks = r.hooks && BigInt(r.hooks) !== ZERO ? r.hooks : null;
  const activeL = BigInt(now.activeLiquidity);
  const st = r.staked;
  return {
    protocol,
    chainId: r.chainId,
    version: r.version,
    id: r.id,
    owner: r.owner,
    holder: st ? st.user : r.owner,
    ...(r.staked === undefined
      ? {}
      : {
          staked: st
            ? {
                masterChef: st.masterChef,
                user: st.user,
                pid: st.pid,
                pendingCake: Number(st.pendingCake) / 10 ** st.cake.decimals,
                cake: st.cake,
              }
            : null,
        }),
    historyRead: d.history,
    pool: r.pool,
    base: quoteIs0 ? r.token1 : r.token0,
    quote: quoteIs0 ? r.token0 : r.token1,
    quoteIs0,
    fee: r.fee,
    dynamicFee,
    lpFeePct: (r.version === "v4" ? now.lpFee : r.fee) / 1e4,
    hooks,
    hookPermissions: hookPermissions(hooks),
    hasSubscriber: r.hasSubscriber,
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
    holdsThen:
      past && past.positionLiquidity !== null
        ? px.amounts(...amountsFor(BigInt(past.positionLiquidity), sqrtFromX96(past.sqrtPriceX96), tl, tu))
        : null,
    valueNow,
    uncollected,
    uncollectedAmounts: px.amounts(Number(owed0), Number(owed1)),
    shareOfActive: inRange && activeL > ZERO ? Number(L) / Number(activeL) : 0,
    fees30d,
    fees30dAmounts,
    holdThen,
    againstHolding,
    againstHoldingWithFees,
    liquidityChanged,
    opened: r.opened,
    // A position missing at `then` (its past liquidity null) opened inside the window.
    openedInWindow:
      (r.opened !== null && r.opened.time > r.then.time) || (past !== null && past.positionLiquidity === null),
    daysInRange,
    sinceDeposit,
    pool30d: {
      fullRangeFees,
      balances:
        now.balance0 !== null && now.balance1 !== null ? px.amounts(Number(now.balance0), Number(now.balance1)) : null,
      balancesThen:
        past && past.balance0 !== null && past.balance1 !== null
          ? px.amounts(Number(past.balance0), Number(past.balance1))
          : null,
    },
    protocolCut: protocolCut(r.version, now.protocolFee, protocol),
  };
}
