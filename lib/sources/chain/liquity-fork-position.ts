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
import type { PositionHeadStamp } from "@/lib/api/fetch-aave-v3-position";
import { serverLiquityForkTrove } from "@/lib/sources/api/liquity-fork-head";
import { settleTrove, troveStub, type TroveDataRead } from "./liquity-fork-settle";

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
  /** The collateral token's decimals: the scale `entireCollRaw` is in. */
  collDecimals: number;
  /** The split getLatestTroveData states: interest accrued since the recorded
   *  debt, and redistribution gains from liquidations. */
  accruedInterest: number;
  /** A batch member's share of the management fee its batch manager has built
   *  up since the batch was last updated — getLatestTroveData's
   *  accruedBatchManagementFee, part of entireDebt. 0 for a Trove outside a
   *  batch. */
  accruedBatchManagementFee: number;
  redistDebtGain: number;
  redistCollGain: number;
  recordedDebt: number;
  /** Annual interest rate (percent). For an unbatched trove this is the rate
   *  the owner set; for a batch member getLatestTroveData serves the BATCH's
   *  current rate — the manager's choice, not the owner's. */
  annualInterestRatePct: number;
  /** getLatestTroveData's annualInterestRate integer (18 places, 1 = 100%). */
  annualInterestRateRaw: string;
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
  /** Present when rails-server read it: the block's time, when it was read, the leg that answered. */
  head?: PositionHeadStamp;
}

const WALK_CAP = 40; // branch lists are single-digit today; a hard stop regardless

/**
 * Read one trove's live state from its branch contracts: from rails-server
 * first when no block is asked (lib/sources/api/liquity-fork-head.ts), else
 * straight from the chain. `atBlock` pins every read to that block. Returns a
 * `chainStale` stub on RPC failure so the caller falls back to its
 * event-derived numbers (the risk surfaces just stay off).
 */
export async function loadLiquityForkTroveFromChain(
  cfg: LiquityForkConfig,
  branchKey: string,
  troveIdRaw: string,
  atBlock?: number,
): Promise<LiquityForkTroveChainResponse> {
  const b = cfg.branches[branchKey];
  if (!b) throw new Error(`unknown branch: ${branchKey}`);
  const troveId = BigInt(troveIdRaw);
  if (atBlock === undefined) {
    const served = await serverLiquityForkTrove(cfg, branchKey, troveIdRaw);
    if (served) return served;
  }

  try {
    const client = chainClient(cfg.chainId ?? MAINNET_CHAIN_ID);
    const tm = b.troveManager as `0x${string}`;
    const pf = b.priceFeed as `0x${string}`;
    const st = b.sortedTroves as `0x${string}`;
    const blockOpt = atBlock != null ? { blockNumber: BigInt(atBlock) } : {};
    const atTm = (functionName: string, args: readonly unknown[] = []): ContractFunctionParameters =>
      ({ address: tm, abi: TM_ABI, functionName, args }) as ContractFunctionParameters;

    // Phase 1 — price (simulated fetch + fallback), the trove struct, status,
    // and the branch aggregates, alongside the head block number.
    const [blockNumber, phase1] = await Promise.all([
      atBlock != null ? Promise.resolve(atBlock) : client.getBlockNumber().then(Number),
      client.multicall({
        allowFailure: true,
        ...blockOpt,
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
    const data = r(2) as TroveDataRead | null;
    const statusNum = r(3) as number | null;
    const firstId = r(6) as bigint | null;
    if (!data || statusNum == null) return troveStub(cfg, b, troveIdRaw);

    const priceRaw = fetched && fetched[0] > BigInt(0) ? fetched[0] : lastGood;

    // Phase 2 — the contract's own ICR at the same price, plus the redemption
    // queue: collect the sorted list (a linked walk), then batch the datas.
    let icrRaw: bigint | null = null;
    let walk: bigint[] | null = null;
    const debts = new Map<bigint, bigint | null>();
    if (priceRaw != null && priceRaw > BigInt(0)) {
      if (data.entireDebt > BigInt(0)) {
        try {
          icrRaw = (await client.readContract({
            address: tm,
            abi: TM_ABI,
            functionName: "getCurrentICR",
            args: [troveId, priceRaw],
            ...blockOpt,
          })) as bigint;
        } catch {
          icrRaw = null;
        }
      }
      // Walk the queue head→tail (descending rate).
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
            ...blockOpt,
          })) as bigint;
        }
        const idx = ids.findIndex((x) => x === troveId);
        const after = idx >= 0 ? ids.slice(idx + 1) : [];
        if (after.length > 0) {
          const datas = (await client.multicall({
            allowFailure: true,
            ...blockOpt,
            contracts: after.map((x) => atTm("getLatestTroveData", [x])),
          })) as { status: string; result?: { entireDebt: bigint } }[];
          after.forEach((x, k) =>
            debts.set(x, datas[k].status === "success" && datas[k].result ? datas[k].result!.entireDebt : null),
          );
        }
        walk = ids;
      } catch {
        walk = null;
      }
    }

    return settleTrove(cfg, b, troveIdRaw, {
      blockNumber,
      fetched,
      lastGood,
      data,
      statusNum,
      branchDebtRaw: r(4) as bigint | null,
      branchCollRaw: r(5) as bigint | null,
      icrRaw,
      walk,
      entireDebtOf: (x) => debts.get(x) ?? null,
    });
  } catch {
    return troveStub(cfg, b, troveIdRaw);
  }
}
