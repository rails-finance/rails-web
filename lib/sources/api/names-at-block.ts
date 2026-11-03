// ENS and Basename names, asked of rails-server first. SERVER-ONLY.
// ----------------------------------------------------------------------------
// `/api/at-block/names` reads a name (forward) or an address's primary name
// (reverse) at the finalized block floored to an hourly grid, through the
// at-block store (rails-server routes/atBlockNames.ts; rails-ops decisions/0056).
// Only a `found` result is an answer: `none` at the grid block may be a name set
// since, `offchain` a resolver the server does not follow, `failed` a read that
// did not answer. The callers (lib/ens/resolve-ens.ts,
// lib/morpho-base/resolve-basename.ts) read the chain for every other result,
// and for all of them where the route cannot answer (`route-gate.ts`).

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { routeGate } from "./route-gate";

/** Addresses one reverse request carries at most (the route's cap). */
export const NAMES_MAX_ADDRESSES = 50;

const gate = routeGate();
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

type Result = { name?: unknown; address?: unknown; answer?: unknown; status?: unknown };

function results(body: { chainId?: unknown; results?: unknown } | null, chainId: number): Result[] | null {
  if (!body || body.chainId !== chainId || !Array.isArray(body.results)) return null;
  return body.results.filter((r): r is Result => r != null && typeof r === "object");
}

async function ask(chainId: 1 | 8453, params: Record<string, string>) {
  const qs = new URLSearchParams({ chain: String(chainId), ...params });
  const body = await gate.json<{ chainId?: unknown; results?: unknown }>(
    `names-${chainId}`,
    `${process.env.RAILS_API_URL}/api/at-block/names?${qs.toString()}`,
    createAuthFetchOptions(),
  );
  return results(body, chainId);
}

/** The checksummed address the name resolves to at the grid block, where the
 *  server found one; null on any other result or where the route cannot answer.
 *  `chainId` 1 for a `.eth` name, 8453 for a `.base.eth` name. */
export async function serverNameAddress(chainId: 1 | 8453, name: string): Promise<string | null> {
  const got = await ask(chainId, { name });
  const r = got?.[0];
  if (!r || r.status !== "found" || typeof r.answer !== "string" || !ADDRESS.test(r.answer)) return null;
  return r.answer;
}

/** Each address's primary ENS name the server found, keyed by lower-cased
 *  address; an address it did not find (or a batch the route could not answer)
 *  is absent. One request per 50 addresses. */
export async function serverEnsNames(addresses: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const chunks: string[][] = [];
  for (let i = 0; i < addresses.length; i += NAMES_MAX_ADDRESSES)
    chunks.push(addresses.slice(i, i + NAMES_MAX_ADDRESSES));
  await Promise.all(
    chunks.map(async (chunk) => {
      const got = await ask(1, { addresses: chunk.join(",") });
      for (const r of got ?? []) {
        if (r.status !== "found" || typeof r.address !== "string" || typeof r.answer !== "string" || !r.answer)
          continue;
        out.set(r.address.toLowerCase(), r.answer);
      }
    }),
  );
  return out;
}
