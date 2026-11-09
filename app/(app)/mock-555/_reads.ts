import "server-only";

// ui-jobs 555, door 1 mock: one Uniswap V3 or V4 position on Ethereum, read
// from state at the head and at the block 30 days back (the at-block store's
// shape on the build), plus the position's own logs where the chain indexes
// them (V3 by token id; V4 only its mint). Days in range are read live here,
// one past block a day; on the build they come from the DEX lane's daily
// sample (decision 0058). Nothing here is shared with the live pages.

import { encodeAbiParameters, getContractAddress, keccak256, pad, parseAbi, toHex, type Address, type Hex } from "viem";
import { chainClient } from "@/lib/sources/chain/rpc";

const NPM: Address = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const V3_FACTORY: Address = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const V3_INIT_CODE_HASH: Hex = "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54";
const NPM_FIRST_BLOCK = BigInt(12_369_621);
const POSM: Address = "0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e";
const POSM_FIRST_BLOCK = BigInt(21_688_329);
const STATE_VIEW: Address = "0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227";
const ZERO: Address = "0x0000000000000000000000000000000000000000";
const DAY = BigInt(7200);
const Q128 = BigInt(2) ** BigInt(128);
const U256 = BigInt(2) ** BigInt(256);

const npmAbi = parseAbi([
  "function positions(uint256) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
  "function ownerOf(uint256) view returns (address)",
  "event IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "event DecreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "event Collect(uint256 indexed tokenId, address recipient, uint256 amount0, uint256 amount1)",
]);
const v3PoolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function feeGrowthGlobal0X128() view returns (uint256)",
  "function feeGrowthGlobal1X128() view returns (uint256)",
  "function liquidity() view returns (uint128)",
  "function ticks(int24) view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)",
]);
const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);
const posmAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "function getPoolAndPositionInfo(uint256 tokenId) view returns (PoolKey poolKey, uint256 info)",
  "function getPositionLiquidity(uint256 tokenId) view returns (uint128)",
  "function ownerOf(uint256) view returns (address)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed id)",
]);
const stateViewAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128)",
  "function getFeeGrowthGlobals(bytes32 poolId) view returns (uint256 feeGrowthGlobal0, uint256 feeGrowthGlobal1)",
  "function getFeeGrowthInside(bytes32 poolId, int24 tickLower, int24 tickUpper) view returns (uint256 feeGrowthInside0X128, uint256 feeGrowthInside1X128)",
  "function getPositionInfo(bytes32 poolId, address owner, int24 tickLower, int24 tickUpper, bytes32 salt) view returns (uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128)",
]);

/** v4-core `Hooks.sol`, bit 13 down to bit 0 of the hook's address. */
const HOOK_FLAGS = [
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

export type Version = "v3" | "v4";
export type Token = { address: Address; symbol: string; decimals: number };
export type Amounts = { base: number; quote: number };

export type PoolPosition = {
  version: Version;
  id: string;
  owner: Address;
  /** The pool's contract (V3) or its id in the PoolManager (V4). */
  pool: string;
  base: Token;
  quote: Token;
  feeLabel: string;
  dynamicFee: boolean;
  lpFeePct: number;
  hooks: Address | null;
  hookPermissions: string[];
  hasSubscriber: boolean;
  block: { now: number; nowAt: number; then: number; thenAt: number };
  /** Prices are quote per base, from the pool's own price. */
  price: number;
  priceThen: number | null;
  range: { low: number; high: number; full: boolean };
  inRange: boolean;
  side: "below" | "above" | "in";
  holds: Amounts;
  valueNow: number;
  uncollected: number;
  shareOfActive: number;
  fees30d: number | null;
  /** Value now against the same liquidity's tokens at the window's start, valued now. */
  againstHolding: number | null;
  againstHoldingWithFees: number | null;
  liquidityChanged: boolean | null;
  firstBlock: number | null;
  firstAt: number | null;
  daysInRange: { inRange: number; read: number } | null;
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
  protocolCut: string;
  reads: { requests: number; ms: number };
};

const STABLE = new Set(["USDC", "USDT", "DAI", "USDS", "EURC", "PYUSD", "RLUSD", "FRAX", "GHO", "USDe"]);
const rank = (s: string) => (STABLE.has(s) ? 3 : s === "ETH" || s === "WETH" ? 2 : 1);
const sqrtAtTick = (t: number) => Math.pow(1.0001, t / 2);
const sub = (a: bigint, b: bigint) => (a - b + U256) % U256;
const sqrtFromX96 = (x: bigint) => Number(x) / 2 ** 96;

function amountsFor(L: bigint, sqrtP: number, tl: number, tu: number): [number, number] {
  const sa = sqrtAtTick(tl);
  const sb = sqrtAtTick(tu);
  const l = Number(L);
  if (sqrtP <= sa) return [(l * (sb - sa)) / (sa * sb), 0];
  if (sqrtP >= sb) return [0, l * (sb - sa)];
  return [(l * (sb - sqrtP)) / (sqrtP * sb), l * (sqrtP - sa)];
}

type TickTuple = readonly [bigint, bigint, bigint, bigint, bigint, bigint, number, boolean];
function v3Inside(cur: number, g0: bigint, g1: bigint, lo: TickTuple, hi: TickTuple, tl: number, tu: number) {
  const b0 = cur >= tl ? lo[2] : sub(g0, lo[2]);
  const b1 = cur >= tl ? lo[3] : sub(g1, lo[3]);
  const a0 = cur < tu ? hi[2] : sub(g0, hi[2]);
  const a1 = cur < tu ? hi[3] : sub(g1, hi[3]);
  return [sub(sub(g0, b0), a0), sub(sub(g1, b1), a1)] as const;
}

/** Everything priced in token1 raw units first, then turned into the quote token. */
class Pricer {
  constructor(
    readonly sqrt: number,
    readonly d0: number,
    readonly d1: number,
    readonly quoteIs0: boolean,
  ) {}
  get P() {
    return this.sqrt * this.sqrt;
  }
  /** Human token1 per token0. */
  get p01() {
    return this.P * 10 ** (this.d0 - this.d1);
  }
  /** raw token0, raw token1 → quote, human. */
  value(a0: number, a1: number) {
    const in1 = (a0 * this.P + a1) / 10 ** this.d1;
    return this.quoteIs0 ? in1 / this.p01 : in1;
  }
  amounts(a0: number, a1: number): Amounts {
    const h0 = a0 / 10 ** this.d0;
    const h1 = a1 / 10 ** this.d1;
    return this.quoteIs0 ? { base: h1, quote: h0 } : { base: h0, quote: h1 };
  }
  priceAt(tickOrNull: number | null, sqrt?: number) {
    const p01 =
      tickOrNull === null
        ? sqrt! * sqrt! * 10 ** (this.d0 - this.d1)
        : Math.pow(1.0001, tickOrNull) * 10 ** (this.d0 - this.d1);
    return this.quoteIs0 ? 1 / p01 : p01;
  }
}

const cache = new Map<string, { at: number; p: Promise<PoolPosition> }>();

export function readPosition(version: Version, id: bigint): Promise<PoolPosition> {
  const key = `${version}:${id}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.p;
  const p = (version === "v3" ? readV3(id) : readV4(id)).catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, { at: Date.now(), p });
  return p;
}

async function blocks() {
  const c = chainClient();
  const now = (await c.getBlockNumber()) - BigInt(5);
  const then = now - BigInt(30) * DAY;
  const [bn, bt] = await Promise.all([c.getBlock({ blockNumber: now }), c.getBlock({ blockNumber: then })]);
  return { now, then, nowAt: Number(bn.timestamp), thenAt: Number(bt.timestamp) };
}

async function tokenMeta(addrs: Address[], blockNumber: bigint): Promise<Token[]> {
  const c = chainClient();
  const real = addrs.filter((a) => a !== ZERO);
  const r = await c.multicall({
    contracts: real.flatMap((a) => [
      { address: a, abi: erc20Abi, functionName: "decimals" } as const,
      { address: a, abi: erc20Abi, functionName: "symbol" } as const,
    ]),
    blockNumber,
  });
  const m = new Map<Address, Token>();
  real.forEach((a, i) =>
    m.set(a, { address: a, decimals: Number(r[2 * i].result ?? 18), symbol: String(r[2 * i + 1].result ?? "?") }),
  );
  return addrs.map((a) => (a === ZERO ? { address: ZERO, decimals: 18, symbol: "ETH" } : m.get(a)!));
}

async function daysInRange(
  read: (b: bigint) => Promise<number | null>,
  now: bigint,
  from: bigint | null,
  tl: number,
  tu: number,
) {
  const days = Array.from({ length: 30 }, (_, i) => now - BigInt(i) * DAY).filter((b) => from === null || b >= from);
  let inRange = 0;
  let readN = 0;
  for (let i = 0; i < days.length; i += 6) {
    const ticks = await Promise.all(days.slice(i, i + 6).map((b) => read(b).catch(() => null)));
    for (const t of ticks) {
      if (t === null) continue;
      readN++;
      if (t >= tl && t < tu) inRange++;
    }
  }
  return { inRange, read: readN };
}

function cutV3(feeProtocol: number) {
  const a = feeProtocol & 15;
  const b = feeProtocol >> 4;
  if (!a && !b) return "Uniswap takes none of this pool's fees.";
  if (a === b) return `Uniswap takes 1/${a} of the swap fees, out of what liquidity providers earn.`;
  return `Uniswap takes ${a ? `1/${a}` : "none"} of fees paid in one token and ${b ? `1/${b}` : "none"} in the other, out of what liquidity providers earn.`;
}
function cutV4(protocolFee: number) {
  const a = protocolFee & 0xfff;
  const b = protocolFee >> 12;
  if (!a && !b) return "Uniswap charges no protocol fee on this pool.";
  const pct = (x: number) => `${(x / 1e4).toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;
  return a === b
    ? `Uniswap adds a ${pct(a)} protocol fee to each swap, paid by the swapper on top of the pool's fee.`
    : `Uniswap adds a ${pct(a)} or ${pct(b)} protocol fee to each swap, by direction, paid by the swapper on top of the pool's fee.`;
}

async function readV3(id: bigint): Promise<PoolPosition> {
  const t0 = performance.now();
  const c = chainClient();
  const B = await blocks();
  const [pos, owner] = await c.multicall({
    contracts: [
      { address: NPM, abi: npmAbi, functionName: "positions", args: [id] },
      { address: NPM, abi: npmAbi, functionName: "ownerOf", args: [id] },
    ],
    blockNumber: B.now,
    allowFailure: false,
  });
  const [, , token0, token1, fee, tl, tu, L, last0, last1, owed0, owed1] = pos;
  const salt = keccak256(
    encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint24" }], [token0, token1, fee]),
  );
  const pool = getContractAddress({ opcode: "CREATE2", from: V3_FACTORY, salt, bytecodeHash: V3_INIT_CODE_HASH });
  const poolCalls = [
    { address: pool, abi: v3PoolAbi, functionName: "slot0" },
    { address: pool, abi: v3PoolAbi, functionName: "feeGrowthGlobal0X128" },
    { address: pool, abi: v3PoolAbi, functionName: "feeGrowthGlobal1X128" },
    { address: pool, abi: v3PoolAbi, functionName: "ticks", args: [tl] },
    { address: pool, abi: v3PoolAbi, functionName: "ticks", args: [tu] },
    { address: token0, abi: erc20Abi, functionName: "balanceOf", args: [pool] },
    { address: token1, abi: erc20Abi, functionName: "balanceOf", args: [pool] },
    { address: pool, abi: v3PoolAbi, functionName: "liquidity" },
  ] as const;
  const [now, then, [t0m, t1m], logs] = await Promise.all([
    c.multicall({ contracts: poolCalls, blockNumber: B.now, allowFailure: false }),
    c.multicall({
      contracts: [{ address: NPM, abi: npmAbi, functionName: "positions", args: [id] }, ...poolCalls] as const,
      blockNumber: B.then,
    }),
    tokenMeta([token0, token1], B.now),
    Promise.all(
      (["IncreaseLiquidity", "DecreaseLiquidity", "Collect"] as const).map((eventName) =>
        c.getContractEvents({
          address: NPM,
          abi: npmAbi,
          eventName,
          args: { tokenId: id },
          fromBlock: NPM_FIRST_BLOCK,
          toBlock: B.now,
        }),
      ),
    ),
  ]);
  const [s0, g0, g1, lo, hi, bal0, bal1, activeL] = now;
  const quoteIs0 = rank(t0m.symbol) > rank(t1m.symbol);
  const px = new Pricer(sqrtFromX96(s0[0]), t0m.decimals, t1m.decimals, quoteIs0);
  const [in0, in1] = v3Inside(s0[1], g0, g1, lo, hi, tl, tu);
  const fees0 = owed0 + (L * sub(in0, last0)) / Q128;
  const fees1 = owed1 + (L * sub(in1, last1)) / Q128;
  const [a0, a1] = amountsFor(L, px.sqrt, tl, tu);
  const valueNow = px.value(a0, a1);

  // The window.
  const posThen = then[0].status === "success" ? then[0].result : null;
  const s30 = then[1].status === "success" ? (then[1].result as typeof s0) : null;
  let fees30d: number | null = null;
  let againstHolding: number | null = null;
  let againstHoldingWithFees: number | null = null;
  let liquidityChanged: boolean | null = null;
  if (posThen && s30) {
    const L30 = posThen[7];
    liquidityChanged = L30 !== L;
    if (!liquidityChanged && L > BigInt(0)) {
      const g0b = then[2].result as bigint;
      const g1b = then[3].result as bigint;
      const [i0, i1] = v3Inside(s30[1], g0b, g1b, then[4].result as TickTuple, then[5].result as TickTuple, tl, tu);
      fees30d = px.value(Number((L * sub(in0, i0)) / Q128), Number((L * sub(in1, i1)) / Q128));
      const [h0, h1] = amountsFor(L, sqrtFromX96(s30[0]), tl, tu);
      const hold = px.value(h0, h1);
      againstHolding = valueNow / hold - 1;
      againstHoldingWithFees = (valueNow + fees30d) / hold - 1;
    }
  }
  const fullRangeFees =
    s30 && then[2].status === "success"
      ? ((Number(sub(g0, then[2].result as bigint)) / 2 ** 128) * px.P +
          Number(sub(g1, then[3].result as bigint)) / 2 ** 128) /
        (2 * px.sqrt)
      : null;

  // The position's own history.
  const [inc, dec, col] = logs;
  const sum = (xs: { args: { amount0?: bigint; amount1?: bigint } }[]) =>
    [
      xs.reduce((s, x) => s + Number(x.args.amount0 ?? BigInt(0)), 0),
      xs.reduce((s, x) => s + Number(x.args.amount1 ?? BigInt(0)), 0),
    ] as const;
  const firstBlock = inc[0]?.blockNumber ?? null;
  const firstAt = firstBlock ? Number((await c.getBlock({ blockNumber: firstBlock })).timestamp) : null;
  const [d0, d1] = sum(inc);
  const [w0, w1] = sum(dec);
  const [c0, c1] = sum(col);
  const uncollected = px.value(Number(fees0), Number(fees1));
  const sinceDeposit = inc.length
    ? {
        deposited: px.amounts(d0, d1),
        withdrawn: px.amounts(w0, w1),
        collected: px.amounts(c0, c1),
        holdValue: px.value(d0, d1),
        // Collect pays out withdrawn principal and fees together, so value now + uncollected + collected is the whole.
        nowWithEverything: valueNow + uncollected + px.value(c0, c1),
        events: { increase: inc.length, decrease: dec.length, collect: col.length },
      }
    : null;

  const dir = await daysInRange(
    async (b) => (await c.readContract({ address: pool, abi: v3PoolAbi, functionName: "slot0", blockNumber: b }))[1],
    B.now,
    firstBlock,
    tl,
    tu,
  );

  const lowP = px.priceAt(tl);
  const highP = px.priceAt(tu);
  const inRange = s0[1] >= tl && s0[1] < tu;
  const priceNow = px.priceAt(null, px.sqrt);
  return {
    version: "v3",
    id: String(id),
    owner,
    pool,
    base: quoteIs0 ? t1m : t0m,
    quote: quoteIs0 ? t0m : t1m,
    feeLabel: `${fee / 1e4}%`,
    dynamicFee: false,
    lpFeePct: fee / 1e4,
    hooks: null,
    hookPermissions: [],
    hasSubscriber: false,
    block: { now: Number(B.now), nowAt: B.nowAt, then: Number(B.then), thenAt: B.thenAt },
    price: priceNow,
    priceThen: s30 ? px.priceAt(null, sqrtFromX96(s30[0])) : null,
    range: { low: Math.min(lowP, highP), high: Math.max(lowP, highP), full: tl <= -887000 && tu >= 887000 },
    inRange,
    side: inRange ? "in" : priceNow < Math.min(lowP, highP) ? "below" : "above",
    holds: px.amounts(a0, a1),
    valueNow,
    uncollected,
    shareOfActive: inRange && activeL > BigInt(0) ? Number(L) / Number(activeL) : 0,
    fees30d,
    againstHolding,
    againstHoldingWithFees,
    liquidityChanged,
    firstBlock: firstBlock ? Number(firstBlock) : null,
    firstAt,
    daysInRange: dir,
    sinceDeposit,
    pool30d: {
      fullRangeFees,
      balances: px.amounts(Number(bal0), Number(bal1)),
      balancesThen: then[6].status === "success" ? px.amounts(Number(then[6].result), Number(then[7].result)) : null,
    },
    protocolCut: cutV3(s0[5]),
    reads: { requests: 0, ms: Math.round(performance.now() - t0) },
  };
}

function decodeInfo(info: bigint) {
  const s24 = (x: bigint) => {
    const n = Number(x & BigInt(0xffffff));
    return n >= 0x800000 ? n - 0x1000000 : n;
  };
  return {
    hasSubscriber: (info & BigInt(0xff)) !== BigInt(0),
    tickLower: s24(info >> BigInt(8)),
    tickUpper: s24(info >> BigInt(32)),
  };
}

async function readV4(id: bigint): Promise<PoolPosition> {
  const t0 = performance.now();
  const c = chainClient();
  const B = await blocks();
  const [[key, info], L, owner] = await c.multicall({
    contracts: [
      { address: POSM, abi: posmAbi, functionName: "getPoolAndPositionInfo", args: [id] },
      { address: POSM, abi: posmAbi, functionName: "getPositionLiquidity", args: [id] },
      { address: POSM, abi: posmAbi, functionName: "ownerOf", args: [id] },
    ],
    blockNumber: B.now,
    allowFailure: false,
  });
  const { tickLower: tl, tickUpper: tu, hasSubscriber } = decodeInfo(info);
  const pid = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
    ),
  );
  const saltId = pad(toHex(id), { size: 32 });
  const sv = <F extends "getSlot0" | "getFeeGrowthInside" | "getPositionInfo" | "getFeeGrowthGlobals" | "getLiquidity">(
    functionName: F,
    args: readonly unknown[],
  ) => ({ address: STATE_VIEW, abi: stateViewAbi, functionName, args }) as const;
  const poolCalls = [
    sv("getSlot0", [pid]),
    sv("getFeeGrowthInside", [pid, tl, tu]),
    sv("getPositionInfo", [pid, POSM, tl, tu, saltId]),
    sv("getFeeGrowthGlobals", [pid]),
    sv("getLiquidity", [pid]),
  ];
  const [now, then, [t0m, t1m], mint] = await Promise.all([
    c.multicall({ contracts: poolCalls, blockNumber: B.now, allowFailure: false }) as Promise<unknown[]>,
    c.multicall({ contracts: poolCalls, blockNumber: B.then }) as Promise<{ status: string; result?: unknown }[]>,
    tokenMeta([key.currency0, key.currency1], B.now),
    c.getContractEvents({
      address: POSM,
      abi: posmAbi,
      eventName: "Transfer",
      args: { from: ZERO, id },
      fromBlock: POSM_FIRST_BLOCK,
      toBlock: B.now,
    }),
  ]);
  const s0 = now[0] as readonly [bigint, number, number, number];
  const inside = now[1] as readonly [bigint, bigint];
  const pinfo = now[2] as readonly [bigint, bigint, bigint];
  const glob = now[3] as readonly [bigint, bigint];
  const activeL = now[4] as bigint;
  const quoteIs0 = rank(t0m.symbol) > rank(t1m.symbol);
  const px = new Pricer(sqrtFromX96(s0[0]), t0m.decimals, t1m.decimals, quoteIs0);
  const fees0 = (L * sub(inside[0], pinfo[1])) / Q128;
  const fees1 = (L * sub(inside[1], pinfo[2])) / Q128;
  const [a0, a1] = amountsFor(L, px.sqrt, tl, tu);
  const valueNow = px.value(a0, a1);

  const s30 =
    then[0].status === "success" && (then[0].result as readonly [bigint])[0] > BigInt(0)
      ? (then[0].result as typeof s0)
      : null;
  let fees30d: number | null = null;
  let againstHolding: number | null = null;
  let againstHoldingWithFees: number | null = null;
  let liquidityChanged: boolean | null = null;
  let fullRangeFees: number | null = null;
  if (s30) {
    const inside30 = then[1].result as readonly [bigint, bigint];
    const L30 = (then[2].result as readonly [bigint])[0];
    const glob30 = then[3].result as readonly [bigint, bigint];
    fullRangeFees =
      ((Number(sub(glob[0], glob30[0])) / 2 ** 128) * px.P + Number(sub(glob[1], glob30[1])) / 2 ** 128) /
      (2 * px.sqrt);
    liquidityChanged = L30 !== L;
    if (!liquidityChanged && L > BigInt(0)) {
      fees30d = px.value(
        Number((L * sub(inside[0], inside30[0])) / Q128),
        Number((L * sub(inside[1], inside30[1])) / Q128),
      );
      const [h0, h1] = amountsFor(L, sqrtFromX96(s30[0]), tl, tu);
      const hold = px.value(h0, h1);
      againstHolding = valueNow / hold - 1;
      againstHoldingWithFees = (valueNow + fees30d) / hold - 1;
    }
  }
  const firstBlock = mint[0]?.blockNumber ?? null;
  const firstAt = firstBlock ? Number((await c.getBlock({ blockNumber: firstBlock })).timestamp) : null;
  const dir = await daysInRange(
    async (b) => {
      const s = await c.readContract({
        address: STATE_VIEW,
        abi: stateViewAbi,
        functionName: "getSlot0",
        args: [pid],
        blockNumber: b,
      });
      return s[0] === BigInt(0) ? null : s[1];
    },
    B.now,
    firstBlock,
    tl,
    tu,
  );
  const hookBits = BigInt(key.hooks) & BigInt(0x3fff);
  const hookPermissions =
    key.hooks === ZERO ? [] : HOOK_FLAGS.filter((_, i) => (hookBits >> BigInt(13 - i)) & BigInt(1));
  const lowP = px.priceAt(tl);
  const highP = px.priceAt(tu);
  const inRange = s0[1] >= tl && s0[1] < tu;
  const priceNow = px.priceAt(null, px.sqrt);
  const dynamicFee = key.fee === 0x800000;
  return {
    version: "v4",
    id: String(id),
    owner,
    pool: pid,
    base: quoteIs0 ? t1m : t0m,
    quote: quoteIs0 ? t0m : t1m,
    feeLabel: dynamicFee ? `set by its hook, ${s0[3] / 1e4}% now` : `${key.fee / 1e4}%`,
    dynamicFee,
    lpFeePct: s0[3] / 1e4,
    hooks: key.hooks === ZERO ? null : key.hooks,
    hookPermissions,
    hasSubscriber,
    block: { now: Number(B.now), nowAt: B.nowAt, then: Number(B.then), thenAt: B.thenAt },
    price: priceNow,
    priceThen: s30 ? px.priceAt(null, sqrtFromX96(s30[0])) : null,
    range: { low: Math.min(lowP, highP), high: Math.max(lowP, highP), full: tl <= -887000 && tu >= 887000 },
    inRange,
    side: inRange ? "in" : priceNow < Math.min(lowP, highP) ? "below" : "above",
    holds: px.amounts(a0, a1),
    valueNow,
    uncollected: px.value(Number(fees0), Number(fees1)),
    shareOfActive: inRange && activeL > BigInt(0) ? Number(L) / Number(activeL) : 0,
    fees30d,
    againstHolding,
    againstHoldingWithFees,
    liquidityChanged,
    firstBlock: firstBlock ? Number(firstBlock) : null,
    firstAt,
    daysInRange: dir,
    sinceDeposit: null,
    pool30d: { fullRangeFees, balances: null, balancesThen: null },
    protocolCut: cutV4(s0[2]),
    reads: { requests: 0, ms: Math.round(performance.now() - t0) },
  };
}
