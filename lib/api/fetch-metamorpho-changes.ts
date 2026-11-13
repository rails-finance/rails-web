import "server-only";

// Client for rails-server's MetaMorpho V1 configuration changes (rails-ops
// ui-jobs 554): GET /api/metamorpho/:chain/vaults/:vault/changes, a vault's
// changes newest first, and GET /api/metamorpho/:chain/roles/:address?role=,
// the runs an address held a vault's curator or owner role. Chain 1 or 8453.
// Both answer 503 `{ unavailable: true, reason: "not yet indexed" }` until
// the server's tables exist. Cached as the routes cache, a minute.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type { MetaMorphoChange, MetaMorphoCoverage, MetaMorphoRoleVault } from "@/lib/vaults/config-changes";

export type MetaMorphoChangesChainId = 1 | 8453;

export interface MetaMorphoChanges {
  chainId: number;
  vault: string;
  name: string | null;
  symbol: string | null;
  version: string;
  createdBlock: number;
  coverage: MetaMorphoCoverage;
  events: string[];
  limit: number;
  beforeBlock: number | null;
  truncated: boolean;
  changes: MetaMorphoChange[];
}

export interface MetaMorphoRoles {
  chainId: number;
  address: string;
  role: "curator" | "owner";
  coverage: MetaMorphoCoverage;
  vaults: MetaMorphoRoleVault[];
}

/** `unavailable`: not yet indexed (503). `error`: any other failure. */
export type MetaMorphoAnswer<T> = { kind: "ok"; data: T } | { kind: "unavailable" } | { kind: "error" };

async function get<T>(p: string): Promise<MetaMorphoAnswer<T>> {
  const base = process.env.RAILS_API_URL;
  if (!base) return { kind: "error" };
  try {
    const res = await fetch(`${base}${p}`, createAuthFetchOptions({ next: { revalidate: 60 } }));
    if (res.status === 503) return { kind: "unavailable" };
    if (!res.ok) {
      console.error(`metamorpho changes: ${p} answered ${res.status}`);
      return { kind: "error" };
    }
    const data = (await res.json()) as T & { unavailable?: boolean };
    if (data.unavailable) return { kind: "unavailable" };
    return { kind: "ok", data };
  } catch (error) {
    console.error(`metamorpho changes: ${p} did not answer`, error);
    return { kind: "error" };
  }
}

const isAddress = (a: string) => /^0x[0-9a-f]{40}$/.test(a);

/** GET /api/metamorpho/:chain/vaults/:vault/changes?event=…&limit=… */
export function fetchMetaMorphoChanges(
  chainId: MetaMorphoChangesChainId,
  vault: string,
  events: readonly string[],
  limit = 1000,
): Promise<MetaMorphoAnswer<MetaMorphoChanges>> {
  const v = vault.toLowerCase();
  if (!isAddress(v)) return Promise.resolve({ kind: "error" });
  return get(`/api/metamorpho/${chainId}/vaults/${v}/changes?event=${events.join(",")}&limit=${limit}`);
}

/** GET /api/metamorpho/:chain/roles/:address?role=curator|owner */
export function fetchMetaMorphoRoles(
  chainId: MetaMorphoChangesChainId,
  address: string,
  role: "curator" | "owner",
): Promise<MetaMorphoAnswer<MetaMorphoRoles>> {
  const a = address.toLowerCase();
  if (!isAddress(a)) return Promise.resolve({ kind: "error" });
  return get(`/api/metamorpho/${chainId}/roles/${a}?role=${role}`);
}
