// One way to name a position across the app (rails-ops ui-jobs 703, settled by
// Miles 17 Nov 2026): "<market> · <Noun> <id>". The tab title, the card
// heading (C5), the listing tag (the id after its "#" icon), the ⋮'s id rows
// and a saved position's default name all read their pieces from here.
//
// Client-safe and import-free, so scripts/test/position-name.test.mjs loads it
// directly.

/** A position's name in its three pieces, and joined. */
export interface PositionName {
  /** The market the family's listing tag shows; absent on a one-market explorer. */
  market?: string;
  /** POSITION_NOUN for the session ("Trove", "Vault", "Account"). */
  noun: string;
  /** The id as shown: "#31245", "165712…6943", "0x3df8…67da". */
  id: string;
  /** "WETH · Trove 165712…6943", or "Position 0x3df8…67da" with no market. */
  text: string;
}

/** The longest decimal id written whole, after "#". */
const WHOLE_DIGITS = 6;

const cut = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;

/** A position's id as every surface shows it. A decimal of up to six digits
 *  reads "#31245"; a longer decimal and any hex id or address keep their first
 *  six and last four characters ("165712…6943", "0x3df8…67da"). Anything else
 *  (an ENS name, an id already cut) passes through. A leading "#" on the input
 *  is dropped first. */
export function shortPositionId(raw: string | number | bigint): string {
  const s = String(raw).trim().replace(/^#/, "");
  if (/^\d+$/.test(s)) return s.length <= WHOLE_DIGITS ? `#${s}` : cut(s);
  if (/^0x[0-9a-fA-F]+$/.test(s) && s.length > 10) return cut(s);
  return s;
}

/** The id as a listing tag draws it, after the icon that stands for "#". */
export function listingTagId(raw: string | number | bigint): string {
  return shortPositionId(raw).replace(/^#/, "");
}

/** A two-asset market, spaced the same way on every surface: "wstETH / USDC". */
export function marketPair(a: string, b: string): string {
  return `${a} / ${b}`;
}

/** Bring a pair written "A/B", "A·B" or "A / B" to "A / B"; a single symbol
 *  passes through. */
export function spacePair(market: string): string {
  const parts = market.split(/\s*[/·]\s*/);
  return parts.length === 2 && parts[0] && parts[1] ? marketPair(parts[0], parts[1]) : market;
}

/** The name from its pieces. `id` is raw (a trove id, a cdp number, an
 *  address); `market` is dropped when empty. */
export function positionName(parts: {
  market?: string | null;
  noun: string;
  id: string | number | bigint;
}): PositionName {
  const market = parts.market ? spacePair(parts.market) : undefined;
  const id = shortPositionId(parts.id);
  const head = `${parts.noun} ${id}`;
  return { ...(market ? { market } : {}), noun: parts.noun, id, text: market ? `${market} · ${head}` : head };
}
