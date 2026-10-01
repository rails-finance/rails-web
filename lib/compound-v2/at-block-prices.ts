// Compound V2's oracle prices at a block, raw integers → dollars. One
// conversion for both sources of them: the archive read
// (lib/sources/chain/compound-v2-prices-at.ts, behind
// /api/chain/compound-v2/prices-at) and the prices the server stores for
// every event row's (block, market) (rails-server mig 372,
// /api/compound-v2/prices-at), so a stored price gives the figure the archive
// read gives. rails-ops reference/compound-prices-at-block.md.
//
// getUnderlyingPrice answers at scale 36 − underlying decimals. Before block
// 10,678,764 (17 Aug 2020) the oracle priced in ETH: a market's ETH price is
// divided by the same block's USDC price (ETH per USDC).

import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
import { rawToNum } from "@/lib/compound-v2/liquidation-values";

/** First block at which Compound's oracle answered in USD. */
export const COMPOUND_V2_USD_ORACLE_BLOCK = 10_678_764;

/** USD per underlying token for each market at one block, from the oracle's
 *  raw answers (`raws`, null or 0 = no price; `usdc` among them in the ETH
 *  years). A market with no price, or no USDC price to convert by, is absent. */
export function compoundV2UsdAtBlock(
  block: number,
  markets: Iterable<string>,
  raws: ReadonlyMap<string, bigint | null>,
): Map<string, number> {
  const native = new Map<string, number>();
  for (const [m, raw] of raws) {
    const meta = COMPOUND_V2_MARKET_BY_KEY[m];
    if (!meta || raw == null || raw === BigInt(0)) continue;
    native.set(m, rawToNum(raw, 36 - meta.decimals));
  }
  // Dollars per ETH at this block: 1 ÷ (ETH per USDC).
  const inEth = block < COMPOUND_V2_USD_ORACLE_BLOCK;
  const usdPerNative = inEth ? (native.get("usdc") ? 1 / native.get("usdc")! : null) : 1;
  const out = new Map<string, number>();
  for (const m of markets) {
    const n = native.get(m);
    const usd = n != null && usdPerNative != null ? n * usdPerNative : null;
    if (usd != null && Number.isFinite(usd) && usd > 0) out.set(m, usd);
  }
  return out;
}

/** The server's answer for stored pairs (/api/compound-v2/prices-at). */
export interface StoredV2Answer {
  prices: Record<string, { raw: string | null; unit: string }>;
  usdc: Record<string, string | null>;
  missing: string[];
}

/** USD by `${block}:${market}` for every stored pair with a price. A stored
 *  pair with no price stays absent, as the archive read leaves it. */
export function storedV2Prices(answer: StoredV2Answer): Map<string, number> {
  const byBlock = new Map<number, Map<string, bigint | null>>();
  for (const [pair, p] of Object.entries(answer.prices)) {
    const [b, m] = pair.split(":");
    const block = Number(b);
    const raws = byBlock.get(block) ?? new Map<string, bigint | null>();
    raws.set(m, p.raw == null ? null : BigInt(p.raw));
    byBlock.set(block, raws);
  }
  const out = new Map<string, number>();
  for (const [block, raws] of byBlock) {
    const markets = [...raws.keys()];
    if (block < COMPOUND_V2_USD_ORACLE_BLOCK && !raws.has("usdc")) {
      const u = answer.usdc[String(block)];
      raws.set("usdc", u == null ? null : BigInt(u));
    }
    for (const [m, usd] of compoundV2UsdAtBlock(block, markets, raws)) out.set(`${block}:${m}`, usd);
  }
  return out;
}

// ── The daily price store's Compound V2 series ───────────────────────────────

/** The daily store's series key for a market (rails-ops
 *  reference/daily-prices.md): `cv2:<cToken>`. */
export const compoundV2SeriesKey = (ctoken: string) => `cv2:${ctoken.toLowerCase()}`;

type DailyObs = [number, string, string, string?, number?];
interface DailyAnswerLike {
  series?: Record<string, { unit?: string | null; scale?: number | null; obs?: DailyObs[] }>;
}

/** Each market's daily price, [UTC day, USD] ascending, from the store's
 *  answer for its `cv2:<cToken>` series: a day in the oracle's ETH years is
 *  turned into dollars with the same day's USDC price, as an event's price
 *  is; a day with no USDC price is left out (the page carries the last). */
export function compoundV2DailyPrices(
  body: DailyAnswerLike,
  markets: readonly string[],
): Record<string, [number, number][]> {
  const seriesOf = (m: string) => {
    const meta = COMPOUND_V2_MARKET_BY_KEY[m];
    return meta ? body.series?.[compoundV2SeriesKey(meta.ctoken)] : undefined;
  };
  const rows = (m: string) => {
    const s = seriesOf(m);
    const out: { day: number; raw: bigint; unit: string; scale: number }[] = [];
    for (const [day, raw, , unit, scale] of s?.obs ?? []) {
      const u = unit ?? s?.unit;
      const sc = scale ?? s?.scale;
      if (u == null || sc == null) continue;
      out.push({ day, raw: BigInt(raw), unit: u, scale: sc });
    }
    return out;
  };
  // ETH per USDC on each ETH-year day.
  const ethPerUsdc = new Map<number, number>();
  for (const r of rows("usdc"))
    if (r.unit === "eth" && r.raw > BigInt(0)) ethPerUsdc.set(r.day, rawToNum(r.raw, r.scale));
  const out: Record<string, [number, number][]> = {};
  for (const m of markets) {
    const list: [number, number][] = [];
    for (const r of rows(m)) {
      if (r.raw <= BigInt(0)) continue;
      const native = rawToNum(r.raw, r.scale);
      const perEth = r.unit === "eth" ? ethPerUsdc.get(r.day) : null;
      const usd = r.unit === "usd" ? native : r.unit === "eth" && perEth ? native * (1 / perEth) : null;
      if (usd != null && Number.isFinite(usd) && usd > 0) list.push([r.day, usd]);
    }
    if (list.length > 0) out[m] = list.sort((a, b) => a[0] - b[0]);
  }
  return out;
}
