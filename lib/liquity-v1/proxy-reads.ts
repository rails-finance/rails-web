// The Liquity V1 proxy routes' reads, callable from a route handler and from
// the position page's loader alike (lib/shared/proxy-answer.ts). Each takes the
// proxy's query and a hop to the box, and answers what the route answers; the
// routes' header comments carry the argument for each shape. SERVER-ONLY.

import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildLiquityV1PositionRows, type RawLiquityV1WalletRow } from "@/lib/sources/api/liquity-v1-positions";
import { withRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { buildLiquityV1Timeline, type MvRow } from "@/lib/sources/api/liquity-v1-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { resolveOpeningAssetKeys, type UpstreamOpeningBalance } from "@/lib/shared/timeline-opening-balance-wire";
import { proxyFail, proxyOk, type ProxyAnswer } from "@/lib/shared/proxy-answer";
import type { SsrHop } from "@/lib/shared/listing-ssr";

interface PositionsRawResponse {
  rows: RawLiquityV1WalletRow[];
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
}

/** Answers `/api/liquity-v1/positions`. */
export async function readLiquityV1Positions(
  sp: URLSearchParams,
  hop: SsrHop,
  signal?: AbortSignal,
): Promise<ProxyAnswer<unknown>> {
  const qs = new URLSearchParams();
  if (sp.get("wallet")) qs.set("wallet", sp.get("wallet")!);
  if (sp.get("hasDebt")) qs.set("hasDebt", sp.get("hasDebt")!);
  if (sp.get("noDebt")) qs.set("noDebt", sp.get("noDebt")!);
  if (sp.get("hasLiquidations")) qs.set("hasLiquidations", sp.get("hasLiquidations")!);
  if (sp.get("hasRedemptions")) qs.set("hasRedemptions", sp.get("hasRedemptions")!);
  if (sp.get("status")) qs.set("status", sp.get("status")!);
  if (sp.get("sortBy")) qs.set("sortBy", sp.get("sortBy")!);
  qs.set("sortOrder", sp.get("sortOrder") === "asc" ? "asc" : "desc");
  if (sp.get("limit") != null) qs.set("limit", sp.get("limit")!);
  if (sp.get("offset") != null) qs.set("offset", sp.get("offset")!);

  const url = `${hop.baseUrl}/api/liquity-v1/positions?${qs.toString()}`;
  const response = await fetch(url, { signal, headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { success: false, error: `Backend error: ${response.statusText}` });
  }
  const raw = (await response.json()) as PositionsRawResponse;
  const data = buildLiquityV1PositionRows(raw.rows);
  return proxyOk(
    {
      success: true,
      data,
      pagination: { total: raw.total, limit: raw.limit, offset: raw.offset },
    },
    proxyCacheControl(response, LISTING_CACHE_CONTROL),
  );
}

/** Answers `/api/liquity-v1/timeline`. */
export async function readLiquityV1Timeline(sp: URLSearchParams, hop: SsrHop): Promise<ProxyAnswer<unknown>> {
  const wallet = sp.get("wallet");
  if (!wallet) return proxyFail(400, { error: "wallet is required" });
  // Passed straight through, validated upstream: rails-server owns the shape of
  // `recent` and answers a bad one with its own 400. Re-validating it here
  // would be a second opinion about the same parameter, and the two would drift.
  const recent = sp.get("recent");

  const recentQs = recent ? `&recent=${encodeURIComponent(recent)}` : "";
  const url = `${hop.baseUrl}/api/liquity-v1/timeline?wallet=${encodeURIComponent(wallet)}${recentQs}`;
  const response = await fetch(url, { headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const { rows, totalEvents, truncated, cutoffBlock } = (await response.json()) as TimelineRowsResponse;
  const data = buildLiquityV1Timeline(rows, wallet);
  // The ceiling and the window are different claims and both can be absent.
  // A windowed fetch is never truncated — it asked for a window and got one —
  // so `withRowCeiling` stays exactly as it was and simply never fires.
  const windowed = { ...withRowCeiling(data, { totalEvents, truncated }), cutoffBlock: cutoffBlock ?? null };
  return proxyOk(toTimelineWire(windowed, MAINNET_CHAIN_ID), proxyCacheControl(response, LISTING_CACHE_CONTROL));
}

/** Answers `/api/liquity-v1/timeline/summary`. */
export async function readLiquityV1OpeningBalance(sp: URLSearchParams, hop: SsrHop): Promise<ProxyAnswer<unknown>> {
  const wallet = sp.get("wallet");
  const cutoffBlock = sp.get("cutoffBlock");
  if (!wallet) return proxyFail(400, { error: "wallet is required" });
  if (!cutoffBlock) return proxyFail(400, { error: "cutoffBlock is required" });

  const qs = new URLSearchParams({ wallet, cutoffBlock });
  const url = `${hop.baseUrl}/api/liquity-v1/timeline/summary?${qs.toString()}`;
  const response = await fetch(url, { headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const upstream = (await response.json()) as UpstreamOpeningBalance;

  // Nothing to resolve — see the header. The identity resolver keeps every key
  // verbatim, which is what a `position` key kind gets in any case.
  const opening = resolveOpeningAssetKeys(upstream, () => undefined);

  return proxyOk(opening, proxyCacheControl(response, LISTING_CACHE_CONTROL));
}
