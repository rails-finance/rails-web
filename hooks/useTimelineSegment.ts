"use client";

// useTimelineSegment — the month read a served timeline page shares
// (decision 0019, amendments 2026-09-24 and 2026-09-25). The preload (the
// newest rows, their folders and the opening balance) stays the page's
// whole-history record: the tower, the export and the life the Date panel's
// grid draws all read it. The TIMELINE alone swaps to a segment when a month
// the loaded rows do not hold is picked; a segment brings no opening balance,
// so its lifetime figures are absent and the count line states its month in
// time. What the preload could carry is learned from the answer (`boundBy`)
// and never assumed.
//
// A page hands over its family's two span reads (grouped, and flat for an api
// that predates the grouped span) and its folder route; the hook owns the
// segment state, calls `useTimelineEvents` over whichever rows are on the
// page, and returns the `segments` prop `ChainTruthTimeline` draws the grid
// from. Lifted out of the Aave V3 mainnet page, whose behaviour it keeps.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { OpeningBucket, TimelineOpeningBalance, TimelineWindow } from "@/lib/shared/timeline-opening-balance";
import {
  interleaveRowPlan,
  type GroupedTimelineFields,
  type ServedFolder,
  type ServedTimelineRow,
} from "@/lib/shared/timeline-folder";
import { lifeDayCounts, lifeExtent, planSegmentAsk, segmentSpan, trimToNewest } from "@/lib/shared/timeline-segments";
import { fetchTimelineFolderMembers } from "@/lib/api/fetch-timeline-folder";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import type { TimelineSegments } from "@/components/shared/chain-truth-timeline";

/** A grouped answer as the hook reads it: the family's fetch result, which
 *  echoes the `span` it was asked for on an api that groups a segment. */
export type SegmentGroupedAnswer = GroupedTimelineFields & {
  events: BaseActivityEvent[];
  cutoffBlock?: number | null;
  span?: { from: number; to: number } | null;
};

export interface TimelineSegmentOptions {
  /** The preload's events, narrowed to the family (`isEvent`). */
  events: BaseActivityEvent[];
  /** The preload's grouped answer, null on a flat page. */
  groupedTail: GroupedTimelineFields | null;
  /** The preload as rows, and its folders whole and unfiltered. */
  servedRows: ServedTimelineRow<BaseActivityEvent>[] | undefined;
  servedFolders: readonly ServedFolder[] | null;
  opening: TimelineOpeningBalance | null;
  /** A page with no opening balance (the Base replays): the served history
   *  below the preload per UTC day, which the replay's route counts
   *  (`belowByDay`), so the grid draws those months and a click reads them. */
  lifeBelow?: readonly OpeningBucket[] | null;
  /** Events of the life that no day count covers — a Base seed's rows, which
   *  travel as state — numbered before every counted day. */
  eventsBelowLife?: number;
  /** At rest, the events below the preload on a page with no opening
   *  balance (`coverage.omitted.count`), so numbering runs over the whole
   *  history. */
  olderCount?: number;
  historyWindow: TimelineWindow;
  /** The rows one month read carries, where the preload's own row count is
   *  not it: a page whose timelines share one preload (Compound V3 Base's
   *  markets) trims each below the cap its month read answers with. Absent,
   *  the preload's `boundBy` teaches it. */
  spanCap?: number | null;
  /** The family's event guard; a segment's events pass through it as the
   *  preload's did. */
  isEvent: (e: BaseActivityEvent) => boolean;
  /** `/timeline?group=1&from=&to=` for this position. */
  readGrouped: (span: [number, number], signal: AbortSignal) => Promise<SegmentGroupedAnswer>;
  /** `/timeline?from=&to=` for this position, flat. */
  readFlat: (span: [number, number]) => Promise<{ events: BaseActivityEvent[] }>;
  /** The family's folder proxy route and the params that name the position. */
  folderPath: string;
  folderParams: Record<string, string>;
  storageKey: string;
  protocolKey: string;
  /** False on a page tied to its Lifetime flows chart: no date range
   *  (`useTimelineEvents`'s `dates`). */
  dates?: boolean;
}

export function useTimelineSegment(o: TimelineSegmentOptions) {
  const { events, groupedTail, servedRows, servedFolders, opening, historyWindow, isEvent } = o;
  // The reads change identity on every render; the latest is what a click
  // uses, and the callbacks below keep theirs.
  const reads = useRef({ readGrouped: o.readGrouped, readFlat: o.readFlat });
  useEffect(() => {
    reads.current = { readGrouped: o.readGrouped, readFlat: o.readFlat };
  });

  const { lifeBelow } = o;
  const lifeDays = useMemo(() => {
    const days = lifeDayCounts(events, servedFolders, opening);
    for (const b of lifeBelow ?? []) {
      const ts = Number(b.key);
      if (Number.isFinite(ts)) days.set(ts, (days.get(ts) ?? 0) + b.count);
    }
    return days;
  }, [events, servedFolders, opening, lifeBelow]);
  const preloadCap = o.spanCap ?? (groupedTail?.boundBy === "rows" ? groupedTail.rowPlan.length : null);
  const [segment, setSegment] = useState<{
    monthIdx: number;
    asked: { from: number; to: number };
    events: BaseActivityEvent[];
    grouped: SegmentGroupedAnswer | null;
    /** Where the served rows open when the ask was cut to the preload, by
     *  the index (`boundBy: "rows"`) or by the page trimming a flat answer. */
    cutAt: number | null;
  } | null>(null);
  const [segmentLoading, setSegmentLoading] = useState<number | null>(null);
  const segmentRead = useRef<AbortController | null>(null);
  // Whether the api groups a segment. Learned from the first answer: one that
  // predates the grouped span answers the newest window with no `span` on it,
  // and from then on the page reads segments flat.
  const apiGroupsSpans = useRef<boolean | null>(null);
  const loadSegment = useCallback(
    async (monthIdx: number) => {
      const ask = planSegmentAsk(monthIdx, lifeDays, preloadCap);
      segmentRead.current?.abort();
      const ac = new AbortController();
      segmentRead.current = ac;
      setSegmentLoading(monthIdx);
      try {
        const span: [number, number] = [ask.from, ask.to];
        if (apiGroupsSpans.current !== false) {
          const grouped = await reads.current.readGrouped(span, ac.signal);
          if (grouped.span && grouped.span.from === ask.from && grouped.span.to === ask.to) {
            apiGroupsSpans.current = true;
            let cutAt: number | null = null;
            if (grouped.cutoffBlock != null) {
              cutAt = Infinity;
              for (const e of grouped.events) if (e.timestamp < cutAt) cutAt = e.timestamp;
              for (const r of grouped.rowPlan)
                if (r.kind === "folder" && r.folder.firstAt < cutAt) cutAt = r.folder.firstAt;
              if (!Number.isFinite(cutAt)) cutAt = null;
            }
            setSegment({ monthIdx, asked: ask, events: grouped.events, grouped, cutAt });
            return;
          }
          apiGroupsSpans.current = false;
        }
        const flat = await reads.current.readFlat(span);
        const kept = trimToNewest(flat.events, preloadCap);
        const cutAt = kept.length < flat.events.length && kept.length > 0 ? kept[0].timestamp : null;
        setSegment({ monthIdx, asked: ask, events: kept, grouped: null, cutAt });
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        // The rows the page holds stay; the month stays where it was.
      } finally {
        if (segmentRead.current === ac) {
          segmentRead.current = null;
          setSegmentLoading(null);
        }
      }
    },
    [lifeDays, preloadCap],
  );
  const segmentEvents = useMemo(() => (segment ? segment.events.filter(isEvent) : null), [segment, isEvent]);
  const segmentRows = useMemo(
    () => (segment?.grouped && segmentEvents ? interleaveRowPlan(segment.grouped.rowPlan, segmentEvents) : undefined),
    [segment, segmentEvents],
  );
  const segmentWindow = useMemo<TimelineWindow | null>(() => {
    if (!segment) return null;
    const span = segmentSpan(segment.monthIdx, segment.asked, segment.cutAt, lifeDays);
    return span ? { state: "span", cutoffBlock: null, opening: null, span } : null;
  }, [segment, lifeDays]);
  const timelineWindow = segmentWindow ?? historyWindow;
  const spanFrom = segment?.grouped ? String(segment.asked.from) : undefined;
  const spanTo = segment?.grouped ? String(segment.asked.to) : undefined;

  const { folderPath } = o;
  const folderParamsKey = JSON.stringify(o.folderParams);
  const readFolderMembers = useCallback(
    (ask: { event?: string; folder?: string }) =>
      fetchTimelineFolderMembers({
        path: folderPath,
        params: {
          ...(JSON.parse(folderParamsKey) as Record<string, string>),
          ...(spanFrom != null && spanTo != null ? { from: spanFrom, to: spanTo } : {}),
        },
        ...ask,
      }),
    // The two strings are the whole of the span's identity.
    [folderPath, folderParamsKey, spanFrom, spanTo],
  );

  const tl = useTimelineEvents(segmentEvents ?? events, {
    storageKey: o.storageKey,
    protocolKey: o.protocolKey,
    window: timelineWindow,
    servedRows: segment ? segmentRows : servedRows,
    eventsServed: segment ? (segment.grouped?.eventsServed ?? segment.events.length) : groupedTail?.eventsServed,
    olderCount:
      segmentWindow?.state === "span"
        ? segmentWindow.span.eventsBefore + (o.eventsBelowLife ?? 0)
        : segment
          ? 0
          : (o.olderCount ?? 0),
    dates: o.dates,
  });
  const { setDateRange } = tl;
  const pickMonth = useCallback(
    (monthIdx: number) => {
      // Picking a month replaces the segment; a date typed within the old
      // one does not carry over.
      setDateRange(null);
      void loadSegment(monthIdx);
    },
    [setDateRange, loadSegment],
  );
  const resetSegment = useCallback(() => {
    segmentRead.current?.abort();
    setSegmentLoading(null);
    setDateRange(null);
    setSegment(null);
  }, [setDateRange]);
  const hasLife = useMemo(() => lifeExtent(lifeDays) != null, [lifeDays]);
  const segments = useMemo<TimelineSegments | undefined>(
    () =>
      groupedTail && hasLife
        ? {
            lifeDays,
            month: segment?.monthIdx ?? null,
            loading: segmentLoading,
            onPick: pickMonth,
            onReset: segment ? resetSegment : null,
          }
        : undefined,
    [groupedTail, hasLife, lifeDays, segment, segmentLoading, pickMonth, resetSegment],
  );

  return { tl, segments, readFolderMembers };
}
