// What /api/chain/wallet/<address>/summary answers: the wallet's positions as
// counts and ids, from rails-server's summary rows alone, with no head read
// (rails-ops decisions/0050-one-wallet-across-protocols-and-chains.md point
// 10; decision 0051 step 3). The line under every explorer's wallet row
// (`components/shared/wallet-elsewhere-line.tsx`) reads it. Client-safe: the
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

export const CHAIN_NAMES: Record<WalletCountsChain, string> = {
  ethereum: "Ethereum",
  base: "Base",
  arbitrum: "Arbitrum",
};

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

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** The line's words for `positions`, or null when there is nothing to say.
 *  `others` is true when the page's position was found and left out. */
export function walletLineText(positions: WalletCountsPosition[], others: boolean): string | null {
  const n = positions.length;
  if (n === 0) return null;
  const chains = [...new Set(positions.map((p) => p.chain))];
  const where = chains.length === 1 ? CHAIN_NAMES[chains[0]] : `${chains.length} chains`;
  const open = positions.filter((p) => p.status === "open").length;
  const status =
    open === n ? (n === 1 ? "open" : "all open") : open === 0 ? (n === 1 ? "closed" : "all closed") : `${open} open`;
  const head = others ? `${count(n, "more position")} on ${where}` : `${count(n, "position")} on ${where} across Rails`;
  return `${head} · ${status}`;
}
