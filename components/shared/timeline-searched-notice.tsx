"use client";

// The cut-page notice (L11, ui-jobs 752 and 753): under a Size or Type filter,
// on a page holding fewer events than the history, one line saying what was
// searched — "Searched the latest 1,000 events. 27,179 older ones not
// searched." — and, where the page can read the rest, a control that loads
// them; the filters apply to what lands. Every family's timeline draws it.

import { INPLACE_TEXT, CARD_INSET_START } from "@/lib/shared/ui-grammar";
import { eventCountState } from "@/components/shared/timeline-toolbar";
import {
  searchedNotice,
  searchedNoticeText,
  type SearchedNotice,
  type TimelineLoadOlder,
} from "@/lib/shared/timeline-size";
import type { TimelineEventsState } from "@/hooks/useTimelineEvents";

/** The notice's numbers for this page, or null where it does not apply. */
export function timelineSearched(tl: TimelineEventsState): SearchedNotice | null {
  const state = eventCountState(tl);
  return searchedNotice({
    narrowed: tl.narrowed,
    totalCount: tl.totalCount,
    servedEventCount: tl.servedEventCount,
    // A month read states its own month; it is not a cut of the latest events.
    totalKnown: state.total !== "pending" && tl.historyWindow.state !== "span",
    totalIsFloor: state.total === "floor",
    windowUnread: tl.historyWindow.state === "pending" || tl.historyWindow.state === "failed",
  });
}

export function TimelineSearchedNotice({
  notice,
  loadOlder,
}: {
  notice: SearchedNotice;
  loadOlder?: TimelineLoadOlder;
}) {
  return (
    <p
      className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-rb-500 ${CARD_INSET_START}`}
      data-anatomy="L11"
      data-timeline-searched={notice.searched}
      data-timeline-not-searched={notice.older ?? "unknown"}
      data-prov-exempt=""
    >
      <span>{searchedNoticeText(notice)}</span>
      {loadOlder &&
        (loadOlder.state === "loading" ? (
          <span role="status">Loading the older events…</span>
        ) : (
          <button
            type="button"
            onClick={loadOlder.load}
            className={`${INPLACE_TEXT} rounded font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
            data-timeline-load-older=""
          >
            {loadOlder.state === "failed" ? "They did not load. Try again" : "Load the older events"}
          </button>
        ))}
    </p>
  );
}
