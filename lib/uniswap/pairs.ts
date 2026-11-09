// The /start pair step's math (rails-ops ui-jobs 556, door 2): every hookless
// Uniswap V3 and V4 pool for a pair, from rails-server's reads at the head and
// 30, 60 and 90 days back (lib/uniswap/types.ts), each worked into a card's
// figures. A pool whose figures a newcomer cannot read plainly is set aside
// with its reason: no liquidity in range, younger than 30 days, thin in range
// at any read (under 50,000 of a stable quote or 20 ETH), under that in size,
// or a 30-day fee figure above 10%.
//
// Pure, with type imports only: scripts/test/uniswap.test.mjs reads it.

import type { UniPairRead, UniToken, UniswapVersion } from "./types";

const U256 = BigInt(2) ** BigInt(256);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const sub = (a: bigint, b: bigint) => (((a - b) % U256) + U256) % U256;
const sqrtFromX96 = (x: string) => Number(BigInt(x)) / 2 ** 96;

/** The tokens the pairs name, as the route is asked for them ("eth" for native ETH). */
export const PAIR_TOKENS: Record<string, UniToken & { param: string }> = {
  ETH: { symbol: "ETH", address: ZERO_ADDRESS, decimals: 18, param: "eth" },
  WETH: { symbol: "WETH", address: WETH, decimals: 18, param: WETH },
  USDC: {
    symbol: "USDC",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    decimals: 6,
    param: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  USDT: {
    symbol: "USDT",
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    decimals: 6,
    param: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  },
  WBTC: {
    symbol: "WBTC",
    address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    decimals: 8,
    param: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
  },
  wstETH: {
    symbol: "wstETH",
    address: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    decimals: 18,
    param: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  },
};

/** A pair as the reader names it: base first, quote second. "ETH" means ETH or WETH. */
export const PAIRS = {
  "eth-usdc": { base: "ETH", quote: "USDC" },
  "eth-usdt": { base: "ETH", quote: "USDT" },
  "wbtc-eth": { base: "WBTC", quote: "ETH" },
  "wsteth-eth": { base: "wstETH", quote: "ETH" },
  "usdc-usdt": { base: "USDC", quote: "USDT" },
} as const;
export type PairKey = keyof typeof PAIRS;

export const isPairKey = (k: string): k is PairKey => k in PAIRS;

/** Why a pool is set aside. */
export type AsideReason =
  | { kind: "empty" }
  | { kind: "young" }
  | { kind: "thin-now"; floor: number }
  | { kind: "thin-then"; floor: number }
  | { kind: "small"; floor: number }
  | { kind: "spike" };

export interface PoolCard {
  key: string;
  version: UniswapVersion;
  fee: number;
  /** V4 with WETH where the pair names ETH: the card says so. */
  weth: boolean;
  /** V3 only: the two balances, valued in the quote token. */
  size: number | null;
  sizeThen: number | null;
  /** Full-range fees as a share of value, per 30-day window, newest first. */
  windows: (number | null)[];
  priceMove: number | null;
  /** The pool's protocol fee field at the head, raw. */
  protocolFee: number;
  aside: AsideReason | null;
  /** The reads behind the card, for its key and the order. */
  reads: number[];
}

/** The liquidity floor: 20 ETH where ETH is the quote, else 50,000 of the stablecoin. */
export const floorFor = (quote: string): number => (quote === "ETH" ? 20 : 50_000);

/** Highest 30-day fee figure a card keeps without being set aside. */
export const SPIKE = 0.1;

/** Every pool of the read as a card. */
export function pairCards(read: UniPairRead, key: PairKey): PoolCard[] {
  const { quote } = PAIRS[key];
  const meta = (address: string): UniToken => {
    const a = address.toLowerCase();
    return (
      read.tokens.find((t) => t.address.toLowerCase() === a) ??
      Object.values(PAIR_TOKENS).find((t) => t.address.toLowerCase() === a) ?? {
        address,
        symbol: "?",
        decimals: 18,
      }
    );
  };
  const isQuote = (t: UniToken) => t.symbol === quote || (quote === "ETH" && t.symbol === "WETH");
  const floor = floorFor(quote);

  return read.pools.flatMap((pool): PoolCard[] => {
    const cur = pool.at[0];
    if (!cur) return [];
    const t0 = meta(pool.token0);
    const t1 = meta(pool.token1);
    const quoteIs0 = isQuote(t0);
    const windows = [0, 1, 2].map((k) => {
      const end = pool.at[k];
      const start = pool.at[k + 1];
      if (!end || !start) return null;
      const sq = sqrtFromX96(end.sqrtPriceX96);
      const d0 = Number(sub(BigInt(end.feeGrowthGlobal0X128), BigInt(start.feeGrowthGlobal0X128))) / 2 ** 128;
      const d1 = Number(sub(BigInt(end.feeGrowthGlobal1X128), BigInt(start.feeGrowthGlobal1X128))) / 2 ** 128;
      return (d0 * sq * sq + d1) / (2 * sq);
    });
    const price = (s: string) => {
      const sq = sqrtFromX96(s);
      const p01 = sq * sq * 10 ** (t0.decimals - t1.decimals);
      return quoteIs0 ? 1 / p01 : p01;
    };
    const valueQuote = (rd: NonNullable<(typeof pool.at)[number]>) => {
      if (rd.balance0 === null || rd.balance1 === null) return null;
      const h0 = Number(rd.balance0) / 10 ** t0.decimals;
      const h1 = Number(rd.balance1) / 10 ** t1.decimals;
      const p = price(rd.sqrtPriceX96);
      return quoteIs0 ? h0 + h1 * p : h1 + h0 * p;
    };
    // Liquidity in range valued as if spread full range (2·L·√P): an upper
    // bound on the capital behind it, so a pool under the floor is thin.
    const inRangeValue = (rd: NonNullable<(typeof pool.at)[number]>) => {
      const sq = sqrtFromX96(rd.sqrtPriceX96);
      const in1 = (2 * Number(BigInt(rd.liquidity)) * sq) / 10 ** t1.decimals;
      return quoteIs0 ? in1 / (sq * sq * 10 ** (t0.decimals - t1.decimals)) : in1;
    };
    const size = valueQuote(cur);
    const past = pool.at[1];
    let aside: AsideReason | null = null;
    if (BigInt(cur.liquidity) === BigInt(0)) aside = { kind: "empty" };
    else if (windows[0] === null) aside = { kind: "young" };
    else if (inRangeValue(cur) < floor) aside = { kind: "thin-now", floor };
    else if (pool.at.some((rd) => rd && inRangeValue(rd) < floor)) aside = { kind: "thin-then", floor };
    else if (size !== null && size < floor) aside = { kind: "small", floor };
    else if (windows.some((w) => w !== null && w > SPIKE)) aside = { kind: "spike" };
    return [
      {
        key: pool.key,
        version: pool.version,
        fee: pool.fee,
        weth: pool.version === "v4" && [t0, t1].some((t) => t.symbol === "WETH"),
        size,
        sizeThen: past ? valueQuote(past) : null,
        windows,
        priceMove: past ? price(cur.sqrtPriceX96) / price(past.sqrtPriceX96) - 1 : null,
        protocolFee: cur.protocolFee,
        aside,
        reads: pool.at.map((_, k) => read.reads[k]?.block ?? 0),
      },
    ];
  });
}

export type PairOrder = "size" | "fees" | "range";

/** The spread of the three 30-day windows; null without all three. */
export const windowSpread = (c: PoolCard): number | null => {
  const w = c.windows.filter((x): x is number => x !== null);
  return w.length === 3 ? Math.max(...w) - Math.min(...w) : null;
};

const desc = (a: number | null, b: number | null) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : b - a);
const asc = (a: number | null, b: number | null) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : a - b);

/** The cards in the reader's order; a card with no figure after every figure. */
export function orderCards(cards: PoolCard[], o: PairOrder): PoolCard[] {
  const out = [...cards];
  if (o === "size") out.sort((a, b) => desc(a.size, b.size) || desc(a.windows[0], b.windows[0]));
  if (o === "fees") out.sort((a, b) => desc(a.windows[0], b.windows[0]));
  if (o === "range") out.sort((a, b) => asc(windowSpread(a), windowSpread(b)));
  return out;
}
