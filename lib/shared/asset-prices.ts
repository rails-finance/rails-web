// The Prices list (rails-ops reference/asset-key-map.md, "The Prices list"):
// one row per asset page, from the roster, priced by the page's main line on
// its first chain over the last 30 UTC days, the series the page's chart
// draws: the daily store joined above by the line's stored rounds where the
// chain serves them, today's price then the value in force at Sieve's
// checkpoint with its "as of" stamp. A row is flagged where
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
  type PageLine,
  type RosterAsset,
  type RosterAssetRef,
} from "@/lib/shared/asset-roster";
import { gapSince, lineSpreads, type SpreadPoint } from "@/lib/shared/asset-spread";
import { lineReaderKeys, parseVia, viaLineOf } from "@/lib/shared/asset-via";

/** The days a row's sparkline and change span. */
export const ROW_DAYS = 30;

/** A page's main line on one chain, as a row reads it. */
export interface ChainPrice {
  chain: number;
  /** The line the row reads: its oracle's name and the protocols on it. */
  oracle: string | null;
  protocols: string[];
  /** The series key the row reads. */
  key: string | null;
  /** The last price: the last completed day's close from the daily store,
   *  or on stored rounds the value in force at `asOf`; and its day. */
  price: number | null;
  day: number | null;
  /** Where the line reads stored rounds: Sieve's checkpoint the price stands at. */
  asOf: { ts: number; block: number } | null;
  /** `[day, price]` over the window, ascending. */
  spark: [number, number][];
  /** The change over ROW_DAYS days, a fraction; null where the series is younger. */
  change: number | null;
  /** The explorers whose protocols read this line, each with its markets or
   *  ilks on it, keyed by explorer and by explorer and market
   *  (`lineReaderKeys`, lib/shared/asset-via.ts). */
  by: Record<string, string[]>;
  /** The lines explorers read where it is not this one, for an icon on a
   *  position page priced by the line its protocol reads (`rowFor`'s `via`). */
  alt?: ChainPrice[];
  /** Each explorer's line among `alt` (its index), where it is not this one,
   *  keyed as `by` is. */
  picks?: Record<string, number>;
}

export interface AssetPriceRow extends ChainPrice {
  token: string;
  symbol: string;
  href: string;
  /** Every (chain, token) the page answers for: its token on each chain. */
  chains: number[];
  /** The price unit: a USD figure on every row today. */
  unit: "usd";
  /** How many protocol series price the page. */
  readers: number;
  /** Why the row is flagged; null where it is not. */
  flag: RowFlag | null;
  /** The main line on each of the page's other chains, for an icon on that chain. */
  elsewhere: ChainPrice[];
}

export interface RowFlag {
  /** The page's fixed-price lines, by their readers ("SparkLend"). */
  fixed: string[];
  /** The largest gap past SPREAD_LIMIT in the last ROW_DAYS days, on any chain. */
  gap: { chain: number; line: string; main: string; dev: number; day: number } | null;
}

/** The flag for a page from its drawn lines' recent points (`chain|key`),
 *  and the first day each joined line's points are its rounds' closes. */
export function pageFlag(
  page: AssetPage,
  points: Map<string, readonly SpreadPoint[]>,
  today: number,
  joins: Map<string, number> = new Map(),
): RowFlag | null {
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
    // A joined line's day closes compare at the same moment, as on the page.
    const joined = (l: (typeof c.lines)[number]) => {
      const d = joins.get(`${c.chain}|${l.drawn!.key}`);
      return d == null ? {} : { rounds: { points: [], joinDay: d } };
    };
    const spreads = lineSpreads(
      { key: main.id, points: mp, fixed: main.oracle.kind === "fixed", ...joined(main) },
      others.map((l) => ({
        key: l.id,
        points: points.get(`${c.chain}|${l.drawn!.key}`)!,
        fixed: l.oracle.kind === "fixed",
        ...joined(l),
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
        others: page.chains
          .slice(1)
          .map((c) => ({ chain: c.chain, line: c.lines.find((l) => l.drawn != null) ?? null })),
        readers: page.chains.reduce((n, c) => n + c.lines.reduce((m, l) => m + l.series.length, 0), 0),
      },
    ];
  });
}

/** Each series' stored-rounds stamp (`chain|key`): the checkpoint its last
 *  point stands at, and the first day its points are the rounds' closes. */
export type RoundsStamp = { asOf: { ts: number; block: number }; joinDay: number };

/** One chain's main line as a row reads it, from its `[day, price]` list. */
function chainPrice(
  chain: number,
  line: PageLine | null,
  prices: Map<string, [number, number][]>,
  stamps: Map<string, RoundsStamp>,
  today: number,
): ChainPrice {
  const key = line?.drawn?.key ?? null;
  const pts = key ? (prices.get(`${chain}|${key}`) ?? []) : [];
  const end = pts.at(-1) ?? null;
  const spark = pts.filter(([d]) => d >= today - ROW_DAYS - 1);
  // The price ROW_DAYS days before the last one: the last at or before that day.
  const base = end ? [...pts].reverse().find(([d]) => d <= end[0] - ROW_DAYS) : undefined;
  const stamp = key ? stamps.get(`${chain}|${key}`) : undefined;
  return {
    chain,
    oracle: line?.oracle.name ?? null,
    protocols: line?.protocols ?? [],
    key,
    price: end ? end[1] : null,
    day: end ? end[0] : null,
    asOf: end && stamp ? stamp.asOf : null,
    spark,
    change: end && base ? end[1] / base[1] - 1 : null,
    by: line ? lineReaderKeys(line) : {},
  };
}

/** A chain's main line as a row reads it, with the other lines its explorers read. */
function chainPrices(
  c: AssetPage["chains"][number] | undefined,
  chain: number,
  line: PageLine | null,
  prices: Map<string, [number, number][]>,
  stamps: Map<string, RoundsStamp>,
  today: number,
): ChainPrice {
  const own = chainPrice(chain, line, prices, stamps, today);
  if (!c) return own;
  const keys = new Set(c.lines.flatMap((l) => Object.keys(lineReaderKeys(l))));
  const alt: PageLine[] = [];
  const picks: Record<string, number> = {};
  for (const k of keys) {
    const v = parseVia(k)!;
    const l = viaLineOf(c.lines, v.id, v.market);
    if (!l || l === line) continue;
    if (!alt.includes(l)) alt.push(l);
    picks[k] = alt.indexOf(l);
  }
  if (!alt.length) return own;
  return { ...own, alt: alt.map((l) => chainPrice(chain, l, prices, stamps, today)), picks };
}

/** The rows, from the pages and each series' `[day, price]` list (a joined
 *  series' last day is the rounds' value at the checkpoint). */
export function priceRows(
  pages: ReturnType<typeof rosterPages>,
  prices: Map<string, [number, number][]>,
  today: number,
  points: Map<string, readonly SpreadPoint[]> = new Map(),
  stamps: Map<string, RoundsStamp> = new Map(),
): AssetPriceList {
  let last: number | null = null;
  const joins = new Map([...stamps].map(([k, s]) => [k, s.joinDay]));
  const rows = pages.map(({ page, chain, chains, line, others, readers }): AssetPriceRow => {
    const at = (n: number) => page.chains.find((c) => c.chain === n);
    const own = chainPrices(at(chain), chain, line, prices, stamps, today);
    // The list's "at the close of" day: the last a daily-store row reads.
    if (own.day != null && own.asOf == null && (last == null || own.day > last)) last = own.day;
    return {
      ...own,
      token: page.token,
      symbol: page.symbol,
      href: assetHref(chain, page.token),
      chains,
      unit: "usd",
      readers,
      flag: pageFlag(page, points, today, joins),
      elsewhere: others.map((o) => chainPrices(at(o.chain), o.chain, o.line, prices, stamps, today)),
    };
  });
  // Flagged rows first, then the most read: the assets most protocols price.
  rows.sort(
    (a, b) =>
      Number(b.flag != null) - Number(a.flag != null) || b.readers - a.readers || a.symbol.localeCompare(b.symbol),
  );
  return { rows, day: last };
}

/** The row for an icon: the page whose token, on that chain, is `token`,
 *  priced by its main line on that chain where the page has one; with `via`
 *  (an explorer id, or id and market), by the line that explorer's protocol reads, the main
 *  line where it reads none (`viaLine` says which). */
export function rowFor(
  list: AssetPriceList,
  chain: number,
  token: string,
  via?: string | null,
): (AssetPriceRow & { viaLine?: "own" | "none"; viaKey?: string }) | null {
  const t = token.toLowerCase();
  const row = list.rows.find((r) => r.token === t && r.chains.includes(chain));
  if (!row) return null;
  const there = row.chain === chain ? null : row.elsewhere?.find((e) => e.chain === chain && e.key != null);
  const base = there ? { ...row, ...there } : row;
  if (!via) return base;
  // A market no line carries reads as its explorer, as on the page.
  const key = base.by?.[via] || base.picks?.[via] != null ? via : (parseVia(via)?.id ?? via);
  const i = base.picks?.[key];
  const alt = i != null ? base.alt?.[i] : undefined;
  if (alt && alt.price != null) return { ...base, ...alt, viaLine: "own", viaKey: key };
  return { ...base, viaLine: base.by?.[key] ? "own" : "none", viaKey: key };
}
