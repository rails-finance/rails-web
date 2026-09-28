// The Fluid proxy routes' reads, callable from a route handler and from
// the position page's loader alike (lib/shared/proxy-answer.ts). Each takes the
// proxy's query and a hop to the box, and answers what the route answers; the
// routes' header comments carry the argument for each shape. SERVER-ONLY.

import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildFluidPositionRows, type RawFluidPositionRow } from "@/lib/sources/api/fluid-positions";
import { withRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { buildFluidTimeline, type FluidMvRow } from "@/lib/sources/api/fluid-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { resolveOpeningAssetKeys, type UpstreamOpeningBalance } from "@/lib/shared/timeline-opening-balance-wire";
import { proxyFail, proxyOk, type ProxyAnswer } from "@/lib/shared/proxy-answer";
import type { SsrHop } from "@/lib/shared/listing-ssr";

const PASSTHROUGH = [
  "wallet",
  "nft",
  "hasDebt",
  "noDebt",
  "wasLiquidated",
  "status",
  "supplyAssets",
  "borrowAssets",
  "vaultKind",
  "sortBy",
  "sortOrder",
  "limit",
  "offset",
] as const;

interface PositionsResponse {
  rows: RawFluidPositionRow[];
  total: number;
  limit: number;
  offset: number;
}

interface TimelineRowsResponse {
  nftId: string;
  rows: FluidMvRow[];
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
}

/** Answers `/api/fluid/positions`. */
export async function readFluidPositions(
  sp: URLSearchParams,
  hop: SsrHop,
  signal?: AbortSignal,
): Promise<ProxyAnswer<unknown>> {
  const qs = new URLSearchParams();
  for (const key of PASSTHROUGH) {
    const v = sp.get(key);
    if (v != null && v !== "") qs.set(key, v);
  }
  const url = `${hop.baseUrl}/api/fluid/positions?${qs.toString()}`;
  const response = await fetch(url, { signal, headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const json = (await response.json()) as PositionsResponse;
  return proxyOk(
    {
      success: true,
      data: buildFluidPositionRows(json.rows ?? []),
      pagination: { total: json.total ?? 0, limit: json.limit ?? 20, offset: json.offset ?? 0 },
    },
    proxyCacheControl(response, LISTING_CACHE_CONTROL),
  );
}

/** Answers `/api/fluid/timeline`. */
export async function readFluidTimeline(sp: URLSearchParams, hop: SsrHop): Promise<ProxyAnswer<unknown>> {
  const nft = sp.get("nft");
  if (!nft || !/^\d+$/.test(nft)) {
    return proxyFail(400, { error: "nft (position NFT id) is required" });
  }

  // Passed straight through, validated upstream: rails-server owns the shape of
  // `recent` and answers a bad one with its own 400. Re-validating it here
  // would be a second opinion about the same parameter, and the two would drift.
  const recent = sp.get("recent");

  const recentQs = recent ? `&recent=${encodeURIComponent(recent)}` : "";
  const url = `${hop.baseUrl}/api/fluid/timeline?nft=${encodeURIComponent(nft)}${recentQs}`;
  const response = await fetch(url, { headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const { rows, totalEvents, truncated, cutoffBlock } = (await response.json()) as TimelineRowsResponse;
  const data = buildFluidTimeline(rows, nft);
  // The ceiling and the window are different claims and both can be absent.
  // A windowed fetch is never truncated — it asked for a window and got one —
  // so `withRowCeiling` stays exactly as it was and simply never fires.
  const windowed = { ...withRowCeiling(data, { totalEvents, truncated }), cutoffBlock: cutoffBlock ?? null };
  return proxyOk(toTimelineWire(windowed, MAINNET_CHAIN_ID), proxyCacheControl(response, LISTING_CACHE_CONTROL));
}

/** Answers `/api/fluid/timeline/summary`. */
export async function readFluidOpeningBalance(sp: URLSearchParams, hop: SsrHop): Promise<ProxyAnswer<unknown>> {
  const nft = sp.get("nft");
  if (!nft || !/^\d+$/.test(nft)) {
    return proxyFail(400, { error: "nft (position NFT id) is required" });
  }
  const cutoffBlock = sp.get("cutoffBlock");
  if (!cutoffBlock) return proxyFail(400, { error: "cutoffBlock is required" });

  const qs = new URLSearchParams({ nft, cutoffBlock });
  const url = `${hop.baseUrl}/api/fluid/timeline/summary?${qs.toString()}`;
  const response = await fetch(url, { headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const upstream = (await response.json()) as UpstreamOpeningBalance;

  // Identity, for the reason above: no key on either axis is an address, so
  // there is nothing to rename. The call still runs, because it is also what
  // narrows the upstream shape to the page's `TimelineOpeningBalance` — and
  // because a bucket whose `decimals` the index could not state stays null
  // through it, which the page reads as unknown rather than as zero.
  const opening = resolveOpeningAssetKeys(upstream, (key) => key);

  return proxyOk(opening, proxyCacheControl(response, LISTING_CACHE_CONTROL));
}
