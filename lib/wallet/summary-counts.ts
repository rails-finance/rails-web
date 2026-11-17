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
  status: "open" | "closed" | "liquidated" | "redeemed";
  href: string;
  /** The row's market or branch as stored ("core", "usdc", a Morpho market
   *  id), or the wallet view's name for it where the family is shaped here
   *  (an Arbitrum Comet's "cUSDCv3"). */
  market?: string;
  /** The collateral's and the debt's symbols, where the row stores them. */
  collateral?: string;
  debt?: string;
}

export interface WalletCountsFamily {
  chain: WalletCountsChain;
  family: string;
  positions: number;
  open: number;
  /** Closed, liquidated or redeemed. */
  closed: number;
}

export interface WalletCounts {
  address: string;
  positions: WalletCountsPosition[];
  families: WalletCountsFamily[];
  total: number;
  open: number;
  closed: number;
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

/** The positions menu's open rows shown before "+N more" (H13.2; ui-jobs 701). */
export const MENU_OPEN_MAX = 6;

/** The menu's footer: the counts are mainnet only. */
export const MENU_TESTNETS = "Testnets not included";

/** The positions menu under the wallet heading (H13.2; Miles 17 Nov 2026,
 *  ui-jobs 701): the trigger's count, the open positions (the page's own
 *  first, so it is always among those shown) up to `MENU_OPEN_MAX`, how many
 *  more are open, and the closed count (closed, liquidated and redeemed, as
 *  the counts treat them). Null when the wallet holds nothing besides the
 *  page's position. */
export function walletPositionsMenu<P extends WalletCountsPosition>(
  positions: P[],
  isPage: (p: P) => boolean,
): {
  trigger: string;
  openHeading: string;
  open: { position: P; page: boolean }[];
  more: string | null;
  closed: string | null;
  /** Whether the page's position is among those counted. */
  pageCounted: boolean;
} | null {
  const page = positions.filter(isPage);
  if (positions.length === page.length) return null;
  const open = positions
    .filter((p) => p.status === "open")
    .map((position) => ({ position, page: isPage(position) }))
    .sort((a, b) => Number(b.page) - Number(a.page));
  const closed = positions.length - open.length;
  const rest = open.length - MENU_OPEN_MAX;
  return {
    trigger: count(positions.length, "position"),
    openHeading: `Open positions (${open.length.toLocaleString("en-US")})`,
    open: open.slice(0, MENU_OPEN_MAX),
    more: rest > 0 ? `+${rest.toLocaleString("en-US")} more on wallet dashboard` : null,
    closed: closed > 0 ? `${count(closed, "closed position")} on wallet dashboard` : null,
    pageCounted: page.length > 0,
  };
}
