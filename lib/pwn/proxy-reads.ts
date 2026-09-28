// The PWN proxy routes' reads, callable from a route handler and from
// the position page's loader alike (lib/shared/proxy-answer.ts). Each takes the
// proxy's query and a hop to the box, and answers what the route answers; the
// routes' header comments carry the argument for each shape. SERVER-ONLY.

import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildPwnPositionRows, type RawPwnPositionRow } from "@/lib/sources/api/pwn-positions";
import { timelineCacheHeaders } from "@/lib/shared/decimals-unread";
import { withRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { buildPwnTimeline, type MvRow } from "@/lib/sources/api/pwn-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { resolveErc20Meta } from "@/lib/sources/chain/erc20-meta";
import { pwnAssetSymbolOverride } from "@/lib/pwn/asset-catalog";
import { resolveOpeningAssetKeys, type UpstreamOpeningBalance } from "@/lib/shared/timeline-opening-balance-wire";
import { proxyFail, proxyOk, type ProxyAnswer } from "@/lib/shared/proxy-answer";
import type { SsrHop } from "@/lib/shared/listing-ssr";

interface PositionsRawResponse {
  rows: RawPwnPositionRow[];
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
   *  predates it) means `rows` IS the whole history. */
  cutoffBlock?: number | null;
}

/** Answers `/api/pwn/positions`. */
export async function readPwnPositions(
  sp: URLSearchParams,
  hop: SsrHop,
  signal?: AbortSignal,
): Promise<ProxyAnswer<unknown>> {
  const qs = new URLSearchParams();
  if (sp.get("wallet")) qs.set("wallet", sp.get("wallet")!);
  if (sp.get("role")) qs.set("role", sp.get("role")!);
  if (sp.get("status")) qs.set("status", sp.get("status")!);
  qs.set("sortOrder", sp.get("sortOrder") === "asc" ? "asc" : "desc");
  if (sp.get("limit") != null) qs.set("limit", sp.get("limit")!);
  if (sp.get("offset") != null) qs.set("offset", sp.get("offset")!);

  const url = `${hop.baseUrl}/api/pwn/positions?${qs.toString()}`;
  const response = await fetch(url, { signal, headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { success: false, error: `Backend error: ${response.statusText}` });
  }
  const raw = (await response.json()) as PositionsRawResponse;
  const data = await buildPwnPositionRows(raw.rows);
  return proxyOk(
    {
      success: true,
      data,
      pagination: { total: raw.total, limit: raw.limit, offset: raw.offset },
    },
    proxyCacheControl(response, LISTING_CACHE_CONTROL),
  );
}

/** Answers `/api/pwn/timeline`. */
export async function readPwnTimeline(sp: URLSearchParams, hop: SsrHop): Promise<ProxyAnswer<unknown>> {
  const wallet = sp.get("wallet");
  if (!wallet) return proxyFail(400, { error: "wallet is required" });
  // Passed straight through, validated upstream: rails-server owns the shape of
  // `recent` and answers a bad one with its own 400. Re-validating it here would
  // be a second opinion about the same parameter, and the two would drift.
  const recent = sp.get("recent");

  const recentQs = recent ? `&recent=${encodeURIComponent(recent)}` : "";
  const url = `${hop.baseUrl}/api/pwn/timeline?wallet=${encodeURIComponent(wallet)}${recentQs}`;
  const response = await fetch(url, { headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const { rows, totalEvents, truncated, cutoffBlock } = (await response.json()) as TimelineRowsResponse;
  const data = await buildPwnTimeline(rows, wallet);
  // The ceiling and the window are different claims and both can be absent. A
  // windowed fetch is never truncated — it asked for a window and got one —
  // so `withRowCeiling` stays exactly as it was and simply never fires.
  const windowed = { ...withRowCeiling(data, { totalEvents, truncated }), cutoffBlock: cutoffBlock ?? null };
  return proxyOk(
    toTimelineWire(windowed, MAINNET_CHAIN_ID),
    timelineCacheHeaders(data.events, proxyCacheControl(response, LISTING_CACHE_CONTROL)),
  );
}

/** Answers `/api/pwn/timeline/summary`. */
export async function readPwnOpeningBalance(sp: URLSearchParams, hop: SsrHop): Promise<ProxyAnswer<unknown>> {
  const wallet = sp.get("wallet");
  const cutoffBlock = sp.get("cutoffBlock");
  if (!wallet) return proxyFail(400, { error: "wallet is required" });
  if (!cutoffBlock) return proxyFail(400, { error: "cutoffBlock is required" });

  const qs = new URLSearchParams({ wallet, cutoffBlock });
  const url = `${hop.baseUrl}/api/pwn/timeline/summary?${qs.toString()}`;
  const response = await fetch(url, { headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const upstream = (await response.json()) as UpstreamOpeningBalance;

  const addresses = (upstream.byAsset ?? []).map((b) => b.key);
  const meta = await resolveErc20Meta(addresses);
  const resolve = (addr: string): string | undefined => {
    const lower = addr.toLowerCase();
    return pwnAssetSymbolOverride(lower) ?? meta.get(lower)?.symbol;
  };
  const opening = resolveOpeningAssetKeys(upstream, resolve);

  return proxyOk(opening, proxyCacheControl(response, LISTING_CACHE_CONTROL));
}
