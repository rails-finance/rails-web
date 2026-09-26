/** Shared formatting helpers for protocol event cards */

import type { GasCost } from "@/lib/shared/types/activity";
import type { AssetFlow } from "@/lib/shared/types/event-shape";
import { formatDayMonth } from "@/lib/date";

/** The contract address for `symbol` among an event's own flows — but only
 *  when EXACTLY ONE flow carries that symbol.
 *
 *  The icon chip needs an address: with a symbol alone it consults the
 *  hand-kept table in lib/shared/token-addresses.ts, which cannot name the
 *  assets of a permissionless market, and an unnamed symbol draws as its
 *  initial letter. A flow does carry the address the transfer actually
 *  touched, so the event knows what the roster does not.
 *
 *  The single-match rule is the point, not caution for its own sake. This
 *  whole problem exists BECAUSE a symbol is not an identifier — resolving one
 *  by picking the first of several flows that share it would reintroduce the
 *  same mistake one layer down, and a plausible-but-wrong brand mark is worse
 *  than an honest letter. Two flows claiming one symbol therefore resolve to
 *  nothing, which is exactly what renders today. */
export function soleFlowAddress(flows: AssetFlow[] | undefined, symbol: string | null | undefined): string | undefined {
  if (!flows || !symbol) return undefined;
  const want = symbol.toLowerCase();
  const hits = flows.filter((f) => f.tokenSymbol?.toLowerCase() === want);
  if (hits.length !== 1) return undefined;
  // Not every builder has an address to put here. The MakerDAO and Fluid
  // timelines record their flows with an empty `token`, because their rows
  // identify a collateral by ilk / vault rather than by contract. An empty
  // string is not an address, and it is worse than none: the chip treats any
  // non-nullish `address` as the answer, so it would stop consulting the house
  // table AND stop building the CDN URLs, turning assets that resolve today
  // into letters. Only a 20-byte hex address is an address.
  const token = hits[0].token;
  return /^0x[0-9a-fA-F]{40}$/.test(token) ? token : undefined;
}

/** Format a transaction's gas cost as "0.0276 ETH ($57.68)" — the ($usd) tail
 *  is dropped below a cent. Used as the trailing bullet in each event's
 *  plain-language explainer (gas is per-transaction, not a position total). */
export function formatGasCost(gas: GasCost): string {
  const eth = gas.gasCostEth < 0.001 ? gas.gasCostEth.toFixed(6) : gas.gasCostEth.toFixed(4);
  const usd = gas.gasCostUsd > 0.01 ? ` ($${gas.gasCostUsd.toFixed(2)})` : "";
  return `${eth} ETH${usd}`;
}

/** Format a unix timestamp as "14:30" (24-hour), UTC.
 *
 *  UTC rather than the reader's zone, and not a stylistic choice: a block
 *  timestamp IS a UTC instant, every explorer states it in UTC, and two people
 *  reading the same event have to be told the same time. It is also what lets
 *  the page render on the server — `getHours()` reads whatever zone the runtime
 *  sits in, so a server in London and a browser in Berlin write 19:19 and 20:19
 *  into the same span, and React repaints the subtree (#418). */
export function formatTimestamp(unix: number): string {
  const d = new Date(unix * 1000);
  const hh = d.getUTCHours().toString().padStart(2, "0");
  const mm = d.getUTCMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Stable per-day key for grouping ("2026-04-14") — UTC, so a day's events
 *  group the same way for every reader and on the server. `toDateString()`
 *  grouped by the runtime's local day, which put an event at 23:40 UTC in a
 *  different bucket depending on who was looking. */
export function dayKey(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

/** Compact day-month label, e.g. "14 Apr" — UTC, en-GB.
 *
 *  en-GB because that is the house date form: lib/date.ts writes "7 Feb 2026"
 *  and every prose date around these chips reads the same way. This call site
 *  wrote "Feb 7" for as long as it existed, which put two orders of the same
 *  three fields on one page. */
export function shortDate(unix: number): string {
  return formatDayMonth(unix);
}

/** Two-digit-year suffix, e.g. "'26" — pair with shortDate for full prefix. */
export function shortDateYear(unix: number): string {
  return "'" + String(new Date(unix * 1000).getUTCFullYear()).slice(-2);
}

/** Format a number with locale grouping. Default 2 decimal places. */
export function formatNum(v: string | number, decimals = 2): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

/** Format a USD value: "< $0.01", "$0.50", "$1,234" */
export function formatUsd(value: number | undefined | null): string {
  if (value == null || isNaN(value) || value < 0.01) return "< $0.01";
  if (value < 1) return `$${value.toFixed(2)}`;
  return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Shorten an address: "0x1234…abcd" */
export function shortAddr(a: string): string {
  return `${a.slice(0, 6)}\u2026${a.slice(-4)}`;
}

/**
 * Format a headline value with compact notation for 4+ digit numbers.
 * Returns `{ display, title }` — wire `title` to the wrapping element so
 * hovering reveals the full-precision number.
 *
 * - n >= 1000:   "60K", "1.2M", "3.4B"   (title: "60,000.00")
 * - 100 <= n:    "1,234.56"                (title same)
 * - 1 <= n:      "12.4500"                (title same)
 * - n < 1:       "0.004567"               (title same)
 */
export function formatCompact(n: number, opts?: { decimals?: number }): { display: string; title: string } {
  const decimals = opts?.decimals;
  const fullDecimals = decimals ?? (n >= 100 ? 2 : n >= 1 ? 4 : 6);
  const title = n.toLocaleString("en-US", {
    minimumFractionDigits: fullDecimals,
    maximumFractionDigits: fullDecimals,
  });
  if (n >= 1000) {
    const compact = Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
    return { display: compact, title };
  }
  const display = n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fullDecimals,
  });
  return { display, title };
}
