// Live Liquity-V2-fork per-trove position — the shared chain detail reader for
// Ebisu and Asymmetry (both run the V2 architecture: per-branch TroveManager /
// PriceFeed / SortedTroves; a trove is (branch, troveId)). One load returns:
//
//   • getLatestTroveData — the canonical V2 struct: entire debt/coll WITH
//     pending redistribution gains, accrued interest, the recorded debt and
//     the user-set annual interest rate. This is the branch's own live
//     reckoning — redemptions shrink it without the index necessarily seeing
//     an attributable event (observed live), which is this lane's reason to
//     exist.
//   • The branch price — fetchPrice SIMULATED via eth_call (state-mutating
//     on-chain, read-only under eth_call — the Liquity V1 pattern), falling
//     back to the stale lastGoodPrice with `priceStale` set. Scale is
//     1e(36 − collateral decimals), proven by the BigInt-exact ICR identity.
//   • getCurrentICR — the CONTRACT's own collateral ratio (kind "chain").
//   • The branch aggregates (entire branch debt/coll → TCR) and the
//     redemption queue: SortedTroves descends by annual interest rate, so
//     debt-in-front = Σ entireDebt of troves BELOW this trove's rate. A
//     zombie trove (status 4) sits outside the list and is redeemed first.
//
// Every assumption is verified on-chain by scripts/verify-liquity-forks-chain.mjs.
// SERVER-ONLY.

import { parseAbi, type ContractFunctionParameters } from "viem";
import { chainClient } from "./rpc";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

export interface LiquityForkBranchConfig {
  key: string;
  symbol: string;
  decimals: number;
  troveManager: string;
  priceFeed: string;
  sortedTroves: string;
  mcr: number;
  ccr: number;
  scr: number;
}

export interface LiquityForkConfig {
  /** Explorer id ("ebisu" | "asymmetry" | "basedollar") — names the API lane
   *  in provenance. */
  protocol: string;
  debtSymbol: string;
  branches: Record<string, LiquityForkBranchConfig>;
  /** Which chain these contracts live on. Defaults to Ethereum, which is what
   *  every mainnet fork wants; basedollar passes 8453. Getting this wrong does
   *  not error — it reads a DIFFERENT chain's state at the same addresses — so
   *  it is declared per config rather than inferred. */
  chainId?: ChainId;
}

const TM_ABI = parseAbi([
  "function getLatestTroveData(uint256 troveId) view returns ((uint256 entireDebt, uint256 entireColl, uint256 redistBoldDebtGain, uint256 redistCollGain, uint256 accruedInterest, uint256 recordedDebt, uint256 annualInterestRate, uint256 weightedRecordedDebt, uint256 accruedBatchManagementFee, uint256 lastInterestRateAdjTime))",
  "function getCurrentICR(uint256 troveId, uint256 price) view returns (uint256)",
  "function getTroveStatus(uint256 troveId) view returns (uint8)",
  "function getEntireBranchDebt() view returns (uint256)",
  "function getEntireBranchColl() view returns (uint256)",
]);
// fetchPrice mutates on-chain; declared view so eth_call simulates it.
const PF_ABI = parseAbi([
  "function fetchPrice() view returns (uint256, bool)",
  "function lastGoodPrice() view returns (uint256)",
]);
const ST_ABI = parseAbi([
  "function getSize() view returns (uint256)",
  "function getFirst() view returns (uint256)",
  "function getNext(uint256 id) view returns (uint256)",
]);

/** V2 trove status enum. */
export type LiquityForkTroveStatus = "nonExistent" | "active" | "closedByOwner" | "closedByLiquidation" | "zombie";
const STATUS: LiquityForkTroveStatus[] = ["nonExistent", "active", "closedByOwner", "closedByLiquidation", "zombie"];

export interface LiquityForkTroveChainResponse {
  protocol: string;
  branch: string;
  symbol: string;
  troveId: string;
  blockNumber: number;
  /** The contract's own trove status (getTroveStatus). Zombie troves sit
   *  outside the sorted list and are redeemed first. */
  status: LiquityForkTroveStatus;
  /** Entire debt/coll — pending redistribution + accrued interest INCLUDED
   *  (raw integer strings; scale by 18 / branch decimals). */
  entireDebtRaw: string;
  entireDebt: number;
  entireCollRaw: string;
  entireColl: number;
  /** The split getLatestTroveData states: interest accrued since the recorded
   *  debt, and redistribution gains from liquidations. */
  accruedInterest: number;
  redistDebtGain: number;
  redistCollGain: number;
  recordedDebt: number;
  /** Annual interest rate (percent). For an unbatched trove this is the rate
   *  the owner set; for a batch member getLatestTroveData serves the BATCH's
   *  current rate — the manager's choice, not the owner's. */
  annualInterestRatePct: number;
  /** The branch's own oracle price, USD per whole collateral token. */
  priceUsd: number | null;
  /** True when the simulated fetchPrice failed and lastGoodPrice (which lags
   *  between user ops) is shown instead. */
  priceStale: boolean;
  /** The feed's own oracle-failure flag from fetchPrice. */
  oracleDown: boolean;
  /** The CONTRACT's own collateral ratio (getCurrentICR at the same price).
   *  Null when the trove has no live debt. */
  icr: number | null;
  /** Governance constants (chain-verified catalog): in this family MCR is the
   *  per-trove liquidation line; CCR gates branch-level borrowing; below SCR
   *  the branch can be shut down. */
  mcr: number;
  ccr: number;
  scr: number;
  /** Liquidation price = entireDebt × MCR ÷ entireColl (chain-derived). */
  liqPriceUsd: number | null;
  /** Branch aggregates at the same head. */
  branchDebt: number | null;
  branchColl: number | null;
  branchTcr: number | null;
  /** Redemption queue (branch-scoped): the debt sitting at LOWER interest
   *  rates than this trove — redeemed before it. Zombie troves are outside
   *  the list and redeemed first (debtInFront 0, inSortedList false). */
  inSortedList: boolean;
  debtInFront: number | null;
  trovesAhead: number | null;
  /** True when the chain RPC read failed and we returned an empty stub. */
  chainStale: boolean;
}

function stub(cfg: LiquityForkConfig, b: LiquityForkBranchConfig, troveId: string): LiquityForkTroveChainResponse {
  return {
    protocol: cfg.protocol,
    branch: b.key,
    symbol: b.symbol,
    troveId,
    blockNumber: 0,
    status: "nonExistent",
    entireDebtRaw: "0",
    entireDebt: 0,
    entireCollRaw: "0",
    entireColl: 0,
    accruedInterest: 0,
    redistDebtGain: 0,
    redistCollGain: 0,
    recordedDebt: 0,
    annualInterestRatePct: 0,
    priceUsd: null,
    priceStale: false,
    oracleDown: false,
    icr: null,
    mcr: b.mcr,
    ccr: b.ccr,
    scr: b.scr,
    liqPriceUsd: null,
    branchDebt: null,
    branchColl: null,
    branchTcr: null,
    inSortedList: false,
    debtInFront: null,
    trovesAhead: null,
    chainStale: true,
  };
}

const WALK_CAP = 40; // branch lists are single-digit today; a hard stop regardless

/**
 * Read one trove's live state straight from its branch contracts. Returns a
 * `chainStale` stub on RPC failure so the caller falls back to its
 * event-derived numbers (the risk surfaces just stay off).
 */
export async function loadLiquityForkTroveFromChain(
  cfg: LiquityForkConfig,
  branchKey: string,
  troveIdRaw: string,
): Promise<LiquityForkTroveChainResponse> {
  const b = cfg.branches[branchKey];
  if (!b) throw new Error(`unknown branch: ${branchKey}`);
  const troveId = BigInt(troveIdRaw);

  try {
    const client = chainClient(cfg.chainId ?? MAINNET_CHAIN_ID);
    const tm = b.troveManager as `0x${string}`;
    const pf = b.priceFeed as `0x${string}`;
    const st = b.sortedTroves as `0x${string}`;
    const atTm = (functionName: string, args: readonly unknown[] = []): ContractFunctionParameters =>
      ({ address: tm, abi: TM_ABI, functionName, args }) as ContractFunctionParameters;

    // Phase 1 — price (simulated fetch + fallback), the trove struct, status,
    // and the branch aggregates, alongside the head block number.
    const [blockNumber, phase1] = await Promise.all([
      client.getBlockNumber().then(Number),
      client.multicall({
        allowFailure: true,
        contracts: [
          { address: pf, abi: PF_ABI, functionName: "fetchPrice" } as ContractFunctionParameters,
          { address: pf, abi: PF_ABI, functionName: "lastGoodPrice" } as ContractFunctionParameters,
          atTm("getLatestTroveData", [troveId]),
          atTm("getTroveStatus", [troveId]),
          atTm("getEntireBranchDebt"),
          atTm("getEntireBranchColl"),
          { address: st, abi: ST_ABI, functionName: "getFirst" } as ContractFunctionParameters,
        ],
      }),
    ]);
    const r = (i: number): unknown => (phase1[i].status === "success" ? phase1[i].result : null);
    const fetched = r(0) as [bigint, boolean] | null;
    const lastGood = r(1) as bigint | null;
    const data = r(2) as {
      entireDebt: bigint;
      entireColl: bigint;
      redistBoldDebtGain: bigint;
      redistCollGain: bigint;
      accruedInterest: bigint;
      recordedDebt: bigint;
      annualInterestRate: bigint;
    } | null;
    const statusNum = r(3) as number | null;
    const branchDebtRaw = r(4) as bigint | null;
    const branchCollRaw = r(5) as bigint | null;
    const firstId = r(6) as bigint | null;
    if (!data || statusNum == null) return stub(cfg, b, troveIdRaw);

    const priceScale = 10 ** (36 - b.decimals); // USD per whole token divisor
    const priceRaw = fetched && fetched[0] > BigInt(0) ? fetched[0] : lastGood;
    const priceStale = !(fetched && fetched[0] > BigInt(0)) && lastGood != null;
    const priceUsd = priceRaw != null && priceRaw > BigInt(0) ? Number(priceRaw) / priceScale : null;

    const debtScale = 1e18;
    const collScale = 10 ** b.decimals;
    const entireDebt = Number(data.entireDebt) / debtScale;
    const entireColl = Number(data.entireColl) / collScale;

    // Phase 2 — the contract's own ICR at the same price, plus the redemption
    // queue: collect the sorted list (a linked walk), then batch the datas.
    let icr: number | null = null;
    let debtInFront: number | null = null;
    let trovesAhead: number | null = null;
    let inSortedList = false;
    let queueLen: number | null = null;
    if (priceRaw != null && priceRaw > BigInt(0)) {
      if (data.entireDebt > BigInt(0)) {
        try {
          const icrRaw = (await client.readContract({
            address: tm,
            abi: TM_ABI,
            functionName: "getCurrentICR",
            args: [troveId, priceRaw],
          })) as bigint;
          // The contract returns max-uint for debtless troves; guard on scale.
          icr = icrRaw < BigInt("0xffffffffffffffffffffffffffffffff") ? Number(icrRaw) / 1e18 : null;
        } catch {
          icr = null;
        }
      }
      // Walk the queue head→tail (descending rate). Debt-in-front for this
      // trove = Σ entireDebt of troves AFTER it (lower rates, redeemed first).
      try {
        const ids: bigint[] = [];
        let id = firstId;
        while (id != null && id !== BigInt(0) && ids.length < WALK_CAP) {
          ids.push(id);
          id = (await client.readContract({
            address: st,
            abi: ST_ABI,
            functionName: "getNext",
            args: [id],
          })) as bigint;
        }
        const idx = ids.findIndex((x) => x === troveId);
        queueLen = ids.length;
        inSortedList = idx >= 0;
        if (inSortedList) {
          const after = ids.slice(idx + 1);
          if (after.length === 0) {
            debtInFront = 0;
            trovesAhead = 0;
          } else {
            const datas = (await client.multicall({
              allowFailure: true,
              contracts: after.map((x) => atTm("getLatestTroveData", [x])),
            })) as { status: string; result?: { entireDebt: bigint } }[];
            let sum = 0;
            let n = 0;
            for (const d of datas) {
              if (d.status !== "success" || !d.result) continue;
              sum += Number(d.result.entireDebt) / debtScale;
              n++;
            }
            debtInFront = sum;
            trovesAhead = n;
          }
        } else if (statusNum === 4) {
          // Zombie: outside the list, redeemed before everything in it.
          debtInFront = 0;
          trovesAhead = 0;
        }
      } catch {
        debtInFront = null;
        trovesAhead = null;
      }
    }

    const branchDebt = branchDebtRaw != null ? Number(branchDebtRaw) / debtScale : null;
    const branchColl = branchCollRaw != null ? Number(branchCollRaw) / collScale : null;

    return {
      protocol: cfg.protocol,
      branch: b.key,
      symbol: b.symbol,
      troveId: troveIdRaw,
      blockNumber,
      status: STATUS[statusNum] ?? "nonExistent",
      entireDebtRaw: data.entireDebt.toString(),
      entireDebt,
      entireCollRaw: data.entireColl.toString(),
      entireColl,
      accruedInterest: Number(data.accruedInterest) / debtScale,
      redistDebtGain: Number(data.redistBoldDebtGain) / debtScale,
      redistCollGain: Number(data.redistCollGain) / collScale,
      recordedDebt: Number(data.recordedDebt) / debtScale,
      annualInterestRatePct: Number(data.annualInterestRate) / 1e16,
      priceUsd,
      priceStale,
      oracleDown: fetched != null ? fetched[1] : false,
      icr,
      mcr: b.mcr,
      ccr: b.ccr,
      scr: b.scr,
      liqPriceUsd: entireDebt > 0 && entireColl > 0 ? (entireDebt * b.mcr) / entireColl : null,
      branchDebt,
      branchColl,
      // A branch whose troves have all gone still reports DUST debt from its
      // aggregate interest bookkeeping, and dividing collateral by dust yields
      // a ratio in the quintillions — the branches lane's rule applies here
      // too: gate on the QUEUE, not on debt > 0 (a failed walk falls back to
      // a whole-token floor). An empty branch has no ratio to state.
      branchTcr:
        branchDebt != null &&
        branchColl != null &&
        priceUsd != null &&
        (queueLen != null ? queueLen > 0 && branchDebt > 0 : branchDebt >= 1)
          ? (branchColl * priceUsd) / branchDebt
          : null,
      inSortedList,
      debtInFront,
      trovesAhead,
      chainStale: false,
    };
  } catch {
    return stub(cfg, b, troveIdRaw);
  }
}
