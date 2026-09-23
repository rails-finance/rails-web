// f(x) V2 protocol view — the two pools' tick ladders, read at one head block.
// ----------------------------------------------------------------------------
// f(x) V2 socializes funding, rebalances and liquidations across WHOLE TICKS:
// a position is shares in a 0.15%-wide debt-ratio bucket (1.0015^tick), and
// every engine — rebalance, liquidation, redemption — consumes ticks, not
// positions. No per-position event exists for any of it. The position pages
// reconcile that silence one position at a time (implied vs settled); this
// loader states the same truth at the level the protocol actually operates on:
// the tick ladder itself, with the ladder's sum reconciled against the pool's
// own share totals BigInt-exact.
//
// The reads are the SAME views the settled sweep and scripts/verify-fx-chain.mjs
// already stand on — the pool's own getters, no log anywhere (Alchemy's free
// tier caps eth_getLogs at 10 blocks; nothing here needs one):
//  * tickBitmap(int8) — 256 words; a set bit IS a tick with debt (the pool
//    flips a bit exactly when a tick's debt crosses zero). The bitmap sweep is
//    the roster: no catalog, no log scan, no heuristics.
//  * tickData(tick) → the tick's CURRENT tree node; tickTreeData(node).value
//    packs the tick's total collateral shares (low 128 bits) and debt shares
//    (high 128 bits) — the exact operands _tickWillMove/_liquidateTick use.
//  * The X96 index identities the verifier proves BigInt-exact turn shares
//    into amounts: rawDebt = shares × debtIndex ÷ 2^96 (a share owes more),
//    rawColl = shares × 2^96 ÷ collIndex (a share holds less — funding).
//
// Three oracle legs, three jobs (all chain-verified in the pool's own source):
// a POSITION's stated debt ratio is judged at the ANCHOR leg; the rebalance and
// liquidation sweeps judge a TICK at the MIN leg; redemption prices collateral
// at the MAX leg. This view sits on the engines' axis, so per-tick ratios here
// are judged at the MIN leg and say so.
//
// Reconciliation (share space, where the arithmetic is exact):
//  * Σ tick debt shares == the pool's total debt shares — every fxUSD of debt
//    sits in exactly one tick.
//  * Σ tick collateral shares ≤ total collateral shares — the gap is
//    collateral held by DEBT-FREE positions (nodeId 0: no debt, no tick).
//
// Dust: the engines skip what isn't worth a keeper's transaction — rebalance/
// liquidation skip a tick below 1e9 wei of raw debt (10^-9 fxUSD), redemption
// below 1e9 debt shares. Ticks under that line are counted and summed here
// rather than drawn, and the count is stated on the page.
//
// SERVER-ONLY (ALCHEMY_URL) — imported from /api/chain/* route handlers and
// the /fx/pools SSR page only.

import { parseAbi } from "viem";
import { alchemyClient } from "./rpc";
import { FX_ADDRESSES, FX_POOLS, FX_POOL_KEYS, type FxPoolKey } from "@/lib/fx/asset-catalog";

const POOL_ABI = parseAbi([
  "function getTopTick() view returns (int16)",
  "function getNextPositionId() view returns (uint32)",
  "function getNextTreeNodeId() view returns (uint48)",
  "function getDebtAndCollateralIndex() view returns (uint256,uint256)",
  "function getDebtAndCollateralShares() view returns (uint256,uint256)",
  "function getTotalRawCollaterals() view returns (uint256)",
  "function getTotalRawDebts() view returns (uint256)",
  "function getDebtRatioRange() view returns (uint256,uint256)",
  "function getRebalanceRatios() view returns (uint256,uint256)",
  "function getLiquidateRatios() view returns (uint256,uint256)",
  "function getMaxRedeemRatioPerTick() view returns (uint256)",
  "function isBorrowPaused() view returns (bool)",
  "function isRedeemPaused() view returns (bool)",
  "function priceOracle() view returns (address)",
  "function configuration() view returns (address)",
  "function borrowRateSnapshot() view returns (uint128,uint80,uint48)",
  "function tickBitmap(int8) view returns (uint256)",
  "function tickData(int256) view returns (uint48)",
  "function tickTreeData(uint256) view returns (bytes32,bytes32)",
]);
const ORACLE_ABI = parseAbi(["function getPrice() view returns (uint256,uint256,uint256)"]);
const CONFIG_ABI = parseAbi(["function getLongPoolFundingRatio(address) view returns (uint256)"]);
const PM_ABI = parseAbi([
  "function getPoolInfo(address) view returns (uint256 collateralCapacity, uint256 collateralBalance, uint256 rawCollateral, uint256 debtCapacity, uint256 debtBalance)",
]);

const ZERO = BigInt(0);
const X96 = BigInt(2) ** BigInt(96);
const E18 = BigInt(10) ** BigInt(18);
const MASK128 = (BigInt(1) << BigInt(128)) - BigInt(1);
/** The engines' own dust line: rebalance/liquidation skip a tick whose raw
 *  debt is below this (redemption: the same figure in debt shares). */
const MIN_DEBT = BigInt(1e9);
/** getTopTick's "no tick has debt" sentinel — type(int16).min. */
const TOP_TICK_SENTINEL = -32768;

const wad = (v: bigint): number => Number(v) / 1e18;

export interface FxTickRow {
  tick: number;
  /** The tick node's raw share integers — the reconciliation's exact operands. */
  debtSharesRaw: string;
  collSharesRaw: string;
  /** Derived through the index identities: fxUSD / NORMALIZED 1e18 units. */
  rawDebt: number;
  rawColl: number;
  /** The tick's current debt ratio judged at the MIN oracle leg — the same
   *  price the rebalance/liquidation sweeps judge this tick at. Null when the
   *  tick holds debt against zero collateral (a pure-bad-debt bucket). */
  debtRatio: number | null;
  /** This tick's slice of the pool's raw debt (0..1). */
  shareOfDebt: number;
  /** Below the engines' own skip line (1e9 wei of raw debt). */
  dust: boolean;
  /** At or past the liquidation rung at the MIN leg — liquidatable as a tick. */
  pastLiquidate: boolean;
}

export interface FxPoolSystem {
  key: FxPoolKey;
  address: string;
  tokenSymbol: string;
  normalizedSymbol: string;

  /** Pool totals — the pool's own getters (NORMALIZED 1e18 / fxUSD 1e18). */
  totalRawColl: number;
  totalRawDebt: number;
  /** Raw integers behind them, for receipts. */
  totalRawCollRaw: string;
  totalRawDebtRaw: string;

  /** The funding engine's dials: X96 indices rendered as plain multipliers. */
  debtIndexMultiplier: number;
  collIndexMultiplier: number;
  /** shares × debtIndex ÷ 2^96 == getTotalRawDebts (and the collateral twin),
   *  re-checked BigInt-exact on this read — the identity the ladder's amounts
   *  are derived through. */
  indexIdentityExact: boolean;

  /** The annualized funding rate on collateral (0.04 = 4%/yr), the protocol's
   *  own configuration getter. AaveFundingPool charges it INTO the collateral
   *  index — funding takes collateral, not debt. */
  fundingRatioAnnual: number;
  /** Unix seconds of the last funding checkpoint (borrowRateSnapshot). */
  fundingCheckpoint: number;

  /** Oracle legs — USD per NORMALIZED unit, 1e18-scaled to numbers. */
  oracle: string;
  priceAnchor: number;
  priceMin: number;
  priceMax: number;

  /** The escalation ladder (fractions of 1): open up to maxBorrowRatio,
   *  rebalance a tick from rebalanceRatio, liquidate it from liquidateRatio. */
  maxBorrowRatio: number;
  rebalanceRatio: number;
  rebalanceBonus: number;
  liquidateRatio: number;
  liquidateBonus: number;
  /** Redemption's per-tick cap (0.2 = 20% of a tick per pass). */
  maxRedeemPerTick: number;
  borrowPaused: boolean;
  redeemPaused: boolean;

  /** The PoolManager's book: caps in TOKEN units / fxUSD, plus its token-unit
   *  balance — the other unit system, named as such. */
  collateralCapacityToken: number;
  collateralBalanceToken: number;
  debtCapacity: number;

  positionsMinted: number;
  treeNodes: number;
  topTick: number | null;

  /** The ladder — every tick the bitmap marks as holding debt, ascending. */
  ticks: FxTickRow[];
  occupiedTicks: number;
  dustTicks: number;
  /** Σ raw debt across dust ticks (fxUSD, effectively ~0 by construction). */
  dustDebt: number;
  dustPastLiquidate: number;

  /** The reconciliation, in share space (exact integers). */
  tickDebtSharesSumRaw: string;
  totalDebtSharesRaw: string;
  debtSharesReconcile: boolean;
  tickCollSharesSumRaw: string;
  totalCollSharesRaw: string;
  /** total − Σ ticks: collateral shares held by debt-free positions. */
  collOutsideLadderSharesRaw: string;
  /** The same gap through the collateral index, NORMALIZED units. */
  collOutsideLadder: number;
}

export interface FxSystemChainResponse {
  blockNumber: number;
  /** The block's own timestamp — the funding-checkpoint ages are read against it. */
  blockTimestamp: number;
  pools: FxPoolSystem[];
  /** fxUSD debt summed across both pools — one unit system, so the sum is safe. */
  totalDebtAllPools: number;
  totalPositionsMinted: number;
  /** True when the chain read failed and the page should say so, not render 0s. */
  chainStale: boolean;
}

function empty(): FxSystemChainResponse {
  return {
    blockNumber: 0,
    blockTimestamp: 0,
    pools: [],
    totalDebtAllPools: 0,
    totalPositionsMinted: 0,
    chainStale: true,
  };
}

/** All 256 possible bitmap words — ticks are int16, so words span -128..127. */
const BITMAP_WORDS: number[] = Array.from({ length: 256 }, (_, i) => i - 128);

async function loadPool(key: FxPoolKey, blockNumber: bigint): Promise<FxPoolSystem> {
  const client = alchemyClient();
  const meta = FX_POOLS[key];
  const address = meta.address as `0x${string}`;
  const at = { blockNumber };

  const [
    topTickRaw,
    nextPositionId,
    nextTreeNodeId,
    indexPair,
    sharesPair,
    totColl,
    totDebt,
    debtRatioRange,
    rebalancePair,
    liquidatePair,
    maxRedeemRaw,
    borrowPaused,
    redeemPaused,
    oracle,
    configuration,
    snapshot,
    poolInfo,
  ] = await Promise.all([
    client.readContract({ address, abi: POOL_ABI, functionName: "getTopTick", ...at }),
    client.readContract({ address, abi: POOL_ABI, functionName: "getNextPositionId", ...at }),
    client.readContract({ address, abi: POOL_ABI, functionName: "getNextTreeNodeId", ...at }),
    client.readContract({ address, abi: POOL_ABI, functionName: "getDebtAndCollateralIndex", ...at }),
    client.readContract({ address, abi: POOL_ABI, functionName: "getDebtAndCollateralShares", ...at }),
    client.readContract({ address, abi: POOL_ABI, functionName: "getTotalRawCollaterals", ...at }),
    client.readContract({ address, abi: POOL_ABI, functionName: "getTotalRawDebts", ...at }),
    client.readContract({ address, abi: POOL_ABI, functionName: "getDebtRatioRange", ...at }),
    client.readContract({ address, abi: POOL_ABI, functionName: "getRebalanceRatios", ...at }),
    client.readContract({ address, abi: POOL_ABI, functionName: "getLiquidateRatios", ...at }),
    client.readContract({ address, abi: POOL_ABI, functionName: "getMaxRedeemRatioPerTick", ...at }),
    client.readContract({ address, abi: POOL_ABI, functionName: "isBorrowPaused", ...at }),
    client.readContract({ address, abi: POOL_ABI, functionName: "isRedeemPaused", ...at }),
    client.readContract({ address, abi: POOL_ABI, functionName: "priceOracle", ...at }),
    client.readContract({ address, abi: POOL_ABI, functionName: "configuration", ...at }),
    client.readContract({ address, abi: POOL_ABI, functionName: "borrowRateSnapshot", ...at }),
    client.readContract({
      address: FX_ADDRESSES.POOL_MANAGER as `0x${string}`,
      abi: PM_ABI,
      functionName: "getPoolInfo",
      args: [address],
      ...at,
    }),
  ]);

  const [debtIndex, collIndex] = indexPair;
  const [debtShares, collShares] = sharesPair;
  const [, maxDebtRatio] = debtRatioRange;
  const [rebalanceRatio, rebalanceBonus] = rebalancePair;
  const [liquidateRatio, liquidateBonus] = liquidatePair;

  const [[anchor, minPrice, maxPrice], fundingRatio] = await Promise.all([
    client.readContract({ address: oracle, abi: ORACLE_ABI, functionName: "getPrice", ...at }),
    client.readContract({
      address: configuration,
      abi: CONFIG_ABI,
      functionName: "getLongPoolFundingRatio",
      args: [address],
      ...at,
    }),
  ]);

  // ── The bitmap sweep: which ticks hold debt ────────────────────────────────
  const words = (await client.multicall({
    contracts: BITMAP_WORDS.map((w) => ({ address, abi: POOL_ABI, functionName: "tickBitmap", args: [w] })),
    allowFailure: false,
    ...at,
  })) as bigint[];
  const tickIds: number[] = [];
  BITMAP_WORDS.forEach((w, i) => {
    const word = words[i];
    if (word === ZERO) return;
    for (let b = 0; b < 256; b++) {
      if ((word >> BigInt(b)) & BigInt(1)) tickIds.push(w * 256 + b);
    }
  });
  tickIds.sort((a, b) => a - b);

  // ── Each tick's current node, then the node's packed share totals ──────────
  const nodeIds = (await client.multicall({
    contracts: tickIds.map((t) => ({ address, abi: POOL_ABI, functionName: "tickData", args: [BigInt(t)] })),
    allowFailure: false,
    ...at,
  })) as number[];
  const nodes = (await client.multicall({
    contracts: nodeIds.map((n) => ({ address, abi: POOL_ABI, functionName: "tickTreeData", args: [BigInt(n)] })),
    allowFailure: false,
    ...at,
  })) as unknown as readonly (readonly [`0x${string}`, `0x${string}`])[];

  let tickDebtSharesSum = ZERO;
  let tickCollSharesSum = ZERO;
  const ticks: FxTickRow[] = tickIds.map((tick, i) => {
    // TickTreeNode.value: [ debt share (128) | coll share (128) ], LSB-first
    // offsets — collateral is the low half, debt the high half.
    const value = BigInt(nodes[i][1]);
    const collSh = value & MASK128;
    const debtSh = (value >> BigInt(128)) & MASK128;
    tickDebtSharesSum += debtSh;
    tickCollSharesSum += collSh;

    const rawDebt = (debtSh * debtIndex) / X96;
    const rawColl = (collSh * X96) / collIndex;
    // The engines' own judgment: debts × 1e36 ÷ (colls × MIN price) — the same
    // identity the verifier proves for positions, at the leg rebalance and
    // liquidation actually consult for a tick.
    const debtRatio = rawColl > ZERO && minPrice > ZERO ? wad((rawDebt * E18 * E18) / (rawColl * minPrice)) : null;
    const dust = rawDebt < MIN_DEBT;
    return {
      tick,
      debtSharesRaw: debtSh.toString(),
      collSharesRaw: collSh.toString(),
      rawDebt: wad(rawDebt),
      rawColl: wad(rawColl),
      debtRatio,
      shareOfDebt: totDebt > ZERO ? wad((rawDebt * E18) / totDebt) : 0,
      dust,
      pastLiquidate: debtRatio != null && debtRatio >= wad(liquidateRatio),
    };
  });

  const collOutsideShares = collShares - tickCollSharesSum;
  const dustRows = ticks.filter((t) => t.dust);

  return {
    key,
    address: meta.address,
    tokenSymbol: meta.tokenSymbol,
    normalizedSymbol: meta.normalizedSymbol,

    totalRawColl: wad(totColl),
    totalRawDebt: wad(totDebt),
    totalRawCollRaw: totColl.toString(),
    totalRawDebtRaw: totDebt.toString(),

    debtIndexMultiplier: Number(debtIndex) / Number(X96),
    collIndexMultiplier: Number(collIndex) / Number(X96),
    indexIdentityExact: (debtShares * debtIndex) / X96 === totDebt && (collShares * X96) / collIndex === totColl,

    fundingRatioAnnual: wad(fundingRatio),
    fundingCheckpoint: Number(snapshot[2]),

    oracle: oracle.toLowerCase(),
    priceAnchor: wad(anchor),
    priceMin: wad(minPrice),
    priceMax: wad(maxPrice),

    maxBorrowRatio: wad(maxDebtRatio),
    rebalanceRatio: wad(rebalanceRatio),
    rebalanceBonus: Number(rebalanceBonus) / 1e9,
    liquidateRatio: wad(liquidateRatio),
    liquidateBonus: Number(liquidateBonus) / 1e9,
    maxRedeemPerTick: Number(maxRedeemRaw) / 1e9,
    borrowPaused,
    redeemPaused,

    collateralCapacityToken: Number(poolInfo[0]) / 10 ** meta.tokenDecimals,
    collateralBalanceToken: Number(poolInfo[1]) / 10 ** meta.tokenDecimals,
    debtCapacity: wad(poolInfo[3]),

    positionsMinted: nextPositionId - 1,
    treeNodes: nextTreeNodeId - 1,
    topTick: topTickRaw === TOP_TICK_SENTINEL ? null : topTickRaw,

    ticks,
    occupiedTicks: ticks.length,
    dustTicks: dustRows.length,
    dustDebt: dustRows.reduce((s, t) => s + t.rawDebt, 0),
    dustPastLiquidate: dustRows.filter((t) => t.pastLiquidate).length,

    tickDebtSharesSumRaw: tickDebtSharesSum.toString(),
    totalDebtSharesRaw: debtShares.toString(),
    debtSharesReconcile: tickDebtSharesSum === debtShares,
    tickCollSharesSumRaw: tickCollSharesSum.toString(),
    totalCollSharesRaw: collShares.toString(),
    collOutsideLadderSharesRaw: collOutsideShares.toString(),
    collOutsideLadder: wad((collOutsideShares * X96) / collIndex),
  };
}

export async function loadFxSystemFromChain(): Promise<FxSystemChainResponse> {
  try {
    const client = alchemyClient();
    // Pin every read to ONE block so the two pools, the bitmap and the node
    // values are a single coherent snapshot rather than a smear across blocks.
    const block = await client.getBlock();
    const blockNumber = block.number;

    const pools = await Promise.all(FX_POOL_KEYS.map((key) => loadPool(key, blockNumber)));

    return {
      blockNumber: Number(blockNumber),
      blockTimestamp: Number(block.timestamp),
      pools,
      // fxUSD is one unit system across pools, so this sum is safe; collateral
      // units differ per pool and are deliberately never summed.
      totalDebtAllPools: pools.reduce((s, p) => s + p.totalRawDebt, 0),
      totalPositionsMinted: pools.reduce((s, p) => s + p.positionsMinted, 0),
      chainStale: false,
    };
  } catch (error) {
    console.error("f(x) system chain read failed:", error);
    return empty();
  }
}
