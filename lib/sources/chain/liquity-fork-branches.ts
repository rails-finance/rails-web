// Live Liquity-V2-fork BRANCH ROSTER — the protocol-level companion to
// liquity-fork-position.ts, shared by Ebisu and Asymmetry. Where the position
// lane answers "where does THIS trove stand", this one answers the protocol
// question the per-trove page can't: how the branches compare, and what the
// whole rate-ordered redemption queue looks like from the front.
//
// Per branch, at one head block:
//   • The branch price — fetchPrice SIMULATED via eth_call (state-mutating
//     on-chain, read-only under eth_call), falling back to the lagging
//     lastGoodPrice with `priceStale` set. Scale 1e(36 − collateral decimals).
//   • The branch aggregates: getEntireBranchDebt / getEntireBranchColl → TCR
//     at that same price, against the branch's own CCR / SCR.
//   • The redemption queue IN REDEMPTION ORDER. SortedTroves descends by
//     annual interest rate and redemptions sweep the LOWEST rate first, so the
//     queue front is the list's TAIL: we walk the branch's own list from that
//     tail (getLast/getPrev — its order, not a client-side re-sort), so the
//     walk yields the queue front-first and the WALK_CAP elides the queue's
//     BACK (highest rates, furthest from redemption), never its front. A
//     capped branch reports `queueCapped` so the view can say so. Zombie
//     troves sit OUTSIDE the list entirely and are redeemed before everything
//     in it — they're found through the TroveManager's own ids array
//     (getTroveIdsCount / getTroveFromTroveIdsArray, which enumerates every
//     trove the branch has, listed or not) and placed at the queue's front.
//
// The same contract graph the depth pass derived and
// scripts/verify-liquity-forks-chain.mjs asserts. SERVER-ONLY.

import { parseAbi, type ContractFunctionParameters } from "viem";
import { chainClient } from "./rpc";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { LiquityForkConfig, LiquityForkBranchConfig } from "./liquity-fork-position";
import type { PositionHeadStamp } from "@/lib/api/fetch-aave-v3-position";
import { serverLiquityForkBranches } from "@/lib/sources/api/liquity-fork-head";
import { emptyBranch, settleBranch, settleBranches, type RosterTroveRead } from "./liquity-fork-settle";

const TM_ABI = parseAbi([
  "function getLatestTroveData(uint256 troveId) view returns ((uint256 entireDebt, uint256 entireColl, uint256 redistBoldDebtGain, uint256 redistCollGain, uint256 accruedInterest, uint256 recordedDebt, uint256 annualInterestRate, uint256 weightedRecordedDebt, uint256 accruedBatchManagementFee, uint256 lastInterestRateAdjTime))",
  "function getTroveStatus(uint256 troveId) view returns (uint8)",
  "function getEntireBranchDebt() view returns (uint256)",
  "function getEntireBranchColl() view returns (uint256)",
  "function getTroveIdsCount() view returns (uint256)",
  "function getTroveFromTroveIdsArray(uint256 index) view returns (uint256)",
]);
// fetchPrice mutates on-chain; declared view so eth_call simulates it.
const PF_ABI = parseAbi([
  "function fetchPrice() view returns (uint256, bool)",
  "function lastGoodPrice() view returns (uint256)",
]);
const ST_ABI = parseAbi([
  "function getSize() view returns (uint256)",
  "function getLast() view returns (uint256)",
  "function getPrev(uint256 id) view returns (uint256)",
]);

/** Hard stops — these branches hold single digits of troves today; the caps
 *  keep a governance-scale roster from turning one page load into a sweep. */
const WALK_CAP = 60;
const IDS_CAP = 120;

/** One trove's place in a branch's redemption queue, in redemption order. */
export interface LiquityForkQueueEntry {
  troveId: string;
  /** User-set annual interest rate (percent) — the queue's sort key. */
  annualInterestRatePct: number;
  /** Entire debt, pending redistribution + accrued interest included. */
  entireDebt: number;
  /** Entire collateral, same reckoning. */
  entireColl: number;
  /** True for a zombie: below the minimum debt after a partial redemption, so
   *  outside the sorted list and redeemed before everything in it. */
  zombie: boolean;
  /** Σ entire debt of everything ahead of this trove in the queue — what
   *  redemptions consume before they reach it. */
  debtInFront: number;
}

/** One collateral branch at head — its own market, price and queue. */
export interface LiquityForkBranchState {
  key: string;
  symbol: string;
  decimals: number;
  troveManager: string;
  /** The branch's own oracle price, USD per whole collateral token. */
  priceUsd: number | null;
  /** True when the simulated fetchPrice failed and the lagging lastGoodPrice
   *  is shown instead. */
  priceStale: boolean;
  /** The feed's own oracle-failure flag from fetchPrice. */
  oracleDown: boolean;
  /** Branch aggregates at the same head. */
  branchDebt: number | null;
  branchColl: number | null;
  /** Branch collateral × price — the branch's collateral in USD. */
  branchCollUsd: number | null;
  /** Total collateral ratio: branch coll × price ÷ branch debt. */
  tcr: number | null;
  /** Governance constants (chain-verified catalog). */
  mcr: number;
  ccr: number;
  scr: number;
  /** The queue, front (redeemed first) → back. Zombies lead it. */
  queue: LiquityForkQueueEntry[];
  /** Troves in the branch's own sorted list (SortedTroves.getSize). */
  listedCount: number;
  /** True when the list outgrew WALK_CAP: the queue holds only its FRONT
   *  (the walk starts at the tail, so what's elided is the back — the
   *  highest rates, furthest from redemption) and the rate span / averages
   *  read over that front slice, not the whole branch. */
  queueCapped: boolean;
  /** Every trove the branch has (TroveManager.getTroveIdsCount) — the
   *  zombie census's enumeration universe. */
  idsTotal: number | null;
  /** True when that universe outgrew IDS_CAP: the zombie census is a floor,
   *  not a count. */
  idsCapped: boolean;
  /** Zombies outside that list AND still carrying debt — i.e. those actually
   *  in the queue. A fully-redeemed zombie (zero debt) is real state but not
   *  queue state, so it isn't counted here. */
  zombieCount: number;
  /** Rate span across the listed queue (percent) — null on an empty branch. */
  minRatePct: number | null;
  maxRatePct: number | null;
  /** Debt-weighted average rate across the listed queue — what the branch
   *  actually pays, rather than the midpoint of its span. */
  avgRatePct: number | null;
  /** True when this branch's reads failed; the row renders as unavailable
   *  rather than as an empty branch. */
  stale: boolean;
}

export interface LiquityForkBranchesResponse {
  protocol: string;
  debtSymbol: string;
  blockNumber: number;
  branches: LiquityForkBranchState[];
  /** Σ branch debt across every branch that answered. */
  totalDebt: number;
  /** Σ branch collateral USD across every branch that answered AND priced. */
  totalCollUsd: number | null;
  /** True when every branch priced — so totalCollUsd covers the whole
   *  protocol rather than a subset (a partial total is not stated). */
  totalCollUsdComplete: boolean;
  /** True when the whole read failed and the page must say so. */
  chainStale: boolean;
  /** Present when rails-server read it: the block's time, when it was read, the leg that answered. */
  head?: PositionHeadStamp;
}

/**
 * Read one fork's whole branch roster from its own contracts: from
 * rails-server first when no block is asked (lib/sources/api/liquity-fork-head.ts),
 * else straight from the chain; `atBlock` pins every read to that block. A
 * branch whose reads fail comes back `stale` (the rest of the roster still
 * renders); a total failure comes back `chainStale` so the page states that
 * instead of showing an empty protocol.
 */
export async function loadLiquityForkBranchesFromChain(
  cfg: LiquityForkConfig,
  atBlock?: number,
): Promise<LiquityForkBranchesResponse> {
  const configs = Object.values(cfg.branches);
  if (atBlock === undefined) {
    const served = await serverLiquityForkBranches(cfg);
    if (served) return served;
  }
  try {
    const client = chainClient(cfg.chainId ?? MAINNET_CHAIN_ID);
    const blockNumber: number = atBlock != null ? atBlock : await client.getBlockNumber().then(Number);
    const branches = await Promise.all(configs.map((b) => loadBranch(client, b, atBlock)));
    return settleBranches(cfg, blockNumber, branches);
  } catch {
    return {
      protocol: cfg.protocol,
      debtSymbol: cfg.debtSymbol,
      blockNumber: 0,
      branches: configs.map(emptyBranch),
      totalDebt: 0,
      totalCollUsd: null,
      totalCollUsdComplete: false,
      chainStale: true,
    };
  }
}

async function loadBranch(
  client: ReturnType<typeof chainClient>,
  b: LiquityForkBranchConfig,
  atBlock?: number,
): Promise<LiquityForkBranchState> {
  const tm = b.troveManager as `0x${string}`;
  const pf = b.priceFeed as `0x${string}`;
  const st = b.sortedTroves as `0x${string}`;
  const blockOpt = atBlock != null ? { blockNumber: BigInt(atBlock) } : {};
  const atTm = (functionName: string, args: readonly unknown[] = []): ContractFunctionParameters =>
    ({ address: tm, abi: TM_ABI, functionName, args }) as ContractFunctionParameters;

  try {
    // Phase 1 — price, aggregates, and the two roster handles: the sorted
    // list's TAIL (the queue's FRONT — lowest rate, redeemed first) and the
    // ids-array count (every trove the branch has, zombies included).
    const phase1 = await client.multicall({
      allowFailure: true,
      ...blockOpt,
      contracts: [
        { address: pf, abi: PF_ABI, functionName: "fetchPrice" } as ContractFunctionParameters,
        { address: pf, abi: PF_ABI, functionName: "lastGoodPrice" } as ContractFunctionParameters,
        atTm("getEntireBranchDebt"),
        atTm("getEntireBranchColl"),
        atTm("getTroveIdsCount"),
        { address: st, abi: ST_ABI, functionName: "getLast" } as ContractFunctionParameters,
        { address: st, abi: ST_ABI, functionName: "getSize" } as ContractFunctionParameters,
      ],
    });
    const r = (i: number): unknown => (phase1[i].status === "success" ? phase1[i].result : null);
    const fetched = r(0) as [bigint, boolean] | null;
    const lastGood = r(1) as bigint | null;
    const branchDebtRaw = r(2) as bigint | null;
    const branchCollRaw = r(3) as bigint | null;
    const idsCount = r(4) as bigint | null;
    const lastId = r(5) as bigint | null;
    const listSize = r(6) as bigint | null;
    // Aggregates are the row's reason to exist — without them there is no
    // branch to show (and nothing to walk).
    if (branchDebtRaw == null || branchCollRaw == null) return emptyBranch(b);

    // Phase 2 — the sorted list walked from its TAIL (getPrev ascends the
    // rate order), so `listed` is the queue front-first and a capped walk
    // elides the queue's back, never the troves nearest redemption. Then the
    // ids array to catch the zombies that sit outside the list.
    const listed: bigint[] = [];
    let id = lastId;
    while (id != null && id !== BigInt(0) && listed.length < WALK_CAP) {
      listed.push(id);
      id = (await client.readContract({
        address: st,
        abi: ST_ABI,
        functionName: "getPrev",
        args: [id],
        ...blockOpt,
      })) as bigint;
    }

    const n = idsCount != null ? Math.min(Number(idsCount), IDS_CAP) : 0;
    const allIds =
      n > 0
        ? (
            (await client.multicall({
              allowFailure: true,
              ...blockOpt,
              contracts: Array.from({ length: n }, (_, i) => atTm("getTroveFromTroveIdsArray", [BigInt(i)])),
            })) as { status: string; result?: bigint }[]
          )
            .filter((x) => x.status === "success" && x.result != null)
            .map((x) => x.result as bigint)
        : [];

    const listedSet = new Set(listed.map(String));
    const unlisted = allIds.filter((x) => !listedSet.has(String(x)));

    // Phase 3 — every trove's live data + status in one batch: the listed
    // queue and the unlisted candidates together.
    const subjects = [...listed, ...unlisted];
    const datas =
      subjects.length > 0
        ? ((await client.multicall({
            allowFailure: true,
            ...blockOpt,
            contracts: [
              ...subjects.map((x) => atTm("getLatestTroveData", [x])),
              ...subjects.map((x) => atTm("getTroveStatus", [x])),
            ],
          })) as { status: string; result?: unknown }[])
        : [];
    const dataBy = new Map<string, RosterTroveRead | null>();
    const statusBy = new Map<string, number | null>();
    subjects.forEach((x, i) => {
      dataBy.set(String(x), datas[i]?.status === "success" ? (datas[i].result as RosterTroveRead) : null);
      const s = datas[subjects.length + i];
      statusBy.set(String(x), s?.status === "success" ? (s.result as number) : null);
    });

    return settleBranch(
      b,
      {
        fetched,
        lastGood,
        branchDebtRaw,
        branchCollRaw,
        idsCount,
        listSize,
        listed,
        allIds,
        dataOf: (x) => dataBy.get(String(x)) ?? null,
        statusOf: (x) => statusBy.get(String(x)) ?? null,
      },
      IDS_CAP,
    );
  } catch {
    return emptyBranch(b);
  }
}
