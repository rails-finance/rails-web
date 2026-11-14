// A Liquity V2 deployment's branch shutdowns, read live (rails-ops
// TO-DO-ui-jobs 612): one multicall per deployment, one `shutdownTime()` call per
// branch on the contract its catalog names (`shutdownRead`). The shapes, the
// settling and the cache rule are lib/liquity-fork/shutdown.ts.
//
// SERVER-ONLY.

import { parseAbi } from "viem";
import { chainClient } from "./rpc";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { LiquityForkConfig } from "./liquity-fork-position";
import { settleShutdownTime, shutdownTtlMs, type BranchShutdownLive } from "@/lib/liquity-fork/shutdown";

const ABI = parseAbi(["function shutdownTime() view returns (uint256)"]);

/** One answer per chain and contract, with the time it stops being good. */
const cache = new Map<string, { live: BranchShutdownLive; until: number }>();
/** One read in flight per deployment, shared by concurrent callers. */
const inflight = new Map<string, Promise<Record<string, BranchShutdownLive>>>();

const keyOf = (chainId: number, address: string) => `${chainId}:${address.toLowerCase()}`;

/** Every branch's live answer, by branch key. A branch whose catalog names no
 *  read is absent. A failed read answers `shutDown: null`. */
export async function readForkShutdown(cfg: LiquityForkConfig): Promise<Record<string, BranchShutdownLive>> {
  const chainId = cfg.chainId ?? MAINNET_CHAIN_ID;
  const now = Date.now();
  const out: Record<string, BranchShutdownLive> = {};
  const due = Object.values(cfg.branches).filter((b) => {
    if (!b.shutdownRead) return false;
    const hit = cache.get(keyOf(chainId, b.shutdownRead.address));
    if (hit && hit.until > now) {
      out[b.key] = hit.live;
      return false;
    }
    return true;
  });
  if (due.length === 0) return out;
  // The flight reads every branch that names a read: one call more each costs nothing.
  const all = Object.values(cfg.branches).filter((b) => b.shutdownRead);

  const flightKey = `${chainId}:${cfg.protocol}`;
  let flight = inflight.get(flightKey);
  if (!flight) {
    flight = (async () => {
      const read: Record<string, BranchShutdownLive> = {};
      let block: number | null = null;
      let answers: ({ status: string; result?: unknown } | null)[] = all.map(() => null);
      try {
        const client = chainClient(chainId);
        block = Number(await client.getBlockNumber());
        answers = await client.multicall({
          allowFailure: true,
          blockNumber: BigInt(block),
          contracts: all.map((b) => ({
            address: b.shutdownRead!.address as `0x${string}`,
            abi: ABI,
            functionName: "shutdownTime" as const,
          })),
        });
      } catch {
        // Every branch reads not known; retried after the failed-read window.
      }
      all.forEach((b, i) => {
        const r = b.shutdownRead!;
        const a = answers[i];
        const raw = a && a.status === "success" && typeof a.result === "bigint" ? a.result : null;
        const live = settleShutdownTime(raw, {
          contract: r.contract,
          address: r.address,
          call: `${r.contract}.${r.call}()`,
          block: raw != null ? block : null,
        });
        cache.set(keyOf(chainId, r.address), { live, until: Date.now() + shutdownTtlMs(live) });
        read[b.key] = live;
      });
      return read;
    })().finally(() => inflight.delete(flightKey));
    inflight.set(flightKey, flight);
  }
  const read = await flight;
  for (const b of due) if (read[b.key]) out[b.key] = read[b.key];
  return out;
}
