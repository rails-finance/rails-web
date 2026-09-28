// The Compound V3 (Ethereum) proxy routes' reads, callable from a route handler and from
// the position page's loader alike (lib/shared/proxy-answer.ts). Each takes the
// proxy's query and a hop to the box, and answers what the route answers; the
// routes' header comments carry the argument for each shape. SERVER-ONLY.

import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { timelineCacheHeaders } from "@/lib/shared/decimals-unread";
import { withRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { buildCompoundTimeline, type MvRow } from "@/lib/sources/api/compound-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { resolveErc20Meta } from "@/lib/sources/chain/erc20-meta";
import type { UpstreamGroupedTimeline } from "@/lib/sources/api/timeline-folder-wire";
import { compoundFolderTokenAddresses, compoundServedFolder } from "@/lib/sources/api/compound-folder-wire";
import type { TimelineRowPlanEntry } from "@/lib/shared/timeline-folder";
import { COMPOUND_MARKETS } from "@/lib/compound/asset-catalog";
import { resolveOpeningAssetKeys, type UpstreamOpeningBalance } from "@/lib/shared/timeline-opening-balance-wire";
import type { CompoundProxyTarget } from "@/lib/api/compound-positions-proxy";
import { COMPOUND_DEPLOYMENT } from "@/lib/compound/asset-catalog";
import { proxyFail, proxyOk, type ProxyAnswer } from "@/lib/shared/proxy-answer";
import type { SsrHop } from "@/lib/shared/listing-ssr";

/** The Ethereum listing target, read by `/api/compound/positions` and the
 *  position page's loader through `readCompoundPositions`. */
export const COMPOUND_ETHEREUM_POSITIONS: CompoundProxyTarget = {
  apiPrefix: "/api/compound",
  label: "compound",
  deployment: COMPOUND_DEPLOYMENT,
  supportsSort: true,
};

interface TimelineRowsResponse {
  wallet: string;
  market: string | null;
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
  /** The span `?from=`/`?to=` asked for, echoed in unix seconds. */
  span?: { from: number; to: number } | null;
}

/** The index keys collateral by raw lowercase token address and base by market
 *  slug, in one response. The two namespaces cannot collide, so one test tells
 *  a key which resolver it belongs to. */
const isTokenAddress = (key: string) => /^0x[0-9a-f]{40}$/i.test(key);

/** Answers `/api/compound/timeline`. */
export async function readCompoundTimeline(sp: URLSearchParams, hop: SsrHop): Promise<ProxyAnswer<unknown>> {
  const wallet = sp.get("wallet");
  if (!wallet) return proxyFail(400, { error: "wallet is required" });
  const market = sp.get("market");
  // Passed straight through, validated upstream: rails-server owns the shape of
  // `recent` and answers a bad one with its own 400. Re-validating it here
  // would be a second opinion about the same parameter, and the two would drift.
  const recent = sp.get("recent");
  // `?from=`/`?to=`: a span of time in place of the newest window, passed
  // straight through; rails-server refuses a half span or one beside `recent`.
  const from = sp.get("from");
  const to = sp.get("to");

  // ── `?group=1`: the same history as ROWS (decision 0019's evening
  // amendment), for one (market, account). The events travel flat and the
  // rows as a plan, as on the SparkLend route, which carries the argument.
  if (sp.get("group") === "1") {
    if (!market) return proxyFail(400, { error: "market is required" });
    const gqs = new URLSearchParams({ wallet, market, group: "1" });
    if (from) gqs.set("from", from);
    if (to) gqs.set("to", to);
    const response = await fetch(`${hop.baseUrl}/api/compound/timeline?${gqs.toString()}`, { headers: hop.headers });
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
    }
    const upstream = (await response.json()) as UpstreamGroupedTimeline<MvRow>;
    // A backend that predates the grouping answers the flat shape; reading
    // it as rows would draw a page of folders that are not folders.
    if (upstream.grouped !== true || !Array.isArray(upstream.rows)) {
      return proxyFail(502, {
        error: "Not grouped",
        code: "GROUPING_UNAVAILABLE",
        message: "This backend does not serve grouped timelines yet, so there are no folders to read.",
      });
    }
    const eventRows = upstream.rows.flatMap((r) => (r.kind === "event" ? [r.event] : []));
    const folders = upstream.rows.flatMap((r) => (r.kind === "folder" ? [r.folder] : []));
    // One ERC20 read behind the rows and one behind the folder headers,
    // run together: a header and the rows beneath it name a token alike.
    const [data, metas] = await Promise.all([
      buildCompoundTimeline(eventRows, wallet, market),
      resolveErc20Meta(compoundFolderTokenAddresses(folders)),
    ]);
    const rowPlan: TimelineRowPlanEntry[] = upstream.rows.map((r) =>
      r.kind === "event" ? { kind: "event" } : { kind: "folder", folder: compoundServedFolder(r.folder, metas) },
    );
    const body = {
      ...data,
      totalEvents: upstream.totalEvents,
      cutoffBlock: upstream.cutoffBlock ?? null,
      grouped: true as const,
      rowPlan,
      eventsServed: upstream.eventsServed,
      boundBy: upstream.boundBy,
      span: upstream.span ?? null,
    };
    return proxyOk(
      toTimelineWire(body, MAINNET_CHAIN_ID),
      [...metas.values()].some((m) => m.unresolved)
        ? { "Cache-Control": "no-store" }
        : timelineCacheHeaders(data.events, proxyCacheControl(response, LISTING_CACHE_CONTROL)),
    );
  }

  const qs = new URLSearchParams({ wallet });
  if (market) qs.set("market", market);
  if (recent) qs.set("recent", recent);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const url = `${hop.baseUrl}/api/compound/timeline?${qs.toString()}`;
  const response = await fetch(url, { headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const {
    rows,
    market: respMarket,
    totalEvents,
    truncated,
    cutoffBlock,
    span,
  } = (await response.json()) as TimelineRowsResponse;
  const data = await buildCompoundTimeline(rows, wallet, respMarket ?? null);
  // The ceiling and the window are different claims and both can be absent.
  // A windowed fetch is never truncated — it asked for a window and got one —
  // so `withRowCeiling` stays exactly as it was and simply never fires.
  const windowed = {
    ...withRowCeiling(data, { totalEvents, truncated }),
    cutoffBlock: cutoffBlock ?? null,
    span: span ?? null,
  };
  return proxyOk(
    toTimelineWire(windowed, MAINNET_CHAIN_ID),
    timelineCacheHeaders(data.events, proxyCacheControl(response, LISTING_CACHE_CONTROL)),
  );
}

/** Answers `/api/compound/timeline/summary`. */
export async function readCompoundOpeningBalance(sp: URLSearchParams, hop: SsrHop): Promise<ProxyAnswer<unknown>> {
  const wallet = sp.get("wallet");
  const cutoffBlock = sp.get("cutoffBlock");
  const market = sp.get("market")?.toLowerCase();
  if (!wallet) return proxyFail(400, { error: "wallet is required" });
  if (!cutoffBlock) return proxyFail(400, { error: "cutoffBlock is required" });
  if (!market || !COMPOUND_MARKETS[market]) {
    return proxyFail(400, { error: "market is required and must be a known Comet market" });
  }

  const qs = new URLSearchParams({ wallet, cutoffBlock, market });
  const url = `${hop.baseUrl}/api/compound/timeline/summary?${qs.toString()}`;
  const response = await fetch(url, { headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const upstream = (await response.json()) as UpstreamOpeningBalance;

  // Every token address the summary names, on either axis, in one multicall.
  // Market slugs are not addresses and never enter it.
  const keys = [...(upstream.byAsset ?? []).map((b) => b.key), ...(upstream.flows ?? []).map((f) => f.key)];
  const meta = await resolveErc20Meta(keys.filter(isTokenAddress));
  const opening = resolveOpeningAssetKeys(
    upstream,
    (key) => (isTokenAddress(key) ? meta.get(key.toLowerCase())?.symbol : COMPOUND_MARKETS[key]?.baseSymbol),
    // Undefined leaves the bucket's decimals null, which the page reads as
    // unknown and refuses to add — never as zero.
    (key) =>
      isTokenAddress(key)
        ? meta.get(key.toLowerCase())?.unresolved
          ? undefined
          : meta.get(key.toLowerCase())?.decimals
        : COMPOUND_MARKETS[key]?.baseDecimals,
  );

  // A token whose decimals did not load leaves its bucket's decimals null
  // (unknown, never added), and the answer is not kept.
  const unread = [...meta.values()].some((m) => m.unresolved);
  return proxyOk(
    opening,
    unread ? { "Cache-Control": "no-store" } : proxyCacheControl(response, LISTING_CACHE_CONTROL),
  );
}
