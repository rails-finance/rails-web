// The wallets rails-server's Aave V3 Arbitrum lane has recorded, newest visit
// first: GET /api/aave-v3-arbitrum/positions (the wire shape is
// lib/aave-v3-arbitrum/api-contract.ts).
//
// SERVER-ONLY.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import {
  AAVE_V3_ARBITRUM_API_PREFIX,
  readPositionsAnswer,
  type AaveV3ArbitrumPositionsResponse,
} from "@/lib/aave-v3-arbitrum/api-contract";

const TIMEOUT_MS = 10_000;

/** Null when the store could not be asked or did not answer with the
 *  contract's shape. */
export async function loadAaveV3ArbitrumPositions(
  opts: { limit?: number; offset?: number; readerIp?: string } = {},
): Promise<AaveV3ArbitrumPositionsResponse | null> {
  const base = process.env.RAILS_API_URL;
  if (!base) return null;
  const q = new URLSearchParams({ limit: String(opts.limit ?? 500), offset: String(opts.offset ?? 0) });
  try {
    const res = await fetch(`${base}${AAVE_V3_ARBITRUM_API_PREFIX}/positions?${q}`, {
      ...createAuthFetchOptions(undefined, opts.readerIp),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`${AAVE_V3_ARBITRUM_API_PREFIX}/positions answered ${res.status} ${res.statusText}`);
      return null;
    }
    const answer = readPositionsAnswer(await res.json());
    if (!answer) console.error(`${AAVE_V3_ARBITRUM_API_PREFIX}/positions answered outside the contract`);
    return answer;
  } catch (err) {
    console.error(`${AAVE_V3_ARBITRUM_API_PREFIX}/positions failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}
