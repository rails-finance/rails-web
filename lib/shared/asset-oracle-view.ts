// The words of a protocol's asset page (Miles's mockup of 24 Nov 2026; ui-jobs
// 818; anatomy A1, A2): the title and the source line naming the oracle the
// page charts, "Also reads this oracle" (the other protocols on that line),
// the table of the other oracles with each one's price now and gap, and the
// as-of line. The page's line is the one its protocol reads (`via`), else the
// line most protocols read. Prices come from the price-now answer
// (lib/shared/asset-prices-now.ts): on a same-block read a gap is the line's
// price against the page line's at that block; where the lines stand at
// different blocks (the stored stub) the table draws each price with its
// stamp and no gap. A failed or missing read is "–" with its reason. Pure.

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

/** What a page shows its title from: the protocol's line, the line most
 *  protocols read (the protocol stores none), or no stored price at all. */
export type TitleMode = "line" | "most-read" | "unpriced";

/** "WETH price in Liquity V2", "USDC: the price most protocols read", "BOLD in Liquity V2". */
export function assetTitle(symbol: string, protocol: string, mode: TitleMode): string {
  if (mode === "line") return `${symbol} price in ${protocol}`;
  if (mode === "most-read") return `${symbol}: the price most protocols read`;
  return `${symbol} in ${protocol}`;
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

/** The line under the title: its words and the contract they end on. */
export interface SourceLine {
  words: string;
  address: string;
}

/** The oracle the page charts, read from `explorer`'s side: "Chainlink ETH /
 *  USD, read through Liquity V2's WETH PriceFeed" (the one contract the
 *  explorer reads it through), "Chronicle median, held 1 hour by Maker's OSM"
 *  (a delayed line with its stored delay), else the oracle's name; each ends
 *  on its contract. */
export function sourceLine(line: Pick<PageLine, "oracle" | "series">, explorer: string | null): SourceLine {
  const own = line.series.filter((s) => explorer != null && seriesExplorer(s.token.chain, s.key) === explorer);
  const through = [...new Set(own.map((s) => (s.via && s.via.kind !== "history" ? s.via.address : "")))];
  if (through.length === 1 && through[0]) {
    const s = own.find((x) => x.via?.address === through[0])!;
    return {
      words: `${line.oracle.name}, read through ${owned(s.via!.name, protocolFamily(s.protocol))}`,
      address: s.via!.address,
    };
  }
  const delay = line.oracle.label?.delay;
  if (delayedLine(line as PageLine) && delay) {
    const family = line.series[0] ? protocolFamily(line.series[0].protocol) : null;
    return {
      words: `${line.oracle.label?.short ?? line.oracle.name}, held ${delayWords(delay)} by ${family ? `${family}'s ` : "the "}OSM`,
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

/** The protocols on the page's line other than the page's, a retired
 *  market not counted: one entry per protocol, its markets together. */
export function alsoReads(
  line: Pick<PageLine, "series">,
  own: string | null,
  pageOf: (explorer: string) => string | null,
): AlsoReadsEntry[] {
  const byFamily = new Map<string, PageSeries[]>();
  for (const s of line.series) {
    const explorer = seriesExplorer(s.token.chain, s.key);
    if (s.retired || (own != null && explorer === own)) continue;
    const f = protocolFamily(s.protocol);
    byFamily.set(f, [...(byFamily.get(f) ?? []), s]);
  }
  return [...byFamily].map(([family, list]) => {
    const explorer = seriesExplorer(list[0].token.chain, list[0].key);
    const vias = [...new Set(list.map((s) => s.via?.address ?? ""))];
    const via = vias.length === 1 && vias[0] ? list[0].via! : null;
    const days = list.map((s) => s.firstDay).filter((d): d is number => d != null);
    return {
      protocol: { name: family, explorer, href: explorer ? pageOf(explorer) : null },
      route: via ? { words: routeName(via.name, family), address: via.address } : null,
      since: days.length ? Math.min(...days) : null,
    };
  });
}

/** "via its OEV wrapper", ", since 31 May 2026" around the route's address. */
export function alsoReadsWords(e: AlsoReadsEntry): { before: string; after: string } {
  const since = e.since != null ? `since ${formatDate(new Date(e.since * DAY_MS))}` : "";
  if (!e.route) return { before: since, after: "" };
  return { before: `via ${e.route.words}`, after: since ? `, ${since}` : "" };
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
 *  read "at the close of 23 Nov 2026". */
export function headTime(p: LinePriceNow | undefined, nowMs: number): string | null {
  if (!p?.ok || p.timestamp == null) return null;
  if (p.read === "day") return `at the close of ${formatDate(new Date(p.timestamp * 1000))}`;
  return `updated ${priceTime(p, nowMs)}`;
}

/** A price's stamp, where the prices stand at different blocks: "07:12 UTC · block 23,860,201". */
export function priceStamp(p: LinePriceNow, nowMs: number): string | null {
  const t = priceTime(p, nowMs);
  if (!p.ok || t == null || p.block == null) return null;
  return `${t} · block ${p.block.toLocaleString("en-US")}`;
}

/** The as-of line under the table: "As of 24 Nov 2026, 07:12 UTC · block
 *  26,483,745" on a same-block read; where each price has its block,
 *  the sentence that says so. */
export function asOfText(now: AssetPricesNow): string {
  if (now.sameBlock && now.block != null && now.timestamp != null) {
    const d = new Date(now.timestamp * 1000);
    return `As of ${formatDate(d)}, ${hhmm(d)} · block ${now.block.toLocaleString("en-US")}`;
  }
  return "Each price is its oracle's latest stored value, at the time and block under it";
}

/** What the (i) beside the as-of line says. */
export function asOfNote(now: AssetPricesNow): string {
  if (now.sameBlock)
    return "Every price on this page, the headline's included, is read from its oracle at this one block, so each gap compares two prices of the same moment. The chart is the stored history of the headline's oracle.";
  return "Rails reads these from its stored oracle rounds, or for an oracle without them its daily store, so each price stands at its block. A gap needs both prices at one block, so the table shows none.";
}

// ── The table ────────────────────────────────────────────────────────────────

/** A price cell: the figure or "–" with why. */
export interface PriceCell {
  text: string;
  value: number | null;
  reason: string | null;
  stale: boolean;
  /** The price's time and block, where the prices stand at different blocks. */
  stamp: string | null;
}

/** A market-level line in a row's expansion. */
export interface MarketLine {
  protocol: string;
  /** The token it prices where the line prices more than one ("prices ETH"). */
  prices: string | null;
  via: { name: string; address: string } | null;
  retired: boolean;
  since: number | null;
}

export interface OracleRow {
  id: string;
  usedBy: PageProtocol[];
  /** Every market on the line is one its protocol has retired. */
  retired: boolean;
  /** The label's short name, else the oracle's full name. */
  name: string;
  /** The full name, where `name` is a short one. */
  full: string | null;
  /** The label's kind, capitalised for the cell; null where none is stored. */
  kind: string | null;
  address: string;
  price: PriceCell;
  /** Null where the table draws no gap (the prices stand at different blocks). */
  gap: { text: string; value: number | null; reason: string | null } | null;
  markets: MarketLine[];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function priceCell(p: LinePriceNow | undefined, sameBlock: boolean, nowMs: number): PriceCell {
  if (!p || !p.ok || p.price == null)
    return { text: "–", value: null, reason: p?.reason ?? "The price was not read", stale: false, stamp: null };
  return {
    text: fmtPriceNow(p.price),
    value: p.price,
    reason: null,
    stale: p.stale === true,
    stamp: sameBlock ? null : priceStamp(p, nowMs),
  };
}

/** The table's rows: every line on the chain but the page's, in the chart's
 *  order. A protocol is named by family ("Aave V3"), or by market where its
 *  markets read more than one of the chain's lines ("Aave V3 EtherFi"). */
export function oracleRows(
  lines: readonly PageLine[],
  pageLine: PageLine,
  now: AssetPricesNow,
  pageOf: (explorer: string) => string | null,
  nowMs: number,
): OracleRow[] {
  const linesOf = new Map<string, number>();
  for (const l of lines)
    for (const f of new Set(l.series.filter((s) => !s.retired).map((s) => protocolFamily(s.protocol))))
      linesOf.set(f, (linesOf.get(f) ?? 0) + 1);
  const ref = now.prices[pageLine.id];
  return lines
    .filter((l) => l.id !== pageLine.id)
    .map((l) => {
      const live = l.series.filter((s) => !s.retired);
      const retired = live.length === 0 && l.series.length > 0;
      const usedBy: PageProtocol[] = [];
      for (const s of retired ? l.series : live) {
        const family = protocolFamily(s.protocol);
        const name = (linesOf.get(family) ?? 0) > 1 ? s.protocol : family;
        if (usedBy.some((p) => p.name === name)) continue;
        const explorer = seriesExplorer(s.token.chain, s.key);
        usedBy.push({ name, explorer, href: explorer ? pageOf(explorer) : null });
      }
      const p = now.prices[l.id];
      const price = priceCell(p, now.sameBlock, nowMs);
      const symbols = new Set(l.series.map((s) => s.token.symbol));
      const short = l.oracle.label?.short;
      return {
        id: l.id,
        usedBy,
        retired,
        name: short ?? l.oracle.name,
        full: short && short !== l.oracle.name ? l.oracle.name : null,
        kind: l.oracle.label?.kind ? cap(l.oracle.label.kind) : null,
        address: l.oracle.address,
        price,
        gap: now.sameBlock ? gapCell(price, ref) : null,
        markets: l.series.map((s) => ({
          protocol: s.protocol,
          prices: symbols.size > 1 ? s.token.symbol : null,
          via: s.via ? { name: s.via.name, address: s.via.address } : null,
          retired: s.retired === true,
          since: s.firstDay,
        })),
      };
    });
}

/** The line's price against the page line's, in percent. */
function gapCell(price: PriceCell, ref: LinePriceNow | undefined): NonNullable<OracleRow["gap"]> {
  if (price.value == null) return { text: "–", value: null, reason: price.reason };
  if (!ref?.ok || ref.price == null)
    return { text: "–", value: null, reason: ref?.reason ?? "The page's price was not read" };
  const pct = (price.value / ref.price - 1) * 100;
  return { text: fmtGap(pct), value: pct, reason: null };
}

/** A market line in words: "Compound V3 cWETHv3, via a constant 1 ETH feed", ", since 9 Jan 2023" after the address. */
export function marketWords(m: MarketLine): { before: string; after: string } {
  const head = `${m.protocol}${m.prices ? ` prices ${m.prices}` : ""}`;
  const tail = `${m.retired ? ", a market it has retired" : ""}${
    m.since != null ? `, since ${formatDate(new Date(m.since * DAY_MS))}` : ", nothing stored"
  }`;
  return m.via ? { before: `${head}, via ${m.via.name}`, after: tail } : { before: head + tail, after: "" };
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
