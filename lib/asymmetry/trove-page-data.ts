// Asymmetry's trove tail, read server-side. SERVER-ONLY — imported only from the
// trove page's server component. The shape, the failure rules and why this
// reads through /api/asymmetry/* rather than the backend directly all live in
// lib/shared/liquity-fork-trove-page-data.ts.

import { forkTroveTailLoader } from "@/lib/shared/liquity-fork-trove-page-data";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";
import { resolveBranch } from "@/lib/asymmetry/asset-catalog";
import { fetchAsymmetryTroves } from "@/lib/api/fetch-asymmetry-troves";
import { fetchAsymmetryTimeline } from "@/lib/api/fetch-asymmetry-timeline";
import type { AsymmetryTroveSummary } from "@/lib/sources/api/asymmetry-troves";

export const loadAsymmetryTroveTail = forkTroveTailLoader<AsymmetryTroveSummary>({
  label: "asymmetry",
  resolveBranch,
  fetchTroves: fetchAsymmetryTroves,
  fetchTimeline: fetchAsymmetryTimeline,
  recent: TIMELINE_WINDOW_EVENTS,
  openingPath: (collateralType, troveId) =>
    `/api/asymmetry/${encodeURIComponent(collateralType)}/${encodeURIComponent(troveId)}/timeline/summary`,
});
