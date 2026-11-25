// The presence check in front of the wallet page's reads at visit (rails-ops decision 0073 point
// 2): before a visit module's or a liquidity source's read, one multicall per chain at the head
// asks whether the wallet holds anything there. A zero answer means no read and no section. A
// check that fails, or a call inside it that fails, counts as holding, so a gateway fault can cost
// a read and cannot hide a position. An entry whose protocol has no one-call answer says so and
// reads as before. The checks count toward decision 0061 point 4's wallet row: at most
// PRESENCE_MAX_CALLS calls over at most PRESENCE_MAX_REQUESTS requests, inside PRESENCE_BUDGET_MS.

import type { Abi } from "viem";
import type { ChainId } from "@/lib/shared/chains";

/** One contract call a check makes. */
export interface PresenceCall {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

export type Presence =
  /** The calls for the owner on `chainId`, and whether their answers (each call's result, in
   *  order) hold anything. */
  | {
      kind: "check";
      chainId: ChainId;
      calls(owner: `0x${string}`): PresenceCall[];
      held(results: readonly unknown[]): boolean;
    }
  /** No one-call answer: the read runs as before. `why` names the reason. */
  | { kind: "none"; why: string };

/** What the check found for one entry. "unchecked": no check; "failed": the check did not
 *  answer, which counts as holding. */
export type PresenceAnswer = "held" | "empty" | "unchecked" | "failed";

/** Whether the read behind the entry runs. */
export const presenceReads = (a: PresenceAnswer | undefined): boolean => a !== "empty";

/** decision 0061 point 4's wallet row: 1,000 head calls, 5 requests, 3 s. */
export const PRESENCE_MAX_CALLS = 1_000;
export const PRESENCE_MAX_REQUESTS = 5;
export const PRESENCE_BUDGET_MS = 3_000;

/** One multicall at the head: each call's status and result. */
export type PresenceMulticall = (
  chainId: ChainId,
  contracts: PresenceCall[],
  signal: AbortSignal,
) => Promise<readonly { status: "success" | "failure"; result?: unknown }[]>;

export interface PresenceEntry {
  id: string;
  presence?: Presence;
}

/** Each entry's answer, from one multicall per chain. An entry with no check is "unchecked"; a
 *  chain whose multicall fails or runs past the budget leaves its entries "failed". */
export async function readPresence(
  entries: readonly PresenceEntry[],
  owner: string,
  multicall: PresenceMulticall,
  budgetMs = PRESENCE_BUDGET_MS,
): Promise<Map<string, PresenceAnswer>> {
  const out = new Map<string, PresenceAnswer>();
  const o = owner.toLowerCase() as `0x${string}`;
  const byChain = new Map<
    ChainId,
    { id: string; check: Extract<Presence, { kind: "check" }>; calls: PresenceCall[] }[]
  >();
  for (const e of entries) {
    if (e.presence?.kind !== "check") {
      out.set(e.id, "unchecked");
      continue;
    }
    const group = byChain.get(e.presence.chainId) ?? [];
    group.push({ id: e.id, check: e.presence, calls: e.presence.calls(o) });
    byChain.set(e.presence.chainId, group);
  }
  // A timer of its own (AbortSignal.timeout's does not hold the process open), cleared at the end.
  const budget = new AbortController();
  const timer = setTimeout(() => budget.abort(new Error("the presence check ran past its budget")), budgetMs);
  const signal = budget.signal;
  await Promise.all(
    [...byChain].map(async ([chainId, group]) => {
      try {
        // Past the budget the chain's entries fail, whether or not the multicall heeds the signal.
        const results = await Promise.race([
          multicall(
            chainId,
            group.flatMap((g) => g.calls),
            signal,
          ),
          new Promise<never>((_, reject) => {
            if (signal.aborted) reject(signal.reason);
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          }),
        ]);
        let i = 0;
        for (const g of group) {
          const mine = results.slice(i, i + g.calls.length);
          i += g.calls.length;
          if (mine.length < g.calls.length || mine.some((r) => r.status !== "success")) out.set(g.id, "failed");
          else out.set(g.id, g.check.held(mine.map((r) => r.result)) ? "held" : "empty");
        }
      } catch {
        for (const g of group) out.set(g.id, "failed");
      }
    }),
  );
  clearTimeout(timer);
  return out;
}

/** A uint answer above zero, in any of the shapes viem decodes one to. */
export const positive = (x: unknown): boolean => {
  try {
    return BigInt(x as bigint | number | string) > BigInt(0);
  } catch {
    return false;
  }
};
