// Every oracle line's price now for an asset page (ui-jobs 818;
// lib/shared/asset-prices-now.ts has the answer's shape). The server's
// same-block read, GET /api/prices/assets/now?chain=&token=, is not served
// yet: this client is its STUB, answering from the stored rounds
// (/api/prices/rounds) and daily store (/api/prices/daily) with each line's
// latest stored value at its block (`sameBlock: false`, `stub: true`).
// The real client replaces this file alone: the page calls
// `fetchAssetPricesNow` and reads the answer's shape.
//
// SERVER-ONLY. Reads `RAILS_API_URL` + `API_BEARER_TOKEN`.

import "server-only";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { ROUNDS_REVALIDATE_S } from "@/lib/api/fetch-asset-prices-server";
import {
  RECENT_DAYS,
  storedPricesNow,
  unreadPricesNow,
  type AssetPricesNow,
  type StoredDaily,
  type StoredRounds,
} from "@/lib/shared/asset-prices-now";
import type { PageLine } from "@/lib/shared/asset-roster";

const TIMEOUT_MS = 10_000;
const DAY_S = 86_400;
/** The rounds read: the first and last of the last 40 days, as the Prices list reads them. */
const ROUND_DAYS = 40;
const MAX_ORACLES = 12;
const MAX_SERIES = 40;

async function get<T>(path: string, readerIp?: string | null): Promise<T | null> {
  const base = process.env.RAILS_API_URL;
  if (!base) throw new Error("RAILS_API_URL environment variable is not set");
  const res = await fetch(
    `${base}${path}`,
    createAuthFetchOptions(
      { next: { revalidate: ROUNDS_REVALIDATE_S }, signal: AbortSignal.timeout(TIMEOUT_MS) },
      readerIp ?? undefined,
    ),
  ).catch(() => null);
  return res?.ok ? ((await res.json()) as T) : null;
}

/** `token`'s lines on `chain`, each priced now. Never throws: a failed read
 *  answers every line unread, with its reason. */
export async function fetchAssetPricesNow(
  chain: number,
  token: string,
  lines: readonly PageLine[],
  readerIp?: string | null,
): Promise<AssetPricesNow> {
  void token; // the same-block route keys on the token; the stub reads the lines
  try {
    const now = Math.floor(Date.now() / 1000);
    const oracles = [...new Set(lines.map((l) => l.oracle.address.toLowerCase()))].slice(0, MAX_ORACLES);
    const keys = [...new Set(lines.flatMap((l) => (l.drawn ? [l.drawn.key] : [])))].slice(0, MAX_SERIES);
    const rq = new URLSearchParams({
      chain: String(chain),
      oracles: oracles.join(","),
      max: "2",
      from: String(now - ROUND_DAYS * DAY_S),
    });
    const dq = new URLSearchParams({
      chain: String(chain),
      series: keys.join(","),
      from: String(Math.floor(now / DAY_S) - RECENT_DAYS),
    });
    const [rounds, daily] = await Promise.all([
      oracles.length ? get<StoredRounds>(`/api/prices/rounds?${rq.toString()}`, readerIp) : null,
      keys.length ? get<StoredDaily>(`/api/prices/daily?${dq.toString()}`, readerIp) : null,
    ]);
    return storedPricesNow(chain, lines, rounds, daily);
  } catch {
    return unreadPricesNow(chain, lines, "The prices were not read");
  }
}
