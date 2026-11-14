// A Liquity V2 deployment's branches and Troves at the chain's head, asked of
// rails-server first.
// ----------------------------------------------------------------------------
// rails-server's `/api/at-block/liquity-fork/{state,trove}` read the calls the
// web's fork readers make (lib/sources/chain/liquity-fork-{branches,position,
// prices}.ts) at one block, keyless gateway first and paid leg last, and keep
// the answer 30 s with one read for concurrent callers (rails-ops
// decisions/0056 step 3). The reads are settled here with the readers' own
// arithmetic (liquity-fork-settle.ts) and the catalog's figures.
//
// Null when the route cannot answer: no RAILS_API_URL, a deployment it does not
// serve, a refused connection, a non-2xx answer or 3 s without one; after a
// failure the chain is read for 30 s without asking (route-gate.ts). The caller
// then reads the chain as before.
//
// SERVER-ONLY.

import { parseAbi, type ContractFunctionParameters } from "viem";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { chainClient } from "@/lib/sources/chain/rpc";
import { routeGate } from "./route-gate";
import { MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { PositionHeadStamp } from "@/lib/api/fetch-aave-v3-position";
import type {
  LiquityForkBranchConfig,
  LiquityForkConfig,
  LiquityForkTroveChainResponse,
} from "@/lib/sources/chain/liquity-fork-position";
import type { LiquityForkBranchesResponse } from "@/lib/sources/chain/liquity-fork-branches";
import type { LiquityForkPriceMap } from "@/lib/sources/chain/liquity-fork-prices";
import { EBISU_BRANCHES } from "@/lib/ebisu/asset-catalog";
import { ASYMMETRY_BRANCHES } from "@/lib/asymmetry/asset-catalog";
import { BASEDOLLAR_BRANCHES } from "@/lib/basedollar/asset-catalog";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import {
  settleBranch,
  settleBranches,
  settlePrice,
  settleTrove,
  type TroveDataRead,
} from "@/lib/sources/chain/liquity-fork-settle";

const gate = routeGate();
/** rails-server's ids-array cap, the roster reader's IDS_CAP. */
const IDS_CAP = 120;

/** The deployments rails-server reads, each on its chain. */
const FORK_CHAIN: Record<string, number> = { ebisu: 1, asymmetry: 1, "liquity-v2": 1, basedollar: 8453 };
const SERVER_FORKS = new Set(Object.keys(FORK_CHAIN));
/** Each branch's TroveManager on its chain → its deployment, for the price reads, which name branches only. */
const FORK_OF_TROVE_MANAGER = new Map<string, string>(
  (
    [
      ["ebisu", EBISU_BRANCHES],
      ["asymmetry", ASYMMETRY_BRANCHES],
      ["basedollar", BASEDOLLAR_BRANCHES],
      ["liquity-v2", LIQUITY_V2_BRANCHES],
    ] as [string, Record<string, { troveManager: string }>][]
  ).flatMap(([fork, branches]) =>
    Object.values(branches).map(
      (b) => [`${FORK_CHAIN[fork]}:${b.troveManager.toLowerCase()}`, fork] as [string, string],
    ),
  ),
);

function forkOf(branches: LiquityForkBranchConfig[], chainId: ChainId): string | null {
  const forks = new Set(
    branches.map((b) => FORK_OF_TROVE_MANAGER.get(`${chainId}:${b.troveManager.toLowerCase()}`) ?? null),
  );
  const [fork] = [...forks];
  return forks.size === 1 && fork ? fork : null;
}

interface BranchRaw {
  fetchPrice: { price: string; oracleDown: boolean } | null;
  lastGoodPrice: string | null;
  branchDebt: string | null;
  branchColl: string | null;
  idsCount: string | null;
  first: string | null;
  last: string | null;
  size: string | null;
  /** TroveManager.lastZombieTroveId; absent from a server that predates it (read here instead). */
  lastZombieTroveId?: string | null;
  ids: (string | null)[];
  headWalk: string[];
  tailWalk: string[];
  troves: Record<
    string,
    { data: { entireDebt: string; entireColl: string; annualInterestRate: string } | null; status: number | null }
  >;
}

interface StateRaw {
  fork: string;
  blockNumber: number;
  branches: Record<string, BranchRaw>;
  head: PositionHeadStamp;
}

interface TroveRaw {
  blockNumber: number;
  branch: BranchRaw;
  trove: { data: Record<string, string> | null; status: number | null; icr: string | null };
  head: PositionHeadStamp;
}

async function ask<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const qs = new URLSearchParams(params);
  const body = await gate.json<T & { branches?: unknown; branch?: unknown; blockNumber?: unknown }>(
    "liquity-fork",
    `${process.env.RAILS_API_URL}/api/at-block/liquity-fork/${path}?${qs.toString()}`,
    createAuthFetchOptions(),
  );
  return body && typeof body === "object" && typeof body.blockNumber === "number" && (body.branches || body.branch)
    ? body
    : null;
}

const big = (s: string | null): bigint | null => (s == null ? null : BigInt(s));

const POINTER_ABI = parseAbi([
  "function lastZombieTroveId() view returns (uint256)",
  "function getLatestTroveData(uint256 troveId) view returns ((uint256 entireDebt, uint256 entireColl, uint256 redistBoldDebtGain, uint256 redistCollGain, uint256 accruedInterest, uint256 recordedDebt, uint256 annualInterestRate, uint256 weightedRecordedDebt, uint256 accruedBatchManagementFee, uint256 lastInterestRateAdjTime))",
]);

/** Fills lastZombieTroveId, and its Trove's data, where the server's answer predates them: one
 *  multicall at the answer's block, a second only when a pointer's Trove went unread. Once the
 *  server reads the pointer this returns without a call. */
async function withPointers(
  chainId: number,
  block: number,
  pairs: { b: LiquityForkBranchConfig; r: BranchRaw }[],
): Promise<void> {
  const missing = pairs.filter(({ r }) => r.lastZombieTroveId === undefined);
  if (missing.length === 0) return;
  const client = chainClient(chainId as ChainId);
  const blockNumber = BigInt(block);
  try {
    const got = await client.multicall({
      allowFailure: true,
      blockNumber,
      contracts: missing.map(
        ({ b }) =>
          ({
            address: b.troveManager,
            abi: POINTER_ABI,
            functionName: "lastZombieTroveId",
          }) as ContractFunctionParameters,
      ),
    });
    missing.forEach(({ r }, i) => {
      r.lastZombieTroveId = got[i].status === "success" ? String(got[i].result) : null;
    });
    const unread = missing.filter(
      ({ r }) => r.lastZombieTroveId && r.lastZombieTroveId !== "0" && !r.troves[r.lastZombieTroveId]?.data,
    );
    if (unread.length === 0) return;
    const datas = await client.multicall({
      allowFailure: true,
      blockNumber,
      contracts: unread.map(
        ({ b, r }) =>
          ({
            address: b.troveManager,
            abi: POINTER_ABI,
            functionName: "getLatestTroveData",
            args: [BigInt(r.lastZombieTroveId!)],
          }) as ContractFunctionParameters,
      ),
    });
    unread.forEach(({ r }, i) => {
      const d = datas[i].status === "success" ? (datas[i].result as Record<string, bigint>) : null;
      r.troves[r.lastZombieTroveId!] = {
        data: d
          ? {
              entireDebt: String(d.entireDebt),
              entireColl: String(d.entireColl),
              annualInterestRate: String(d.annualInterestRate),
            }
          : null,
        status: 4,
      };
    });
  } catch {
    missing.forEach(({ r }) => {
      if (r.lastZombieTroveId === undefined) r.lastZombieTroveId = null;
    });
  }
}
const fetchedOf = (b: BranchRaw): [bigint, boolean] | null =>
  b.fetchPrice ? [BigInt(b.fetchPrice.price), b.fetchPrice.oracleDown] : null;

/** A deployment's branch roster from rails-server; null where the route cannot answer. */
export async function serverLiquityForkBranches(cfg: LiquityForkConfig): Promise<LiquityForkBranchesResponse | null> {
  if (!SERVER_FORKS.has(cfg.protocol) || (cfg.chainId ?? MAINNET_CHAIN_ID) !== FORK_CHAIN[cfg.protocol]) return null;
  const raw = await ask<StateRaw>("state", { fork: cfg.protocol });
  if (!raw) return null;
  const configs = Object.values(cfg.branches);
  if (!configs.every((b) => raw.branches[b.key])) return null;
  await withPointers(
    FORK_CHAIN[cfg.protocol],
    raw.blockNumber,
    configs.map((b) => ({ b, r: raw.branches[b.key] })),
  );
  const branches = configs.map((b) => {
    const r = raw.branches[b.key];
    return settleBranch(
      b,
      {
        fetched: fetchedOf(r),
        lastGood: big(r.lastGoodPrice),
        branchDebtRaw: big(r.branchDebt),
        branchCollRaw: big(r.branchColl),
        idsCount: big(r.idsCount),
        listSize: big(r.size),
        listed: r.tailWalk.map((x) => BigInt(x)),
        allIds: r.ids.filter((x): x is string => x != null).map((x) => BigInt(x)),
        dataOf: (id) => {
          const d = r.troves[id.toString()]?.data;
          return d
            ? {
                entireDebt: BigInt(d.entireDebt),
                entireColl: BigInt(d.entireColl),
                annualInterestRate: BigInt(d.annualInterestRate),
              }
            : null;
        },
        statusOf: (id) => r.troves[id.toString()]?.status ?? null,
        lastZombieId: big(r.lastZombieTroveId ?? null),
      },
      IDS_CAP,
    );
  });
  return { ...settleBranches(cfg, raw.blockNumber, branches), head: raw.head };
}

/** One Trove from rails-server; null where the route cannot answer. */
export async function serverLiquityForkTrove(
  cfg: LiquityForkConfig,
  branchKey: string,
  troveIdRaw: string,
): Promise<LiquityForkTroveChainResponse | null> {
  const b = cfg.branches[branchKey];
  if (!b || !SERVER_FORKS.has(cfg.protocol) || (cfg.chainId ?? MAINNET_CHAIN_ID) !== FORK_CHAIN[cfg.protocol])
    return null;
  const raw = await ask<TroveRaw>("trove", {
    fork: cfg.protocol,
    branch: b.key,
    troveId: BigInt(troveIdRaw).toString(),
  });
  if (!raw) return null;
  const r = raw.branch;
  await withPointers(FORK_CHAIN[cfg.protocol], raw.blockNumber, [{ b, r }]);
  const d = raw.trove.data;
  const data: TroveDataRead | null = d
    ? {
        entireDebt: BigInt(d.entireDebt),
        entireColl: BigInt(d.entireColl),
        redistBoldDebtGain: BigInt(d.redistBoldDebtGain),
        redistCollGain: BigInt(d.redistCollGain),
        accruedInterest: BigInt(d.accruedInterest),
        recordedDebt: BigInt(d.recordedDebt),
        annualInterestRate: BigInt(d.annualInterestRate),
        accruedBatchManagementFee: BigInt(d.accruedBatchManagementFee ?? "0"),
      }
    : null;
  const answer = settleTrove(cfg, b, troveIdRaw, {
    blockNumber: raw.blockNumber,
    fetched: fetchedOf(r),
    lastGood: big(r.lastGoodPrice),
    data,
    statusNum: raw.trove.status,
    branchDebtRaw: big(r.branchDebt),
    branchCollRaw: big(r.branchColl),
    icrRaw: big(raw.trove.icr),
    walk: r.headWalk.map((x) => BigInt(x)),
    entireDebtOf: (id) => big(r.troves[id.toString()]?.data?.entireDebt ?? null),
    lastZombieId: big(r.lastZombieTroveId ?? null),
  });
  return answer.chainStale ? answer : { ...answer, head: raw.head };
}

/** The branches' prices from rails-server, keyed by branch; null where the
 *  route cannot answer or the branches are not one deployment it reads. */
export async function serverLiquityForkPrices(
  branches: LiquityForkBranchConfig[],
  chainId: ChainId,
): Promise<LiquityForkPriceMap | null> {
  const fork = branches.length > 0 ? forkOf(branches, chainId) : null;
  if (!fork) return null;
  const raw = await ask<StateRaw>("state", { fork });
  if (!raw || !branches.every((b) => raw.branches[b.key])) return null;
  const out: LiquityForkPriceMap = new Map();
  for (const b of branches) {
    const r = raw.branches[b.key];
    const p = settlePrice(b, r.fetchPrice ? BigInt(r.fetchPrice.price) : null, big(r.lastGoodPrice));
    if (p) out.set(b.key, p);
  }
  return out;
}
