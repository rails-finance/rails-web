// The asset explorer at /assets (rails-ops reference/asset-key-map.md, "The
// asset explorer"): one card per asset, its Prices-list figures, its chains,
// the Rails explorers that list it (lib/api/asset-explorer-chips.ts) and the
// tokens it wraps or is wrapped as.
//
// One card per asset: an asset page (one token address, its chains) is a
// card, and pages of one symbol on different chains share one (USDC on
// Ethereum and on Base), each chain a mark linking its page. A symbol two
// tokens carry on one chain (KNC's two contracts, Maker's UNI-V2 ilks) stays
// two cards, each named with its short address. A token an explorer lists by
// symbol that the roster does not price has a card of chips alone, with the
// line saying why there is no price (Miles, 26 Oct 2026).
//
// Pure: the server builds the cards, the page's client island filters them.

import { assetHref, type LinkKind, type RosterLinkRef } from "@/lib/shared/asset-roster";
import type { AssetPriceList, AssetPriceRow } from "@/lib/shared/asset-prices";
import { ASSET_CATEGORY_ORDER, assetCategory, type AssetCategory } from "@/lib/shared/asset-categories";

/** A one-for-one wrapper (WETH, WBTC, cbBTC, tBTC, FBTC, BTC.b, USDbC):
 *  "own" gives it a card of its own beside its underlying's, linked both ways;
 *  "merged" puts its chains and chips on the underlying's card. */
export const WRAPPER_CARDS: "own" | "merged" = "own";

/** How a chip links: the listing filtered to the asset, the explorer's asset
 *  or market page, or the explorer. */
export type ChipLink = "filtered" | "page" | "explorer";

export interface AssetChip {
  /** The explorer's id in lib/shared/protocols.ts. */
  explorer: string;
  label: string;
  chain: number;
  href: string;
  link: ChipLink;
  /** Where the chip came from: the price roster, the explorer's asset list, or both. */
  from: ("roster" | "catalog")[];
}

export interface CardChain {
  chain: number;
  token: string;
  /** The asset page; null for a token with no stored price. */
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

export interface CardLink {
  symbol: string;
  chain: number;
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
  chains: CardChain[];
  chips: AssetChip[];
  /** What it wraps or is priced from, and what wraps it or is priced from it. */
  underlying: CardLink | null;
  wrapped: CardLink[];
  /** With WRAPPER_CARDS "merged": the wrappers whose cards this one took. */
  takes: string[];
}

const link = (r: RosterLinkRef): CardLink => ({
  symbol: r.symbol,
  chain: r.chain,
  href: assetHref(r.chain, r.token),
  kind: r.kind ?? "wraps",
});

/** The cards, from the Prices list, each page's links (by token) and the chips by `chain:token`. */
export function assetCards(
  list: AssetPriceList,
  links: Map<string, { underlying: RosterLinkRef | null; wrapped: RosterLinkRef[] }>,
  chips: Map<string, AssetChip[]>,
  listed: readonly ListedRef[] = [],
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
    // A symbol a card carries on another chain is that card's chain with no page.
    const same = cards.find((c) => c.symbol === t.symbol && !c.chains.some((x) => x.chain === t.chain));
    if (same) {
      same.chains.push({ chain: t.chain, token: t.token, href: null });
      priced.add(`${t.chain}:${t.token}`);
      continue;
    }
    cards.push({
      id: `${t.chain}:${t.token}`,
      symbol: t.symbol,
      short: null,
      category: assetCategory(t.symbol),
      row: null,
      chains: [{ chain: t.chain, token: t.token, href: null }],
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

export type CardSort = "read" | "flagged" | "symbol";

export const CARD_SORTS: readonly { value: CardSort; label: string }[] = [
  { value: "read", label: "Most read" },
  { value: "flagged", label: "Flagged first" },
  { value: "symbol", label: "Symbol" },
];

/** The cards in a sort: the most read (protocol series on the page; a card
 *  with no price after, by its explorers), flagged ones first (the Prices
 *  list's order), or by symbol. */
export function sortCards(cards: readonly AssetCard[], sort: CardSort): AssetCard[] {
  const read = (a: AssetCard, b: AssetCard) =>
    Number(b.row != null) - Number(a.row != null) ||
    (b.row?.readers ?? 0) - (a.row?.readers ?? 0) ||
    b.chips.length - a.chips.length ||
    a.symbol.localeCompare(b.symbol);
  const out = [...cards];
  if (sort === "symbol") out.sort((a, b) => a.symbol.localeCompare(b.symbol, "en-US", { sensitivity: "base" }));
  else if (sort === "flagged")
    out.sort((a, b) => Number(b.row?.flag != null) - Number(a.row?.flag != null) || read(a, b));
  else out.sort(read);
  return out;
}

export type ExplorerView = "grid" | "list";

export interface ExplorerState {
  cat: AssetCategory | "all";
  view: ExplorerView;
  sort: CardSort;
}

/** The state a URL's params name; unknown values fall back to the defaults. */
export function explorerState(sp: Record<string, string | string[] | undefined>): ExplorerState {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;
  const cat = one("cat");
  const sort = one("sort");
  return {
    cat: ASSET_CATEGORY_ORDER.includes(cat as AssetCategory) ? (cat as AssetCategory) : "all",
    view: one("view") === "list" ? "list" : "grid",
    sort: CARD_SORTS.some((s) => s.value === sort) ? (sort as CardSort) : "read",
  };
}
