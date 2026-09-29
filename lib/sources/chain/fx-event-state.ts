// One f(x) position read at the blocks around its timeline rows: getPosition
// and getPositionDebtRatio at block − 1 and at the block, so a row can state
// what it changed (a rebalance moves the position with no event of its own,
// and the Operate event carries no debt ratio). The wstETH pool adds the
// wstETH→stETH rate at each block (wstETH.stEthPerToken), which turns token
// amounts on the row into the pool's stETH-equivalent unit.
//
// With `prices`, each block also carries the pool oracle's anchor and min legs
// (pool.priceOracle().getPrice()): the debt ratio is judged at the anchor, and
// borrowing, withdrawing, rebalancing and liquidating at the min
// (PositionLogic.getPositionDebtRatio; BasePool operate / rebalance /
// liquidate). Two more eth_calls per block.
//
// With `tick` (one block only), the tick the position sits in at that block:
// positionData(id) names the tree node its shares were stored in at its last
// own transaction; a rebalance, liquidation or redemption that moved that tick
// gives the node a parent in the tick the shares went to, so the walk up the
// parents (tickTreeData(node).metadata: parent in bits 0–47, tick in 48–63)
// ends at the node that holds them now, and its tick is the position's tick
// (TickLogic.sol, _getRootNode). One eth_call per node on the path.
//
// A single-row read may also ask for what the transaction was charged
// (`tx`): the pool's fee schedule for the manager's caller at block − 1
// (PoolConfiguration.getPoolFeeRatio(pool, caller), which falls back to the
// pool's default when the caller has no schedule of its own; the manager
// charges its msg.sender), the default beside it, and the manager's share of
// a rebalance or liquidation bonus (getLiquidationExpenseRatio). The caller is
// the transaction's sender when it called the manager, else the account that
// called the manager inside it (debug_traceTransaction, callTracer). The
// receipt names a filled f(x) limit order (FillOrder from the Limit Order
// Manager: the holder who signed it and the contract that filled it).
// PoolConfiguration exists from mid-2025; before it the Operate event's own
// `protocolFees` carried the fee.
//
// Calls: one eth_call (Multicall3) per distinct block, plus, with `tx`, one
// transaction read, one trace, one receipt and two fee-ratio calls. A mined block never changes, so
// every answer is kept in process memory and the route caches it at the edge.
//
// SERVER-ONLY.

import { getAddress, parseAbi } from "viem";
import { alchemyClient } from "./rpc";
import { FX_ADDRESSES, FX_POOLS, type FxPoolKey } from "@/lib/fx/asset-catalog";

const POOL_ABI = parseAbi([
  "function getPosition(uint256) view returns (uint256 rawColls, uint256 rawDebts)",
  "function getPositionDebtRatio(uint256) view returns (uint256)",
  "function getRebalanceRatios() view returns (uint256 debtRatio, uint256 bonusRatio)",
  "function getLiquidateRatios() view returns (uint256 debtRatio, uint256 bonusRatio)",
  "function priceOracle() view returns (address)",
  "function positionData(uint256) view returns (int16 tick, uint48 nodeId, uint96 colls, uint96 debts)",
  "function tickTreeData(uint256) view returns (bytes32 metadata, bytes32 value)",
]);
const ORACLE_ABI = parseAbi(["function getPrice() view returns (uint256 anchor, uint256 min, uint256 max)"]);
const WSTETH_ABI = parseAbi(["function stEthPerToken() view returns (uint256)"]);
const PM_ABI = parseAbi([
  "function configuration() view returns (address)",
  "function getLiquidationExpenseRatio() view returns (uint256)",
]);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const CONFIG_ABI = parseAbi([
  "function getPoolFeeRatio(address,address) view returns (uint256,uint256,uint256,uint256)",
]);

/** The position at one block, 1e18-scaled integers as strings: collateral in
 *  the pool's normalized unit, debt in fxUSD, the debt ratio 0–1e18, the
 *  wstETH→stETH rate (wstETH pool only), and the pool's rebalance and
 *  liquidation lines (debt ratio 1e18, bonus 1e9). */
export interface FxStateAt {
  block: number;
  colls: string | null;
  debts: string | null;
  ratio: string | null;
  rate: string | null;
  rebalanceLine?: string | null;
  rebalanceBonus?: string | null;
  liquidateLine?: string | null;
  liquidateBonus?: string | null;
  /** With `prices`: the oracle's anchor and min legs, USD per normalized
   *  unit, 1e18. */
  anchorPrice?: string | null;
  minPrice?: string | null;
  /** With `tick`: the tick the position's shares sit in at this block. */
  tick?: number | null;
}

/** Fee ratios (fractions, 1e9 on chain) the pool applied to the caller. */
export interface FxFeeSchedule {
  /** The account that called the manager (the fee is charged to it). */
  caller: string;
  supply: number;
  withdraw: number;
  borrow: number;
  repay: number;
  /** The pool's default schedule at the same block; `custom` when the
   *  caller's differs from it. */
  defaults?: { supply: number; withdraw: number; borrow: number; repay: number } | null;
  custom?: boolean;
  /** The transaction's sender and the contract it called. */
  signer?: string;
  target?: string | null;
  /** A filled f(x) limit order: the holder who signed it, the contract that
   *  filled it. */
  limitOrder?: { manager: string; maker: string; taker: string } | null;
}

/** f(x) Limit Order Manager (EIP-712 name "f(x) Limit Order Manager") and its
 *  FillOrder(orderHash, maker, taker, pool, positionId, …) topic. */
export const FX_LIMIT_ORDER_MANAGER = "0x112873b395b98287f3a4db266a58e2d01779ad96";
const FILL_ORDER_TOPIC = "0x75cd2dd4ac65c65f90b9260abea4acc14dbec58ec96cd2ce26ab5195a6e0aedb";

export interface FxEventState {
  pool: FxPoolKey;
  id: string;
  /** Keyed by block number: each asked block and the block before it. */
  reads: Record<string, FxStateAt>;
  /** With `tx`: the schedule in force for the caller, null before
   *  PoolConfiguration existed. */
  fees?: FxFeeSchedule | null;
  /** The manager's share of a rebalance/liquidation bonus (0.1 = 10%), read
   *  at the first asked block − 1. */
  expenseRatio?: number | null;
}

type Res = { status: string; result?: unknown };
const ok = <T>(r: Res | undefined): T | null => (r?.status === "success" && r.result != null ? (r.result as T) : null);

const CACHE_MAX = 6000;
const stateCache = new Map<string, Promise<FxStateAt>>();
const extraCache = new Map<string, Promise<unknown>>();

function remember<T>(map: Map<string, Promise<T>>, key: string, make: () => Promise<T>): Promise<T> {
  const hit = map.get(key);
  if (hit) return hit;
  if (map.size >= CACHE_MAX) {
    const oldest = map.keys().next().value;
    if (oldest != null) map.delete(oldest);
  }
  const p = make();
  map.set(key, p);
  p.catch(() => map.delete(key));
  return p;
}

function readPrices(pool: FxPoolKey, block: number): Promise<{ anchor: string; min: string } | null> {
  return remember(extraCache, `px:${pool}:${block}`, async () => {
    const client = alchemyClient();
    const at = BigInt(block);
    const oracle = (await client.readContract({
      address: getAddress(FX_POOLS[pool].address),
      abi: POOL_ABI,
      functionName: "priceOracle",
      blockNumber: at,
    })) as `0x${string}`;
    const p = (await client.readContract({
      address: getAddress(oracle),
      abi: ORACLE_ABI,
      functionName: "getPrice",
      blockNumber: at,
    })) as readonly [bigint, bigint, bigint];
    return { anchor: p[0].toString(), min: p[1].toString() };
  }) as Promise<{ anchor: string; min: string } | null>;
}

async function readAtWithPrices(pool: FxPoolKey, id: bigint, block: number): Promise<FxStateAt> {
  const [s, px] = await Promise.all([readAt(pool, id, block), readPrices(pool, block).catch(() => null)]);
  return { ...s, anchorPrice: px?.anchor ?? null, minPrice: px?.min ?? null };
}

/** The position's tick at `block`: its stored tree node, then up the parent
 *  links to the node that holds its shares now. Null for a position with no
 *  node (never opened) or a path longer than 64 nodes. */
function readTick(pool: FxPoolKey, id: bigint, block: number): Promise<number | null> {
  return remember(extraCache, `tick:${pool}:${id}:${block}`, async () => {
    const client = alchemyClient();
    const address = getAddress(FX_POOLS[pool].address);
    const at = BigInt(block);
    const pd = (await client.readContract({
      address,
      abi: POOL_ABI,
      functionName: "positionData",
      args: [id],
      blockNumber: at,
    })) as readonly [number, number, bigint, bigint];
    let node = BigInt(pd[1]);
    if (node === BigInt(0)) return null;
    const mask48 = (BigInt(1) << BigInt(48)) - BigInt(1);
    for (let hop = 0; hop < 64; hop++) {
      const [meta] = (await client.readContract({
        address,
        abi: POOL_ABI,
        functionName: "tickTreeData",
        args: [node],
        blockNumber: at,
      })) as readonly [`0x${string}`, `0x${string}`];
      const m = BigInt(meta);
      const parent = m & mask48;
      if (parent === BigInt(0)) {
        const raw = Number((m >> BigInt(48)) & BigInt(0xffff));
        return raw >= 0x8000 ? raw - 0x10000 : raw;
      }
      node = parent;
    }
    return null;
  }) as Promise<number | null>;
}

function readAt(pool: FxPoolKey, id: bigint, block: number): Promise<FxStateAt> {
  return remember(stateCache, `${pool}:${id}:${block}`, async () => {
    const address = getAddress(FX_POOLS[pool].address);
    const contracts = [
      { address, abi: POOL_ABI, functionName: "getPosition", args: [id] },
      { address, abi: POOL_ABI, functionName: "getPositionDebtRatio", args: [id] },
      { address, abi: POOL_ABI, functionName: "getRebalanceRatios" },
      { address, abi: POOL_ABI, functionName: "getLiquidateRatios" },
      ...(pool === "wsteth"
        ? [{ address: getAddress(FX_POOLS.wsteth.tokenAddress), abi: WSTETH_ABI, functionName: "stEthPerToken" }]
        : []),
    ];
    const r = (await alchemyClient().multicall({
      allowFailure: true,
      blockNumber: BigInt(block),
      contracts: contracts as never,
    })) as Res[];
    const pos = ok<readonly [bigint, bigint]>(r[0]);
    const ratio = ok<bigint>(r[1]);
    const reb = ok<readonly [bigint, bigint]>(r[2]);
    const liq = ok<readonly [bigint, bigint]>(r[3]);
    const rate = pool === "wsteth" ? ok<bigint>(r[4]) : null;
    return {
      block,
      colls: pos ? pos[0].toString() : null,
      debts: pos ? pos[1].toString() : null,
      ratio: ratio != null ? ratio.toString() : null,
      rate: rate != null ? rate.toString() : null,
      rebalanceLine: reb ? reb[0].toString() : null,
      rebalanceBonus: reb ? reb[1].toString() : null,
      liquidateLine: liq ? liq[0].toString() : null,
      liquidateBonus: liq ? liq[1].toString() : null,
    };
  });
}

async function readManager(block: number): Promise<{ config: string | null; expense: number | null }> {
  return remember(extraCache, `pm:${block}`, async () => {
    const pm = getAddress(FX_ADDRESSES.POOL_MANAGER);
    const r = (await alchemyClient().multicall({
      allowFailure: true,
      blockNumber: BigInt(block),
      contracts: [
        { address: pm, abi: PM_ABI, functionName: "configuration" },
        { address: pm, abi: PM_ABI, functionName: "getLiquidationExpenseRatio" },
      ],
    })) as Res[];
    const config = ok<string>(r[0]);
    const expense = ok<bigint>(r[1]);
    return { config: config ?? null, expense: expense != null ? Number(expense) / 1e9 : null };
  }) as Promise<{ config: string | null; expense: number | null }>;
}

type CallFrame = { type?: string; from?: string; to?: string; calls?: CallFrame[] };

/** The first account that called the manager inside the transaction. */
function managerCaller(frame: CallFrame | null): string | null {
  if (!frame) return null;
  if (frame.type === "CALL" && frame.to?.toLowerCase() === FX_ADDRESSES.POOL_MANAGER && frame.from)
    return frame.from.toLowerCase();
  for (const c of frame.calls ?? []) {
    const hit = managerCaller(c);
    if (hit) return hit;
  }
  return null;
}

const feeRatios = (r: readonly [bigint, bigint, bigint, bigint]) => ({
  supply: Number(r[0]) / 1e9,
  withdraw: Number(r[1]) / 1e9,
  borrow: Number(r[2]) / 1e9,
  repay: Number(r[3]) / 1e9,
});

async function readFees(pool: FxPoolKey, tx: `0x${string}`, block: number): Promise<FxFeeSchedule | null> {
  return remember(extraCache, `fee:${pool}:${tx}`, async () => {
    const client = alchemyClient();
    const [t, pm, receipt] = await Promise.all([
      client.getTransaction({ hash: tx }),
      readManager(block),
      client.getTransactionReceipt({ hash: tx }).catch(() => null),
    ]);
    if (!pm.config) return null;
    const target = t.to ? t.to.toLowerCase() : null;
    let caller: string | null = target === FX_ADDRESSES.POOL_MANAGER ? t.from.toLowerCase() : null;
    if (!caller) {
      const trace = (await client
        .request({ method: "debug_traceTransaction" as never, params: [tx, { tracer: "callTracer" }] as never })
        .catch(() => null)) as CallFrame | null;
      caller = managerCaller(trace) ?? target;
    }
    if (!caller) return null;
    const poolAddr = getAddress(FX_POOLS[pool].address);
    const at = BigInt(block);
    const read = (who: string) =>
      client.readContract({
        address: getAddress(pm.config!),
        abi: CONFIG_ABI,
        functionName: "getPoolFeeRatio",
        args: [poolAddr, getAddress(who)],
        blockNumber: at,
      }) as Promise<readonly [bigint, bigint, bigint, bigint]>;
    const [mine, dflt] = await Promise.all([read(caller), read(ZERO_ADDRESS).catch(() => null)]);
    const fees = feeRatios(mine);
    const defaults = dflt ? feeRatios(dflt) : null;
    const fill = receipt?.logs.find(
      (l) => l.address.toLowerCase() === FX_LIMIT_ORDER_MANAGER && l.topics[0] === FILL_ORDER_TOPIC,
    );
    const topicAddr = (h?: string) => (h ? `0x${h.slice(26)}`.toLowerCase() : "");
    return {
      caller,
      ...fees,
      defaults,
      custom:
        defaults != null &&
        (defaults.supply !== fees.supply ||
          defaults.withdraw !== fees.withdraw ||
          defaults.borrow !== fees.borrow ||
          defaults.repay !== fees.repay),
      signer: t.from.toLowerCase(),
      target,
      limitOrder: fill
        ? { manager: FX_LIMIT_ORDER_MANAGER, maker: topicAddr(fill.topics[2]), taker: topicAddr(fill.topics[3]) }
        : null,
    };
  }) as Promise<FxFeeSchedule | null>;
}

/** At most this many rows' blocks per request (the card's rebalance split). */
export const FX_EVENT_STATE_MAX_BLOCKS = 60;

export async function readFxEventState(
  pool: FxPoolKey,
  id: string,
  blocks: number[],
  tx?: `0x${string}`,
  prices = false,
  tick = false,
): Promise<FxEventState> {
  const pid = BigInt(id);
  const wanted = [...new Set(blocks.flatMap((b) => [b - 1, b]))].sort((a, b) => a - b);
  const reads: Record<string, FxStateAt> = {};
  // Four at a time: a card's split can ask for dozens of blocks.
  for (let i = 0; i < wanted.length; i += 4) {
    const got = await Promise.all(
      wanted.slice(i, i + 4).map((b) => (prices ? readAtWithPrices(pool, pid, b) : readAt(pool, pid, b))),
    );
    for (const g of got) reads[String(g.block)] = g;
  }
  if (tick && blocks.length === 1) {
    const at = reads[String(blocks[0])];
    if (at) at.tick = await readTick(pool, pid, blocks[0]).catch(() => null);
  }
  const out: FxEventState = { pool, id, reads };
  if (blocks.length === 1) {
    const before = blocks[0] - 1;
    const [pm, fees] = await Promise.all([
      readManager(before).catch(() => null),
      tx ? readFees(pool, tx, before).catch(() => null) : Promise.resolve(undefined),
    ]);
    out.expenseRatio = pm?.expense ?? null;
    if (tx) out.fees = fees ?? null;
  }
  return out;
}
