// Ebisu's trove tail, read server-side. SERVER-ONLY — imported only from the
// trove page's server component. The shape, the failure rules and why this
// reads through /api/ebisu/* rather than the backend directly all live in
// lib/shared/liquity-fork-trove-page-data.ts.

import { forkTroveTailLoader } from "@/lib/shared/liquity-fork-trove-page-data";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";
import { resolveBranch } from "@/lib/ebisu/asset-catalog";
import { fetchEbisuTroves } from "@/lib/api/fetch-ebisu-troves";
import { fetchEbisuTimeline } from "@/lib/api/fetch-ebisu-timeline";
import type { EbisuTroveSummary } from "@/lib/sources/api/ebisu-troves";

export const loadEbisuTroveTail = forkTroveTailLoader<EbisuTroveSummary>({
  label: "ebisu",
  resolveBranch,
  fetchTroves: fetchEbisuTroves,
  fetchTimeline: fetchEbisuTimeline,
  recent: TIMELINE_WINDOW_EVENTS,
  openingPath: (collateralType, troveId) =>
    `/api/ebisu/${encodeURIComponent(collateralType)}/${encodeURIComponent(troveId)}/timeline/summary`,
});
