// The Prices list's rows for a server render or the list route (rails-ops
// reference/asset-key-map.md, "The Prices list"): the whole roster (GET
// /api/prices/assets), then over the last 30 days from the daily store (GET
// /api/prices/daily), 40 series a read, each row's series and every drawn
// line on its page, for the flags; and where the chain serves stored rounds
// (GET /api/prices/rounds, 12 oracles a read, each line's first and last round
// in the window and its day closes from the window's first day), each line
// joined above as its page's chart joins it.
//
// SERVER-ONLY. Reads `RAILS_API_URL` + `API_BEARER_TOKEN`.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { dailyPricesFromAnswer, type DailyAnswer } from "@/lib/api/fetch-daily-prices";
import type { RoundsAnswer } from "@/lib/api/fetch-price-rounds";
import { dailyStorePriceSeries, joinRounds, roundsOf, type PriceSeries } from "@/lib/shared/price-series";
import type { SpreadPoint } from "@/lib/shared/asset-spread";
import { priceRows, rosterPages, ROW_DAYS, type AssetPriceList, type RoundsStamp } from "@/lib/shared/asset-prices";
import type { AssetRosterAnswer } from "@/lib/shared/asset-roster";

const TIMEOUT_MS = 10_000;
const MAX_SERIES = 40;
const MAX_ORACLES = 12;
/** The rounds a line is read with: the first and last in the window. */
const ROUND_POINTS = 2;
/** The daily store and roster change once a day; the rounds at each oracle update. */
const DAILY_REVALIDATE_S = 3600;
export const ROUNDS_REVALIDATE_S = 300;
const DAY_MS = 86_400_000;

async function get<T>(path: string, readerIp?: string | null, revalidate = DAILY_REVALIDATE_S): Promise<T> {
  const RAILS_API_URL = process.env.RAILS_API_URL;
  if (!RAILS_API_URL) throw new Error("RAILS_API_URL environment variable is not set");
  const res = await fetch(
    `${RAILS_API_URL}${path}`,
    createAuthFetchOptions({ next: { revalidate }, signal: AbortSignal.timeout(TIMEOUT_MS) }, readerIp ?? undefined),
  );
  if (!res.ok) throw new Error(`${path.split("?")[0]} failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function fetchAssetPricesServer(readerIp?: string | null): Promise<AssetPriceList> {
  return (await buildAssetPrices(readerIp)).list;
}

/** The list, with the roster and the pages it was built from (the asset explorer's cards). */
export async function buildAssetPrices(readerIp?: string | null) {
  const roster = await get<Omit<AssetRosterAnswer, "related">>("/api/prices/assets", readerIp);
  const pages = rosterPages(roster.assets, roster.readAt, roster.native);
  const today = Math.floor(Date.now() / DAY_MS);
  // Back far enough to find the price 30 days before a series' last day.
  const from = today - ROW_DAYS - 10;
  // Per chain, each drawn series and the oracle its line reads.
  const oracles = new Map<number, Map<string, string>>();
  for (const p of pages)
    for (const c of p.page.chains)
      for (const l of c.lines)
        if (l.drawn)
          oracles.set(c.chain, (oracles.get(c.chain) ?? new Map()).set(l.drawn.key, l.oracle.address.toLowerCase()));
  const series = new Map<string, PriceSeries>();
  const reads: Promise<void>[] = [];
  for (const [chain, byKey] of oracles) {
    const list = [...byKey.keys()];
    for (let i = 0; i < list.length; i += MAX_SERIES) {
      const qs = new URLSearchParams({
        chain: String(chain),
        series: list.slice(i, i + MAX_SERIES).join(","),
        from: String(from),
      });
      reads.push(
        get<DailyAnswer>(`/api/prices/daily?${qs.toString()}`, readerIp).then((a) => {
          for (const [k, s] of Object.entries(dailyStorePriceSeries(a, () => ({ symbol: "", chain }))))
            series.set(`${chain}|${k}`, s);
        }),
      );
    }
  }
  const rounds = new Map<string, NonNullable<ReturnType<typeof roundsOf>>>();
  // The rounds from the window's first day: the list draws no day before it.
  const fromTs = from * 86_400;
  for (const [chain, byKey] of oracles)
    reads.push(readRounds(chain, [...new Set(byKey.values())], rounds, fromTs, readerIp));
  await Promise.all(reads);
  const prices = new Map<string, [number, number][]>();
  const points = new Map<string, readonly SpreadPoint[]>();
  const stamps = new Map<string, RoundsStamp>();
  for (const [id, s] of series) {
    const [chain, key] = id.split("|");
    const r = rounds.get(`${chain}|${oracles.get(Number(chain))?.get(key)}`);
    const joined = r ? joinRounds(s, r) : s;
    const pts = joined.points.filter((p) => p[0] >= from);
    prices.set(
      id,
      pts.map((p) => [p[0], p[1]]),
    );
    points.set(id, pts);
    if (r) stamps.set(id, { asOf: r.rounds.asOf, joinDay: r.rounds.joinDay });
  }
  return { roster, pages, list: priceRows(pages, prices, today, points, stamps) };
}

/** One chain's stored rounds, 12 oracles a read; the first read answering
 *  `lane: "off"` ends the chain's reads. A failed read leaves its lines on
 *  the daily store. */
async function readRounds(
  chain: number,
  list: string[],
  into: Map<string, NonNullable<ReturnType<typeof roundsOf>>>,
  fromTs: number,
  readerIp?: string | null,
): Promise<void> {
  const read = async (part: string[]) => {
    const qs = new URLSearchParams({
      chain: String(chain),
      oracles: part.join(","),
      max: String(ROUND_POINTS),
      from: String(fromTs),
    });
    const a = await get<RoundsAnswer>(`/api/prices/rounds?${qs.toString()}`, readerIp, ROUNDS_REVALIDATE_S).catch(
      () => null,
    );
    if (a?.lane !== "on") return a;
    for (const [o, wire] of Object.entries(a.lines)) {
      const r = "points" in wire ? roundsOf(wire, a.asOf) : null;
      if (r) into.set(`${chain}|${o.toLowerCase()}`, r);
    }
    return a;
  };
  const first = await read(list.slice(0, MAX_ORACLES));
  if (first?.lane !== "on") return;
  const rest: Promise<unknown>[] = [];
  for (let i = MAX_ORACLES; i < list.length; i += MAX_ORACLES) rest.push(read(list.slice(i, i + MAX_ORACLES)));
  await Promise.all(rest);
}
