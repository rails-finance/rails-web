// The vault holder pages' logs, asked of rails-server first. SERVER-ONLY.
// ----------------------------------------------------------------------------
// `/api/at-block/vault/holder-logs` answers the sweeps a holder timeline makes
// (Transfer out, Transfer in, Deposit, Withdraw, and Umbrella's
// StakerCooldownUpdated) over [from, to] from the at-block store, and
// `/api/at-block/vault/notes` the vault-wide note logs (rails-server
// services/vault-holder-logs.ts; rails-ops decisions/0056 step 2). Each log is
// in `eth_getLogs`'s shape, so a loader replays it where it replayed the
// node's. Null where the route cannot answer: the loader then sweeps the
// chain as before (`route-gate.ts`).

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type { RawLog } from "@/lib/sources/chain/vault-holder-logs";
import { routeGate } from "./route-gate";

export type VaultLogFamily = "aave-stata" | "aave-sgho" | "aave-umbrella" | "yearn-v3" | "metamorpho";

export interface HolderLogSweeps {
  transferOut: RawLog[];
  transferIn: RawLog[];
  deposit: RawLog[];
  withdraw: RawLog[];
  /** Umbrella's alone; empty for every other family. */
  cooldown: RawLog[];
}

/** A cold holder's logs may be read from the chain on the server first. */
const HOLDER_LOGS_WAIT_MS = 20_000;

const gate = routeGate();

const isLogs = (v: unknown): v is RawLog[] =>
  Array.isArray(v) &&
  v.every(
    (l) =>
      l != null &&
      typeof l === "object" &&
      typeof (l as RawLog).blockNumber === "string" &&
      typeof (l as RawLog).logIndex === "string" &&
      typeof (l as RawLog).transactionHash === "string" &&
      typeof (l as RawLog).data === "string" &&
      Array.isArray((l as RawLog).topics),
  );

/** The holder's logs under each of the family's sweeps, `from` to `to` inclusive. */
export async function fetchHolderLogs(q: {
  chainId: 1 | 8453;
  vault: string;
  holder: string;
  family: VaultLogFamily;
  from: number;
  to: number;
}): Promise<HolderLogSweeps | null> {
  const vault = q.vault.toLowerCase();
  const holder = q.holder.toLowerCase();
  const qs = new URLSearchParams({
    chain: String(q.chainId),
    vault,
    holder,
    family: q.family,
    from: String(q.from),
    to: String(q.to),
  });
  const r = await gate.json<{
    vault?: string;
    holder?: string;
    fromBlock?: number;
    toBlock?: number;
    sweeps?: Record<string, unknown>;
  }>(
    `holder-logs:${q.chainId}`,
    `${process.env.RAILS_API_URL}/api/at-block/vault/holder-logs?${qs.toString()}`,
    createAuthFetchOptions(),
    { timeoutMs: HOLDER_LOGS_WAIT_MS },
  );
  if (!r || r.vault !== vault || r.holder !== holder || r.fromBlock !== q.from || r.toBlock !== q.to) return null;
  const s = r.sweeps ?? {};
  const cooldown = q.family === "aave-umbrella" ? s.cooldown : [];
  if (!isLogs(s.transferOut) || !isLogs(s.transferIn) || !isLogs(s.deposit) || !isLogs(s.withdraw) || !isLogs(cooldown))
    return null;
  return { transferOut: s.transferOut, transferIn: s.transferIn, deposit: s.deposit, withdraw: s.withdraw, cooldown };
}
