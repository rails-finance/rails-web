// Every oracle line's price now for an asset page (ui-jobs 818;
// lib/shared/asset-prices-now.ts has the answer's shape). It reads the
// server's same-block route, GET /api/prices/assets/now?chain=&token=: every
// line at one block, `sameBlock: true`. Where the route is not served (404,
// or a network error) it answers from the stored rounds (/api/prices/rounds)
// and daily store (/api/prices/daily): each line's latest stored value at its
// block (`sameBlock: false`, `stub: true`). A 502 (the round failed past its
// grace) answers every line unread.
//
// SERVER-ONLY. Reads `RAILS_API_URL` + `API_BEARER_TOKEN`.

import "server-only";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { ROUNDS_REVALIDATE_S } from "@/lib/api/fetch-asset-prices-server";
import {
  readPricesNow,
  RECENT_DAYS,
  routePricesNow,
  type RouteNowAnswer,
  storedPricesNow,
  unreadPricesNow,
  type AssetPricesNow,
  type StoredDaily,
  type StoredRounds,
} from "@/lib/shared/asset-prices-now";
import type { PageLine } from "@/lib/shared/asset-roster";

/** Each stage's deadline: the route call, then the fallback from its own start. */
const TIMEOUT_MS = 10_000;
/** The route call's cache time: the server's round is 60 s. */
const ROUTE_REVALIDATE_S = 60;
const DAY_S = 86_400;
/** The rounds read: the first and last of the last 40 days, as the Prices list reads them. */
const ROUND_DAYS = 40;
const MAX_ORACLES = 12;
const MAX_SERIES = 40;

async function get<T>(path: string, signal: AbortSignal, readerIp?: string | null): Promise<T | null> {
  const base = process.env.RAILS_API_URL;
  if (!base) throw new Error("RAILS_API_URL environment variable is not set");
  const res = await fetch(
    `${base}${path}`,
    createAuthFetchOptions({ next: { revalidate: ROUNDS_REVALIDATE_S }, signal }, readerIp ?? undefined),
  ).catch(() => null);
  return res?.ok ? ((await res.json()) as T) : null;
}

/** The route's status (null on a network error) with its body where it is a 200. */
async function getRoute(
  chain: number,
  token: string,
  signal: AbortSignal,
  readerIp?: string | null,
): Promise<{ status: number | null; body: RouteNowAnswer | null }> {
  const base = process.env.RAILS_API_URL;
  if (!base) throw new Error("RAILS_API_URL environment variable is not set");
  const q = new URLSearchParams({ chain: String(chain), token: token.toLowerCase() });
  const res = await fetch(
    `${base}/api/prices/assets/now?${q.toString()}`,
    createAuthFetchOptions({ next: { revalidate: ROUTE_REVALIDATE_S }, signal }, readerIp ?? undefined),
  ).catch(() => null);
  if (!res) return { status: null, body: null };
  const body = res.status === 200 ? ((await res.json().catch(() => null)) as RouteNowAnswer | null) : null;
  return { status: res.status, body };
}

/** `token`'s lines on `chain`, each priced now. Never throws: a failed read
 *  answers every line unread, with its reason. */
export async function fetchAssetPricesNow(
  chain: number,
  token: string,
  lines: readonly PageLine[],
  readerIp?: string | null,
): Promise<AssetPricesNow> {
  try {
    return await readPricesNow({
      timeoutMs: TIMEOUT_MS,
      route: async (signal) => {
        const r = await getRoute(chain, token, signal, readerIp);
        return { status: r.status, answer: r.body ? routePricesNow(r.body) : null };
      },
      unread: () => unreadPricesNow(chain, lines, "The prices were not read"),
      fallback: (signal) => storedNow(chain, lines, signal, readerIp),
    });
  } catch {
    return unreadPricesNow(chain, lines, "The prices were not read");
  }
}

/** Each line's latest stored value at its block: the read where the route is not served. */
async function storedNow(
  chain: number,
  lines: readonly PageLine[],
  signal: AbortSignal,
  readerIp?: string | null,
): Promise<AssetPricesNow> {
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
    oracles.length ? get<StoredRounds>(`/api/prices/rounds?${rq.toString()}`, signal, readerIp) : null,
    keys.length ? get<StoredDaily>(`/api/prices/daily?${dq.toString()}`, signal, readerIp) : null,
  ]);
  return storedPricesNow(chain, lines, rounds, daily);
}
