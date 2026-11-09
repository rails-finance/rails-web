import "server-only";

// ui-jobs 555, door 2 mock: "I have ETH and USDC: where could they go?"
// Every hookless Uniswap V3 and V4 pool for a pair, from state only: V3 pool
// addresses by CREATE2 from the factory, V4 pool ids by hashing the standard
// keys. Hooked V4 pools and non-standard tick spacings are found from
// `Initialize` logs, so they join with the DEX lane (decision 0058).

import {
  type ContractFunctionParameters,
  encodeAbiParameters,
  getContractAddress,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { chainClient } from "@/lib/sources/chain/rpc";

const V3_FACTORY: Address = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const V3_INIT_CODE_HASH: Hex = "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54";
const STATE_VIEW: Address = "0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227";
const ZERO: Address = "0x0000000000000000000000000000000000000000";
const DAY = BigInt(7200);
const U256 = BigInt(2) ** BigInt(256);

const v3PoolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function feeGrowthGlobal0X128() view returns (uint256)",
  "function feeGrowthGlobal1X128() view returns (uint256)",
  "function liquidity() view returns (uint128)",
]);
const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const stateViewAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128)",
  "function getFeeGrowthGlobals(bytes32 poolId) view returns (uint256 feeGrowthGlobal0, uint256 feeGrowthGlobal1)",
]);

type Tok = { symbol: string; address: Address; decimals: number };
const T: Record<string, Tok> = {
  ETH: { symbol: "ETH", address: ZERO, decimals: 18 },
  WETH: { symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
  USDC: { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  USDT: { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  WBTC: { symbol: "WBTC", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
  wstETH: { symbol: "wstETH", address: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", decimals: 18 },
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

const FEES = [100, 500, 3000, 10000] as const;
const SPACING: Record<number, number> = { 100: 1, 500: 10, 3000: 60, 10000: 200 };

export type PoolCard = {
  key: string;
  version: "v3" | "v4";
  label: string;
  feePct: number;
  /** V3 only: the two balances, valued in the quote token. */
  size: number | null;
  sizeThen: number | null;
  /** Full-range fees as a share of value, per 30-day window, newest first. */
  windows: (number | null)[];
  priceMove: number | null;
  protocolFee: string;
  /** Why it is set aside, if it is. */
  aside: string | null;
};

const sub = (a: bigint, b: bigint) => (a - b + U256) % U256;
const sqrtFromX96 = (x: bigint) => Number(x) / 2 ** 96;
const sort = (a: Tok, b: Tok) => (BigInt(a.address) < BigInt(b.address) ? [a, b] : [b, a]);

type Candidate =
  | { version: "v3"; fee: number; t0: Tok; t1: Tok; pool: Address }
  | { version: "v4"; fee: number; t0: Tok; t1: Tok; id: Hex };

function candidates(key: PairKey): Candidate[] {
  const { base, quote } = PAIRS[key];
  const v3Tok = (s: string) => T[s === "ETH" ? "WETH" : s];
  const out: Candidate[] = [];
  const [a3, b3] = sort(v3Tok(base), v3Tok(quote));
  for (const fee of FEES) {
    const salt = keccak256(
      encodeAbiParameters(
        [{ type: "address" }, { type: "address" }, { type: "uint24" }],
        [a3.address, b3.address, fee],
      ),
    );
    out.push({
      version: "v3",
      fee,
      t0: a3,
      t1: b3,
      pool: getContractAddress({ opcode: "CREATE2", from: V3_FACTORY, salt, bytecodeHash: V3_INIT_CODE_HASH }),
    });
  }
  // V4 takes native ETH and WETH as different currencies; both are read.
  const v4Sets = [base, quote].includes("ETH")
    ? [
        [T[base], T[quote]],
        [v3Tok(base), v3Tok(quote)],
      ]
    : [[T[base], T[quote]]];
  for (const [x, y] of v4Sets) {
    const [a4, b4] = sort(x, y);
    for (const fee of FEES) {
      const id = keccak256(
        encodeAbiParameters(
          [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
          [a4.address, b4.address, fee, SPACING[fee], ZERO],
        ),
      );
      out.push({ version: "v4", fee, t0: a4, t1: b4, id });
    }
  }
  return out;
}

type Read = {
  sqrt: bigint;
  g0: bigint;
  g1: bigint;
  bal0?: bigint;
  bal1?: bigint;
  liq: bigint;
  protocol: number;
} | null;

async function readAt(cs: Candidate[], blockNumber: bigint): Promise<Read[]> {
  const c = chainClient();
  const calls: ContractFunctionParameters[] = cs.flatMap((x): readonly ContractFunctionParameters[] =>
    x.version === "v3"
      ? ([
          { address: x.pool, abi: v3PoolAbi, functionName: "slot0" },
          { address: x.pool, abi: v3PoolAbi, functionName: "feeGrowthGlobal0X128" },
          { address: x.pool, abi: v3PoolAbi, functionName: "feeGrowthGlobal1X128" },
          { address: x.pool, abi: v3PoolAbi, functionName: "liquidity" },
          { address: x.t0.address, abi: erc20Abi, functionName: "balanceOf", args: [x.pool] },
          { address: x.t1.address, abi: erc20Abi, functionName: "balanceOf", args: [x.pool] },
        ] as const)
      : ([
          { address: STATE_VIEW, abi: stateViewAbi, functionName: "getSlot0", args: [x.id] },
          { address: STATE_VIEW, abi: stateViewAbi, functionName: "getFeeGrowthGlobals", args: [x.id] },
          { address: STATE_VIEW, abi: stateViewAbi, functionName: "getLiquidity", args: [x.id] },
        ] as const),
  );
  const r = (await c.multicall({ contracts: calls, blockNumber })).map((x) =>
    x.status === "success" ? x.result : undefined,
  );
  const out: Read[] = [];
  let i = 0;
  for (const x of cs) {
    if (x.version === "v3") {
      const [s, g0, g1, liq, bal0, bal1] = r.slice(i, i + 6) as [
        readonly [bigint, number, number, number, number, number, boolean] | undefined,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
      ];
      i += 6;
      out.push(s ? { sqrt: s[0], g0, g1, liq, bal0, bal1, protocol: s[5] } : null);
    } else {
      const [s, g, liq] = r.slice(i, i + 3) as [
        readonly [bigint, number, number, number] | undefined,
        readonly [bigint, bigint] | undefined,
        bigint,
      ];
      i += 3;
      out.push(s && s[0] > BigInt(0) && g ? { sqrt: s[0], g0: g[0], g1: g[1], liq, protocol: s[2] } : null);
    }
  }
  return out;
}

function protocolText(c: Candidate, protocol: number): string {
  if (c.version === "v3") {
    const a = protocol & 15;
    return a ? `1/${a} of LP fees` : "none";
  }
  const a = protocol & 0xfff;
  return a ? `${(a / 1e4).toLocaleString("en-US", { maximumFractionDigits: 4 })}% added to swaps` : "none";
}

const cache = new Map<string, { at: number; p: Promise<{ cards: PoolCard[]; block: number; at: number }> }>();

export function readPair(key: PairKey) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.p;
  const p = load(key).catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, { at: Date.now(), p });
  return p;
}

async function load(key: PairKey) {
  const c = chainClient();
  const now = (await c.getBlockNumber()) - BigInt(5);
  const blocks = [0, 1, 2, 3].map((k) => now - BigInt(30 * k) * DAY);
  const cs = candidates(key);
  const [reads, nowBlock] = await Promise.all([
    Promise.all(blocks.map((b) => readAt(cs, b))),
    c.getBlock({ blockNumber: now }),
  ]);
  const { quote } = PAIRS[key];
  const isQuote = (t: Tok) => t.symbol === quote || (quote === "ETH" && t.symbol === "WETH");

  const cards: PoolCard[] = cs.flatMap((x, j): PoolCard[] => {
    const r = reads.map((rs) => rs[j]);
    const cur = r[0];
    if (!cur) return [];
    const quoteIs0 = isQuote(x.t0);
    // Full-range fee return over the window ending at k, valued at that block's price.
    const windows = [0, 1, 2].map((k) => {
      const end = r[k];
      const start = r[k + 1];
      if (!end || !start) return null;
      const sq = sqrtFromX96(end.sqrt);
      const P = sq * sq;
      return ((Number(sub(end.g0, start.g0)) / 2 ** 128) * P + Number(sub(end.g1, start.g1)) / 2 ** 128) / (2 * sq);
    });
    const price = (s: bigint) => {
      const sq = sqrtFromX96(s);
      const p01 = sq * sq * 10 ** (x.t0.decimals - x.t1.decimals);
      return quoteIs0 ? 1 / p01 : p01;
    };
    const valueQuote = (rd: NonNullable<Read>) => {
      if (rd.bal0 === undefined || rd.bal1 === undefined) return null;
      const h0 = Number(rd.bal0) / 10 ** x.t0.decimals;
      const h1 = Number(rd.bal1) / 10 ** x.t1.decimals;
      const p = price(rd.sqrt);
      return quoteIs0 ? h0 + h1 * p : h1 + h0 * p;
    };
    const size = valueQuote(cur);
    const ethLabel = x.version === "v4" && [x.t0, x.t1].some((t) => t.symbol === "WETH") ? " (WETH)" : "";
    // Liquidity in range, valued as if it were spread full range (2·L·√P): an
    // upper bound on the capital behind it, so a pool under the floor is thin.
    const floor = quote === "ETH" ? 20 : 50_000;
    const floorText = quote === "ETH" ? "20 ETH" : `50,000 ${quote}`;
    const inRangeValue = (rd: NonNullable<Read>) => {
      const sq = sqrtFromX96(rd.sqrt);
      const in1 = (2 * Number(rd.liq) * sq) / 10 ** x.t1.decimals;
      return quoteIs0 ? in1 / (sq * sq * 10 ** (x.t0.decimals - x.t1.decimals)) : in1;
    };
    let aside: string | null = null;
    if (cur.liq === BigInt(0)) aside = "no liquidity in range now";
    else if (windows[0] === null) aside = "younger than 30 days";
    else if (inRangeValue(cur) < floor) aside = `under ${floorText} in range now`;
    else if (r.some((rd) => rd && inRangeValue(rd) < floor))
      aside = `under ${floorText} in range at one of the reads 30, 60 or 90 days back, which inflates a fee figure`;
    else if (size !== null && size < floor) aside = `under ${floorText} in size`;
    else if (windows.some((w) => w !== null && w > 0.1))
      aside = "a 30-day fee figure above 10%, which thin liquidity or donations to the pool produce";
    return [
      {
        key: x.version === "v3" ? x.pool : x.id,
        version: x.version,
        label: `Uniswap ${x.version.toUpperCase()} · ${x.fee / 1e4}%${ethLabel}`,
        feePct: x.fee / 1e4,
        size,
        sizeThen: r[1] ? valueQuote(r[1]) : null,
        windows,
        priceMove: r[1] ? price(cur.sqrt) / price(r[1].sqrt) - 1 : null,
        protocolFee: protocolText(x, cur.protocol),
        aside,
      },
    ];
  });
  return { cards, block: Number(now), at: Number(nowBlock.timestamp) };
}
