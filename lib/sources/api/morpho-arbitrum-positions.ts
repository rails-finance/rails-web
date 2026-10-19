// The wallets rails-server's Morpho Blue Arbitrum lane has recorded, newest
// visit first: GET /api/morpho-blue-arbitrum/positions (the wire shape is
// lib/morpho-arbitrum/api-contract.ts).
//
// SERVER-ONLY.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import {
  MORPHO_ARBITRUM_API_PREFIX,
  readPositionsAnswer,
  type MorphoArbitrumPositionsResponse,
} from "@/lib/morpho-arbitrum/api-contract";

const TIMEOUT_MS = 10_000;

/** Null when the store could not be asked or did not answer with the
 *  contract's shape. */
export async function loadMorphoArbitrumPositions(
  opts: { limit?: number; offset?: number; readerIp?: string } = {},
): Promise<MorphoArbitrumPositionsResponse | null> {
  const base = process.env.RAILS_API_URL;
  if (!base) return null;
  const q = new URLSearchParams({ limit: String(opts.limit ?? 500), offset: String(opts.offset ?? 0) });
  try {
    const res = await fetch(`${base}${MORPHO_ARBITRUM_API_PREFIX}/positions?${q}`, {
      ...createAuthFetchOptions(undefined, opts.readerIp),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`${MORPHO_ARBITRUM_API_PREFIX}/positions answered ${res.status} ${res.statusText}`);
      return null;
    }
    const answer = readPositionsAnswer(await res.json());
    if (!answer) console.error(`${MORPHO_ARBITRUM_API_PREFIX}/positions answered outside the contract`);
    return answer;
  } catch (err) {
    console.error(`${MORPHO_ARBITRUM_API_PREFIX}/positions failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}
