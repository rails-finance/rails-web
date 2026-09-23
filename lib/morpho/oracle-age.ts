// How old a Morpho market's oracle price is — the words for it.
// ----------------------------------------------------------------------------
// The oracle answers price() with no check on its feeds' age, so a price can
// be days old (a tokenised stock's feed posts nothing from Friday 20:00 to
// Sunday 20:00 ET). What the page states is the chain's own fact: the oldest
// feed's updatedAt, and how long before the read block it was. Nothing more —
// no threshold, no market-hours reading, no substitute price (Miles's ruling,
// 2026-09-19; the facts are rails-ops reference/tokenised-stock-collateral-
// pricing.md). With no feeds read, there is nothing to state.
//
// Both texts are built by hand from UTC fields rather than a locale call: the
// same instant must print the same on the server and in the browser.

import type { MorphoChainPositionResponse } from "@/lib/api/fetch-morpho-position";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "Fri 18 Sep 15:24 UTC" — the year only when it differs from the read's. */
export function publishedText(unix: number, readUnix: number): string {
  const d = new Date(unix * 1000);
  const year = d.getUTCFullYear() !== new Date(readUnix * 1000).getUTCFullYear() ? ` ${d.getUTCFullYear()}` : "";
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${year} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** "40 s", "35 min", "21 h", "2 d 9 h". */
function ageText(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  const hours = Math.round(s / 3600);
  if (hours < 48) return `${hours} h`;
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return h > 0 ? `${d} d ${h} h` : `${d} d`;
}

interface OracleAge {
  /** "Fri 18 Sep 15:24 UTC". */
  published: string;
  /** "21 h" — read block time − the oldest feed's updatedAt. */
  age: string;
  /** How many feeds the price is built from; the time is the oldest's. */
  feedCount: number;
}

/** The oracle price's age, or null — say nothing — when no feed was read. Takes
 *  the four fields it reads, so a market's read (lib/sources/chain/morpho-markets
 *  loadMorphoMarketFromChain) states it exactly as a position's does. */
export function oracleAge(
  chain: Pick<MorphoChainPositionResponse, "chainStale" | "oraclePublishedAt" | "oracleFeeds" | "timestamp">,
): OracleAge | null {
  if (chain.chainStale || chain.oraclePublishedAt == null || !chain.oracleFeeds?.length) return null;
  return {
    published: publishedText(chain.oraclePublishedAt, chain.timestamp),
    age: ageText(chain.timestamp - chain.oraclePublishedAt),
    feedCount: chain.oracleFeeds.length,
  };
}
