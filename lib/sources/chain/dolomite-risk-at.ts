// Dolomite's risk figures at a past block, and the core's risk setter logs,
// for the Lifetime flows chart's margin-ratio view (lib/dolomite/flows-health.ts,
// ui-jobs 328 step 8).
//
//   readDolomiteRiskAt  — one multicall at the end of a block: getMarginRatio,
//                         the account's getAccountRiskOverrideByAccount and
//                         getMarginRatioForAccount, and getMarketMarginPremium
//                         for each named market.
//   readDolomiteRiskLog — the core's LogSetMarginRatio and LogSetMarginPremium
//                         logs from its deployment to a block: one topic-filtered
//                         eth_getLogs (about fifty logs over the core's life),
//                         each log's block read once for its time.
//
// SERVER-ONLY.

import { getAddress, keccak256, parseAbi, toHex, type ContractFunctionParameters, type Hex } from "viem";
import { alchemyClient } from "./rpc";
import { DOLOMITE_ADDRESSES, DOLOMITE_BASE } from "@/lib/dolomite/asset-catalog";

const MARGIN = DOLOMITE_ADDRESSES.MARGIN as `0x${string}`;
/** The block that deployed the core (its first LogSetMarginRatio). */
export const DOLOMITE_CORE_FROM_BLOCK = 22_753_940;

const ABI = parseAbi([
  "struct Info { address owner; uint256 number; }",
  "function getAccountRiskOverrideByAccount(Info account) view returns ((uint256 value) marginRatioOverride, (uint256 value) liquidationSpreadOverride)",
  "function getMarginRatioForAccount(Info account) view returns ((uint256 value))",
  "function getMarginRatio() view returns ((uint256 value))",
  "function getMarketMarginPremium(uint256 marketId) view returns ((uint256 value))",
]);

/** The account's risk figures at the end of one block, fractions of 1. */
export interface DolomiteRiskAt {
  block: number;
  /** The global margin ratio (getMarginRatio). */
  marginRatio: number;
  /** The core's ratio for this account: the override where set. */
  marginRatioForAccount: number;
  /** The account's override ratio, null where none is set. */
  overrideMarginRatio: number | null;
  /** Each named market's margin premium; a market the core did not list at
   *  the block is absent. */
  premiums: Record<string, number>;
}

type Res = { status: string; result?: unknown };
const value = (r: Res | undefined): number | null =>
  r?.status === "success" && r.result != null ? Number((r.result as { value: bigint }).value) / DOLOMITE_BASE : null;

export async function readDolomiteRiskAt(
  owner: string,
  accountNumber: string,
  block: number,
  markets: readonly number[],
): Promise<DolomiteRiskAt | null> {
  const account = { owner: getAddress(owner), number: BigInt(accountNumber) };
  const contracts: ContractFunctionParameters[] = [
    { address: MARGIN, abi: ABI, functionName: "getMarginRatio" },
    { address: MARGIN, abi: ABI, functionName: "getMarginRatioForAccount", args: [account] },
    { address: MARGIN, abi: ABI, functionName: "getAccountRiskOverrideByAccount", args: [account] },
    ...markets.map((m) => ({ address: MARGIN, abi: ABI, functionName: "getMarketMarginPremium", args: [BigInt(m)] })),
  ];
  const res = (await alchemyClient().multicall({
    allowFailure: true,
    blockNumber: BigInt(block),
    contracts,
  })) as Res[];
  const marginRatio = value(res[0]);
  const forAccount = value(res[1]);
  if (marginRatio == null || forAccount == null || !(forAccount > 0)) return null;
  const ovr = res[2]?.status === "success" ? (res[2].result as readonly [{ value: bigint }, { value: bigint }]) : null;
  const overrideMarginRatio = ovr && ovr[0].value > BigInt(0) ? Number(ovr[0].value) / DOLOMITE_BASE : null;
  const premiums: Record<string, number> = {};
  markets.forEach((m, i) => {
    const p = value(res[3 + i]);
    if (p != null && p >= 0) premiums[String(m)] = p;
  });
  return { block, marginRatio, marginRatioForAccount: forAccount, overrideMarginRatio, premiums };
}

/** One risk setter log of the core. */
export interface DolomiteRiskSet {
  block: number;
  timestamp: number;
  txHash: string;
  logIndex: number;
  kind: "margin-ratio" | "margin-premium";
  /** The market a premium was set on. */
  marketId: number | null;
  /** The value set, a fraction of 1. */
  value: number;
}

export interface DolomiteRiskLog {
  fromBlock: number;
  toBlock: number;
  sets: DolomiteRiskSet[];
}

const RATIO_TOPIC = keccak256(toHex("LogSetMarginRatio((uint256))"));
const PREMIUM_TOPIC = keccak256(toHex("LogSetMarginPremium(uint256,(uint256))"));

const cache = new Map<number, Promise<DolomiteRiskLog>>();

async function readOnce(toBlock: number): Promise<DolomiteRiskLog> {
  const client = alchemyClient();
  const logs = (await client.request({
    method: "eth_getLogs",
    params: [
      {
        address: MARGIN,
        topics: [[RATIO_TOPIC, PREMIUM_TOPIC]],
        fromBlock: toHex(DOLOMITE_CORE_FROM_BLOCK),
        toBlock: toHex(toBlock),
      },
    ],
  })) as { data: Hex; topics: Hex[]; blockNumber: Hex; transactionHash: Hex; logIndex: Hex }[];
  const times = new Map<number, number>();
  for (const b of new Set(logs.map((l) => Number(l.blockNumber)))) {
    const header = await client.getBlock({ blockNumber: BigInt(b) });
    times.set(b, Number(header.timestamp));
  }
  const word = (hex: string, i: number) => BigInt(`0x${hex.slice(2 + 64 * i, 2 + 64 * (i + 1))}`);
  const sets = logs.map((l): DolomiteRiskSet => {
    const block = Number(l.blockNumber);
    const premium = l.topics[0] === PREMIUM_TOPIC;
    return {
      block,
      timestamp: times.get(block)!,
      txHash: String(l.transactionHash).toLowerCase(),
      logIndex: Number(l.logIndex),
      kind: premium ? "margin-premium" : "margin-ratio",
      marketId: premium ? Number(word(l.data, 0)) : null,
      value: Number(word(l.data, premium ? 1 : 0)) / DOLOMITE_BASE,
    };
  });
  sets.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
  return { fromBlock: DOLOMITE_CORE_FROM_BLOCK, toBlock, sets };
}

/** The setter logs to `toBlock`, kept per block for the life of the server. */
export function readDolomiteRiskLog(toBlock: number): Promise<DolomiteRiskLog> {
  let p = cache.get(toBlock);
  if (!p) {
    p = readOnce(toBlock);
    p.catch(() => cache.delete(toBlock));
    cache.set(toBlock, p);
  }
  return p;
}

/** The head rounded down to the hour's blocks, so a page's reads share one
 *  answer for an hour. */
export async function dolomiteRiskLogBlock(): Promise<number> {
  const head = Number(await alchemyClient().getBlockNumber());
  return head - (head % 300);
}
