// f(x) Protocol's position tail, read server-side. SERVER-ONLY — imported only
// from the position page's server component. The shape and the failure rules
// live in lib/shared/position-tail-page-data.ts.
//
// One read, not two: /api/fx/position/<pool>/<id>/timeline answers with the
// position row AND its events, so there is no separate roster read for the
// shared loader to make.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { fetchFxTimeline } from "@/lib/api/fetch-fx-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";
import type { FxPoolKey } from "@/lib/fx/asset-catalog";
import type { FxTimelineResult } from "@/lib/sources/api/fx-timeline";

export const loadFxPositionTail = cache(async (pool: FxPoolKey, positionId: string) => {
  let position: FxTimelineResult["position"] | null = null;
  const tail = await loadPositionTail({
    label: "fx",
    readTimeline: async (baseUrl, headers) => {
      const res = await fetchFxTimeline(pool, positionId, { recent: TIMELINE_WINDOW_EVENTS, baseUrl, headers });
      // Captured on the way past: the row rides the timeline response, and the
      // shared loader's contract is about events. A failed read never reaches
      // here, so this can only hold what the seeded events came with.
      position = res.position ?? null;
      return res;
    },
    readOpening: (baseUrl, cutoffBlock, headers) =>
      fetchTimelineOpeningBalance({
        path: `/api/fx/position/${pool}/${encodeURIComponent(positionId)}/timeline/summary`,
        params: {},
        cutoffBlock,
        baseUrl,
        headers,
      }),
  });
  return { ...tail, position: tail.events != null ? position : null };
});
