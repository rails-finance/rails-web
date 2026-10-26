// The Prices list's rows for a server render or the list route (rails-ops
// reference/asset-key-map.md): the whole roster (GET /api/prices/assets), then
// over the last 30 days from the daily store (GET /api/prices/daily), 40
// series a read, each row's series and every drawn line on its page, for the
// flags.
//
// SERVER-ONLY. Reads `RAILS_API_URL` + `API_BEARER_TOKEN`.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { dailyPricesFromAnswer, type DailyAnswer } from "@/lib/api/fetch-daily-prices";
import { dailyStorePriceSeries } from "@/lib/shared/price-series";
import type { SpreadPoint } from "@/lib/shared/asset-spread";
import { priceRows, rosterPages, ROW_DAYS, type AssetPriceList } from "@/lib/shared/asset-prices";
import type { AssetRosterAnswer } from "@/lib/shared/asset-roster";

const TIMEOUT_MS = 10_000;
const MAX_SERIES = 40;
const DAY_MS = 86_400_000;

async function get<T>(path: string, readerIp?: string | null): Promise<T> {
  const RAILS_API_URL = process.env.RAILS_API_URL;
  if (!RAILS_API_URL) throw new Error("RAILS_API_URL environment variable is not set");
  const res = await fetch(
    `${RAILS_API_URL}${path}`,
    createAuthFetchOptions(
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(TIMEOUT_MS) },
      readerIp ?? undefined,
    ),
  );
  if (!res.ok) throw new Error(`${path.split("?")[0]} failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function fetchAssetPricesServer(readerIp?: string | null): Promise<AssetPriceList> {
  const roster = await get<Omit<AssetRosterAnswer, "related">>("/api/prices/assets", readerIp);
  const pages = rosterPages(roster.assets, roster.readAt, roster.native);
  const today = Math.floor(Date.now() / DAY_MS);
  // Back far enough to find the price 30 days before a series' last day.
  const from = today - ROW_DAYS - 10;
  const keys = new Map<number, Set<string>>();
  const want = (chain: number, k: string) => keys.set(chain, (keys.get(chain) ?? new Set()).add(k));
  for (const p of pages)
    for (const c of p.page.chains) for (const l of c.lines) if (l.drawn) want(c.chain, l.drawn.key);
  const prices = new Map<string, [number, number][]>();
  const points = new Map<string, readonly SpreadPoint[]>();
  const reads: Promise<void>[] = [];
  for (const [chain, set] of keys) {
    const list = [...set];
    for (let i = 0; i < list.length; i += MAX_SERIES) {
      const qs = new URLSearchParams({
        chain: String(chain),
        series: list.slice(i, i + MAX_SERIES).join(","),
        from: String(from),
      });
      reads.push(
        get<DailyAnswer>(`/api/prices/daily?${qs.toString()}`, readerIp).then((a) => {
          for (const [k, pts] of Object.entries(dailyPricesFromAnswer(a))) prices.set(`${chain}|${k}`, pts);
          const series = dailyStorePriceSeries(a, () => ({ symbol: "", chain }));
          for (const [k, s] of Object.entries(series)) points.set(`${chain}|${k}`, s.points);
        }),
      );
    }
  }
  await Promise.all(reads);
  return priceRows(pages, prices, today, points);
}
