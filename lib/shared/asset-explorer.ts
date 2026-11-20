// The asset cards (rails-ops reference/asset-key-map.md, "The asset
// explorer"; since decision 0069 read by each protocol's Assets pages and the
// asset-page resolver): one card per asset, its Prices-list figures, its chains,
// the Rails explorers that list it (lib/api/asset-explorer-chips.ts) and the
// tokens it wraps or is wrapped as.
//
// One card per asset: an asset page (one token address, its chains) is a
// card, and pages of one symbol on different chains share one (USDC on
// Ethereum and on Base), each chain a mark linking its page. A symbol two
// tokens carry on one chain (KNC's two contracts, Maker's UNI-V2 ilks) stays
// two cards, each named with its short address. A token an explorer lists by
// symbol that the roster does not price has a card of chips alone, with the
// line saying why there is no price (Miles, 26 Oct 2026), and where Rails
// reads or stores one, its figure: ZCHF's supply, a Liquity V2-family
// stablecoin's trove debt (lib/api/asset-card-figures.ts). Its symbol and
// chain mark link its page, which carries the same.
//
// Pure: the server builds the cards, the page's client island filters them.

import type { ChipUse } from "@/lib/shared/asset-uses";
import { assetHref, type LinkKind, type RosterLinkRef } from "@/lib/shared/asset-roster";
import type { AssetPriceList, AssetPriceRow, ChainPrice } from "@/lib/shared/asset-prices";
import { assetCategory, type AssetCategory } from "@/lib/shared/asset-categories";

/** A one-for-one wrapper (WETH, WBTC, cbBTC, tBTC, FBTC, BTC.b, USDbC):
 *  "own" gives it a card of its own beside its underlying's, linked both ways;
 *  "merged" puts its chains and chips on the underlying's card. */
export const WRAPPER_CARDS: "own" | "merged" = "own";

/** How a chip links: the listing filtered to the asset, the explorer's asset
 *  or market page, or the explorer. */
export type ChipLink = "filtered" | "page" | "explorer";

export interface AssetChip {
  /** The explorer's id in lib/shared/protocols.ts, or a vault family no
   *  explorer deploys ("sbold", ui-jobs 765). */
  explorer: string;
  /** On a vault no explorer deploys: the token whose icon the chip draws in
   *  place of a protocol mark. */
  token?: { symbol: string; address: string };
  label: string;
  chain: number;
  href: string;
  link: ChipLink;
  /** Where the chip came from: the price roster, the explorer's asset list, or both. */
  from: ("roster" | "catalog")[];
  /** What the token is to the explorer, each with its page: BOLD's "Trove
   *  debt" and "Stability Pools" on Liquity V2, a Pendle market's PT
   *  (lib/shared/asset-uses.ts). */
  uses?: ChipUse[];
  /** On Aave V3 on Ethereum: the markets the token is a reserve of ("core",
   *  "prime", "etherfi"), each a reserve page (ui-jobs 786). */
  markets?: string[];
}

export interface CardChain {
  chain: number;
  token: string;
  /** The asset page: the chart, or for a token without a stored price the
   *  page of its line, figure and chips. */
  href: string | null;
}

/** A token an explorer lists by symbol (lib/api/asset-explorer-chips.ts). */
export interface ListedRef {
  chain: number;
  token: string;
  symbol: string;
}

/** Why a card has no price figures. */
export const PRICELESS_WHY = "No price: no oracle Rails stores prices it.";

/** A card without a price's figure: ZCHF's supply, a Liquity V2-family
 *  stablecoin's trove debt. */
export interface CardFigure {
  label: "Supply" | "Trove debt";
  amount: number;
  /** The token's symbol, the figure's unit. */
  unit: string;
  /** Where the figure is a read at head: its block and time. */
  asOf: { block: number; ts: number } | null;
  /** The figure in a sentence, for its title. */
  title: string;
}

export interface CardLink {
  symbol: string;
  chain: number;
  token: string;
  href: string;
  kind: LinkKind;
}

export interface AssetCard {
  id: string;
  symbol: string;
  /** The short address, where another card carries the same symbol. */
  short: string | null;
  category: AssetCategory;
  /** The Prices-list row of the card's first page; null for a token the
   *  roster does not price. */
  row: AssetPriceRow | null;
  /** On a card without a price, the figure Rails reads or stores for it. */
  figure: CardFigure | null;
  chains: CardChain[];
  chips: AssetChip[];
  /** What it wraps or is priced from, and what wraps it or is priced from it. */
  underlying: CardLink | null;
  wrapped: CardLink[];
  /** With WRAPPER_CARDS "merged": the wrappers whose cards this one took. */
  takes: string[];
  /** The Prices-list rows of the same symbol's pages on other chains, merged
   *  into this card: each chain's line reads its price from them (ui-jobs 781). */
  others?: AssetPriceRow[];
}

/** One chain of a card, as its line on /assets (A5.4; ui-jobs 781): the
 *  asset's page on that chain, its price on that chain where a stored line
 *  prices it, and the explorers that list it there. */
export interface CardLine {
  chain: number;
  token: string;
  href: string | null;
  /** The chain's main line: the page row's own where `main`, else the row's
   *  line on this chain (`elsewhere`). */
  price: ChainPrice | null;
  /** The page row the price comes from (its unit, its flag). */
  row: AssetPriceRow | null;
  /** The line is the row's own chain: its flag shows here. */
  main: boolean;
  chips: AssetChip[];
}

/** A card's lines, one per chain, in `order` (the chains' order). */
export function cardLines(c: AssetCard, order: readonly number[]): CardLine[] {
  const rows = [c.row, ...(c.others ?? [])].filter((r): r is AssetPriceRow => r != null);
  // A row prices its token alone, on its chain or its other chains, so a
  // merged wrapper (USDbC in USDC's card) cannot take USDC's price.
  const at = (chain: number, token: string) => {
    for (const r of rows) {
      if (r.token.toLowerCase() !== token.toLowerCase()) continue;
      if (r.chain === chain) return { price: r as ChainPrice, row: r, main: true };
      const e = r.elsewhere.find((x) => x.chain === chain);
      if (e) return { price: e, row: r, main: false };
    }
    return { price: null, row: null, main: false };
  };
  const rank = (chain: number) => (order.indexOf(chain) < 0 ? order.length : order.indexOf(chain));
  return [...c.chains]
    .sort((a, b) => rank(a.chain) - rank(b.chain))
    .map((x) => ({
      chain: x.chain,
      token: x.token,
      href: x.href,
      ...at(x.chain, x.token),
      chips: c.chips.filter((ch) => ch.chain === x.chain),
    }));
}

const link = (r: RosterLinkRef): CardLink => ({
  symbol: r.symbol,
  chain: r.chain,
  token: r.token,
  href: assetHref(r.chain, r.token),
  kind: r.kind ?? "wraps",
});

/** The cards, from the Prices list, each page's links (by token) and the chips by `chain:token`. */
export function assetCards(
  list: AssetPriceList,
  links: Map<string, { underlying: RosterLinkRef | null; wrapped: RosterLinkRef[] }>,
  chips: Map<string, AssetChip[]>,
  listed: readonly ListedRef[] = [],
  figures: ReadonlyMap<string, CardFigure> = new Map(),
  wrappers: "own" | "merged" = WRAPPER_CARDS,
): AssetCard[] {
  const chipsOf = (chains: CardChain[]) => {
    const seen = new Map<string, AssetChip>();
    for (const c of chains)
      for (const ch of chips.get(`${c.chain}:${c.token}`) ?? []) if (!seen.has(ch.explorer)) seen.set(ch.explorer, ch);
    return [...seen.values()];
  };
  let cards: AssetCard[] = list.rows.map((row) => {
    const chains = row.chains.map((chain) => ({ chain, token: row.token, href: assetHref(chain, row.token) }));
    const l = links.get(row.token);
    return {
      id: `${row.chain}:${row.token}`,
      symbol: row.symbol,
      short: null,
      category: assetCategory(row.symbol),
      row,
      figure: null,
      chains,
      chips: [],
      underlying: l?.underlying ? link(l.underlying) : null,
      wrapped: (l?.wrapped ?? []).map(link),
      takes: [],
    };
  });

  // One symbol on different chains is one card (the rows come most read first).
  const bySymbol = new Map<string, AssetCard[]>();
  const kept: AssetCard[] = [];
  for (const c of cards) {
    const same = bySymbol.get(c.symbol) ?? [];
    const into = same.find((s) => !s.chains.some((x) => c.chains.some((y) => y.chain === x.chain)));
    if (into) {
      into.chains.push(...c.chains);
      into.wrapped.push(...c.wrapped.filter((w) => !into.wrapped.some((x) => x.href === w.href)));
      into.underlying ??= c.underlying;
      // The wrappers the other chain's row names ("also USDbC") join this card's row.
      const more = (c.row?.also ?? []).filter((a) => !into.row?.also?.some((x) => x.symbol === a.symbol));
      if (into.row && more.length) into.row = { ...into.row, also: [...(into.row.also ?? []), ...more] };
      // Its row prices its chains' lines.
      if (c.row) into.others = [...(into.others ?? []), c.row];
      continue;
    }
    bySymbol.set(c.symbol, [...same, c]);
    kept.push(c);
  }
  cards = kept;

  // The tokens the explorers list that no card prices: a card each.
  const priced = new Set(cards.flatMap((c) => c.chains.map((x) => `${x.chain}:${x.token}`)));
  for (const t of listed) {
    if (priced.has(`${t.chain}:${t.token}`) || /^0x0{40}$/.test(t.token)) continue;
    const href = assetHref(t.chain, t.token);
    // A symbol a card carries on another chain is that card's chain.
    const same = cards.find((c) => c.symbol === t.symbol && !c.chains.some((x) => x.chain === t.chain));
    if (same) {
      same.chains.push({ chain: t.chain, token: t.token, href });
      priced.add(`${t.chain}:${t.token}`);
      continue;
    }
    cards.push({
      id: `${t.chain}:${t.token}`,
      symbol: t.symbol,
      short: null,
      category: assetCategory(t.symbol),
      row: null,
      figure: figures.get(`${t.chain}:${t.token}`) ?? null,
      chains: [{ chain: t.chain, token: t.token, href }],
      chips: [],
      underlying: null,
      wrapped: [],
      takes: [],
    });
  }

  if (wrappers === "merged") {
    const at = new Map(cards.flatMap((c) => c.chains.map((x) => [`${x.chain}:${x.token}`, c] as const)));
    cards = cards.filter((c) => {
      const u = c.underlying;
      if (!u || u.kind !== "wraps") return true;
      const target = [...at.values()].find((t) => t.chains.some((x) => x.href === u.href));
      if (!target || target === c) return true;
      target.chains.push(...c.chains.filter((x) => !target.chains.some((y) => y.href === x.href)));
      target.takes.push(c.symbol);
      target.wrapped = target.wrapped.filter((w) => w.symbol !== c.symbol);
      return false;
    });
  }

  for (const c of cards)
    c.chips = chipsOf(c.chains).sort((x, y) => x.chain - y.chain || x.label.localeCompare(y.label));
  const count = new Map<string, number>();
  for (const c of cards) count.set(c.symbol, (count.get(c.symbol) ?? 0) + 1);
  for (const c of cards)
    if ((count.get(c.symbol) ?? 0) > 1) {
      const t = c.chains[0].token;
      c.short = `${t.slice(0, 6)}…${t.slice(-4)}`;
    }
  return cards;
}
