// Pendle figures as the pages draw them: raw integers scaled by each token's
// decimals, 1e18-scaled rates, APYs as percentages, maturity in words.

import { formatNumber, shiftDecimal } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";
import type { PendleEventKind, PendleMarketTokens, PendleToken } from "@/lib/pendle/types";

export const PENDLE_CHAIN_ID = 1 as const;
export const PENDLE_ROUTER_STATIC = "0x263833d47ea3fa4a30f269323aba6a107f9eb14c";
export const PENDLE_ORACLE = "0x5542be50420e88dd7d5b4a3d488fa6ed82f6dac2";
export const PENDLE_ROUTER_V4 = "0x888888888889758f76e7103c6cbf23abbf58f946";
export const PENDLE_ROUTER_V3 = "0x00000000005bbb0ef59571e58418f9a4357b68a0";
export const PENDLE_LIMIT_ROUTER = "0x000000000000c9b3e2c3ec88b1b4c0cd853f4321";

export const ROUTER_NAME: Record<"v4" | "v3" | "limit", { name: string; address: string }> = {
  v4: { name: "PendleRouterV4", address: PENDLE_ROUTER_V4 },
  v3: { name: "PendleRouterV3", address: PENDLE_ROUTER_V3 },
  limit: { name: "Pendle limit router", address: PENDLE_LIMIT_ROUTER },
};

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** A token's name on the page: its symbol, else its short address. */
export const symbolOf = (t: { address: string; symbol: string | null }) => t.symbol ?? shortAddress(t.address);

/** The raw amount as a decimal string, or null where the decimals did not read. */
export function exact(raw: string | null | undefined, decimals: number | null | undefined): string | null {
  if (raw == null || decimals == null) return null;
  return shiftDecimal(raw, decimals);
}

/** The amount as a number, or null. */
export function units(raw: string | null | undefined, decimals: number | null | undefined): number | null {
  const e = exact(raw, decimals);
  return e == null ? null : Number(e);
}

/** The amount in the site's number format, or "–". */
export function amountText(raw: string | null | undefined, decimals: number | null | undefined): string {
  const n = units(raw, decimals);
  return n == null ? "–" : formatNumber(n);
}

/** A 1e18-scaled rate as a number (asset per PT, SY per LP). */
export function rate(raw: string | null | undefined): number | null {
  return raw == null ? null : Number(shiftDecimal(raw, 18));
}

/**
 * A 1e18-scaled rate between two tokens' smallest units, per whole token: Pendle's
 * PT, YT and LP to SY rates are unit for unit, so a 6-decimal PT against an 18-decimal
 * SY reads 10¹² too high without the shift.
 */
export function unitRate(
  raw: string | null | undefined,
  fromDecimals: number | null | undefined,
  toDecimals: number | null | undefined,
): number | null {
  if (raw == null || fromDecimals == null || toDecimals == null) return null;
  const places = 18 + toDecimals - fromDecimals;
  return places >= 0 ? Number(shiftDecimal(raw, places)) : Number(raw) * 10 ** -places;
}

/** An APY fraction as "8.10%". */
export function apyText(apy: number | null | undefined): string {
  return apy == null || !Number.isFinite(apy) ? "–" : `${(apy * 100).toFixed(2)}%`;
}

/** The decimals the asset carries (PT and YT share them). */
export const assetDecimals = (t: PendleMarketTokens) => t.asset.decimals ?? t.pt.decimals;

/** The asset's name as the page states values in it. */
export const assetSymbol = (t: PendleMarketTokens) =>
  /^0x0{40}$|^0xe{40}$/i.test(t.asset.address) ? "ETH" : symbolOf(t.asset);

/** The market's short name: the PT's symbol without its "PT-" prefix ("apxUSD-11FEB2027"). */
export function marketName(t: PendleMarketTokens): string {
  const pt = t.pt.symbol;
  return pt?.startsWith("PT-") ? pt.slice(3) : (pt ?? shortAddress(t.market.address));
}

/** "11 Feb 2027" for the expiry. */
export const maturityDate = (expiry: number) => formatDate(expiry);

/** Whole days from `at` to the expiry, never negative. */
export const daysToExpiry = (expiry: number, at: number) => Math.max(0, Math.ceil((expiry - at) / 86_400));

/** "in 94 days", "matured 3 days ago". */
export function maturityWords(expiry: number, at: number): string {
  if (at >= expiry) {
    const d = Math.floor((at - expiry) / 86_400);
    return d === 0 ? "matured today" : `matured ${d} ${d === 1 ? "day" : "days"} ago`;
  }
  const d = daysToExpiry(expiry, at);
  return `in ${d} ${d === 1 ? "day" : "days"}`;
}

/** The verb a router event's kind reads as. */
export const KIND_LABEL: Record<PendleEventKind, string> = {
  "add-liquidity": "Add liquidity",
  "remove-liquidity": "Remove liquidity",
  "buy-pt": "Buy PT",
  "sell-pt": "Sell PT",
  "buy-yt": "Buy YT",
  "sell-yt": "Sell YT",
  "swap-pt-yt": "Swap PT and YT",
  "mint-py": "Mint PT and YT",
  "redeem-py": "Redeem PT and YT",
  // P5 (ui-jobs 654): the docs' verbs, "Wrap" and "Unwrap" (SY page) and
  // "Redeem" (PT page, Dashboard) for a matured exit.
  "mint-sy": "Wrap",
  "redeem-sy": "Unwrap",
  exit: "Redeem",
  "limit-fill": "Limit order fill",
};

/** The token a leg moves, from the market's tokens or the event's outside token. */
export function legToken(
  leg: "pt" | "yt" | "lp" | "sy" | "token",
  token: string | null,
  t: PendleMarketTokens | null,
  meta: Record<string, { symbol: string | null; decimals: number | null }>,
): PendleToken | null {
  if (leg === "token") {
    if (!token) return null;
    const m = meta[token];
    return { address: token, symbol: m?.symbol ?? null, decimals: m?.decimals ?? null };
  }
  if (!t) return null;
  if (leg === "pt") return t.pt;
  if (leg === "yt") return t.yt;
  if (leg === "sy") return t.sy;
  return { ...t.market, symbol: t.market.symbol === "PENDLE-LPT" ? `LP ${marketName(t)}` : t.market.symbol };
}

export const LEG_NAME = { pt: "PT", yt: "YT", lp: "LP" } as const;
