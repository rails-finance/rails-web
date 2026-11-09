// What the Morpho markets roster reads beyond the market sweep (rails-ops
// ui-jobs 549, the roster's default view, Miles's agreement of 9 Nov 2026).
// SERVER-ONLY.
// ----------------------------------------------------------------------------
// THE VAULTS' QUEUES. Which markets a vault on Rails's roster lends into is
// the vault directory's `queue` (each funded vault's withdraw queue, read with
// the illiquid test and cached five minutes; lib/sources/chain/
// morpho-base-vault-directory.ts). The roster reuses that cached reading and
// adds no read of its own. Arbitrum has no vault roster: null.
//
// THE MARKS. Two dependent multicalls at the roster's block, for the rows the
// roster ships (a few dozen per chain):
//   1. Multicall3's `getCurrentBlockTimestamp()`; the AdaptiveCurveIRM's
//      `rateAtTarget(id)` for each row 99.9% or more borrowed on it (the rate
//      ceiling test, lib/vaults/illiquid.ts `atRateCeiling`); and the four
//      feed getters of each oracle behind a repeated pair (two or more rows in
//      one loan token with one collateral and one LLTV).
//   2. `description()` on each distinct feed those getters name.
// Both are pinned to the block and ride the page's ISR, so they are made once
// per roster render. A call that fails leaves its row unmarked.

import { parseAbi } from "viem";
import { chainClient } from "./rpc";
import type { ChainId } from "@/lib/shared/chains";
import { loadMetaMorphoVaultDirectory } from "./morpho-base-vault-directory";
import { isAdaptiveCurveIrm } from "@/lib/morpho/adaptive-curve";
import { atRateCeiling, fullyBorrowedShare } from "@/lib/vaults/illiquid";
import { loadMorphoMarketsFromChain, type MorphoMarketRow } from "./morpho-markets";
import type { MorphoDeployment } from "./morpho-deployments";
import {
  rosterData,
  rosterRows,
  withRosterMarks,
  type MorphoPriceSource,
  type MorphoRosterData,
  type MorphoRosterMarks,
} from "@/lib/morpho/markets-shape";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
/** Multicall3, at one address on every chain Rails reads. */
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

const MULTICALL3_ABI = parseAbi(["function getCurrentBlockTimestamp() view returns (uint256)"]);
const IRM_ABI = parseAbi(["function rateAtTarget(bytes32 id) view returns (int256)"]);
const ORACLE_ABI = parseAbi([
  "function BASE_FEED_1() view returns (address)",
  "function BASE_FEED_2() view returns (address)",
  "function QUOTE_FEED_1() view returns (address)",
  "function QUOTE_FEED_2() view returns (address)",
]);
const FEED_ABI = parseAbi(["function description() view returns (string)"]);
const SLOTS = ["BASE_FEED_1", "BASE_FEED_2", "QUOTE_FEED_1", "QUOTE_FEED_2"] as const;

/** The market ids a vault on Rails's roster names in its withdraw queue,
 *  lowercased; null where Rails has no vault roster on the chain or the
 *  directory did not answer. */
export async function readVaultLentMarkets(chainId: ChainId): Promise<Set<string> | null> {
  if (chainId !== 1 && chainId !== 8453) return null;
  try {
    const dir = await loadMetaMorphoVaultDirectory(chainId);
    if (dir.chainStale) return null;
    const ids = new Set<string>();
    for (const r of dir.rows) for (const id of r.queue ?? []) ids.add(id.toLowerCase());
    return ids.size > 0 ? ids : null;
  } catch (error) {
    console.error(`Morpho roster: the vault directory failed (chain ${chainId}):`, error);
    return null;
  }
}

/** The rows that repeat a pair: two or more in one loan token with one
 *  collateral and one LLTV. */
export function repeatedPairRows(rows: readonly MorphoMarketRow[]): MorphoMarketRow[] {
  const by = new Map<string, MorphoMarketRow[]>();
  for (const m of rows) {
    if (m.isIdle) continue;
    const k = `${m.loanToken}:${m.collateralToken}:${m.lltv}`;
    by.set(k, [...(by.get(k) ?? []), m]);
  }
  return [...by.values()].filter((g) => g.length > 1).flat();
}

type Res = { status: string; result?: unknown };

/** The rate ceiling marks and the repeated pairs' price sources, for `rows`, at `block`. */
export async function readRosterMarks(
  chainId: ChainId,
  block: number,
  rows: readonly MorphoMarketRow[],
): Promise<MorphoRosterMarks> {
  const marks: MorphoRosterMarks = { ceiling: {}, priceSources: {} };
  if (block <= 0 || rows.length === 0) return marks;
  const candidates = rows.filter(
    (m) =>
      !m.isIdle && isAdaptiveCurveIrm(chainId, m.irm) && m.utilization != null && fullyBorrowedShare(m.utilization),
  );
  const pairRows = repeatedPairRows(rows);
  const oracles = [...new Set(pairRows.map((m) => m.oracle?.toLowerCase()).filter((o): o is string => o != null))];
  try {
    const client = chainClient(chainId);
    const blockNumber = BigInt(block);
    const calls: unknown[] = [
      { address: MULTICALL3, abi: MULTICALL3_ABI, functionName: "getCurrentBlockTimestamp" },
      ...candidates.map((m) => ({
        address: m.irm as `0x${string}`,
        abi: IRM_ABI,
        functionName: "rateAtTarget" as const,
        args: [m.id as `0x${string}`],
      })),
      ...oracles.flatMap((o) =>
        SLOTS.map((slot) => ({ address: o as `0x${string}`, abi: ORACLE_ABI, functionName: slot })),
      ),
    ];
    const first = (await client.multicall({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contracts: calls as any,
      allowFailure: true,
      blockNumber,
      batchSize: 0,
    })) as Res[];

    const ts = first[0]?.status === "success" ? Number(first[0].result as bigint) : null;
    if (ts != null)
      candidates.forEach((m, i) => {
        const r = first[1 + i];
        if (r?.status !== "success") return;
        const stored = r.result as bigint;
        const elapsed = ts - m.lastUpdate;
        if (atRateCeiling(stored, m.utilization ?? 0, elapsed))
          marks.ceiling[m.id.toLowerCase()] = { stored: stored.toString(), elapsed };
      });

    // Each oracle's named feeds; an oracle whose getters all fail names none we can read.
    const base = 1 + candidates.length;
    const feedsOf = new Map<string, { slot: (typeof SLOTS)[number]; address: string }[] | null>();
    oracles.forEach((o, i) => {
      const got = SLOTS.map((slot, k) => ({ slot, r: first[base + i * SLOTS.length + k] }));
      if (got.every((g) => g.r?.status !== "success")) return feedsOf.set(o, null);
      feedsOf.set(
        o,
        got
          .filter((g) => g.r?.status === "success" && String(g.r.result).toLowerCase() !== ZERO_ADDR)
          .map((g) => ({ slot: g.slot, address: String(g.r!.result).toLowerCase() })),
      );
    });
    const feeds = [...new Set([...feedsOf.values()].flatMap((f) => (f ?? []).map((x) => x.address)))];
    const descs = new Map<string, string>();
    if (feeds.length > 0) {
      const second = (await client.multicall({
        contracts: feeds.map((f) => ({
          address: f as `0x${string}`,
          abi: FEED_ABI,
          functionName: "description" as const,
        })),
        allowFailure: true,
        blockNumber,
        batchSize: 0,
      })) as Res[];
      feeds.forEach((f, i) => {
        const r = second[i];
        if (r?.status === "success" && typeof r.result === "string" && r.result.trim()) descs.set(f, r.result.trim());
      });
    }
    for (const m of pairRows) {
      const o = m.oracle?.toLowerCase();
      const named = o ? feedsOf.get(o) : null;
      const src: MorphoPriceSource = {
        oracle: m.oracle,
        feeds: (named ?? []).map((f) => ({ ...f, description: descs.get(f.address) ?? null })),
        readable: named != null,
      };
      marks.priceSources[m.id.toLowerCase()] = src;
    }
  } catch (error) {
    console.error(`Morpho roster: the marks read failed (chain ${chainId}):`, error);
  }
  return marks;
}

/** The roster's props on `chainId`: the market sweep and the vaults' queues
 *  side by side, then the marks for the rows it ships. */
export async function loadMorphoRoster(deployment: MorphoDeployment, chainId: ChainId): Promise<MorphoRosterData> {
  const [resp, lent] = await Promise.all([loadMorphoMarketsFromChain(deployment), readVaultLentMarkets(chainId)]);
  const vaults = chainId !== 1 && chainId !== 8453 ? "none" : lent ? "read" : "failed";
  const d = rosterData(resp, lent, vaults);
  if (resp.chainStale) return d;
  return withRosterMarks(d, await readRosterMarks(chainId, d.blockNumber, rosterRows(d)));
}
