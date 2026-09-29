// The position state of an Aave V3 account on Base around one transaction,
// read from the chain at two blocks — the Base lane's equivalent of the
// Ethereum index's /api/aave-v3/timeline/position-state (rails-ops
// TO-DO-ui-jobs §19; the Base lane reads balances with balanceOf, decision 0008
// addendum, so there are no scaled deltas to reduce).
//
// RULE: "before" is the account at the end of block N−1 and "after" at the end
// of block N, so the answer holds only where the owner has no other
// transaction in block N (the caller checks: it knows the timeline). Balances
// before are the scaled balance at N−1 times the reserve's index at N, so
// before and after stand at one index and after − before is the transaction's
// own change; the account figures are the Pool's getUserAccountData at each
// block. Same wire shape as the Ethereum answer (lib/aave-v3/position-state).
//
// SERVER-ONLY.

import { getAddress, parseAbi } from "viem";
import { chainClient } from "./rpc";
import { resolveV3Tokens } from "./aave-v3-tokens";
import type { ChainId } from "@/lib/shared/chains";
import type {
  AaveV3AccountSide,
  AaveV3EmodeCategory,
  AaveV3PositionState,
  AaveV3PositionStateReserve,
} from "@/lib/aave-v3/position-state";

const POOL_ABI = parseAbi([
  "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  "function getUserConfiguration(address user) view returns (uint256 data)",
  "function getReservesList() view returns (address[])",
  "function getReserveData(address asset) view returns ((uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
  "function getReserveNormalizedIncome(address asset) view returns (uint256)",
  "function getReserveNormalizedVariableDebt(address asset) view returns (uint256)",
  "function getUserEMode(address user) view returns (uint256)",
  "function getEModeCategoryCollateralBitmap(uint8 id) view returns (uint128)",
  "function getEModeCategoryCollateralConfig(uint8 id) view returns ((uint16 ltv, uint16 liquidationThreshold, uint16 liquidationBonus))",
  "function getEModeCategoryLabel(uint8 id) view returns (string)",
]);
const TOKEN_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function scaledBalanceOf(address) view returns (uint256)",
]);
const ORACLE_ABI = parseAbi(["function getAssetPrice(address asset) view returns (uint256)"]);

const ZERO = BigInt(0);
const RAY = BigInt("1000000000000000000000000000");
const HALF_RAY = RAY / BigInt(2);
const UINT_MAX = (BigInt(1) << BigInt(256)) - BigInt(1);
const rayMul = (a: bigint, b: bigint): bigint => (a * b + HALF_RAY) / RAY;

interface ReserveData {
  configuration: bigint;
  currentLiquidityRate: bigint;
  currentVariableBorrowRate: bigint;
  lastUpdateTimestamp: number;
  id: number;
  aTokenAddress: `0x${string}`;
  variableDebtTokenAddress: `0x${string}`;
}

export class PositionStateRefusal extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

/** The account before and after `txHash`, which must sit in `block`. */
export async function loadAaveV3PositionStateAtBlock(args: {
  wallet: string;
  pool: string;
  oracle: string;
  chainId: ChainId;
  block: number;
  txHash: string;
  market: string;
}): Promise<AaveV3PositionState> {
  const client = chainClient(args.chainId);
  const wallet = getAddress(args.wallet);
  const pool = getAddress(args.pool);
  const after = { blockNumber: BigInt(args.block) };
  const before = { blockNumber: BigInt(args.block - 1) };

  const [receipt, blockHeader, reservesList] = await Promise.all([
    client.getTransactionReceipt({ hash: args.txHash as `0x${string}` }).catch(() => null),
    client.getBlock(after),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "getReservesList", ...after }),
  ]);
  if (!receipt || Number(receipt.blockNumber) !== args.block) throw new PositionStateRefusal("event_not_found", 404);
  const reserves = [...new Set((reservesList as readonly string[]).map((a) => getAddress(a)))];

  const account = (at: { blockNumber: bigint }) =>
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "getUserAccountData", args: [wallet], ...at });
  const config = (at: { blockNumber: bigint }) =>
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "getUserConfiguration", args: [wallet], ...at });
  const emodeOf = (at: { blockNumber: bigint }) =>
    client
      .readContract({ address: pool, abi: POOL_ABI, functionName: "getUserEMode", args: [wallet], ...at })
      .then((v) => Number(v))
      .catch(() => 0);

  const [accBefore, accAfter, cfgBefore, cfgAfter, emBefore, emAfter, reserveStructs] = await Promise.all([
    account(before),
    account(after),
    config(before),
    config(after),
    emodeOf(before),
    emodeOf(after),
    client.multicall({
      allowFailure: false,
      ...after,
      contracts: reserves.map(
        (a) => ({ address: pool, abi: POOL_ABI, functionName: "getReserveData", args: [a] }) as const,
      ),
    }) as Promise<ReserveData[]>,
  ]);

  // Per reserve at N: both indexes, the four balances, the oracle price; at
  // N−1: the two scaled balances.
  const perAfter = reserves.flatMap((a, i) => {
    const d = reserveStructs[i];
    return [
      { address: pool, abi: POOL_ABI, functionName: "getReserveNormalizedIncome", args: [a] },
      { address: pool, abi: POOL_ABI, functionName: "getReserveNormalizedVariableDebt", args: [a] },
      { address: d.aTokenAddress, abi: TOKEN_ABI, functionName: "balanceOf", args: [wallet] },
      { address: d.aTokenAddress, abi: TOKEN_ABI, functionName: "scaledBalanceOf", args: [wallet] },
      { address: d.variableDebtTokenAddress, abi: TOKEN_ABI, functionName: "balanceOf", args: [wallet] },
      { address: d.variableDebtTokenAddress, abi: TOKEN_ABI, functionName: "scaledBalanceOf", args: [wallet] },
      { address: getAddress(args.oracle), abi: ORACLE_ABI, functionName: "getAssetPrice", args: [a] },
    ] as const;
  });
  const perBefore = reserves.flatMap((_, i) => {
    const d = reserveStructs[i];
    return [
      { address: d.aTokenAddress, abi: TOKEN_ABI, functionName: "scaledBalanceOf", args: [wallet] },
      { address: d.variableDebtTokenAddress, abi: TOKEN_ABI, functionName: "scaledBalanceOf", args: [wallet] },
    ] as const;
  });
  const [rAfter, rBefore] = await Promise.all([
    client.multicall({ allowFailure: true, ...after, contracts: perAfter }),
    client.multicall({ allowFailure: true, ...before, contracts: perBefore }),
  ]);
  const val = (r: { status: string; result?: unknown } | undefined): bigint | null =>
    r && r.status === "success" ? (r.result as bigint) : null;

  // eMode categories either side names (liquid generation: Base answers the
  // bitmap getters).
  const catIds = [...new Set([emBefore, emAfter].filter((id) => id > 0))];
  const categories: Record<string, AaveV3EmodeCategory> = {};
  let bitmapAfter: bigint | null = null;
  for (const id of catIds) {
    const [bitmap, cfg, label] = await Promise.all([
      client
        .readContract({
          address: pool,
          abi: POOL_ABI,
          functionName: "getEModeCategoryCollateralBitmap",
          args: [id],
          ...after,
        })
        .catch(() => null),
      client
        .readContract({
          address: pool,
          abi: POOL_ABI,
          functionName: "getEModeCategoryCollateralConfig",
          args: [id],
          ...after,
        })
        .catch(() => null),
      client
        .readContract({ address: pool, abi: POOL_ABI, functionName: "getEModeCategoryLabel", args: [id], ...after })
        .catch(() => null),
    ]);
    if (id === emAfter) bitmapAfter = (bitmap as bigint | null) ?? null;
    const c = cfg as { ltv: number; liquidationThreshold: number } | null;
    if (c)
      categories[String(id)] = {
        label: (label as string | null) || null,
        ltvBps: Number(c.ltv),
        liquidationThresholdBps: Number(c.liquidationThreshold),
        priceSource: null,
        generation: "bitmap",
      };
  }

  const collateralBit = (cfg: bigint, id: number) => ((cfg >> BigInt(2 * id + 1)) & BigInt(1)) === BigInt(1);
  const rows: { addr: string; row: Omit<AaveV3PositionStateReserve, "symbol" | "decimals"> }[] = [];
  reserves.forEach((addr, i) => {
    const d = reserveStructs[i];
    const o = i * 7;
    const income = val(rAfter[o]);
    const debtIndex = val(rAfter[o + 1]);
    const supplyAfter = val(rAfter[o + 2]) ?? ZERO;
    const supplyScaledAfter = val(rAfter[o + 3]) ?? ZERO;
    const debtAfter = val(rAfter[o + 4]) ?? ZERO;
    const debtScaledAfter = val(rAfter[o + 5]) ?? ZERO;
    const price = val(rAfter[o + 6]);
    const supplyScaledBefore = val(rBefore[i * 2]) ?? ZERO;
    const debtScaledBefore = val(rBefore[i * 2 + 1]) ?? ZERO;
    const collBefore = collateralBit(cfgBefore, d.id);
    const collAfter = collateralBit(cfgAfter, d.id);
    const held =
      supplyAfter > ZERO ||
      debtAfter > ZERO ||
      supplyScaledBefore > ZERO ||
      debtScaledBefore > ZERO ||
      collBefore ||
      collAfter;
    if (!held || income == null || debtIndex == null) return;
    const leg = (scaledBefore: bigint, scaledAfter: bigint, afterBal: bigint, index: bigint, rate: bigint) => ({
      before: rayMul(scaledBefore, index).toString(),
      after: afterBal.toString(),
      scaledBefore: scaledBefore.toString(),
      scaledAfter: scaledAfter.toString(),
      index: index.toString(),
      rduBlock: args.block,
      rduTxHash: "",
      rduTimestamp: d.lastUpdateTimestamp,
      rate: rate.toString(),
    });
    rows.push({
      addr: addr.toLowerCase(),
      row: {
        reserve: addr.toLowerCase(),
        supply: leg(supplyScaledBefore, supplyScaledAfter, supplyAfter, income, d.currentLiquidityRate),
        debt: leg(debtScaledBefore, debtScaledAfter, debtAfter, debtIndex, d.currentVariableBorrowRate),
        collateral: { before: collBefore, after: collAfter },
        priceBase: price != null ? price.toString() : null,
        ltvBps: Number(d.configuration & BigInt(0xffff)),
        liquidationThresholdBps: Number((d.configuration >> BigInt(16)) & BigInt(0xffff)),
        inEmode: emAfter > 0 && bitmapAfter != null ? ((bitmapAfter >> BigInt(d.id)) & BigInt(1)) === BigInt(1) : false,
      },
    });
  });

  const metas = await resolveV3Tokens(
    rows.map((r) => r.addr),
    args.chainId,
  );
  const side = (a: readonly [bigint, bigint, bigint, bigint, bigint, bigint]): AaveV3AccountSide => ({
    totalCollateralBase: a[0].toString(),
    totalDebtBase: a[1].toString(),
    ltvBps: Number(a[4]),
    liquidationThresholdBps: Number(a[3]),
    healthFactor: a[1] === ZERO || a[5] >= UINT_MAX ? null : a[5].toString(),
  });

  return {
    wallet: wallet.toLowerCase(),
    market: args.market,
    marketKey: args.market,
    block: args.block,
    txHash: args.txHash.toLowerCase(),
    txIndex: receipt.transactionIndex,
    blockTimestamp: Number(blockHeader.timestamp),
    complete: true,
    reserves: rows.map(({ addr, row }) => {
      const m = metas.get(addr);
      return { ...row, symbol: m?.symbol ?? null, decimals: m && !m.unresolved ? m.decimals : null };
    }),
    emode: { before: emBefore, after: emAfter, categories },
    account: { before: side(accBefore), after: side(accAfter) },
    sources: {
      balances: "chain-read-at-block",
      settings: "chain-read-at-block",
      market: "chain-read-at-block",
      marketReadBlock: args.block,
      poolRevision: null,
    },
    notes: [],
  };
}
