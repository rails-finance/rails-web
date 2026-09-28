// The Frankencoin proxy routes' reads, callable from a route handler and from
// the position page's loader alike (lib/shared/proxy-answer.ts). Each takes the
// proxy's query and a hop to the box, and answers what the route answers; the
// routes' header comments carry the argument for each shape. SERVER-ONLY.

import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildFrankencoinPositionRows, type RawFrankencoinPositionRow } from "@/lib/sources/api/frankencoin-positions";
import { withRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { buildFrankencoinTimeline, type FrankencoinMvRow } from "@/lib/sources/api/frankencoin-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { resolveOpeningAssetKeys, type UpstreamOpeningBalance } from "@/lib/shared/timeline-opening-balance-wire";
import { proxyFail, proxyOk, type ProxyAnswer } from "@/lib/shared/proxy-answer";
import type { SsrHop } from "@/lib/shared/listing-ssr";

interface PositionsRawResponse {
  rows: RawFrankencoinPositionRow[];
  total: number;
  limit: number;
  offset: number;
}

/** The backend's max page size. */
const PAGE_LIMIT = 5000;
/** Hard stop on the cursor walk — if it ever trips, events.length <
 *  totalEvents states the truncation plainly rather than looping unbounded. */
const MAX_PAGES = 20;

interface TimelineRowsResponse {
  position: string;
  rows: FrankencoinMvRow[];
  totalEvents: number;
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
  /** Where `?recent=N` drew the line — see the fetch loop below. Null (or
   *  absent, on a backend that predates it) means the pages ARE the whole
   *  history. */
  cutoffBlock?: number | null;
}

/** Answers `/api/frankencoin/positions`. */
export async function readFrankencoinPositions(
  sp: URLSearchParams,
  hop: SsrHop,
  signal?: AbortSignal,
): Promise<ProxyAnswer<unknown>> {
  const qs = new URLSearchParams();
  if (sp.get("position")) qs.set("position", sp.get("position")!);
  if (sp.get("owner")) qs.set("owner", sp.get("owner")!);
  if (sp.get("status")) qs.set("status", sp.get("status")!);
  if (sp.get("hub")) qs.set("hub", sp.get("hub")!);
  if (sp.get("everChallenged")) qs.set("everChallenged", sp.get("everChallenged")!);
  if (sp.get("challengeSucceeded")) qs.set("challengeSucceeded", sp.get("challengeSucceeded")!);
  // Allowlist, like sortOrder: an unrecognised value is dropped rather than
  // forwarded verbatim, so rails-server's own default (recent) decides it.
  const sortBy = sp.get("sortBy");
  if (sortBy === "debt" || sortBy === "coll") qs.set("sortBy", sortBy);
  qs.set("sortOrder", sp.get("sortOrder") === "asc" ? "asc" : "desc");
  if (sp.get("limit") != null) qs.set("limit", sp.get("limit")!);
  if (sp.get("offset") != null) qs.set("offset", sp.get("offset")!);

  const url = `${hop.baseUrl}/api/frankencoin/positions?${qs.toString()}`;
  const response = await fetch(url, { signal, headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { success: false, error: `Backend error: ${response.statusText}` });
  }
  const raw = (await response.json()) as PositionsRawResponse;
  const data = buildFrankencoinPositionRows(raw.rows);
  return proxyOk(
    {
      success: true,
      data,
      pagination: { total: raw.total, limit: raw.limit, offset: raw.offset },
    },
    proxyCacheControl(response, LISTING_CACHE_CONTROL),
  );
}

/** Answers `/api/frankencoin/timeline`. */
export async function readFrankencoinTimeline(sp: URLSearchParams, hop: SsrHop): Promise<ProxyAnswer<unknown>> {
  const position = sp.get("position");
  if (!position) {
    return proxyFail(400, { error: "position is required" });
  }
  // Passed straight through, validated upstream: rails-server owns the shape of
  // `recent` and answers a bad one with its own 400. Sent on the FIRST page
  // only — the window and the cursor compose upstream, and page one's cursor
  // already sits at or past the cutoff, so re-sending it would let a fresh
  // event move a recomputed cutoff up mid-drain.
  const recent = sp.get("recent");

  const rows: FrankencoinMvRow[] = [];
  let totalEvents = 0;
  let cursor: string | null = null;
  let cutoffBlock: number | null = null;
  let lastResponse: Response | null = null;
  // True when the walk hit MAX_PAGES with the backend still saying `hasMore`
  // — the drained rows are then a prefix of the history, and the page's
  // row-ceiling disclosure states it rather than a cut list passing as whole.
  let stoppedShort = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ position, limit: String(PAGE_LIMIT) });
    if (recent && page === 0) qs.set("recent", recent);
    if (cursor) qs.set("cursor", cursor);
    const response = await fetch(`${hop.baseUrl}/api/frankencoin/timeline?${qs.toString()}`, { headers: hop.headers });
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
    }
    const json = (await response.json()) as TimelineRowsResponse;
    rows.push(...json.rows);
    totalEvents = json.totalEvents;
    if (page === 0) cutoffBlock = json.cutoffBlock ?? null;
    lastResponse = response;
    if (!json.hasMore || !json.nextCursor) break;
    cursor = json.nextCursor;
    stoppedShort = page === MAX_PAGES - 1;
  }

  const data = {
    ...withRowCeiling(buildFrankencoinTimeline(rows, position, totalEvents), {
      totalEvents,
      truncated: stoppedShort,
    }),
    cutoffBlock,
  };
  return proxyOk(
    toTimelineWire(data, MAINNET_CHAIN_ID),
    lastResponse ? proxyCacheControl(lastResponse, LISTING_CACHE_CONTROL) : undefined,
  );
}

/** Answers `/api/frankencoin/timeline/summary`. */
export async function readFrankencoinOpeningBalance(sp: URLSearchParams, hop: SsrHop): Promise<ProxyAnswer<unknown>> {
  const position = sp.get("position");
  const cutoffBlock = sp.get("cutoffBlock");
  if (!position) return proxyFail(400, { error: "position is required" });
  if (!cutoffBlock) return proxyFail(400, { error: "cutoffBlock is required" });

  const qs = new URLSearchParams({ position, cutoffBlock });
  const url = `${hop.baseUrl}/api/frankencoin/timeline/summary?${qs.toString()}`;
  const response = await fetch(url, { headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const upstream = (await response.json()) as UpstreamOpeningBalance;
  const opening = resolveOpeningAssetKeys(upstream, () => undefined);
  return proxyOk(opening, proxyCacheControl(response, LISTING_CACHE_CONTROL));
}
