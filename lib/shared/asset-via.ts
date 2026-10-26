// An asset page read from a protocol's side (rails-ops reference/asset-key-map.md,
// "Read from a protocol"; Miles, 26 Oct 2026). A link into an asset page from
// a protocol context carries `?via=<explorer id>` (the id in
// lib/shared/protocols.ts, which names the chain as well: `aave-v3`,
// `aave-v3-base`, `compound-base`), optionally narrowed to one market by the
// series key's second part (`aave-v3:core`, `aave-v3:prime`, `makerdao:ETH-A`;
// ignored where no series on the page matches it), and `&from=<the path it
// was opened from>`.
// With `via`, the page puts that explorer's chain first and, on it, the line
// the protocol reads as the main line: the other lines thin under it, the
// spread strip against it, the oracle list led by it. A protocol that reads
// the asset through a composed or capped adapter reads that adapter's line
// (a line is the feed underneath, and an adapter that changes the number is
// a line apart). Where the protocol has no stored line for the asset the
// page says so and keeps its usual main line. Without `via` nothing changes.
//
// Pure, and imports types only, so scripts/test can load it.

import type { AssetPage, PageChain, PageLine } from "@/lib/shared/asset-roster";

export const VIA_PARAM = "via";
export const FROM_PARAM = "from";

/** The explorer a roster series key belongs to, per chain: the key's family
 *  (`aave-v3:core:0x…` is `aave-v3`) to the explorer id. */
const FAMILY_EXPLORER: Record<number, Record<string, string>> = {
  1: {
    "aave-v3": "aave-v3",
    spark: "spark",
    "aave-v4": "aave-v4",
    "liquity-v2": "liquity",
    cv3: "compound",
    cv2: "compound-v2",
    moonwell: "moonwell",
    maker: "makerdao",
    dolomite: "dolomite",
  },
  8453: {
    "aave-v3-base": "aave-v3-base",
    seamless: "seamless",
    cv3: "compound-base",
    moonwell: "moonwell-base",
  },
};

/** The explorer whose protocol reads a series, or null where Rails has none for it. */
export function seriesExplorer(chain: number, key: string): string | null {
  return FAMILY_EXPLORER[chain]?.[key.split(":")[0]] ?? null;
}

/** A series' market: its key's second part (`core` in `aave-v3:core:0x…`). */
const marketOf = (key: string) => key.split(":")[1]?.toLowerCase() ?? "";

/** The explorers that read a line, each with the protocols (markets, ilks)
 *  its series name, a retired market left out: `{ "aave-v3": ["Aave V3 Core", "Aave V3 Prime"] }`; with
 *  `market`, that market's alone where the line carries it. */
export function lineExplorers(line: Pick<PageLine, "series">, market?: string | null): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const m = market?.toLowerCase();
  const narrowed = m != null && line.series.some((s) => marketOf(s.key) === m);
  for (const s of line.series) {
    const e = s.retired ? null : seriesExplorer(s.token.chain, s.key);
    if (!e || (narrowed && marketOf(s.key) !== m)) continue;
    const list = (out[e] ??= []);
    if (!list.includes(s.protocol)) list.push(s.protocol);
  }
  return out;
}

/** The line an explorer reads on one chain: of the lines with a stored
 *  series, the one carrying most of its series (a retired market not
 *  counted; with `market`, that market's where any line carries it), the
 *  chart's order breaking a tie. Null where it reads none. */
export function viaLineOf(lines: readonly PageLine[], explorer: string, market?: string | null): PageLine | null {
  const m = market?.toLowerCase();
  const count = (l: PageLine, narrow: boolean) =>
    l.series.filter(
      (s) => !s.retired && seriesExplorer(s.token.chain, s.key) === explorer && (!narrow || marketOf(s.key) === m),
    ).length;
  const pick = (narrow: boolean) => {
    let best: PageLine | null = null;
    let most = 0;
    for (const l of lines) {
      if (!l.drawn) continue;
      const n = count(l, narrow);
      if (n > most) {
        best = l;
        most = n;
      }
    }
    return best;
  };
  return (m ? pick(true) : null) ?? pick(false);
}

/** A line's readers keyed both ways a `via` can name them: by explorer
 *  (`aave-v3`) and by explorer and market (`aave-v3:core`). */
export function lineReaderKeys(line: Pick<PageLine, "series">): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const s of line.series) {
    const e = s.retired ? null : seriesExplorer(s.token.chain, s.key);
    if (!e) continue;
    for (const k of [e, `${e}:${marketOf(s.key)}`]) {
      const list = (out[k] ??= []);
      if (!list.includes(s.protocol)) list.push(s.protocol);
    }
  }
  return out;
}

/** A `via` value: the explorer id and the market it may name. */
export function parseVia(v: string | null | undefined): { id: string; market: string | null } | null {
  if (!v) return null;
  const [id, market] = v.split(":");
  return id ? { id, market: market || null } : null;
}

/** How the page names the protocol: its one market or ilk where the line
 *  carries one ("Aave V3 Core", "Maker ETH-A"), else the explorer's label. */
export function viaName(protocols: readonly string[] | undefined, label: string): string {
  const one = [...new Set(protocols ?? [])];
  return one.length === 1 ? one[0] : label;
}

/** "the price Aave V3 Core uses". */
export const usesWords = (name: string) => `the price ${name} uses`;

export interface ViaExplorer {
  id: string;
  label: string;
  chain: number;
  /** The market the link names (`core`), where it names one. */
  market?: string | null;
}

/** What the page shows for `via` on the explorer's chain. */
export interface ViaView {
  explorer: ViaExplorer;
  /** The protocol as the page names it. */
  name: string;
  /** The line it reads, now the chart's main line; null where none is stored. */
  lineId: string | null;
  /** The page's usual main line on that chain, where it is another. */
  usualId: string | null;
}

const firstDrawn = (c: PageChain) => c.lines.find((l) => l.drawn != null) ?? null;

/** The page read from `explorer`'s side: its chain first, its line first on
 *  that chain. The view is null where the page has no chart on its chain. */
export function viaPage(page: AssetPage, explorer: ViaExplorer): { page: AssetPage; view: ViaView | null } {
  const at = page.chains.findIndex((c) => c.chain === explorer.chain);
  if (at < 0) return { page, view: null };
  const c = page.chains[at];
  const usual = firstDrawn(c);
  const line = viaLineOf(c.lines, explorer.id, explorer.market);
  const name = viaName(line ? lineExplorers(line, explorer.market)[explorer.id] : undefined, explorer.label);
  const lines = line ? [line, ...c.lines.filter((l) => l !== line)] : c.lines;
  const chains = [{ ...c, lines }, ...page.chains.filter((_, i) => i !== at)];
  return {
    page: { ...page, chains },
    view: {
      explorer,
      name,
      lineId: line?.id ?? null,
      usualId: line && usual && usual.id !== line.id ? usual.id : null,
    },
  };
}

/** A `from` the page may link back to: a path on this site, nothing else. */
export function safeFrom(from: string | null | undefined): string | null {
  if (!from || from.length > 600) return null;
  if (!from.startsWith("/") || from.startsWith("//") || from.includes("\\")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(from)) return null;
  return from;
}

/** An asset page's link, with the protocol context where there is one. */
export function withVia(href: string, via: string | null | undefined, from?: string | null): string {
  if (!via) return href;
  const sp = new URLSearchParams({ [VIA_PARAM]: via });
  const back = safeFrom(from);
  if (back) sp.set(FROM_PARAM, back);
  return `${href}?${sp.toString()}`;
}
