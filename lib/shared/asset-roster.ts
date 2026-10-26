// The asset roster's answer (server GET /api/prices/assets; rails-ops
// reference/asset-key-map.md) and what an asset page draws from it: per chain,
// one line per oracle, each named with the protocols that read it.
//
// A page for a token gathers the token's entries on every chain that lists
// the same address (native ETH's 0xeeee…eeee sentinel, BTC's 0xbbbb…bbbb,
// cbBTC's one address on Ethereum and Base), and an underlying's page adds the
// lines of the tokens that wrap it one for one on each chain (ETH draws
// WETH's readers, BTC draws cbBTC's, WBTC's and tBTC's), so two entries
// reading one oracle stand on one line. A token priced as its underlying
// times a rate (wstETH) is linked and drawn on its page alone. A line is the
// feed underneath, wrappers that only rescale it merged in (the roster's
// `via`); it draws one series, its longest, except that a series through a
// wrapper with a `history` (Compound V2's PriceOracle, whose series carries
// the sources before this feed, USDC held at $1 in March 2023) is drawn only
// where no other series is stored. The line's other series are listed with it. The main line is the one
// the most protocols read (a protocol's markets and ilks counted once), the
// longest series breaking a tie; the others are measured against it.

import { CHAINS, type ChainId } from "@/lib/shared/chains";

/** Native ETH's key on every chain (BTC's is 0xbbbb…bbbb, Chainlink's Denominations address). */
export const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

export interface RosterOracle {
  address: string;
  name: string;
  kind: string;
  reads?: string;
}
export interface RosterSeries {
  key: string;
  protocol: string;
  /** The wrappers the protocol reads the line's feed through: `pass`, each
   *  hands on the feed's answer; `history`, the protocol's wrapper named other
   *  sources before this feed (Compound V2's PriceOracle). */
  via?: { address: string; name: string; kind?: "pass" | "history" };
  /** A market the protocol has dropped (a Maker ilk the IlkRegistry no
   *  longer lists): drawn and listed, not counted among the line's readers. */
  retired?: true;
  firstDay: number | null;
  lastDay: number | null;
}
export interface RosterLine {
  oracle: RosterOracle;
  protocols: string[];
  series: RosterSeries[];
}
export interface RosterAssetRef {
  chain: number;
  token: string;
  symbol: string;
}
/** `wraps`: one for one (WETH, cbBTC, USDbC); `rate`: the underlying times
 *  an exchange rate (wstETH). */
export type LinkKind = "wraps" | "rate";
export interface RosterLinkRef extends RosterAssetRef {
  kind?: LinkKind;
}
export interface RosterAsset extends RosterAssetRef {
  underlying: RosterLinkRef | null;
  wrapped: RosterLinkRef[];
  lines: RosterLine[];
}
export interface AssetRosterAnswer {
  readAt: Record<string, { block: number; date: string }>;
  native: string;
  assets: RosterAsset[];
  related: RosterAsset[];
}

/** A series on a page line, with the token it prices. */
export interface PageSeries extends RosterSeries {
  token: RosterAssetRef;
}
/** One line on a chain's chart. */
export interface PageLine {
  /** The line's id on the chart: its chain and oracle. */
  id: string;
  oracle: RosterOracle;
  protocols: string[];
  /** The protocols on it, a protocol's markets and ilks counted once and a
   *  retired market not at all. */
  readers: number;
  /** The days its longest stored series spans. */
  span: number;
  /** The series the line draws: the longest stored one not read through a
   *  wrapper with a `history`, else the longest. Null where no series on the line has a stored span. */
  drawn: PageSeries | null;
  series: PageSeries[];
}
export interface PageChain {
  chain: number;
  name: string;
  /** Main line first (`mainLine`), then by readers and span. */
  lines: PageLine[];
  /** The block the oracles were named at (the roster's readAt). */
  readAt: { block: number; date: string } | null;
}
export interface AssetPage {
  symbol: string;
  token: string;
  /** The underlying this token wraps, and the tokens that wrap this one. */
  underlying: RosterLinkRef | null;
  wrapped: RosterLinkRef[];
  chains: PageChain[];
}

export function chainName(chain: number): string {
  return CHAINS[chain as ChainId]?.name ?? `Chain ${chain}`;
}
export function chainSlug(chain: number): string | null {
  return CHAINS[chain as ChainId]?.slug ?? null;
}
export function chainOfSlug(slug: string): number | null {
  const hit = Object.values(CHAINS).find((c) => c.slug === slug);
  return hit ? hit.id : null;
}

/** The asset page's path: chain + token address. */
export function assetHref(chain: number, token: string): string {
  return `/assets/${chainSlug(chain) ?? chain}/${token.toLowerCase()}`;
}

/** A protocol's name without its market or ilk: "Maker ETH-A" and "Maker
 *  ETH-B" are one reader, as are a protocol's Comets and Aave V3's markets. */
export function protocolFamily(protocol: string): string {
  return protocol
    .replace(/^(Maker) .+$/, "$1")
    .replace(/^(Compound V3) c\w+v3$/, "$1")
    .replace(/^(Aave V3) (Core|Prime|EtherFi)$/, "$1");
}

/** The line's protocols for a sentence: "Maker", "Aave V3, Aave V4";
 *  "Maker (retired)" where every series on it is a dropped market. */
export function lineReaders(l: PageLine): string {
  const names = [...new Set(l.protocols.map(protocolFamily))].join(", ");
  return l.series.length > 0 && l.series.every((s) => s.retired) ? `${names} (retired)` : names;
}

/** A Maker OSM line (the OSM, or the Lockstake ilk's capped wrapper over one):
 *  its price is the median of an hour before, by design. The spread strip
 *  names that cause on its gap, and its gap flags no Prices list row (Miles,
 *  26 Oct 2026). */
export function delayedLine(l: PageLine): boolean {
  return l.oracle.kind === "osm" || /\bOSM\b/.test(l.oracle.name);
}

const seriesSpan = (s: RosterSeries, today: number) => (s.firstDay == null ? 0 : (s.lastDay ?? today) - s.firstDay + 1);

/** The chart's main line: the first line with a drawn series. */
export function mainLine(c: PageChain): PageLine | null {
  return c.lines.find((l) => l.drawn != null) ?? null;
}

/** The page for `token` as opened on `chain` (that chain's section first). */
export function assetPage(answer: AssetRosterAnswer, chain: number): AssetPage | null {
  const own = answer.assets;
  if (own.length === 0) return null;
  const first = own.find((a) => a.chain === chain) ?? own[0];
  const byChain = new Map<number, PageLine[]>();
  const add = (a: RosterAsset) => {
    const lines = byChain.get(a.chain) ?? [];
    byChain.set(a.chain, lines);
    for (const l of a.lines) {
      const id = `${a.chain}:${l.oracle.address}`;
      let line = lines.find((x) => x.id === id);
      if (!line) {
        line = { id, oracle: l.oracle, protocols: [], readers: 0, span: 0, drawn: null, series: [] };
        lines.push(line);
      }
      for (const s of l.series) line.series.push({ ...s, token: { chain: a.chain, token: a.token, symbol: a.symbol } });
      for (const p of l.protocols) if (!line.protocols.includes(p)) line.protocols.push(p);
    }
  };
  for (const a of own) add(a);
  // An underlying's page carries the lines of the tokens that wrap it one for
  // one; a wrapper's page, and a rate token's, carry their own only.
  for (const a of answer.related)
    if (a.underlying && a.underlying.kind !== "rate" && own.some((o) => o.token === a.underlying!.token)) add(a);
  const chains: PageChain[] = [...byChain]
    .sort(([a], [b]) => (a === first.chain ? -1 : b === first.chain ? 1 : a - b))
    .map(([c, lines]) => {
      const today = Math.floor(Date.now() / 86_400_000);
      for (const l of lines) {
        l.series.sort((x, y) => (x.firstDay ?? Infinity) - (y.firstDay ?? Infinity));
        const stored = l.series.filter((s) => s.firstDay != null);
        const longest = (list: PageSeries[]) =>
          list.reduce<PageSeries | null>(
            (a, b) => (a == null || seriesSpan(b, today) > seriesSpan(a, today) ? b : a),
            null,
          );
        l.drawn = longest(stored.filter((s) => s.via?.kind !== "history")) ?? longest(stored);
        l.readers = new Set(l.series.filter((s) => !s.retired).map((s) => protocolFamily(s.protocol))).size;
        l.span = Math.max(0, ...stored.map((s) => seriesSpan(s, today)));
      }
      // Main line first: the most readers, then the longest series; a line
      // with nothing stored last.
      lines.sort(
        (x, y) => Number(y.drawn != null) - Number(x.drawn != null) || y.readers - x.readers || y.span - x.span,
      );
      return { chain: c, name: chainName(c), lines, readAt: answer.readAt[String(c)] ?? null };
    });
  const wrapped = own.flatMap((a) => a.wrapped);
  return {
    symbol: first.symbol,
    token: first.token,
    underlying: first.underlying,
    wrapped,
    chains,
  };
}

/** "0x5424…215e". */
export function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** A line's name in the chart's list: the oracle and the protocols on it. */
export function lineName(l: PageLine): string {
  return `${l.oracle.name} · ${l.protocols.join(", ")}`;
}

/** The heading's links, one group per relation and chain: "Wraps BTC",
 *  "Wrapped on Ethereum as WBTC, cbBTC, tBTC", "Priced from ETH". */
export interface PageLinkGroup {
  id: string;
  word: string;
  assets: RosterAssetRef[];
}
export function pageLinks(page: AssetPage): PageLinkGroup[] {
  const groups: PageLinkGroup[] = [];
  const u = page.underlying;
  if (u) groups.push({ id: "under", word: u.kind === "rate" ? "Priced from" : "Wraps", assets: [u] });
  for (const w of page.wrapped) {
    const rate = w.kind === "rate";
    const id = `${rate ? "rate" : "wraps"}:${w.chain}`;
    let g = groups.find((x) => x.id === id);
    if (!g) {
      g = {
        id,
        word: rate ? `Priced from it on ${chainName(w.chain)}:` : `Wrapped on ${chainName(w.chain)} as`,
        assets: [],
      };
      groups.push(g);
    }
    if (!g.assets.some((a) => a.chain === w.chain && a.token === w.token)) g.assets.push(w);
  }
  return groups;
}
