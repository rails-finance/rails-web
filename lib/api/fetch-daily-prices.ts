// The shared daily price store, read through /api/prices/daily (rails-ops
// reference/daily-prices.md): per series key, the price of each completed UTC
// day as `[day, usd]` ascending. A day with no price is absent, and a row
// whose unit is not USD (Compound V2's ETH years) is left out; the caller
// carries the last price over both. Null where the read failed or answered
// nothing, so a page keeps carrying each event's price.

type Obs = [number, string, string, string?, number?];

export interface DailyAnswer {
  series?: Record<string, { unit?: string; scale?: number; obs?: Obs[] }>;
}

/** At most 40 series per read (the route's cap). */
const MAX_SERIES = 40;

export async function fetchDailyPrices(
  chain: number,
  keys: readonly string[],
  opts: { from?: number; signal?: AbortSignal } = {},
): Promise<Record<string, [number, number][]> | null> {
  const body = await fetchDailyAnswer(chain, keys, opts);
  if (!body) return null;
  const out = dailyPricesFromAnswer(body);
  return Object.keys(out).length > 0 ? out : null;
}

/** The store's answer as it came, every unit kept, the reads of more than
 *  40 series merged; null where a read failed. */
export async function fetchDailyAnswer(
  chain: number,
  keys: readonly string[],
  opts: { from?: number; signal?: AbortSignal } = {},
): Promise<DailyAnswer | null> {
  const unique = [...new Set(keys)];
  if (unique.length === 0) return null;
  const out: DailyAnswer = { series: {} };
  for (let i = 0; i < unique.length; i += MAX_SERIES) {
    const qs = new URLSearchParams({ chain: String(chain), series: unique.slice(i, i + MAX_SERIES).join(",") });
    if (opts.from != null) qs.set("from", String(opts.from));
    const res = await fetch(`/api/prices/daily?${qs.toString()}`, { signal: opts.signal });
    if (!res.ok) return null;
    Object.assign(out.series!, ((await res.json()) as DailyAnswer).series ?? {});
  }
  return out;
}

/** One answer's series as `[day, price]` ascending, the rows whose unit
 *  `accept` takes: USD by default; a ratio family (Fluid's `token:<debt
 *  token>`) passes its own. */
export function dailyPricesFromAnswer(
  body: DailyAnswer,
  accept: (unit: string) => boolean = (u) => u === "usd",
): Record<string, [number, number][]> {
  const out: Record<string, [number, number][]> = {};
  for (const [key, s] of Object.entries(body.series ?? {})) {
    const list: [number, number][] = [];
    for (const [day, raw, , unit, scale] of s.obs ?? []) {
      const u = unit ?? s.unit;
      if (u == null || !accept(u)) continue;
      const sc = scale ?? s.scale;
      const p = sc != null ? Number(raw) / 10 ** sc : NaN;
      if (Number.isFinite(p) && p > 0) list.push([day, p]);
    }
    if (list.length > 0) out[key] = list.sort((a, b) => a[0] - b[0]);
  }
  return out;
}
