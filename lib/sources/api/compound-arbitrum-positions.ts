// The wallets rails-server's Compound V3 Arbitrum lane has recorded, newest
// visit first: GET /api/compound-v3-arbitrum/positions (the wire shape is
// lib/compound-arbitrum/api-contract.ts).
//
// SERVER-ONLY.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import {
  COMPOUND_ARBITRUM_API_PREFIX,
  readPositionsAnswer,
  type CompoundArbitrumPositionsResponse,
} from "@/lib/compound-arbitrum/api-contract";

const TIMEOUT_MS = 10_000;

/** Null when the store could not be asked or did not answer with the
 *  contract's shape. */
export async function loadCompoundArbitrumPositions(
  opts: { limit?: number; offset?: number; readerIp?: string } = {},
): Promise<CompoundArbitrumPositionsResponse | null> {
  const base = process.env.RAILS_API_URL;
  if (!base) return null;
  const q = new URLSearchParams({ limit: String(opts.limit ?? 500), offset: String(opts.offset ?? 0) });
  try {
    const res = await fetch(`${base}${COMPOUND_ARBITRUM_API_PREFIX}/positions?${q}`, {
      ...createAuthFetchOptions(undefined, opts.readerIp),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`${COMPOUND_ARBITRUM_API_PREFIX}/positions answered ${res.status} ${res.statusText}`);
      return null;
    }
    const answer = readPositionsAnswer(await res.json());
    if (!answer) console.error(`${COMPOUND_ARBITRUM_API_PREFIX}/positions answered outside the contract`);
    return answer;
  } catch (err) {
    console.error(`${COMPOUND_ARBITRUM_API_PREFIX}/positions failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}
