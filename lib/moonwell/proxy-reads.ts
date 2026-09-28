// The Moonwell (Ethereum) proxy routes' reads, callable from a route handler and from
// the position page's loader alike (lib/shared/proxy-answer.ts). Each takes the
// proxy's query and a hop to the box, and answers what the route answers; the
// routes' header comments carry the argument for each shape. SERVER-ONLY.

import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildMoonwellPositionRows, type RawMoonwellWalletRow } from "@/lib/sources/api/moonwell-positions";
import { MOONWELL_KEY_BY_SYMBOL, MOONWELL_MARKET_BY_KEY } from "@/lib/moonwell/asset-catalog";
import { withRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { buildMoonwellTimeline, type MvRow } from "@/lib/sources/api/moonwell-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { resolveOpeningAssetKeys, type UpstreamOpeningBalance } from "@/lib/shared/timeline-opening-balance-wire";
import { proxyFail, proxyOk, type ProxyAnswer } from "@/lib/shared/proxy-answer";
import type { SsrHop } from "@/lib/shared/listing-ssr";

// The filter chips are underlying SYMBOLS; the rails route filters by market
// KEY. Map off the same catalog the chips are populated from; raw keys pass
// through untouched.
function symbolsToMarketKeys(csvValue: string): string {
  return csvValue
    .split(",")
    .filter(Boolean)
    .map((s) => MOONWELL_KEY_BY_SYMBOL[s] ?? s.toLowerCase())
    .filter(Boolean)
    .join(",");
}

interface PositionsRawResponse {
  rows: RawMoonwellWalletRow[];
  total: number;
  limit: number;
  offset: number;
}

interface TimelineRowsResponse {
  wallet: string;
  rows: MvRow[];
  totalEvents: number;
  /** The index's row ceiling cut this query, so `rows` is short of
   *  `totalEvents`. Optional — a backend that predates the field means the
   *  fetch was not capped, and the page reads exactly as it did before. */
  truncated?: boolean;
  /** Where `?recent=N` drew the line: `rows` holds every event from this block
   *  onward and everything below it is the opening balance, fetched from the
   *  /summary twin with THIS number. Null (or absent, on a backend that
   *  predates it) means the rows ARE the whole history. */
  cutoffBlock?: number | null;
  /** Markets this wallet ever moved an mToken on by transfer — a backend
   *  that predates the flag simply omits it (no stand-down). */
  transferMarkets?: string[];
}

/** Answers `/api/moonwell/positions`. */
export async function readMoonwellPositions(
  sp: URLSearchParams,
  hop: SsrHop,
  signal?: AbortSignal,
): Promise<ProxyAnswer<unknown>> {
  const qs = new URLSearchParams();
  if (sp.get("wallet")) qs.set("wallet", sp.get("wallet")!);
  if (sp.get("status")) qs.set("status", sp.get("status")!);
  if (sp.get("hasDebt")) qs.set("hasDebt", sp.get("hasDebt")!);
  if (sp.get("noDebt")) qs.set("noDebt", sp.get("noDebt")!);
  if (sp.get("hasLiquidations")) qs.set("hasLiquidations", sp.get("hasLiquidations")!);
  if (sp.get("supplyAssets")) qs.set("supplyMarkets", symbolsToMarketKeys(sp.get("supplyAssets")!));
  if (sp.get("borrowAssets")) qs.set("borrowMarkets", symbolsToMarketKeys(sp.get("borrowAssets")!));
  // Allowlist, like sortOrder: an unrecognised value is dropped rather than
  // forwarded verbatim, so rails-server's own default (recent) decides it —
  // same "unrecognised ⇒ default, no error" stance the route takes throughout.
  const sortBy = sp.get("sortBy");
  if (sortBy === "debt" || sortBy === "coll") qs.set("sortBy", sortBy);
  qs.set("sortOrder", sp.get("sortOrder") === "asc" ? "asc" : "desc");
  if (sp.get("limit") != null) qs.set("limit", sp.get("limit")!);
  if (sp.get("offset") != null) qs.set("offset", sp.get("offset")!);

  const url = `${hop.baseUrl}/api/moonwell/positions?${qs.toString()}`;
  const response = await fetch(url, { signal, headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { success: false, error: `Backend error: ${response.statusText}` });
  }
  const raw = (await response.json()) as PositionsRawResponse;
  const data = await buildMoonwellPositionRows(raw.rows);
  return proxyOk(
    {
      success: true,
      data,
      pagination: { total: raw.total, limit: raw.limit, offset: raw.offset },
    },
    proxyCacheControl(response, LISTING_CACHE_CONTROL),
  );
}

/** Answers `/api/moonwell/timeline`. */
export async function readMoonwellTimeline(sp: URLSearchParams, hop: SsrHop): Promise<ProxyAnswer<unknown>> {
  const wallet = sp.get("wallet");
  if (!wallet) return proxyFail(400, { error: "wallet is required" });
  // Passed straight through, validated upstream: rails-server owns the shape of
  // `recent` and answers a bad one with its own 400. Re-validating it here
  // would be a second opinion about the same parameter, and the two would drift.
  const recent = sp.get("recent");

  const recentQs = recent ? `&recent=${encodeURIComponent(recent)}` : "";
  const url = `${hop.baseUrl}/api/moonwell/timeline?wallet=${encodeURIComponent(wallet)}${recentQs}`;
  const response = await fetch(url, { headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const { rows, totalEvents, truncated, cutoffBlock, transferMarkets } =
    (await response.json()) as TimelineRowsResponse;
  const data = buildMoonwellTimeline(rows, wallet, { transferMarkets });
  // The ceiling and the window are different claims and both can be absent.
  // A windowed fetch is never truncated — it asked for a window and got one —
  // so `withRowCeiling` stays exactly as it was and simply never fires.
  const windowed = { ...withRowCeiling(data, { totalEvents, truncated }), cutoffBlock: cutoffBlock ?? null };
  return proxyOk(toTimelineWire(windowed, MAINNET_CHAIN_ID), proxyCacheControl(response, LISTING_CACHE_CONTROL));
}

/** Answers `/api/moonwell/timeline/summary`. */
export async function readMoonwellOpeningBalance(sp: URLSearchParams, hop: SsrHop): Promise<ProxyAnswer<unknown>> {
  const wallet = sp.get("wallet");
  const cutoffBlock = sp.get("cutoffBlock");
  if (!wallet) return proxyFail(400, { error: "wallet is required" });
  if (!cutoffBlock) return proxyFail(400, { error: "cutoffBlock is required" });

  const qs = new URLSearchParams({ wallet, cutoffBlock });
  const url = `${hop.baseUrl}/api/moonwell/timeline/summary?${qs.toString()}`;
  const response = await fetch(url, { headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const upstream = (await response.json()) as UpstreamOpeningBalance;

  const opening = resolveOpeningAssetKeys(
    upstream,
    (key) => MOONWELL_MARKET_BY_KEY[key]?.symbol,
    (key) => MOONWELL_MARKET_BY_KEY[key]?.decimals,
  );

  return proxyOk(opening, proxyCacheControl(response, LISTING_CACHE_CONTROL));
}
