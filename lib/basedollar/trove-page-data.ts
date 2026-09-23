// Basedollar's trove tail, read server-side. SERVER-ONLY — imported only from the
// trove page's server component. The shape, the failure rules and why this
// reads through /api/basedollar/* rather than the backend directly all live in
// lib/shared/liquity-fork-trove-page-data.ts.

import { forkTroveTailLoader } from "@/lib/shared/liquity-fork-trove-page-data";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";
import { resolveBranch } from "@/lib/basedollar/asset-catalog";
import { fetchBasedollarTroves } from "@/lib/api/fetch-basedollar-troves";
import { fetchBasedollarTimeline } from "@/lib/api/fetch-basedollar-timeline";
import type { BasedollarTroveSummary } from "@/lib/sources/api/basedollar-troves";

export const loadBasedollarTroveTail = forkTroveTailLoader<BasedollarTroveSummary>({
  label: "basedollar",
  resolveBranch,
  fetchTroves: fetchBasedollarTroves,
  fetchTimeline: fetchBasedollarTimeline,
  recent: TIMELINE_WINDOW_EVENTS,
  openingPath: (collateralType, troveId) =>
    `/api/basedollar/${encodeURIComponent(collateralType)}/${encodeURIComponent(troveId)}/timeline/summary`,
});
