// One f(x) position read at the blocks around its timeline rows: getPosition
// and getPositionDebtRatio at block − 1 and at the block, so a row can state
// what it changed (a rebalance moves the position with no event of its own,
// and the Operate event carries no debt ratio). The wstETH pool adds the
// wstETH→stETH rate at each block (wstETH.stEthPerToken), which turns token
// amounts on the row into the pool's stETH-equivalent unit.
//
// A single-row read may also ask for what the transaction was charged
// (`tx`): the pool's fee schedule for the manager's caller at block − 1
// (PoolConfiguration.getPoolFeeRatio(pool, caller); the caller is the
// transaction's target, or its sender when that target is the manager) and
// the manager's share of a rebalance or liquidation bonus
// (getLiquidationExpenseRatio). PoolConfiguration exists from mid-2025; before
// it the Operate event's own `protocolFees` carried the fee.
//
// Calls: one eth_call (Multicall3) per distinct block, plus, with `tx`, one
// transaction read and one fee-ratio call. A mined block never changes, so
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
]);
const WSTETH_ABI = parseAbi(["function stEthPerToken() view returns (uint256)"]);
const PM_ABI = parseAbi([
  "function configuration() view returns (address)",
  "function getLiquidationExpenseRatio() view returns (uint256)",
]);
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
}

/** Fee ratios (fractions, 1e9 on chain) the pool applied to the caller. */
export interface FxFeeSchedule {
  caller: string;
  supply: number;
  withdraw: number;
  borrow: number;
  repay: number;
}

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

async function readFees(pool: FxPoolKey, tx: `0x${string}`, block: number): Promise<FxFeeSchedule | null> {
  return remember(extraCache, `fee:${pool}:${tx}`, async () => {
    const client = alchemyClient();
    const [t, pm] = await Promise.all([client.getTransaction({ hash: tx }), readManager(block)]);
    if (!pm.config || !t.to) return null;
    const caller = t.to.toLowerCase() === FX_ADDRESSES.POOL_MANAGER ? t.from : t.to;
    const r = (await client.readContract({
      address: getAddress(pm.config),
      abi: CONFIG_ABI,
      functionName: "getPoolFeeRatio",
      args: [getAddress(FX_POOLS[pool].address), getAddress(caller)],
      blockNumber: BigInt(block),
    })) as readonly [bigint, bigint, bigint, bigint];
    return {
      caller: caller.toLowerCase(),
      supply: Number(r[0]) / 1e9,
      withdraw: Number(r[1]) / 1e9,
      borrow: Number(r[2]) / 1e9,
      repay: Number(r[3]) / 1e9,
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
): Promise<FxEventState> {
  const pid = BigInt(id);
  const wanted = [...new Set(blocks.flatMap((b) => [b - 1, b]))].sort((a, b) => a - b);
  const reads: Record<string, FxStateAt> = {};
  // Four at a time: a card's split can ask for dozens of blocks.
  for (let i = 0; i < wanted.length; i += 4) {
    const got = await Promise.all(wanted.slice(i, i + 4).map((b) => readAt(pool, pid, b)));
    for (const g of got) reads[String(g.block)] = g;
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
