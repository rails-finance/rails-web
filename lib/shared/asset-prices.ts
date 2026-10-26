// The Prices list (rails-ops reference/asset-key-map.md, "The Prices list"):
// one row per asset page, from the roster, priced by the page's main line on
// its first chain over the last 30 completed UTC days. A row is flagged where
// its page carries a fixed price, or a line past SPREAD_LIMIT from its chart's
// main line in those 30 days (a line only retired markets read aside, and a
// Maker OSM line, whose gap is its hour's delay), and flagged rows come first.
//
// Pure: the server builds the rows (lib/api/fetch-asset-prices-server.ts),
// the list page and the asset icon's popover read them.

import {
  assetHref,
  assetPage,
  delayedLine,
  lineReaders,
  mainLine,
  type AssetPage,
  type AssetRosterAnswer,
  type RosterAsset,
  type RosterAssetRef,
} from "@/lib/shared/asset-roster";
import { gapSince, lineSpreads, type SpreadPoint } from "@/lib/shared/asset-spread";

/** The days a row's sparkline and change span. */
export const ROW_DAYS = 30;

export interface AssetPriceRow {
  chain: number;
  token: string;
  symbol: string;
  href: string;
  /** Every (chain, token) the page answers for: its token on each chain. */
  chains: number[];
  /** The line the row reads: its oracle's name and the protocols on it. */
  oracle: string | null;
  protocols: string[];
  /** The series key the row reads, and its chain. */
  key: string | null;
  /** The price unit: a USD figure on every row today. */
  unit: "usd";
  /** The last completed day's price, and that day. */
  price: number | null;
  day: number | null;
  /** `[day, price]` over the window, ascending. */
  spark: [number, number][];
  /** The change over ROW_DAYS days, a fraction; null where the series is younger. */
  change: number | null;
  /** How many protocol series price the page. */
  readers: number;
  /** Why the row is flagged; null where it is not. */
  flag: RowFlag | null;
}

export interface RowFlag {
  /** The page's fixed-price lines, by their readers ("SparkLend"). */
  fixed: string[];
  /** The largest gap past SPREAD_LIMIT in the last ROW_DAYS days, on any chain. */
  gap: { chain: number; line: string; main: string; dev: number; day: number } | null;
}

/** The flag for a page from its drawn lines' recent points (`chain|key`). */
export function pageFlag(page: AssetPage, points: Map<string, readonly SpreadPoint[]>, today: number): RowFlag | null {
  const fixed = [
    ...new Set(page.chains.flatMap((c) => c.lines.filter((l) => l.oracle.kind === "fixed").map(lineReaders))),
  ];
  let gap: RowFlag["gap"] = null;
  for (const c of page.chains) {
    const main = mainLine(c);
    const mp = main?.drawn ? points.get(`${c.chain}|${main.drawn.key}`) : undefined;
    if (!main || !mp) continue;
    // A line only retired markets read (an offboarded Maker ilk, its price
    // frozen at the last poke) is drawn on the page and not flagged here; nor
    // is a Maker OSM line, whose gap is the hour it runs behind by design
    // (the page's spread strip names it).
    const others = c.lines.filter(
      (l) =>
        l !== main &&
        l.drawn &&
        points.has(`${c.chain}|${l.drawn.key}`) &&
        !l.series.every((x) => x.retired) &&
        !delayedLine(l),
    );
    const spreads = lineSpreads(
      { key: main.id, points: mp, fixed: main.oracle.kind === "fixed" },
      others.map((l) => ({
        key: l.id,
        points: points.get(`${c.chain}|${l.drawn!.key}`)!,
        fixed: l.oracle.kind === "fixed",
      })),
      c.chain,
    );
    for (const [i, sp] of spreads.entries()) {
      const g = gapSince(sp, today - ROW_DAYS);
      if (g && (gap == null || Math.abs(g.dev) > Math.abs(gap.dev)))
        gap = { chain: c.chain, line: lineReaders(others[i]), main: main.oracle.name, ...g };
    }
  }
  return fixed.length || gap ? { fixed, gap } : null;
}

export interface AssetPriceList {
  rows: AssetPriceRow[];
  /** The last day any row reads, for the list's "as of". */
  day: number | null;
}

/** The page of each token in the whole roster, and the series key each row
 *  reads (the first chain's picked line). */
export function rosterPages(assets: RosterAsset[], readAt: AssetRosterAnswer["readAt"], native: string) {
  const byToken = new Map<string, RosterAsset[]>();
  // The zero address is a key-map entry whose token was not resolved (Maker's
  // allocator ilks, Compound V2's cTUSD): no page to list.
  for (const a of assets) if (!/^0x0{40}$/.test(a.token)) byToken.set(a.token, [...(byToken.get(a.token) ?? []), a]);
  const id = (r: RosterAssetRef) => `${r.chain}:${r.token}`;
  const byId = new Map(assets.map((a) => [id(a), a]));
  return [...byToken].flatMap(([, own]) => {
    const linked = new Set<string>();
    for (const a of own) {
      for (const w of a.wrapped) linked.add(id(w));
      if (a.underlying) linked.add(id(a.underlying));
    }
    const related = [...linked].map((k) => byId.get(k)).filter((a): a is RosterAsset => a != null);
    const chain = own.some((a) => a.chain === 1) ? 1 : own[0].chain;
    const page = assetPage({ readAt, native, assets: own, related }, chain);
    if (!page) return [];
    const first = page.chains[0];
    const line = first?.lines.find((l) => l.drawn != null) ?? null;
    return [
      {
        page,
        chain: first?.chain ?? chain,
        chains: own.map((a) => a.chain),
        line,
        readers: page.chains.reduce((n, c) => n + c.lines.reduce((m, l) => m + l.series.length, 0), 0),
      },
    ];
  });
}

/** The rows, from the pages and each series' `[day, price]` list. */
export function priceRows(
  pages: ReturnType<typeof rosterPages>,
  prices: Map<string, [number, number][]>,
  today: number,
  points: Map<string, readonly SpreadPoint[]> = new Map(),
): AssetPriceList {
  let last: number | null = null;
  const rows = pages.map(({ page, chain, chains, line, readers }): AssetPriceRow => {
    const key = line?.drawn?.key ?? null;
    const pts = key ? (prices.get(`${chain}|${key}`) ?? []) : [];
    const end = pts.at(-1) ?? null;
    const from = today - ROW_DAYS;
    const spark = pts.filter(([d]) => d >= from - 1);
    // The price ROW_DAYS days before the last one: the last at or before that day.
    const base = end ? [...pts].reverse().find(([d]) => d <= end[0] - ROW_DAYS) : undefined;
    if (end && (last == null || end[0] > last)) last = end[0];
    return {
      chain,
      token: page.token,
      symbol: page.symbol,
      href: assetHref(chain, page.token),
      chains,
      oracle: line?.oracle.name ?? null,
      protocols: line?.protocols ?? [],
      key,
      unit: "usd",
      price: end ? end[1] : null,
      day: end ? end[0] : null,
      spark,
      change: end && base ? end[1] / base[1] - 1 : null,
      readers,
      flag: pageFlag(page, points, today),
    };
  });
  // Flagged rows first, then the most read: the assets most protocols price.
  rows.sort(
    (a, b) =>
      Number(b.flag != null) - Number(a.flag != null) || b.readers - a.readers || a.symbol.localeCompare(b.symbol),
  );
  return { rows, day: last };
}

/** The row for an icon: the page whose token, on that chain, is `token`. */
export function rowFor(list: AssetPriceList, chain: number, token: string): AssetPriceRow | null {
  const t = token.toLowerCase();
  return list.rows.find((r) => r.token === t && r.chains.includes(chain)) ?? null;
}
