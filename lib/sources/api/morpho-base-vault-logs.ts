// A MetaMorpho Base holder's logs and a vault's note logs, asked of rails-server.
// ----------------------------------------------------------------------------
// `GET /api/at-block/vault/holder-logs` answers the four holder sweeps
// lib/sources/chain/morpho-base-vault-timeline.ts makes (Transfer out, Transfer
// in, Deposit and Withdraw by owner) over one range, and `/api/at-block/vault/notes`
// the vault's SetFee, SetName and SetSymbol logs, each in eth_getLogs's shape
// (rails-server api/src/services/vault-holder-logs.ts; rails-ops decisions/0056
// step 2). Null where the route cannot answer: the loader then sweeps the chain
// as before. After a 5xx, 429, refusal or timeout the chain is read for 30 s
// without asking (`route-gate.ts`).
//
// SERVER-ONLY.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import type { RawLog } from "@/lib/sources/chain/vault-holder-logs";
import { routeGate } from "./route-gate";

/** A holder the store has not swept reads its ranges from the chain on the server
 *  once; the web's own sweep of the same range is the alternative, so it waits. */
const HOLDER_LOGS_TIMEOUT_MS = 20_000;

export interface HolderSweeps {
  transferOut: RawLog[];
  transferIn: RawLog[];
  deposit: RawLog[];
  withdraw: RawLog[];
}

const gate = routeGate();

const isLogs = (x: unknown): x is RawLog[] =>
  Array.isArray(x) &&
  x.every(
    (l) =>
      l != null &&
      typeof l === "object" &&
      typeof (l as RawLog).blockNumber === "string" &&
      typeof (l as RawLog).logIndex === "string" &&
      typeof (l as RawLog).transactionHash === "string" &&
      Array.isArray((l as RawLog).topics),
  );

/** The holder's four sweeps on this vault over `[from, to]`, or null. */
export async function fetchMorphoBaseHolderLogs(
  vault: string,
  holder: string,
  from: number,
  to: number,
): Promise<HolderSweeps | null> {
  const qs = new URLSearchParams({
    chain: String(BASE_CHAIN_ID),
    vault: vault.toLowerCase(),
    holder: holder.toLowerCase(),
    family: "metamorpho",
    from: String(from),
    to: String(to),
  });
  const r = await gate.json<{ toBlock?: unknown; fromBlock?: unknown; sweeps?: Record<string, unknown> }>(
    "holder-logs",
    `${process.env.RAILS_API_URL}/api/at-block/vault/holder-logs?${qs}`,
    createAuthFetchOptions(),
    { timeoutMs: HOLDER_LOGS_TIMEOUT_MS },
  );
  const s = r?.sweeps;
  if (!r || r.fromBlock !== from || r.toBlock !== to || !s) return null;
  if (!isLogs(s.transferOut) || !isLogs(s.transferIn) || !isLogs(s.deposit) || !isLogs(s.withdraw)) return null;
  return { transferOut: s.transferOut, transferIn: s.transferIn, deposit: s.deposit, withdraw: s.withdraw };
}

/** The vault's note logs (SetFee, SetName, SetSymbol) from block 0, and the last
 *  block the answer covers; or null. */
export async function fetchMorphoBaseVaultNotes(vault: string): Promise<{ toBlock: number; logs: RawLog[] } | null> {
  const qs = new URLSearchParams({ chain: String(BASE_CHAIN_ID), vault: vault.toLowerCase(), family: "metamorpho" });
  const r = await gate.json<{ toBlock?: unknown; logs?: unknown }>(
    "notes",
    `${process.env.RAILS_API_URL}/api/at-block/vault/notes?${qs}`,
    createAuthFetchOptions(),
  );
  if (!r || typeof r.toBlock !== "number" || !isLogs(r.logs)) return null;
  return { toBlock: r.toBlock, logs: r.logs };
}
