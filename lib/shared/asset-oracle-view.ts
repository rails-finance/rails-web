// The words of a protocol's asset page (Miles, 24 Nov 2026; ui-jobs 818;
// anatomy A1.9, A2): the source naming the oracle the page charts, and one
// table, "How other protocols price <SYMBOL>": a row per protocol (a protocol
// that reads more than one line, a row per market), the protocols on the page's
// line first, then the other oracle lines, then the protocols that list the
// token with no stored line, each row with its price now and, on a same-block
// read, its gap.
// The as-of line closes a same-block read. The page's line is the one its
// protocol reads (`via`), else the line most protocols read. Prices come from
// the price-now answer (lib/shared/asset-prices-now.ts): on a same-block read
// a gap is the line's price against the page line's at that block; where the
// lines stand at different blocks (the stored stub) the table shows the price
// only. A failed or missing read is "–" with its reason. Pure.

import { formatDate } from "../date";
import { delayedLine, protocolFamily, shortAddress, type PageLine, type PageSeries } from "./asset-roster";
import { seriesExplorer } from "./asset-via";
import type { AssetPricesNow, LinePriceNow } from "./asset-prices-now";
import type { Provenance } from "@/components/shared/provenance";

const DAY_MS = 86_400_000;

/** A protocol named on the page, with its page for the token where it has one. */
export interface PageProtocol {
  name: string;
  /** The explorer whose series it is, null where Rails has none for it. */
  explorer: string | null;
  href: string | null;
}

/** "Liquity V2 WETH PriceFeed" as "Liquity V2's WETH PriceFeed" where it opens with its protocol's name. */
function owned(name: string, protocol: string): string {
  return name.startsWith(`${protocol} `) && !name.startsWith(`${protocol}'s`)
    ? `${protocol}'s ${name.slice(protocol.length + 1)}`
    : name;
}

/** "1 hour", "2 hours", "90 minutes". */
export function delayWords(seconds: number): string {
  if (seconds % 3600 === 0) return seconds === 3600 ? "1 hour" : `${seconds / 3600} hours`;
  return `${Math.round(seconds / 60)} minutes`;
}

/** The source in the row under the chart: its words and the contract they end on. */
export interface SourceLine {
  words: string;
  address: string;
}

/** The oracle the page charts, read from `explorer`'s side: "Chainlink ETH /
 *  USD, read through Liquity V2's WETH PriceFeed" (the one contract the
 *  explorer reads it through), "Chronicle median, held 1 hour by Maker's OSM"
 *  (a delayed line with its hop), else the oracle's name; each ends
 *  on its contract. Where the protocol stores no line (`noLine`), the most
 *  read: "Morpho Blue has no stored price for USDC here; the price most
 *  protocols read is Chainlink USDC / USD". */
export function sourceLine(
  line: Pick<PageLine, "oracle" | "series">,
  explorer: string | null,
  noLine?: { protocol: string; symbol: string },
): SourceLine {
  if (noLine)
    return {
      words: `${noLine.protocol} has no stored price for ${noLine.symbol} here; the price most protocols read is ${line.oracle.name}`,
      address: line.oracle.address,
    };
  const own = line.series.filter((s) => explorer != null && seriesExplorer(s.token.chain, s.key) === explorer);
  const through = [...new Set(own.map((s) => (s.via && s.via.kind !== "history" ? s.via.address : "")))];
  if (through.length === 1 && through[0]) {
    const s = own.find((x) => x.via?.address === through[0])!;
    return {
      words: `${line.oracle.name}, read through ${owned(s.via!.name, protocolFamily(s.protocol))}`,
      address: s.via!.address,
    };
  }
  const hop = line.oracle.hop;
  if (delayedLine(line as PageLine) && hop) {
    const family = line.series[0] ? protocolFamily(line.series[0].protocol) : null;
    return {
      words: `${line.oracle.label?.short ?? line.oracle.name}, held ${delayWords(hop)} by ${family ? `${family}'s ` : "the "}OSM`,
      address: line.oracle.address,
    };
  }
  return { words: line.oracle.name, address: line.oracle.address };
}

/** A route as the page words it: "its OEV wrapper" for "Moonwell's OEV
 *  wrapper" on Moonwell's entry, "its PriceOracle" for "Compound V2
 *  PriceOracle", else the wrapper's name ("a constant 1 ETH feed"). */
function routeName(name: string, family: string): string {
  if (name.startsWith(`${family}'s `)) return `its ${name.slice(family.length + 3)}`;
  if (name.startsWith(`${family} `)) return `its ${name.slice(family.length + 1)}`;
  return name;
}

/** One protocol under "Also reads this oracle". */
export interface AlsoReadsEntry {
  protocol: PageProtocol;
  /** The one contract it reads the oracle through, where it names one. */
  route: { words: string; address: string } | null;
  /** The first day stored for it on the line. */
  since: number | null;
}

/** The families whose markets read more than one of the chain's lines: a row
 *  names them by market ("Compound V3 cWETHv3"), not by family. A retired
 *  market is not counted. */
export function multiLineFamilies(lines: readonly Pick<PageLine, "series">[]): Set<string> {
  const linesOf = new Map<string, number>();
  for (const l of lines)
    for (const f of new Set(l.series.filter((s) => !s.retired).map((s) => protocolFamily(s.protocol))))
      linesOf.set(f, (linesOf.get(f) ?? 0) + 1);
  return new Set([...linesOf].filter(([, n]) => n > 1).map(([f]) => f));
}

/** The protocols on the page's line other than the page's, a retired market
 *  not counted: one entry per protocol, named by market for a family in
 *  `multi` (`multiLineFamilies`). */
export function alsoReads(
  line: Pick<PageLine, "series">,
  own: string | null,
  pageOf: (explorer: string) => string | null,
  multi: ReadonlySet<string> = new Set(),
): AlsoReadsEntry[] {
  const byName = new Map<string, PageSeries[]>();
  for (const s of line.series) {
    const explorer = seriesExplorer(s.token.chain, s.key);
    if (s.retired || (own != null && explorer === own)) continue;
    const family = protocolFamily(s.protocol);
    const name = multi.has(family) ? s.protocol : family;
    byName.set(name, [...(byName.get(name) ?? []), s]);
  }
  return [...byName].map(([name, list]) => {
    const explorer = seriesExplorer(list[0].token.chain, list[0].key);
    const vias = [...new Set(list.map((s) => s.via?.address ?? ""))];
    const via = vias.length === 1 && vias[0] ? list[0].via! : null;
    const days = list.map((s) => s.firstDay).filter((d): d is number => d != null);
    return {
      protocol: { name, explorer, href: explorer ? pageOf(explorer) : null },
      route: via ? { words: routeName(via.name, protocolFamily(list[0].protocol)), address: via.address } : null,
      since: days.length ? Math.min(...days) : null,
    };
  });
}

/** `pageOf` for the table's rows: the page's own protocol has no page to open
 *  from its own page, so a row it owns (Compound V3's cWETHv3 on Compound V3's
 *  USDC page) stays in the table with no link. */
export function rowPageOf(
  own: string | null,
  pageOf: (explorer: string) => string | null,
): (explorer: string) => string | null {
  return (explorer) => (explorer === own ? null : pageOf(explorer));
}

/** The page protocol's markets on the charted line, under the chart:
 *  "Core since 27 Jan 2023 · Prime since 29 Jul 2024", or "Stored since 15 Jul
 *  2024" for a protocol with one market. Null where the page has no line of
 *  its own or no market has a stored day. */
export function historyLine(line: Pick<PageLine, "series">, explorer: string | null): string | null {
  if (!explorer) return null;
  const own = line.series.filter((s) => s.firstDay != null && seriesExplorer(s.token.chain, s.key) === explorer);
  if (own.length === 0) return null;
  const first = new Map<string, number>();
  for (const s of own) first.set(s.protocol, Math.min(first.get(s.protocol) ?? Infinity, s.firstDay!));
  const family = protocolFamily(own[0].protocol);
  return [...first]
    .map(([name, day]) => {
      const market = name.startsWith(`${family} `) ? name.slice(family.length + 1) : "Stored";
      return `${market} since ${formatDate(new Date(day * DAY_MS))}`;
    })
    .join(" · ");
}

/** A protocol listing the token on the chain that reads no stored oracle line for it. */
export interface AlsoListedEntry {
  name: string;
  explorer: string;
  /** Its asset page for the token, null where it has none. */
  href: string | null;
  /** Why it reads no line, only where the roster's data states it for the explorer. */
  reason: string | null;
}

/** The explorers listing the token on the chain (the card line's chips) that
 *  the table names nowhere else: not the page's protocol, not another row's protocol. A vault family no explorer deploys (a chip
 *  with a token) is no protocol and is left out. `reasonOf` is the data's
 *  statement of why an explorer reads no line, null where it has none. */
export function alsoListed(
  chips: readonly { explorer: string; label: string; chain: number; token?: unknown }[],
  chain: number,
  own: string | null,
  named: { reads: readonly AlsoReadsEntry[]; rows: readonly OracleRow[] },
  pageOf: (explorer: string) => string | null,
  reasonOf: (explorer: string) => string | null = () => null,
): AlsoListedEntry[] {
  const used = new Set<string>(own ? [own] : []);
  const names = new Set<string>();
  for (const p of [...named.reads.map((e) => e.protocol), ...named.rows.map((r) => r.protocol)]) {
    if (p.explorer) used.add(p.explorer);
    names.add(p.name);
  }
  const out: AlsoListedEntry[] = [];
  for (const c of chips) {
    if (c.chain !== chain || c.token || used.has(c.explorer) || names.has(c.label)) continue;
    if (out.some((o) => o.explorer === c.explorer)) continue;
    out.push({ name: c.label, explorer: c.explorer, href: pageOf(c.explorer), reason: reasonOf(c.explorer) });
  }
  return out;
}

// ── Prices ───────────────────────────────────────────────────────────────────

/** "$1,697.10", "$0.9998": cents from $10, four decimals under it. */
export function fmtPriceNow(v: number): string {
  const d = v >= 10 ? 2 : 4;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}

/** A gap in percent, signed to two decimals: "+0.01%", "−0.32%", "0.00%". */
export function fmtGap(pct: number): string {
  const r = Math.round(Math.abs(pct) * 100) / 100;
  if (r === 0) return "0.00%";
  return `${pct > 0 ? "+" : "−"}${r.toFixed(2)}%`;
}

const hhmm = (d: Date) =>
  `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;

/** A price's time: "07:12 UTC" on today's date, else "23 Nov 2026, 07:12
 *  UTC"; a daily-store read is its day's close ("close of 23 Nov 2026"). */
export function priceTime(p: Pick<LinePriceNow, "timestamp" | "read">, nowMs: number): string | null {
  if (p.timestamp == null) return null;
  const d = new Date(p.timestamp * 1000);
  if (p.read === "day") return `close of ${formatDate(d)}`;
  return Math.floor(p.timestamp / 86_400) === Math.floor(nowMs / DAY_MS) ? hhmm(d) : `${formatDate(d)}, ${hhmm(d)}`;
}

/** The panel header's time words: "updated 07:12 UTC", or for a daily-store
 *  read "close of 23 Nov 2026". */
export function headTime(p: LinePriceNow | undefined, nowMs: number): string | null {
  if (!p?.ok || p.timestamp == null) return null;
  if (p.read === "day") return `close of ${formatDate(new Date(p.timestamp * 1000))}`;
  return `updated ${priceTime(p, nowMs)}`;
}

/** The as-of line under the table: "As of 24 Nov 2026, 07:12 UTC · block
 *  26,483,745" on a same-block read; null where each price stands at its own
 *  block (the stub), which draws no line. */
export function asOfText(now: AssetPricesNow): string | null {
  if (!now.sameBlock || now.block == null || now.timestamp == null) return null;
  const d = new Date(now.timestamp * 1000);
  return `As of ${formatDate(d)}, ${hhmm(d)} · block ${now.block.toLocaleString("en-US")}`;
}

/** What the (i) beside the as-of line says. */
export const AS_OF_NOTE =
  "Every price on this page, the headline's included, is read from its oracle at this one block. The chart is the stored history of the headline's oracle.";

// ── The table ────────────────────────────────────────────────────────────────

/** A price cell: the figure or "–" with why. */
export interface PriceCell {
  text: string;
  value: number | null;
  reason: string | null;
  stale: boolean;
}

/** Which of the table's three groups a row belongs to. */
export type RowGroup = "same" | "other" | "listed";

export interface OracleRow {
  /** The line's id on an "other" row; "same:<protocol>" or "listed:<explorer>" on the others. */
  id: string;
  group: RowGroup;
  /** The line the price is read from: the page's line on a "same" row, null on a "listed" one. */
  lineId: string | null;
  /** The route a "same" row's protocol reads the line through, drawn under its oracle. */
  via: { words: string; address: string } | null;
  /** The row's one protocol: its name is the family, or the market where the family reads more than one line. */
  protocol: PageProtocol;
  /** Every market on the line is one its protocol has retired. */
  retired: boolean;
  /** The label's short name, else the oracle's full name. */
  name: string;
  /** The full name, where `name` is a short one. */
  full: string | null;
  /** The label's kind, capitalised for the cell; null where none is stored. */
  kind: string | null;
  /** Null on a "listed" row, which reads no line. */
  address: string | null;
  price: PriceCell;
  /** Null where the table draws no gap (the prices stand at different blocks). */
  gap: { text: string; value: number | null; reason: string | null } | null;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function priceCell(p: LinePriceNow | undefined): PriceCell {
  if (!p || !p.ok || p.price == null)
    return { text: "–", value: null, reason: p?.reason ?? "The price was not read", stale: false };
  return { text: fmtPriceNow(p.price), value: p.price, reason: null, stale: p.stale === true };
}

/** The sentence above the table (A2.4), built from data. `gapFrom` names what
 *  the gap is against ("Liquity V2's price", "the price charted above"); it is
 *  drawn on a same-block read only. */
export function tableIntro(o: { chain: string; symbol: string; sameBlock: boolean; gapFrom: string }): string {
  const head = `The table below shows how other protocols on ${o.chain} price ${o.symbol}: the oracle each one reads`;
  return o.sameBlock
    ? `${head}, its price at one block and its gap from ${o.gapFrom}.`
    : `${head} and its latest price.`;
}

/** The table's "other" rows: every line on the chain but the page's, in the
 *  chart's order, a row per protocol on it, so a line's rows stand together.
 *  A protocol is named by family ("Aave V3"), or by market where its markets
 *  read more than one of the chain's lines ("Aave V3 EtherFi"). */
export function oracleRows(
  lines: readonly PageLine[],
  pageLine: PageLine,
  now: AssetPricesNow,
  pageOf: (explorer: string) => string | null,
): OracleRow[] {
  const multi = multiLineFamilies(lines);
  const ref = now.prices[pageLine.id];
  return lines
    .filter((l) => l.id !== pageLine.id)
    .flatMap((l) => {
      const live = l.series.filter((s) => !s.retired);
      const retired = live.length === 0 && l.series.length > 0;
      const protocols: PageProtocol[] = [];
      for (const s of retired ? l.series : live) {
        const family = protocolFamily(s.protocol);
        const name = multi.has(family) ? s.protocol : family;
        if (protocols.some((p) => p.name === name)) continue;
        const explorer = seriesExplorer(s.token.chain, s.key);
        protocols.push({ name, explorer, href: explorer ? pageOf(explorer) : null });
      }
      const price = priceCell(now.prices[l.id]);
      const short = l.oracle.label?.short;
      return protocols.map((protocol) => ({
        id: `${l.id}:${protocol.name}`,
        group: "other" as const,
        lineId: l.id,
        via: null,
        protocol,
        retired,
        name: short ?? l.oracle.name,
        full: short && short !== l.oracle.name ? l.oracle.name : null,
        kind: l.oracle.label?.kind ? cap(l.oracle.label.kind) : null,
        address: l.oracle.address,
        price,
        gap: now.sameBlock ? gapCell(price, ref) : null,
      }));
    });
}

/** The table's "same" rows: each protocol on the page line's oracle, priced
 *  as the page's line is. `pageName` is the page's protocol ("Aave V3"), null
 *  where it has no line of its own (Morpho's page), and the row then names the
 *  line the chart draws. */
export function sameRows(
  pageLine: Pick<PageLine, "id" | "oracle">,
  reads: readonly AlsoReadsEntry[],
  pageName: string | null,
  now: AssetPricesNow,
): OracleRow[] {
  const price = priceCell(now.prices[pageLine.id]);
  const gap = now.sameBlock ? gapCell(price, now.prices[pageLine.id]) : null;
  return reads.map((e) => ({
    id: `same:${e.protocol.name}`,
    group: "same" as const,
    lineId: pageLine.id,
    via: e.route,
    protocol: e.protocol,
    retired: false,
    name: pageName ? `Same oracle as ${pageName}` : "The price charted above",
    full: null,
    kind: null,
    address: pageLine.oracle.address,
    price,
    gap,
  }));
}

/** The table's "listed" rows: a protocol that lists the token and stores no
 *  line for it, with no price. A stated reason, where the data has one, sits under "Not saved by Rails". */
export function listedRows(entries: readonly AlsoListedEntry[], now: AssetPricesNow): OracleRow[] {
  return entries.map((e) => ({
    id: `listed:${e.explorer}`,
    group: "listed" as const,
    lineId: null,
    via: null,
    protocol: { name: e.name, explorer: e.explorer, href: e.href },
    retired: false,
    name: "Not saved by Rails",
    full: null,
    kind: e.reason,
    address: null,
    price: { text: "–", value: null, reason: null, stale: false },
    gap: now.sameBlock ? { text: "–", value: null, reason: null } : null,
  }));
}

/** The table in its order: the page line's readers, the other lines, the listed-only protocols. */
export const tableRows = (same: OracleRow[], other: OracleRow[], listed: OracleRow[]): OracleRow[] => [
  ...same,
  ...other,
  ...listed,
];

/** The line's price against the page line's, in percent. */
function gapCell(price: PriceCell, ref: LinePriceNow | undefined): NonNullable<OracleRow["gap"]> {
  if (price.value == null) return { text: "–", value: null, reason: price.reason };
  if (!ref?.ok || ref.price == null)
    return { text: "–", value: null, reason: ref?.reason ?? "The page's price was not read" };
  const pct = (price.value / ref.price - 1) * 100;
  return { text: fmtGap(pct), value: pct, reason: null };
}

/** A row link's accessible name, one per row: "Compound V3 cWETHv3: Chainlink
 *  USDC / USD, $0.9999", so rows that open one page still read apart. */
export function rowLabel(r: Pick<OracleRow, "protocol" | "name" | "price" | "group">): string {
  const price = r.group === "listed" ? null : r.price.value != null ? r.price.text : "no price read";
  return `${r.protocol.name}: ${r.name}${price ? `, ${price}` : ""}`;
}

// ── Receipts ─────────────────────────────────────────────────────────────────

/** A price's receipt: the oracle, what was read and the block. */
export function priceProv(line: Pick<PageLine, "oracle">, p: LinePriceNow, symbol: string): Provenance {
  const name = line.oracle.label?.short ?? line.oracle.name;
  const at = p.block != null ? `block ${p.block.toLocaleString("en-US")}` : "an unknown block";
  const what =
    p.read === "round"
      ? `the round of ${line.oracle.name} in force at ${at}, from the oracle rounds Rails stores`
      : p.read === "day"
        ? `the daily store's read of ${line.oracle.name} at ${at}, its day's close`
        : `${p.read} on ${line.oracle.name} at ${at}, the block every price on the page is read at`;
  return {
    kind: "chain",
    pclass: "oracle",
    summary: `${symbol} price from ${name} — ${what}.`,
    contract: { name: line.oracle.name, address: line.oracle.address },
    via: p.read === "round" ? "stored oracle rounds" : p.read === "day" ? "daily price store" : p.read,
    ...(p.block != null ? { source: { block: p.block } } : {}),
  };
}

/** A gap's receipt: the line's price over the page line's, less one, at the one block. */
export function gapProv(
  row: Pick<OracleRow, "name">,
  price: number,
  ref: number,
  refName: string,
  block: number | null,
): Provenance {
  return {
    kind: "derived",
    summary: `Gap from ${refName} — ${row.name}'s price over ${refName}'s, less one, both read at block ${block?.toLocaleString("en-US") ?? "?"}.`,
    formula: "price ÷ reference price − 1",
    inputs: [
      { label: `${row.name} price`, value: fmtPriceNow(price), kind: "chain", pclass: "oracle" },
      { label: `${refName} price`, value: fmtPriceNow(ref), kind: "chain", pclass: "oracle" },
    ],
    ...(block != null ? { source: { block } } : {}),
  };
}
