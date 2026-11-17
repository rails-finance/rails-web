// What /api/chain/wallet/<address>/summary answers: the wallet's positions as
// counts and ids, from rails-server's summary rows alone, with no head read
// (rails-ops decisions/0050-one-wallet-across-protocols-and-chains.md point
// 10; decision 0051 step 3). The positions menu under every explorer's
// wallet heading (`components/shared/wallet-positions-menu.tsx`) reads it. Client-safe: the
// read is `readWalletCounts` in lib/wallet/read-wallet.ts.

export type WalletCountsChain = "ethereum" | "base" | "arbitrum";

/** One position as the wallet view lists it: its chain, family, id, status and
 *  page. An Arbitrum Compound V3 row is one position per Comet held, as on
 *  the wallet view. */
export interface WalletCountsPosition {
  chain: WalletCountsChain;
  family: string;
  positionId: string;
  /** `moved`: a position the wallet held and passed on (ui-jobs 705). */
  status: "open" | "closed" | "liquidated" | "redeemed" | "moved";
  href: string;
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
export function rowIsPage(href: string, pathname: string, search: string): boolean {
  const [rawPath, rawQuery = ""] = href.split("?");
  const row = pagePath(rawPath);
  const page = pagePath(pathname);
  if (page !== row && !page.startsWith(`${row}/`)) return false;
  const market = new URLSearchParams(rawQuery).get("market");
  if (!market) return true;
  return (new URLSearchParams(search).get("market") ?? "core").toLowerCase() === market.toLowerCase();
}

/** The wallet view's counter's tip (W1): the counts cover the mainnet wallet
 *  families only (`WALLET_FAMILIES`), not Polaris on Sepolia (ui-jobs 691). */
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

export interface WalletProtocolRow<P extends WalletCountsPosition> {
  /** `<chain>:<family>`. */
  key: string;
  name: string;
  /** Any one of its positions, for its chain and family. */
  first: P;
  open: number;
  closed: number;
  /** Passed to another wallet (ui-jobs 705); never open or closed. */
  moved: number;
  /** "1 open", "2 closed", "1 open · 2 closed", "1 open · 1 moved". */
  counts: string;
  /** The one position's page; past one, the listing searched by the wallet,
   *  else the wallet view. */
  href: string;
  /** The page's position is one of the row's. */
  page: boolean;
  /** The row's href is the page: the row is not a link. */
  current: boolean;
}

/** The positions menu under the wallet heading (H13.2; Miles 17 Nov 2026,
 *  ui-jobs 701): one row per protocol and chain the wallet holds positions
 *  in, those with an open position first, each group in roster order; closed
 *  counts closed, liquidated and redeemed, as the counts do, and moved (a
 *  position passed to another wallet, ui-jobs 705) is counted apart. Null when the
 *  wallet holds nothing besides the page's position. */
export function walletProtocolMenu<P extends WalletCountsPosition>(
  positions: P[],
  isPage: (p: P) => boolean,
  protocolOf: (p: P) => MenuProtocol | undefined,
  dashboard: string,
): { trigger: string; rows: WalletProtocolRow<P>[]; pageCounted: boolean } | null {
  const page = positions.filter(isPage);
  if (positions.length === page.length) return null;
  const groups = new Map<string, { protocol: MenuProtocol | undefined; positions: P[] }>();
  for (const p of positions) {
    const key = `${p.chain}:${p.family}`;
    const g = groups.get(key) ?? { protocol: protocolOf(p), positions: [] };
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
    return {
      key,
      name: g.protocol?.name ?? g.positions[0].family,
      first: g.positions[0],
      open,
      closed,
      moved,
      counts: parts.filter(Boolean).join(" · "),
      href: one ? g.positions[0].href : (g.protocol?.listing ?? dashboard),
      page: onPage,
      current: one && onPage,
    };
  });
  rows.sort(
    (a, b) => Number(b.open > 0) - Number(a.open > 0) || order(a.key) - order(b.key) || a.key.localeCompare(b.key),
  );
  return {
    trigger: count(positions.length, "position"),
    rows,
    pageCounted: page.length > 0,
  };
}
