// f(x) Protocol's position tail, read server-side. SERVER-ONLY — imported only
// from the position page's server component. The shape and the failure rules
// live in lib/shared/position-tail-page-data.ts.
//
// One read, not two: /api/fx/position/<pool>/<id>/timeline answers with the
// position row AND its events, so there is no separate roster read for the
// shared loader to make.
//
// The two reads go to the BOX and run the proxy routes' shaping here, in the
// render (lib/fx/proxy-reads.ts), in place of a fetch of each route.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { boxOnlyHop } from "@/lib/shared/listing-ssr";
import { answerBody, answerTimeline } from "@/lib/shared/proxy-answer";
import { readFxOpeningBalance, readFxTimeline } from "@/lib/fx/proxy-reads";
import { TIMELINE_WINDOW_EVENTS, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";
import type { FxPoolKey } from "@/lib/fx/asset-catalog";
import type { FxTimelineResult } from "@/lib/sources/api/fx-timeline";

export const loadFxPositionTail = cache(async (pool: FxPoolKey, positionId: string) => {
  let position: FxTimelineResult["position"] | null = null;
  const tail = await loadPositionTail({
    label: "fx",
    readTimeline: async (baseUrl, headers) => {
      const res = answerTimeline<FxTimelineResult>(
        await readFxTimeline(pool, positionId, new URLSearchParams({ recent: String(TIMELINE_WINDOW_EVENTS) }), {
          baseUrl,
          headers,
        }),
        "readFxTimeline",
      );
      // Captured on the way past: the row rides the timeline response, and the
      // shared loader's contract is about events. A failed read never reaches
      // here, so this can only hold what the seeded events came with.
      position = res.position ?? null;
      return res;
    },
    readOpening: async (baseUrl, cutoffBlock, headers) =>
      answerBody(
        await readFxOpeningBalance(pool, positionId, new URLSearchParams({ cutoffBlock: String(cutoffBlock) }), {
          baseUrl,
          headers,
        }),
        "readFxOpeningBalance",
      ) as TimelineOpeningBalance,
    hop: boxOnlyHop,
  });
  return { ...tail, position: tail.events != null ? position : null };
});
