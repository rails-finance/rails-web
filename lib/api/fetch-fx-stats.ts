// ============================================================================
// FETCH FX POOL STATS
// ============================================================================
//
// Per-pool aggregates for the /fx listing header band. Served by the LIVE
// rails-server index (fx_pool_state + roster counts); totals are the settled
// sweep's pool-wide reads at one named head block. Tolerant by design: the
// band is decorative context, so failures resolve to [] and the listing
// renders without it rather than erroring the page.

import { buildFxPoolStats, type FxPoolStatsSummary, type RawFxPoolStats } from "@/lib/sources/api/fx-stats";

export async function fetchFxPoolStats(p?: { baseUrl?: string; headers?: HeadersInit }): Promise<FxPoolStatsSummary[]> {
  try {
    const res = await fetch(`${p?.baseUrl ?? ""}/api/fx/stats`, { cache: "no-store", headers: p?.headers });
    if (!res.ok) return [];
    const json = (await res.json()) as { pools?: RawFxPoolStats[] };
    return buildFxPoolStats(json.pools ?? []);
  } catch {
    return [];
  }
}
