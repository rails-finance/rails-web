// The MakerDAO proxy routes' reads, callable from a route handler and from
// the position page's loader alike (lib/shared/proxy-answer.ts). Each takes the
// proxy's query and a hop to the box, and answers what the route answers; the
// routes' header comments carry the argument for each shape. SERVER-ONLY.

import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildMakerVaultRows, type RawMakerVaultRow } from "@/lib/sources/api/makerdao-vaults";
import { buildMakerTimeline, type RawMakerTimelineResponse } from "@/lib/sources/api/makerdao-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { UpstreamGroupedTimeline } from "@/lib/sources/api/timeline-folder-wire";
import { makerServedFolder } from "@/lib/sources/api/lender-folder-wire";
import type { TimelineRowPlanEntry } from "@/lib/shared/timeline-folder";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";
import { resolveOpeningAssetKeys, type UpstreamOpeningBalance } from "@/lib/shared/timeline-opening-balance-wire";
import { proxyFail, proxyOk, type ProxyAnswer } from "@/lib/shared/proxy-answer";
import type { SsrHop } from "@/lib/shared/listing-ssr";
import { SHAPE_RUNS_PARAM } from "@/lib/shared/timeline-folder";

interface VaultsRawResponse {
  rows: RawMakerVaultRow[];
  total: number;
  limit: number;
  offset: number;
}

/** frob sub-keys → the client's composed labels, modulo the debt symbol. */
const FROB_LABELS: Record<string, string | ((debtSymbol: string) => string)> = {
  "frob:open": "Open Vault",
  "frob:lock-draw": "Deposit & Generate",
  "frob:lock-wipe": "Deposit & Repay",
  "frob:free-draw": "Withdraw & Generate",
  "frob:free-wipe": "Repay & Withdraw",
  "frob:lock": "Deposit",
  "frob:free": "Withdraw",
  "frob:draw": (sym) => `Generate ${sym}`,
  "frob:wipe": (sym) => `Repay ${sym}`,
  "frob:zero": "Adjust Vault",
};

/** Raw non-frob actions → the labels the transform gives them (the client
 *  keys those events by label too — all except `grab`, which keys as itself). */
const ACTION_LABELS: Record<string, string> = {
  "fork-out": "Move to Another Vault",
  "fork-in": "Move from Another Vault",
  give: "Ownership Transferred",
  "lse-kick": "Auction Started",
  "lse-take": "Auction Sale",
  "lse-remove": "Auction Settled",
};

/** Answers `/api/makerdao/vaults`. */
export async function readMakerVaults(
  sp: URLSearchParams,
  hop: SsrHop,
  signal?: AbortSignal,
): Promise<ProxyAnswer<unknown>> {
  const qs = new URLSearchParams();
  if (sp.get("cdpId")) qs.set("cdpId", sp.get("cdpId")!);
  if (sp.get("urn")) qs.set("urn", sp.get("urn")!);
  if (sp.get("owner")) qs.set("owner", sp.get("owner")!);
  if (sp.get("ilks")) qs.set("ilks", sp.get("ilks")!);
  if (sp.get("status")) qs.set("status", sp.get("status")!);
  if (sp.get("sortBy")) qs.set("sortBy", sp.get("sortBy")!);
  qs.set("sortOrder", sp.get("sortOrder") === "asc" ? "asc" : "desc");
  if (sp.get("limit") != null) qs.set("limit", sp.get("limit")!);
  if (sp.get("offset") != null) qs.set("offset", sp.get("offset")!);

  const url = `${hop.baseUrl}/api/makerdao/vaults?${qs.toString()}`;
  const response = await fetch(url, { signal, headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { success: false, error: `Backend error: ${response.statusText}` });
  }
  const raw = (await response.json()) as VaultsRawResponse;
  const data = buildMakerVaultRows(raw.rows);
  return proxyOk(
    {
      success: true,
      data,
      pagination: { total: raw.total, limit: raw.limit, offset: raw.offset },
    },
    proxyCacheControl(response, LISTING_CACHE_CONTROL),
  );
}

/** Answers `/api/makerdao/vault/[vaultId]/timeline`. */
export async function readMakerTimeline(
  vaultId: string,
  sp: URLSearchParams,
  hop: SsrHop,
): Promise<ProxyAnswer<unknown>> {
  // Passed straight through, validated upstream: rails-server owns the shape
  // of `recent` and answers a bad one with its own 400.
  const qs = new URLSearchParams();
  for (const k of ["recent", "from", "to"]) {
    const v = sp.get(k);
    if (v) qs.set(k, v);
  }
  const base = `${hop.baseUrl}/api/makerdao/vault/${encodeURIComponent(vaultId)}/timeline`;

  if (sp.get("group") === "1") {
    qs.delete("recent");
    qs.set("group", "1");
    qs.set(SHAPE_RUNS_PARAM, "1");
    const response = await fetch(`${base}?${qs.toString()}`, { headers: hop.headers });
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
    }
    const upstream = (await response.json()) as UpstreamGroupedTimeline<RawMakerTimelineResponse["rows"][number]> &
      Omit<RawMakerTimelineResponse, "rows">;
    // An unknown vault answers the flat empty shape; it has nothing to group.
    if (upstream.urn == null) {
      const empty = { ...buildMakerTimeline({ ...upstream, rows: [] }), cutoffBlock: null };
      return proxyOk(toTimelineWire(empty, MAINNET_CHAIN_ID), proxyCacheControl(response, LISTING_CACHE_CONTROL));
    }
    // A backend that predates the grouping answers the flat shape; reading it
    // as rows would draw a page of folders that are not folders.
    if (upstream.grouped !== true || !Array.isArray(upstream.rows)) {
      return proxyFail(502, {
        error: "Not grouped",
        code: "GROUPING_UNAVAILABLE",
        message: "This backend does not serve grouped timelines yet, so there are no folders to read.",
      });
    }
    const eventRows = upstream.rows.flatMap((r) => (r.kind === "event" ? [r.event] : []));
    // Each row's `is_open` says which one is the vault's opening frob.
    const result = buildMakerTimeline({ ...upstream, rows: eventRows });
    const rowPlan: TimelineRowPlanEntry[] = upstream.rows.map((r) =>
      r.kind === "event" ? { kind: "event" } : { kind: "folder", folder: makerServedFolder(r.folder, upstream.ilk) },
    );
    const body = {
      ...result,
      totalEvents: upstream.totalEvents,
      cutoffBlock: upstream.cutoffBlock ?? null,
      grouped: true as const,
      rowPlan,
      eventsServed: upstream.eventsServed,
      boundBy: upstream.boundBy,
      span: upstream.span ?? null,
    };
    return proxyOk(toTimelineWire(body, MAINNET_CHAIN_ID), proxyCacheControl(response, LISTING_CACHE_CONTROL));
  }

  const url = qs.toString() ? `${base}?${qs.toString()}` : base;
  const response = await fetch(url, { headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const raw = (await response.json()) as RawMakerTimelineResponse;
  const result = {
    ...buildMakerTimeline(raw),
    cutoffBlock: raw.cutoffBlock ?? null,
    span: (raw as { span?: { from: number; to: number } | null }).span ?? null,
  };
  return proxyOk(toTimelineWire(result, MAINNET_CHAIN_ID), proxyCacheControl(response, LISTING_CACHE_CONTROL));
}

/** Answers `/api/makerdao/vault/[vaultId]/timeline/summary`. */
export async function readMakerOpeningBalance(
  vaultId: string,
  sp: URLSearchParams,
  hop: SsrHop,
): Promise<ProxyAnswer<unknown>> {
  const cutoffBlock = sp.get("cutoffBlock");
  if (!cutoffBlock) return proxyFail(400, { error: "cutoffBlock is required" });

  const url = `${hop.baseUrl}/api/makerdao/vault/${encodeURIComponent(vaultId)}/timeline/summary?cutoffBlock=${encodeURIComponent(cutoffBlock)}`;
  const response = await fetch(url, { headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const upstream = (await response.json()) as UpstreamOpeningBalance & { ilk?: string | null };
  const debtSymbol = ilkDebtSymbol(upstream.ilk ?? "");
  const opening = resolveOpeningAssetKeys(upstream, () => undefined);
  opening.byAction = opening.byAction.map(({ key, count }) => {
    const frob = FROB_LABELS[key];
    const label = frob != null ? (typeof frob === "function" ? frob(debtSymbol) : frob) : ACTION_LABELS[key];
    return { key: label ?? key, count };
  });
  return proxyOk(opening, proxyCacheControl(response, LISTING_CACHE_CONTROL));
}
