// The list under a protocol's asset chart (Miles, 24 Nov 2026; ui-jobs 818;
// anatomy A2.2): the other protocols that read the token on the chain, one
// entry per line they read, the page's protocol left out. An entry names the
// protocols (each a link to its page for the token where it has one; by
// market where a protocol reads several lines, "Aave V3 EtherFi") and the
// line, with a line's short address where another line on the chain bears its
// name, an OSM's hour delay and a fixed line's kind where the name does not
// say it, and "the" before a protocol's own oracle ("the Dolomite oracle
// aggregator"). "The same feed as <protocol>" stands only on the line the page's
// protocol reads: the roster merges one oracle address into one line, so that
// is the identity the data holds. Retired markets are not readers. Pure.

import { delayedLine, protocolFamily, shortAddress, type PageChain, type PageLine } from "./asset-roster";
import { seriesExplorer, type ViaView } from "./asset-via";

export interface ReaderProtocol {
  /** As the line lists name it: "Aave V3", "Maker"; with its market where
   *  the protocol reads more than one line ("Aave V3 EtherFi"). */
  name: string;
  /** The explorer whose series it is, null where Rails has none for it. */
  explorer: string | null;
  /** That explorer's page for the token, null where it has none. */
  href: string | null;
}

export interface ReaderEntry {
  /** The line's id (chain and oracle). */
  id: string;
  protocols: ReaderProtocol[];
  /** What they read: "Chainlink ETH / USD 0x5424…215e",
   *  "an hour-delayed price: Maker OSM over the Chronicle ETH/USD median". */
  reads: string;
  /** The page protocol's name where this is its line. */
  sameAs: string | null;
}

/** "A", "A and B", "A, B and C". */
export function andList(names: readonly string[]): string {
  return names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** What a line's readers read, in words. */
function readsWords(line: PageLine, named: ReadonlyMap<string, number>): string {
  const name =
    (named.get(line.oracle.name) ?? 0) > 1
      ? `${line.oracle.name} ${shortAddress(line.oracle.address)}`
      : line.oracle.name;
  if (delayedLine(line)) return `an hour-delayed price: ${name}`;
  if (line.oracle.kind === "fixed" && !/\bfixed\b/i.test(line.oracle.name)) return `a fixed price: ${name}`;
  return line.oracle.kind === "protocol" ? `the ${name}` : name;
}

/** The list for `section` read from `via`'s side. `pageOf` gives an explorer's
 *  page for the token, null where it has none. */
export function readerEntries(
  section: Pick<PageChain, "lines">,
  via: Pick<ViaView, "explorer" | "name" | "lineId"> | null,
  pageOf: (explorer: string) => string | null,
): ReaderEntry[] {
  const own = via?.explorer.id ?? null;
  const named = new Map<string, number>();
  for (const l of section.lines) named.set(l.oracle.name, (named.get(l.oracle.name) ?? 0) + 1);
  // Each line's readers, the page's protocol and retired markets left out.
  const readers = section.lines.map((line) => ({
    line,
    series: line.series.filter((s) => !s.retired && (own == null || seriesExplorer(s.token.chain, s.key) !== own)),
  }));
  // A protocol on more than one of those lines is named by its markets.
  const lines = new Map<string, number>();
  for (const r of readers)
    for (const f of new Set(r.series.map((s) => protocolFamily(s.protocol)))) lines.set(f, (lines.get(f) ?? 0) + 1);
  const out: ReaderEntry[] = [];
  for (const { line, series } of readers) {
    const protocols: ReaderProtocol[] = [];
    for (const s of series) {
      const explorer = seriesExplorer(s.token.chain, s.key);
      const family = protocolFamily(s.protocol);
      const name = (lines.get(family) ?? 0) > 1 ? s.protocol : family;
      if (protocols.some((p) => p.name === name)) continue;
      protocols.push({ name, explorer, href: explorer ? pageOf(explorer) : null });
    }
    if (protocols.length === 0) continue;
    out.push({
      id: line.id,
      protocols,
      reads: readsWords(line, named),
      sameAs: via?.lineId != null && via.lineId === line.id ? via.name : null,
    });
  }
  // The page protocol's line first: its readers read the price the chart draws.
  return out.sort((a, b) => Number(b.sameAs != null) - Number(a.sameAs != null));
}

/** What follows an entry's protocols: "read Chainlink ETH / USD 0x5424…215e",
 *  "reads Chainlink ETH / USD 0x5f4e…8419, the same feed as Liquity V2". */
export function readerTail(e: ReaderEntry): string {
  const verb = e.protocols.length > 1 ? "read" : "reads";
  return `${verb} ${e.reads}${e.sameAs ? `, the same feed as ${e.sameAs}` : ""}`;
}

/** An entry as one sentence: "Aave V3 and Aave V4 read Chainlink ETH / USD 0x5424…215e". */
export function readerText(e: ReaderEntry): string {
  return `${andList(e.protocols.map((p) => p.name))} ${readerTail(e)}`;
}
