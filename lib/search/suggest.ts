// The search's suggestions (rails-ops ui-jobs 482): the index's shape, served
// by app/api/search/index/route.ts, and the matching the browser runs on it.
// Client-safe and pure: no fetch, no storage.
//
// Order (the charter routes to data and ranks nothing by "best"): an exact
// identifier first, then bookmarks, then how well a name matches (the whole
// name equal, the whole name starting with the query, a word starting with
// it, the query anywhere), with the vault's stored size at its census block
// as the tie-break only. No yield.

/** One explorer: its name, chain and landing page. */
export type SearchExplorer = [name: string, chain: string, href: string];
/** One roster vault. The server sends them in the order of their stored total
 *  assets at the census block, largest first, so a vault's position in the
 *  list is its tie-break and no figure travels. */
export type SearchVault = [
  name: string,
  symbol: string,
  asset: string,
  protocol: string,
  chain: string,
  address: string,
  href: string,
];
/** One token: its symbol and how many index vaults hold it. */
export type SearchToken = [symbol: string, vaults: number];

export interface SearchIndex {
  /** When the index was built, ISO-8601. */
  at: string;
  explorers: SearchExplorer[];
  vaults: SearchVault[];
  /** Vaults from this position on held no shares at the census block; they
   *  follow every funded match, as the vault index's empty group does. */
  emptyFrom: number;
  tokens: SearchToken[];
}

/** One roster on the wire: its protocol, chain, and the vault page's path
 *  before the address (`perVault`), or the one page every vault opens. */
export type WireRoster = [protocol: string, chain: string, href: string, perVault: 0 | 1];
/** One vault on the wire: the symbol is "" where it equals the name. */
export type WireVault = [name: string, symbol: string, asset: string, roster: number, address: string];

/** The index as the route sends it: the vault rows name their roster, so the
 *  repeated protocol, chain and path travel once. */
export interface SearchIndexWire {
  v: 2;
  at: string;
  explorers: SearchExplorer[];
  rosters: WireRoster[];
  vaults: WireVault[];
  emptyFrom: number;
  tokens: SearchToken[];
}

export function expandIndex(w: SearchIndexWire): SearchIndex {
  return {
    at: w.at,
    emptyFrom: w.emptyFrom,
    explorers: w.explorers,
    tokens: w.tokens,
    vaults: w.vaults.map(([name, symbol, asset, r, address]) => {
      const [protocol, chain, href, perVault] = w.rosters[r];
      return [name, symbol || name, asset, protocol, chain, address, perVault ? href + address : href];
    }),
  };
}

export type SuggestionKind = "Wallet" | "Bookmark" | "Explorer" | "Vault" | "Token";

export interface Suggestion {
  /** Stable within one list: the row's DOM id is formed from it. */
  key: string;
  kind: SuggestionKind;
  name: string;
  /** The muted line after the name: a chain, a protocol and chain, an address. */
  detail?: string;
  /** Where the row goes. A wallet row carries `address` (the wallet view) or
   *  `ens` (resolved on the way) instead. */
  href?: string;
  address?: string;
  ens?: string;
  /** A token row's symbol, as the index carries it (the AIM button maps it to
   *  the chooser's tokens, components/shared/aim-search-button.tsx). */
  symbol?: string;
}

/** A bookmark as the matcher needs it. */
export interface SuggestBookmark {
  address: string;
  /** The custom name, else the ENS name, else null. */
  label: string | null;
  /** Every name the bookmark answers to: its custom name and each ENS name. */
  names?: readonly string[];
}

/** What AIM (asset isolation mode, ui-jobs 557) lets through, while it is on:
 *  the rows that name an asset show only where it touches the AIM set.
 *  Wallets and bookmarks are not assets and stay. */
export interface SuggestScope {
  token: (symbol: string) => boolean;
  vault: (v: SearchVault) => boolean;
  explorer: (href: string) => boolean;
}

export const SUGGESTION_LIMIT = 8;
const BOOKMARK_LIMIT = 3;

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
export const ENS_RE = /^[^\s]+\.eth$/i;

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** How well `text` matches `q` (both lowercase): 4 equal, 3 the whole text
 *  starts with it, 2 a word starts with it, 1 anywhere, 0 not at all. */
export function matchTier(text: string, q: string): number {
  if (!text) return 0;
  const t = text.toLowerCase();
  if (t === q) return 4;
  if (t.startsWith(q)) return 3;
  const at = t.indexOf(q);
  if (at < 0) return 0;
  // A word starts after a space, a dash, a dot, a slash or a case change the
  // lowercase copy lost; the plain separators are enough here.
  for (let i = at; i >= 0; i = t.indexOf(q, i + 1)) if (/[\s\-._/()]/.test(t[i - 1] ?? " ")) return 2;
  return 1;
}

const vaultRow = (v: SearchVault): Suggestion => ({
  key: `v:${v[4]}:${v[5]}`,
  kind: "Vault",
  name: v[0] || v[1] || shortAddr(v[5]),
  detail: `${v[3]} · ${v[4]}`,
  href: v[6],
});

const bookmarkRow = (b: SuggestBookmark): Suggestion => ({
  key: `b:${b.address}`,
  kind: "Bookmark",
  name: b.label ?? shortAddr(b.address),
  detail: b.label ? shortAddr(b.address) : undefined,
  address: b.address,
});

/** The rows for an empty, focused field: the bookmarks, newest first. */
export function emptySuggestions(bookmarks: readonly SuggestBookmark[]): Suggestion[] {
  return bookmarks.slice(0, SUGGESTION_LIMIT).map(bookmarkRow);
}

/** The rows for `raw`. `index` is null until it has loaded; `ens` is the
 *  resolver's answer for a complete .eth name (undefined while it is asked,
 *  null when it has no address set, "unreachable" when the lookup did not
 *  answer). */
export function suggest(
  raw: string,
  index: SearchIndex | null,
  bookmarks: readonly SuggestBookmark[],
  ens?: string | null | "unreachable",
  scope?: SuggestScope | null,
): Suggestion[] {
  const typed = raw.trim();
  const q = typed.toLowerCase();
  if (q === "") return emptySuggestions(bookmarks);
  const rows: Suggestion[] = [];

  // 1. The exact identifier: a full address (a vault in the index first), or
  //    a complete ENS name.
  if (ADDRESS_RE.test(typed)) {
    for (const v of index?.vaults ?? []) if (v[5] === q && (!scope || scope.vault(v))) rows.push(vaultRow(v));
    const marked = bookmarks.find((b) => b.address === q);
    rows.push(
      marked
        ? bookmarkRow(marked)
        : { key: `w:${q}`, kind: "Wallet", name: shortAddr(q), detail: "Wallet view", address: q },
    );
    return rows.slice(0, SUGGESTION_LIMIT);
  }
  if (/^0x[0-9a-f]{64}$/.test(q)) return [];
  if (ENS_RE.test(typed) && typed.length >= 7) {
    if (ens === null) rows.push({ key: `e:${q}`, kind: "Wallet", name: q, detail: "has no address set" });
    else if (ens === "unreachable")
      rows.push({ key: `e:${q}`, kind: "Wallet", name: q, detail: "Couldn't reach ENS, try again", ens: q });
    else
      rows.push({
        key: `e:${q}`,
        kind: "Wallet",
        name: q,
        detail: ens ? shortAddr(ens) : "Looking up…",
        ...(ens ? { address: ens } : { ens: q }),
      });
  }

  // 2. Bookmarks: by name, or by address from its first characters.
  const seen = new Set(rows.map((r) => r.address).filter(Boolean));
  const marks = bookmarks
    .map((b) => {
      // The best-matching name; shown beside the label when it is another
      // name (an ENS name under a custom one), so the row says why it matched.
      let tier = q.startsWith("0x") && q.length >= 3 && b.address.startsWith(q) ? 3 : 0;
      let via: string | undefined;
      for (const n of b.names ?? (b.label ? [b.label] : [])) {
        const t = matchTier(n, q);
        if (t > tier || (t === tier && t > 0 && via === undefined && n === b.label)) {
          tier = t;
          via = n;
        }
      }
      return { b, tier, via };
    })
    .filter((m) => m.tier > 0 && !seen.has(m.b.address))
    .sort((a, b) => b.tier - a.tier)
    .slice(0, BOOKMARK_LIMIT);
  for (const m of marks) {
    const row = bookmarkRow(m.b);
    rows.push(m.via && m.via !== m.b.label ? { ...row, detail: m.via } : row);
  }

  // 3. Names: explorers, tokens and vaults by match quality; ties keep the
  //    explorers, then the tokens, then the vaults in their stored size order;
  //    a vault the census shows empty follows every funded match.
  if (index && q.length >= 2) {
    const named: { row: Suggestion; tier: number; kind: number; order: number; empty?: boolean }[] = [];
    index.explorers.forEach(([name, chain, href], i) => {
      const tier = Math.max(matchTier(name, q), matchTier(`${name} ${chain}`, q));
      if (tier > 0 && (!scope || scope.explorer(href)))
        named.push({ row: { key: `x:${href}`, kind: "Explorer", name, detail: chain, href }, tier, kind: 0, order: i });
    });
    index.tokens.forEach(([symbol], i) => {
      const tier = matchTier(symbol, q);
      if (tier >= 3 && (!scope || scope.token(symbol)))
        named.push({
          row: {
            key: `t:${symbol}`,
            kind: "Token",
            name: `${symbol} vaults`,
            symbol,
            href: `/vaults?asset=${encodeURIComponent(symbol)}`,
          },
          tier,
          kind: 1,
          order: i,
        });
    });
    const addressPrefix = q.startsWith("0x") && q.length >= 6;
    index.vaults.forEach((v, i) => {
      // The asset and the protocol place a vault below any name match, so
      // "usdc" lists the token row, then vaults named USDC, then the rest
      // that hold it.
      // A symbol that is the asset's ("USDC") says no more than the asset.
      const symbolIsAsset = v[1].toLowerCase() === v[2].toLowerCase();
      const tier = Math.max(
        matchTier(v[0], q),
        symbolIsAsset ? Math.min(matchTier(v[1], q), 1) : matchTier(v[1], q),
        Math.min(matchTier(v[2], q), 1),
        Math.min(matchTier(v[3], q), 1),
        addressPrefix && v[5].startsWith(q) ? 1 : 0,
      );
      if (tier > 0 && (!scope || scope.vault(v)))
        named.push({ row: vaultRow(v), tier, kind: 2, order: i, empty: i >= index.emptyFrom });
    });
    named.sort(
      (a, b) => Number(!!a.empty) - Number(!!b.empty) || b.tier - a.tier || a.kind - b.kind || a.order - b.order,
    );
    for (const n of named) {
      if (rows.length >= SUGGESTION_LIMIT) break;
      rows.push(n.row);
    }
  }
  return rows.slice(0, SUGGESTION_LIMIT);
}

/** A row Enter or a press can open: every row but the one saying an ENS
 *  name has no address set. An unreachable name's row retries the lookup. */
export const isOpenable = (s: Suggestion) => s.href != null || s.address != null || s.ens != null;
