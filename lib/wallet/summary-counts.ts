// What /api/chain/wallet/<address>/summary answers: the wallet's positions as
// counts and ids, from rails-server's summary rows alone, with no head read
// (rails-ops decisions/0050-one-wallet-across-protocols-and-chains.md point
// 10; decision 0051 step 3). The positions menu under every explorer's
// wallet heading (`components/shared/wallet-positions-menu.tsx`) reads it. Client-safe: the
// read is `readWalletCounts` in lib/wallet/read-wallet.ts.

export type WalletCountsChain = "ethereum" | "base" | "arbitrum" | "arc" | "sepolia";

/** One position as the wallet view lists it: its chain, family, id, status and
 *  page. An Arbitrum Compound V3 row is one position per Comet held, as on
 *  the wallet view. */
export interface WalletCountsPosition {
  chain: WalletCountsChain;
  family: string;
  positionId: string;
  /** `moved`: a position the wallet held and passed on (ui-jobs 705). */
  status: "open" | "closed" | "liquidated" | "redeemed" | "moved";
  /** Null on a position with no page. */
  href: string | null;
}

export interface WalletCountsFamily {
  chain: WalletCountsChain;
  family: string;
  positions: number;
  open: number;
  /** Closed, liquidated or redeemed. */
  closed: number;
  /** Held and passed to another wallet (ui-jobs 705). */
  moved: number;
}

export interface WalletCounts {
  address: string;
  positions: WalletCountsPosition[];
  families: WalletCountsFamily[];
  total: number;
  open: number;
  closed: number;
  /** Held and passed to another wallet (ui-jobs 705). */
  moved: number;
  /** The chains the positions are on. */
  chains: WalletCountsChain[];
  readAt: number;
  ms: number;
  error?: string;
  /** The listing reads that did not answer, by what they read: the counts
   *  are part of the wallet and are not kept. */
  partial?: string[];
}

/** A page path for comparison: decoded, lowercase, no trailing slash, and an
 *  event page reduced to its position's page. */
function pagePath(path: string): string {
  let p = path;
  try {
    p = decodeURIComponent(path);
  } catch {
    // keep the raw path
  }
  p = p
    .toLowerCase()
    .replace(/\/event\/[^/]+$/, "")
    .replace(/\/+$/, "");
  return p;
}

/** Whether the page at `pathname` + `search` is this position's page. The
 *  row's href is its page (the wallet view links it), so the row's chain,
 *  family and id are its path. A `market` on the href (Aave V3 Ethereum)
 *  must match the page's, which defaults to `core` as the page does; a page
 *  under the href (Morpho Blue Arbitrum's per-market page under the
 *  wallet's one row) is that position's. */
export function rowIsPage(href: string | null, pathname: string, search: string): boolean {
  if (!href) return false;
  const [rawPath, rawQuery = ""] = href.split("?");
  const row = pagePath(rawPath);
  const page = pagePath(pathname);
  if (page !== row && !page.startsWith(`${row}/`)) return false;
  const market = new URLSearchParams(rawQuery).get("market");
  if (!market) return true;
  return (new URLSearchParams(search).get("market") ?? "core").toLowerCase() === market.toLowerCase();
}

/** The wallet view's counter's tip (W1): the counts cover the mainnet rows
 *  only (`countedRow`); Polaris on Sepolia is drawn and not counted (ui-jobs
 *  691). */
export const WALLET_COUNTS_SCOPE = "Counts mainnet positions; the Sepolia testnet is not counted.";

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** The menu's footer: the counts are mainnet only. */
export const MENU_TESTNETS = "Testnets not included";

/** A position's protocol on its chain, as the roster names it: its name, its
 *  place in the roster, and its listing searched by the wallet (null where
 *  the listing takes no wallet). */
export interface MenuProtocol {
  name: string;
  order: number;
  listing: string | null;
}

/** The summary rows' family for vault shares (rails-server mig 531): one
 *  family over MetaMorpho, Yearn V3 and Aave's vaults on Ethereum and Base. */
export const VAULT_SHARES_FAMILY = "vaults";

/** The vault protocols a vault-share row can belong to, by the root of its
 *  holder page (`/<chain>/<root>/vaults/<vault>/<holder>`, lib/vaults/routes.ts). */
const VAULT_ROOTS: Record<string, string> = { morpho: "MetaMorpho vaults", aave: "Aave vaults", yearn: "Yearn V3" };

/** A vault-share row's protocol root from its href (morpho, aave, yearn);
 *  undefined for a path outside the vault routes. */
export function vaultRoot(href: string | null): string | undefined {
  const m = href ? /^\/[^/]+\/([^/]+)\/vaults\//.exec(href.split("?")[0].toLowerCase()) : null;
  return m && m[1] in VAULT_ROOTS ? m[1] : undefined;
}

/** The menu's name for a vault-share row's protocol ("MetaMorpho vaults"), or
 *  undefined where its href names none (or it has no page). */
export const vaultProtocolOfHref = (href: string | null): string | undefined => {
  const root = vaultRoot(href);
  return root ? VAULT_ROOTS[root] : undefined;
};

/** A position's row in the menu: its chain and family, a vault-share row's
 *  split by its vault protocol, so MetaMorpho vaults, Aave vaults and Yearn V3
 *  each take a row. */
export const menuKey = (p: Pick<WalletCountsPosition, "chain" | "family" | "href">): string =>
  p.family === VAULT_SHARES_FAMILY
    ? `${p.chain}:${p.family}:${vaultRoot(p.href) ?? "other"}`
    : `${p.chain}:${p.family}`;

export interface WalletProtocolRow<P extends WalletCountsPosition> {
  /** `<chain>:<family>`, and `:<root>` on a vault-share row (`menuKey`). */
  key: string;
  name: string;
  /** Any one of its positions, for its chain and family. */
  first: P;
  positions: P[];
  open: number;
  closed: number;
  /** Passed to another wallet (ui-jobs 705); never open or closed. */
  moved: number;
  /** "1 open", "2 closed", "1 open · 2 closed", "1 open · 1 moved". */
  counts: string;
  /** The one position's page; past one, `listing`. */
  href: string;
  /** The protocol's listing searched by the wallet, else the wallet view. */
  listing: string;
  /** `listing` is the protocol's, not the wallet view. */
  listed: boolean;
  /** The page's position is one of the row's. */
  page: boolean;
  /** The row's href is the page: the row is not a link. */
  current: boolean;
}

/** One row per protocol and chain the wallet holds positions in (each vault
 *  protocol its own, `menuKey`), those with an open position first, each
 *  group in roster order; closed counts closed, liquidated and redeemed, as
 *  the counts do, and moved (a position passed to another wallet, ui-jobs
 *  705) is counted apart. The positions menu (H13.2) and the trail's
 *  protocol crumb (H13.4) read them. */
export function walletProtocolRows<P extends WalletCountsPosition>(
  positions: P[],
  isPage: (p: P) => boolean,
  protocolOf: (p: P) => MenuProtocol | undefined,
  dashboard: string,
): WalletProtocolRow<P>[] {
  const groups = new Map<string, { protocol: MenuProtocol | undefined; positions: P[] }>();
  for (const p of positions) {
    const key = menuKey(p);
    const g = groups.get(key) ?? { protocol: undefined, positions: [] };
    // The group takes its name from any row that resolves.
    g.protocol ??= protocolOf(p);
    g.positions.push(p);
    groups.set(key, g);
  }
  const order = (key: string) => groups.get(key)?.protocol?.order ?? Number.MAX_SAFE_INTEGER;
  const rows = [...groups.entries()].map(([key, g]): WalletProtocolRow<P> => {
    const open = g.positions.filter((p) => p.status === "open").length;
    const moved = g.positions.filter((p) => p.status === "moved").length;
    const closed = g.positions.length - open - moved;
    const one = g.positions.length === 1;
    const onPage = g.positions.some(isPage);
    const parts = [
      open > 0 && `${open.toLocaleString("en-US")} open`,
      closed > 0 && `${closed.toLocaleString("en-US")} closed`,
      moved > 0 && `${moved.toLocaleString("en-US")} moved`,
    ];
    const listing = g.protocol?.listing ?? dashboard;
    return {
      key,
      name: g.protocol?.name ?? g.positions[0].family,
      first: g.positions[0],
      positions: g.positions,
      open,
      closed,
      moved,
      counts: parts.filter(Boolean).join(" · "),
      href: (one ? g.positions[0].href : null) ?? listing,
      listing,
      listed: g.protocol?.listing != null,
      page: onPage,
      current: one && onPage,
    };
  });
  rows.sort(
    (a, b) => Number(b.open > 0) - Number(a.open > 0) || order(a.key) - order(b.key) || a.key.localeCompare(b.key),
  );
  return rows;
}

/** The positions menu under the wallet heading (H13.2; Miles 17 Nov 2026,
 *  ui-jobs 701): the trigger and `walletProtocolRows`. Null when the wallet
 *  holds nothing besides the page's position. */
export function walletProtocolMenu<P extends WalletCountsPosition>(
  positions: P[],
  isPage: (p: P) => boolean,
  protocolOf: (p: P) => MenuProtocol | undefined,
  dashboard: string,
): { trigger: string; rows: WalletProtocolRow<P>[]; pageCounted: boolean } | null {
  const page = positions.filter(isPage);
  if (positions.length === page.length) return null;
  return {
    trigger: count(positions.length, "position"),
    rows: walletProtocolRows(positions, isPage, protocolOf, dashboard),
    pageCounted: page.length > 0,
  };
}

/** What the page under the wallet heading is: a position, an event of one,
 *  or a page listing the wallet's positions in one protocol. */
export type TrailPage = "position" | "event" | "wallet";

/** Whether `href` is the page at `pathname` + `search`: the same path, and
 *  each query parameter the href states the same on the page. */
export function hrefIsPage(href: string, pathname: string, search: string): boolean {
  const [rawPath, rawQuery = ""] = href.split("?");
  if (pagePath(rawPath) !== pagePath(pathname)) return false;
  const page = new URLSearchParams(search);
  for (const [k, v] of new URLSearchParams(rawQuery))
    if ((page.get(k) ?? "").toLowerCase() !== v.toLowerCase()) return false;
  return true;
}

/** The trail's protocol crumb (H13.4): the row of the page's protocol, where
 *  it links, and whether it is the page. On a position or an event page it
 *  links where the menu's row does: the protocol's listing searched by the
 *  wallet, or, where the row's one position is a page above this one (Morpho
 *  Blue Arbitrum's wallet page over its per-market page), that page. On a
 *  wallet page it is the page. Null where no row is the page's. */
export function walletTrailCrumb<P extends WalletCountsPosition>(
  rows: WalletProtocolRow<P>[],
  pathname: string,
  search: string,
  page: TrailPage,
): { row: WalletProtocolRow<P>; href: string; current: boolean; keys: string[] } | null {
  const here = pagePath(pathname);
  const under = (href: string | null) => href != null && pagePath(href.split("?")[0]).startsWith(`${here}/`);
  const row =
    rows.find((r) => r.page) ??
    rows.find((r) => r.listed && hrefIsPage(r.listing, pathname, search)) ??
    (page === "wallet" ? rows.find((r) => r.positions.some((p) => under(p.href))) : undefined);
  if (!row) return null;
  // On a wallet page, the rows the page lists: each chain's row of a
  // protocol the wallet view narrows to.
  if (page === "wallet") {
    const keys = rows.filter((r) => r.listed && hrefIsPage(r.listing, pathname, search)).map((r) => r.key);
    return { row, href: row.listing, current: true, keys: keys.length ? keys : [row.key] };
  }
  const above = (href: string | null) => href != null && here.startsWith(`${pagePath(href.split("?")[0])}/`);
  const href = row.positions.length === 1 && above(row.first.href) ? row.first.href! : row.listing;
  return { row, href, current: hrefIsPage(href, pathname, search), keys: [] };
}
