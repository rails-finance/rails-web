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

/** At most this many protocols are named; past it the line counts them. */
const NAMED_MAX = 3;

const listed = (names: string[]) =>
  names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** The line's words for the wallet's positions, in the wallet view's words
 *  (W1: "2 positions · 1 open · 1 closed"; Miles, 6 Nov 2026), the chains
 *  named only when there are more than one, after the scope: "On Rails:" when
 *  the page's position is among those counted, "Also on Rails:" when it is
 *  not (a Read on visit page; Miles 12 Nov 2026, ui-jobs 613). The protocols
 *  counted are named, most positions first, so a reader on a page whose
 *  family is not counted does not take the count for it (Miles 13 Nov 2026,
 *  ui-jobs 639): "Also on Rails: 1 Aave V3 position · closed", "3 positions
 *  in Aave V3 and Liquity V2 · 1 open · 2 closed", past three "in 4
 *  protocols". `nameOf` gives a position's protocol name; where it has none
 *  for some position the line names none. Null when there is nothing. */
export function walletLineText(
  positions: WalletCountsPosition[],
  pageCounted: boolean,
  nameOf: (p: WalletCountsPosition) => string | undefined = () => undefined,
): string | null {
  const n = positions.length;
  if (n === 0) return null;
  const chains = new Set(positions.map((p) => p.chain)).size;
  const open = positions.filter((p) => p.status === "open").length;
  const where = chains > 1 ? ` on ${chains} chains` : "";
  const scope = pageCounted ? "On Rails" : "Also on Rails";
  const tally = new Map<string, number>();
  for (const p of positions) {
    const name = nameOf(p);
    if (!name) {
      tally.clear();
      break;
    }
    tally.set(name, (tally.get(name) ?? 0) + 1);
  }
  const names = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
  const states = ` · ${open.toLocaleString("en-US")} open · ${(n - open).toLocaleString("en-US")} closed`;
  if (names.length === 1) {
    if (n === 1) return `${scope}: 1 ${names[0]} position · ${open === 1 ? "open" : "closed"}`;
    return `${scope}: ${count(n, `${names[0]} position`)}${where}${states}`;
  }
  const within =
    names.length === 0 ? "" : names.length <= NAMED_MAX ? ` in ${listed(names)}` : ` in ${names.length} protocols`;
  return `${scope}: ${count(n, "position")}${within}${where}${states}`;
}
