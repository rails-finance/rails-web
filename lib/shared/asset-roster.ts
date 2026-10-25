// The asset roster's answer (server GET /api/prices/assets; rails-ops
// reference/asset-key-map.md) and what an asset page draws from it: per chain,
// one line per oracle, each named with the protocols that read it.
//
// A page for a token gathers the token's entries on every chain that lists
// the same address (native ETH's 0xeeee…eeee sentinel, cbBTC's one address on
// Ethereum and Base), and an underlying's page adds its wrapped tokens' lines
// on each chain (ETH draws WETH's readers), so two entries reading one oracle
// stand on one line. A line draws one series, its earliest; the line's other
// series read the same oracle and are listed with it.

import { CHAINS, type ChainId } from "@/lib/shared/chains";

export interface RosterOracle {
  address: string;
  name: string;
  kind: string;
  reads?: string;
}
export interface RosterSeries {
  key: string;
  protocol: string;
  via?: { address: string; name: string };
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
export interface RosterAsset extends RosterAssetRef {
  underlying: RosterAssetRef | null;
  wrapped: RosterAssetRef[];
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
  /** The series the line draws: the earliest stored one. Null where no
   *  series on the line has a stored span. */
  drawn: PageSeries | null;
  series: PageSeries[];
}
export interface PageChain {
  chain: number;
  name: string;
  lines: PageLine[];
  /** The block the oracles were named at (the roster's readAt). */
  readAt: { block: number; date: string } | null;
}
export interface AssetPage {
  symbol: string;
  token: string;
  /** The underlying this token wraps, and the tokens that wrap this one. */
  underlying: RosterAssetRef | null;
  wrapped: RosterAssetRef[];
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
        line = { id, oracle: l.oracle, protocols: [], drawn: null, series: [] };
        lines.push(line);
      }
      for (const s of l.series) line.series.push({ ...s, token: { chain: a.chain, token: a.token, symbol: a.symbol } });
      for (const p of l.protocols) if (!line.protocols.includes(p)) line.protocols.push(p);
    }
  };
  for (const a of own) add(a);
  // An underlying's page carries its wrapped tokens' lines; a wrapper's page
  // carries its own only.
  for (const a of answer.related) if (a.underlying && own.some((o) => o.token === a.underlying!.token)) add(a);
  const chains: PageChain[] = [...byChain]
    .sort(([a], [b]) => (a === first.chain ? -1 : b === first.chain ? 1 : a - b))
    .map(([c, lines]) => {
      for (const l of lines) {
        l.series.sort((x, y) => (x.firstDay ?? Infinity) - (y.firstDay ?? Infinity));
        l.drawn = l.series.find((s) => s.firstDay != null) ?? null;
      }
      lines.sort((x, y) => (x.drawn?.firstDay ?? Infinity) - (y.drawn?.firstDay ?? Infinity));
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
