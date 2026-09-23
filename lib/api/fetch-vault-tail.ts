// ============================================================================
// FETCH / STORE A VAULT HISTORY TAIL
// ============================================================================
//
// The client half of the store. A tail is every row of one holder's life in one
// vault at or below a FINALIZED block, with the signed sum of those rows'
// deltas — a value, keyed by `(chainId, vault, holder, loaderVersion)` and
// fixed by its cut.
//
// Mirrors fetch-vault-positions: the only arm is this app's own
// /api/vaults/positions/tail proxy, and it takes an optional `baseUrl` so a
// Server Component can call the SAME function pointed at this deployment's own
// origin. One code path, server or client.
//
// TWO NAMES FOR ONE FIGURE, TRANSLATED HERE AND NOWHERE ELSE. The store's wire
// calls the cut `cutBlock` (it is a column); the web type calls it `cut`. This
// file is the seam, so nothing downstream has to know both words.
//
// NEITHER CALL EVER THROWS AT THE READER. A tail that cannot be read is a page
// that sweeps the whole life — slower, not wrong — and a tail that cannot be
// stored is a page that stores again next time. Both outcomes are logged and
// returned as data, because the alternative is a reading failing over a cache.

import { AAVE_VAULT_TAIL_VERSION, type StoredVaultTail } from "@/lib/shared/vault-holder-timeline";

export interface VaultTailKey {
  chainId?: number;
  /** Lowercased on the way out. */
  vault: string;
  holder: string;
  loaderVersion?: number;
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

/** The store's own field names. */
interface WireTail {
  chainId: number;
  vault: string;
  holder: string;
  loaderVersion: number;
  cutBlock: number;
  cutBalance: string;
  logsIn: number;
  logsOut: number;
  lane: string;
  storedAt: string;
  rows: StoredVaultTail["rows"];
}

const keyParams = (k: VaultTailKey) =>
  new URLSearchParams({
    chain: String(k.chainId ?? 1),
    vault: k.vault.toLowerCase(),
    holder: k.holder.toLowerCase(),
    loaderVersion: String(k.loaderVersion ?? AAVE_VAULT_TAIL_VERSION),
  }).toString();

/** The stored tail for this position, or null — including when nothing is
 *  stored (404), which is the ordinary answer for a position nobody has opened
 *  yet. */
export async function fetchVaultTail(key: VaultTailKey): Promise<StoredVaultTail | null> {
  try {
    const res = await fetch(`${key.baseUrl ?? ""}/api/vaults/positions/tail?${keyParams(key)}`, {
      cache: "no-store",
      headers: key.headers,
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error(`fetchVaultTail: the store answered ${res.status} ${res.statusText}`);
      return null;
    }
    const wire = (await res.json()) as Partial<WireTail>;
    if (!wire || !Array.isArray(wire.rows) || typeof wire.cutBalance !== "string" || wire.cutBlock == null) return null;
    return {
      chainId: Number(wire.chainId ?? key.chainId ?? 1),
      vault: String(wire.vault ?? key.vault).toLowerCase(),
      holder: String(wire.holder ?? key.holder).toLowerCase(),
      loaderVersion: Number(wire.loaderVersion ?? AAVE_VAULT_TAIL_VERSION),
      cut: Number(wire.cutBlock),
      cutBalance: wire.cutBalance,
      logsIn: Number(wire.logsIn ?? 0),
      logsOut: Number(wire.logsOut ?? 0),
      lane: String(wire.lane ?? ""),
      storedAt: String(wire.storedAt ?? ""),
      rows: wire.rows,
    };
  } catch (error) {
    console.error("fetchVaultTail: the store did not answer —", error);
    return null;
  }
}

/** THE BODY IS SENT GZIPPED, because the route it goes to is a Vercel
 *  function and Vercel refuses a function request body above 4.5 MB (413
 *  FUNCTION_PAYLOAD_TOO_LARGE; measured on preview 2026-09-21, 4,404,029 bytes
 *  through and 5,033,174 refused). A stored row is about 440 B on chain 1 and
 *  550 B on Base, so a tail passed that at about 10,000 and 8,200 rows — under
 *  both ceilings — and a heavy Base build stopped at the first chunk too large
 *  to offer (`0xbeef…83b2/0x25c1…9c52`, 4,514 of 8,771 rows). That tail
 *  gzips from 4,818,063 bytes to 893,233. The route inflates it, and the store
 *  sees plain JSON. `verify-base-vault-cold-build.mjs` check 7 holds this. */
async function gzipped(json: string): Promise<ArrayBuffer> {
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

/** Offer a tail to the store. The store re-sums the rows and refuses a body
 *  that does not add up (422) or a cut below the one it holds (409); both are
 *  returned as a status, never thrown. */
export async function putVaultTail(
  tail: StoredVaultTail,
  opts: { baseUrl?: string; headers?: Record<string, string> } = {},
): Promise<{ ok: boolean; status: number }> {
  const key: VaultTailKey = {
    chainId: tail.chainId,
    vault: tail.vault,
    holder: tail.holder,
    loaderVersion: tail.loaderVersion,
    baseUrl: opts.baseUrl,
  };
  const body: WireTail = {
    chainId: tail.chainId,
    vault: tail.vault.toLowerCase(),
    holder: tail.holder.toLowerCase(),
    loaderVersion: tail.loaderVersion,
    cutBlock: tail.cut,
    cutBalance: tail.cutBalance,
    logsIn: tail.logsIn,
    logsOut: tail.logsOut,
    lane: tail.lane,
    storedAt: tail.storedAt,
    rows: tail.rows,
  };
  try {
    const res = await fetch(`${opts.baseUrl ?? ""}/api/vaults/positions/tail?${keyParams(key)}`, {
      method: "PUT",
      headers: { ...opts.headers, "Content-Type": "application/json", "Content-Encoding": "gzip" },
      body: await gzipped(JSON.stringify(body)),
      cache: "no-store",
    });
    if (!res.ok) console.error(`putVaultTail: the store answered ${res.status} ${res.statusText}`);
    return { ok: res.ok, status: res.status };
  } catch (error) {
    console.error("putVaultTail: the store did not answer —", error);
    return { ok: false, status: 0 };
  }
}
