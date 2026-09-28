// The month read on a replay-served Base page (Aave V3 Base, Seamless,
// Moonwell Base): the reads `useTimelineSegment` takes, over the page's
// `/api/chain/<proto>/timeline` route, and the figures the route's grouped
// answer adds for the Date panel's grid (lib/shared/replay-grouped-answer.ts).

import type { SegmentGroupedAnswer } from "@/hooks/useTimelineSegment";
import type { GroupedTimelineFields } from "@/lib/shared/timeline-folder";
import type { OpeningBucket } from "@/lib/shared/timeline-opening-balance";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { fetchChainTimeline } from "@/lib/api/fetch-chain-timeline";

/** What a grouped replay answer carries beside its rows. */
export type ReplayGroupedFields = Partial<GroupedTimelineFields> & {
  /** The served history below the preload, per UTC day. */
  belowByDay?: OpeningBucket[] | null;
  cutoffBlock?: number | null;
};

/** The two reads for `useTimelineSegment`. The route groups every span it
 *  reads, so there is no flat span read: a history the index cannot vouch for
 *  is swept and answered flat, and the rows the page holds stay. */
export function replaySegmentReads(route: string, wallet: string) {
  return {
    // A span answer carries its rows and the span, not the replay's envelope
    // (lib/shared/replay-grouped-answer.ts `replayGroupedBody`).
    readGrouped: async (span: [number, number], signal: AbortSignal): Promise<SegmentGroupedAnswer> =>
      (await fetchChainTimeline({
        wallet,
        route,
        mark: "replay-segment",
        params: { group: "1", from: String(span[0]), to: String(span[1]) },
        signal,
      })) as unknown as SegmentGroupedAnswer,
    readFlat: (): Promise<{ events: BaseActivityEvent[] }> =>
      Promise.reject(new Error("This route reads a month only in folders")),
  };
}

/** Events of the life no day count covers: what the replay's `omitted`
 *  counts beyond the days it sent (a seed's rows). */
export function eventsBelowLife(omitted: number | undefined, belowByDay: readonly OpeningBucket[] | null | undefined) {
  let counted = 0;
  for (const b of belowByDay ?? []) counted += b.count;
  return Math.max(0, (omitted ?? 0) - counted);
}
