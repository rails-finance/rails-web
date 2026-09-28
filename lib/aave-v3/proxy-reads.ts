// The Aave V3 proxy routes' reads, callable from a route handler and from
// the position page's loader alike (lib/shared/proxy-answer.ts). Each takes the
// proxy's query and a hop to the box, and answers what the route answers; the
// routes' header comments carry the argument for each shape. SERVER-ONLY.

import type { AaveLaneInterest } from "@/lib/aave-v3/lane-interest";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { resolveEnsAddress } from "@/lib/ens/resolve-ens";
import { buildAaveV3PositionRows, type RawV3WalletRow } from "@/lib/sources/api/aave-v3-positions";
import { AAVE_V3_CATALOG } from "@/lib/aave-v3/asset-catalog";
import { timelineCacheHeaders } from "@/lib/shared/decimals-unread";
import { withRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { buildAaveV3Timeline, type MvRow } from "@/lib/sources/api/aave-v3-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { resolveErc20Meta } from "@/lib/sources/chain/erc20-meta";
import {
  folderLegAddresses,
  toServedFolder,
  type UpstreamGroupedTimeline,
} from "@/lib/sources/api/timeline-folder-wire";
import type { TimelineRowPlanEntry } from "@/lib/shared/timeline-folder";
import { resolveV3Tokens } from "@/lib/sources/chain/aave-v3-tokens";
import { resolveOpeningAssetKeys, type UpstreamOpeningBalance } from "@/lib/shared/timeline-opening-balance-wire";
import { proxyFail, proxyOk, type ProxyAnswer } from "@/lib/shared/proxy-answer";
import type { SsrHop } from "@/lib/shared/listing-ssr";

interface PositionsRawResponse {
  rows: RawV3WalletRow[];
  total: number;
  limit: number;
  offset: number;
}

// The filter chips are asset SYMBOLS; the rails route filters by token ADDRESS.
// Map here off the same catalog the chips are populated from (a symbol can map to
// more than one address across the listed/delisted long-tail — keep them all).
const SYMBOL_TO_ADDRESSES = new Map<string, string[]>();
for (const a of AAVE_V3_CATALOG) {
  const list = SYMBOL_TO_ADDRESSES.get(a.symbol) ?? [];
  list.push(a.address.toLowerCase());
  SYMBOL_TO_ADDRESSES.set(a.symbol, list);
}

const csv = (v: string | null): string[] => (v ?? "").split(",").filter(Boolean);

function symbolsToAddresses(symbols: string[]): string[] {
  const out = new Set<string>();
  for (const s of symbols) for (const addr of SYMBOL_TO_ADDRESSES.get(s) ?? []) out.add(addr);
  return [...out];
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
  /** The span `?from=`/`?to=` asked for, echoed in unix seconds. Null (or
   *  absent, on a backend that predates it) means no span was asked for. A
   *  span answer always carries `cutoffBlock: null`: a stretch in the middle
   *  of a history is not the newest slice of anything, so it brings nothing
   *  forward. */
  span?: { from: number; to: number } | null;
}

/** Answers `/api/aave-v3/positions`. */
export async function readAaveV3Positions(
  sp: URLSearchParams,
  hop: SsrHop,
  signal?: AbortSignal,
): Promise<ProxyAnswer<unknown>> {
  let wallet = sp.get("wallet") ?? undefined;
  const ownerEns = sp.get("ownerEns");
  if (ownerEns && !wallet) {
    const resolved = await resolveEnsAddress(ownerEns);
    if (resolved) wallet = resolved;
  }

  const qs = new URLSearchParams();
  if (wallet) qs.set("wallet", wallet);
  if (sp.get("hasDebt") === "true") qs.set("hasDebt", "true");
  if (sp.get("noDebt") === "true") qs.set("noDebt", "true");
  if (sp.get("hasLiquidations") === "true") qs.set("hasLiquidations", "true");
  if (sp.get("hasLiquidations") === "false") qs.set("hasLiquidations", "false");
  if (sp.get("market")) qs.set("market", sp.get("market")!);
  // Lifecycle Status facet — rails-server filters mv_aave_v3_wallet_markets.status
  // (mig 105; whole-lifecycle). Absent = the whole lifecycle (a cleared chip).
  if (sp.get("status")) qs.set("status", sp.get("status")!);
  const supplyAddrs = symbolsToAddresses(csv(sp.get("supplyAssets")));
  const borrowAddrs = symbolsToAddresses(csv(sp.get("borrowAssets")));
  if (supplyAddrs.length) qs.set("supplyAssets", supplyAddrs.join(","));
  if (borrowAddrs.length) qs.set("borrowAssets", borrowAddrs.join(","));
  // Allowlist, like sortOrder: an unrecognised value is dropped rather than
  // forwarded verbatim, so rails-server's own default (recent) decides it —
  // same "unrecognised ⇒ default, no error" stance the route takes throughout.
  const sortBy = sp.get("sortBy");
  if (sortBy === "debt" || sortBy === "coll") qs.set("sortBy", sortBy);
  qs.set("sortOrder", sp.get("sortOrder") === "asc" ? "asc" : "desc");
  if (sp.get("limit") != null) qs.set("limit", sp.get("limit")!);
  if (sp.get("offset") != null) qs.set("offset", sp.get("offset")!);

  const url = `${hop.baseUrl}/api/aave-v3/positions?${qs.toString()}`;
  const response = await fetch(url, { signal, headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const raw = (await response.json()) as PositionsRawResponse;
  const rows = await buildAaveV3PositionRows(raw.rows);
  return proxyOk(
    { rows, total: raw.total, limit: raw.limit, offset: raw.offset },
    proxyCacheControl(response, LISTING_CACHE_CONTROL),
  );
}

/** Answers `/api/aave-v3/timeline`. */
export async function readAaveV3Timeline(sp: URLSearchParams, hop: SsrHop): Promise<ProxyAnswer<unknown>> {
  const wallet = sp.get("wallet");
  if (!wallet) return proxyFail(400, { error: "wallet is required" });
  const market = sp.get("market");
  // Passed straight through, validated upstream: rails-server owns the shape of
  // `recent` and answers a bad one with its own 400. Re-validating it here
  // would be a second opinion about the same parameter, and the two would drift.
  const recent = sp.get("recent");
  // `?from=`/`?to=` — the OTHER window, a span of time in unix seconds, for a
  // reader who pointed at one month or one day in the middle of the history
  // rather than at its newest end. Passed straight through for the same reason
  // `recent` is: rails-server owns the shape of both, refuses them together,
  // and answers a bad one with its own 400. Under `group` it names the
  // segment (below).
  const from = sp.get("from");
  const to = sp.get("to");
  const grouped = sp.get("group") === "1";

  if (grouped) {
    // `recent` is deliberately NOT composed with `group`: under grouping the
    // two bounds are the route's own (a row cap and an event scan bound,
    // whichever binds first), because a caller cannot know how many events
    // fill a thousand rows on this particular position.
    const marketParam = market ? `&market=${encodeURIComponent(market)}` : "";
    // A SPAN is composed with `group`: the month picker's read (decision
    // 0019, amendment 2026-09-24) is the segment grouped the same way the
    // newest window is. Each end forwarded independently, as below. An api
    // that predates the grouped span answers the newest window with no
    // `span` on it, and the page reads the segment flat instead.
    const spanParam = (from ? `&from=${encodeURIComponent(from)}` : "") + (to ? `&to=${encodeURIComponent(to)}` : "");
    // `swaps=1`: both legs of a paired position swap arrive marked, and the
    // transform draws them as one card (rails-ops TO-DO-ui-jobs §15).
    const url = `${hop.baseUrl}/api/aave-v3/timeline?wallet=${encodeURIComponent(wallet)}${marketParam}${spanParam}&group=1&swaps=1`;
    const response = await fetch(url, { headers: hop.headers });
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
    }
    const upstream = (await response.json()) as UpstreamGroupedTimeline<MvRow> & { laneInterest?: AaveLaneInterest[] };
    // A backend that predates the grouping answers `?group=1` with the FLAT
    // shape — same 200, rows of raw MV rows rather than wire rows. Saying so
    // is the whole point: a caller that cannot tell "not deployed yet" from
    // "this position has no folders" would report a green run for a feature
    // that never ran. The SparkLend twin carries the argument in full.
    if (upstream.grouped !== true || !Array.isArray(upstream.rows)) {
      return proxyFail(502, {
        error: "Not grouped",
        code: "GROUPING_UNAVAILABLE",
        message: "This backend does not serve grouped timelines yet, so there are no folders to read.",
      });
    }
    const eventRows = upstream.rows.flatMap((r) => (r.kind === "event" ? [r.event] : []));
    // ONE resolver behind both halves of the answer, exactly as the flat
    // branch has one behind its rows: a folder header and the rows beneath
    // it must never disagree about what a symbol is.
    const [data, legMetas] = await Promise.all([
      buildAaveV3Timeline(eventRows, wallet),
      resolveErc20Meta(folderLegAddresses(upstream.rows)),
    ]);
    const resolve = {
      symbol: (key: string) => legMetas.get(key)?.symbol,
      decimals: (key: string) => (legMetas.get(key)?.unresolved ? undefined : legMetas.get(key)?.decimals),
    };
    const rowPlan: TimelineRowPlanEntry[] = upstream.rows.map((r) =>
      r.kind === "event" ? { kind: "event" } : { kind: "folder", folder: toServedFolder(r.folder, resolve) },
    );
    const body = {
      ...data,
      // The position's own count, not this answer's — the same meaning it
      // carries on the flat branch.
      totalEvents: upstream.totalEvents,
      cutoffBlock: upstream.cutoffBlock ?? null,
      grouped: true as const,
      rowPlan,
      eventsServed: upstream.eventsServed,
      boundBy: upstream.boundBy,
      span: upstream.span ?? null,
      // The lifetime interest per lane (decision 0033); absent from an api
      // that predates it.
      laneInterest: upstream.laneInterest ?? null,
    };
    // A leg whose decimals did not load is left off its folder header; the
    // answer is then not kept, like a row carrying one.
    const legsUnread = [...legMetas.values()].some((m) => m.unresolved);
    return proxyOk(
      toTimelineWire(body, MAINNET_CHAIN_ID),
      legsUnread
        ? { "Cache-Control": "no-store" }
        : timelineCacheHeaders(data.events, proxyCacheControl(response, LISTING_CACHE_CONTROL)),
    );
  }

  const marketQs = market ? `&market=${encodeURIComponent(market)}` : "";
  const recentQs = recent ? `&recent=${encodeURIComponent(recent)}` : "";
  // Each end forwarded independently, so a half span reaches upstream and
  // gets upstream's own "from and to are given together or not at all"
  // rather than being silently completed or silently dropped here.
  const spanQs = (from ? `&from=${encodeURIComponent(from)}` : "") + (to ? `&to=${encodeURIComponent(to)}` : "");
  const url = `${hop.baseUrl}/api/aave-v3/timeline?wallet=${encodeURIComponent(wallet)}${marketQs}${recentQs}${spanQs}&swaps=1`;
  const response = await fetch(url, { headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const { rows, totalEvents, truncated, cutoffBlock, span, laneInterest } =
    (await response.json()) as TimelineRowsResponse & {
      laneInterest?: AaveLaneInterest[];
    };
  const data = await buildAaveV3Timeline(rows, wallet);
  // The ceiling and the window are different claims and both can be absent.
  // A windowed fetch is never truncated — it asked for a window and got one —
  // so `withRowCeiling` stays exactly as it was and simply never fires.
  const windowed = {
    ...withRowCeiling(data, { totalEvents, truncated }),
    cutoffBlock: cutoffBlock ?? null,
    span: span ?? null,
    laneInterest: laneInterest ?? null,
  };
  return proxyOk(
    toTimelineWire(windowed, MAINNET_CHAIN_ID),
    timelineCacheHeaders(data.events, proxyCacheControl(response, LISTING_CACHE_CONTROL)),
  );
}

/** Answers `/api/aave-v3/timeline/summary`. */
export async function readAaveV3OpeningBalance(sp: URLSearchParams, hop: SsrHop): Promise<ProxyAnswer<unknown>> {
  const wallet = sp.get("wallet");
  const cutoffBlock = sp.get("cutoffBlock");
  if (!wallet) return proxyFail(400, { error: "wallet is required" });
  if (!cutoffBlock) return proxyFail(400, { error: "cutoffBlock is required" });
  const market = sp.get("market");

  // `swaps=1` as on /timeline: a paired swap is one event below the cut too.
  const qs = new URLSearchParams({ wallet, cutoffBlock, swaps: "1" });
  if (market) qs.set("market", market);
  const url = `${hop.baseUrl}/api/aave-v3/timeline/summary?${qs.toString()}`;
  const response = await fetch(url, { headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const upstream = (await response.json()) as UpstreamOpeningBalance;

  // Every address the summary names, on either axis, resolved in one batch.
  const addresses = [...(upstream.byAsset ?? []).map((b) => b.key), ...(upstream.flows ?? []).map((f) => f.key)];
  const meta = await resolveV3Tokens(addresses);
  const opening = resolveOpeningAssetKeys(
    upstream,
    (addr) => meta.get(addr.toLowerCase())?.symbol,
    (addr) => (meta.get(addr.toLowerCase())?.unresolved ? undefined : meta.get(addr.toLowerCase())?.decimals),
  );

  // A token whose decimals did not load leaves its bucket's decimals null
  // (unknown, never added), and the answer is not kept.
  const unread = [...meta.values()].some((m) => m.unresolved);
  return proxyOk(
    opening,
    unread ? { "Cache-Control": "no-store" } : proxyCacheControl(response, LISTING_CACHE_CONTROL),
  );
}
