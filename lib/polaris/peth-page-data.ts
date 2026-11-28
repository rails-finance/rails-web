// A Polaris pETH account's read, done on the server (ui-jobs 865).
// SERVER-ONLY: imported by the account page and its event route, which read
// the same answer within one request (`cache()`). A 400 is the route's
// refusal with its reason (a protocol contract, an address too heavy to
// replay); any other failure is null, and the client view reads it itself.
// In development with MAP_FIXTURE_DIR set, the answer comes from the saved
// file (lib/polaris/peth-dev-cache.ts).

import { cache } from "react";
import { boxHop, SSR_FETCH_TIMEOUT_MS } from "@/lib/shared/listing-ssr";
import { isPethRefusal, PETH_FIRST_READ, type PethRefusal } from "@/lib/polaris/peth-page-data-shared";
import { PolarisPethHttpError, readPolarisPeth, type PolarisPethResponse } from "@/lib/sources/api/polaris-peth";
import type { PethDevCacheHit } from "@/lib/polaris/peth-dev-cache";

async function readLive(address: string): Promise<PolarisPethResponse | PethRefusal | null> {
  try {
    const hop = await boxHop();
    if (!hop) return null;
    return await readPolarisPeth(
      address,
      { limit: String(PETH_FIRST_READ) },
      { ...hop, signal: AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS) },
    );
  } catch (err) {
    if (err instanceof PolarisPethHttpError && (err.status === 400 || err.status === 413 || err.status === 422))
      return { refused: true, status: err.status, reason: err.reason, code: err.code };
    console.error("polaris pETH account page read failed:", err);
    return null;
  }
}

/** The saved answer, in development with MAP_FIXTURE_DIR set; else null. */
export const loadPethDevCache = cache(async (address: string): Promise<PethDevCacheHit | null> => {
  if (process.env.NODE_ENV === "production" || !process.env.MAP_FIXTURE_DIR) return null;
  const { readPethDevCache } = await import("@/lib/polaris/peth-dev-cache");
  return readPethDevCache(address, () => readLive(address));
});

export const loadPolarisPeth = cache(async (address: string): Promise<PolarisPethResponse | PethRefusal | null> => {
  const dev = await loadPethDevCache(address);
  return dev ? dev.data : readLive(address);
});

export { isPethRefusal, PETH_FIRST_READ, type PethRefusal };
