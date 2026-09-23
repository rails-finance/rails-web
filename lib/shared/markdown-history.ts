// The Markdown snapshot's scope — one statement of it for every protocol's
// serializer.
// ----------------------------------------------------------------------------
// The snapshot used to end with one table row per event: 104,015 of them on the
// deepest Aave V3 wallet, 50,000 before the timeline window bounded the page.
// That is not something an LLM can read, and it is not what the export is for —
// the snapshot's job is to state the position. So the transcript is bounded to
// the most recent MARKDOWN_EVENT_ROWS and the heading says how many events the
// position actually has, rather than passing the kept rows off as the whole
// history. The CSV is where the rows belong.
//
// The same parameter carries the two whole-history facts a windowed page cannot
// read off its own event array — the position's first event and its total event
// count. Without them a bounded snapshot would state the window's opening date
// as the position's, which is the claim this programme exists to remove.

//
// A GROUPED page's `events` is not a contiguous tail. Where the index served
// folders (decision 0019's evening amendment), the members sit inside them and
// never reach the array — so `events` is a SUBSET of the history above the cut,
// not its end. Both claims this module makes therefore take the folders too:
// the total counts the members, and the transcript stops calling its rows the
// most recent N, because they are the most recent N it can list.
//
//   rails-ops/decisions/0019-timeline-boundary-card.md

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { TimelineWindow } from "@/lib/shared/timeline-opening-balance";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import { earliestHeldTimestamp, folderMembers } from "@/lib/shared/timeline-folder-reductions";

/** Event rows a Markdown snapshot carries. The rest are summarised above. */
export const MARKDOWN_EVENT_ROWS = 50;

/** Passed by a page whose `events` is a window over a longer history. Absent
 *  means `events` IS the whole history and answers for itself. */
export type MarkdownHistoryScope = {
  /** Every event the position has, not only the ones in `events`. Null when
   *  the page drew a window but the opening balance did not arrive — then the
   *  snapshot states what it lists and says the rest is not summarised, rather
   *  than presenting the window's length as the position's. */
  totalEvents: number | null;
  /** The position's first event, from the declared opening balance. Null when
   *  the window failed to open — then the snapshot states no tenure at all,
   *  rather than the window's own first row. */
  firstTimestamp: number | null;
  /** Events the page holds only as folder aggregates, counted in `totalEvents`
   *  and absent from `events`. Zero on an ungrouped page, and where it is not
   *  zero the listed rows are not the history's last N. */
  folderMembers: number;
};

type SliceOptions = {
  /** Heading used when nothing is omitted. Default "Activity timeline". */
  title?: string;
  /** Noun for one event — "row" where a protocol's timeline is not 1:1. */
  unit?: string;
  /** Trailing clause inside the parentheses, e.g. ", all markets". */
  suffix?: string;
};

const n = (v: number) => v.toLocaleString("en-US");

/** The rows a snapshot lists, the heading that declares what it left out, and
 *  the absolute number of the first row so the `#` column matches the page. */
export function markdownTimelineSlice<T extends BaseActivityEvent>(
  events: T[],
  history: MarkdownHistoryScope | undefined,
  opts: SliceOptions = {},
): { rows: T[]; heading: string; firstIndex: number } {
  const { title = "Activity timeline", unit = "event", suffix = "" } = opts;
  const rows = events.length > MARKDOWN_EVENT_ROWS ? events.slice(-MARKDOWN_EVENT_ROWS) : events;
  const plural = (v: number) => `${unit}${v === 1 ? "" : "s"}`;
  // A window whose opening balance never arrived knows its own rows and
  // nothing else. It says so: no total, and the numbering is local to what is
  // listed rather than a position in a history whose length is unknown.
  if (history && history.totalEvents == null) {
    return {
      rows,
      heading:
        `## Recent activity (last ${n(rows.length)} ${plural(rows.length)}, oldest first${suffix}` +
        ` — the earlier events are neither listed nor summarised here)`,
      firstIndex: 1,
    };
  }
  // The window can never hold more than the history it is drawn from; if a
  // caller's total disagrees, the events in hand are the floor.
  const total = Math.max(history?.totalEvents ?? events.length, events.length);
  // A grouped page lists the rows it HOLDS. Its folders' members are not in
  // `events`, so these are not the history's last N and their absolute places
  // in it are unknown: the heading says so, and the numbering is local to what
  // is listed rather than claiming positions at the end of the history.
  if (history && history.folderMembers > 0) {
    return {
      rows,
      heading:
        `## Recent activity (${n(rows.length)} of ${n(total)} ${plural(total)}, oldest first${suffix}` +
        ` — the ${n(history.folderMembers)} ${plural(history.folderMembers)} inside collapsed groups are not listed)`,
      firstIndex: 1,
    };
  }
  const heading =
    rows.length < total
      ? `## Recent activity (last ${n(rows.length)} of ${n(total)} ${plural(total)}, oldest first${suffix})`
      : `## ${title} (${n(total)} ${plural(total)}, oldest first${suffix})`;
  return { rows, heading, firstIndex: total - rows.length + 1 };
}

/** Every event the position has — the window's own length only where the page
 *  loaded the whole history. */
export function markdownTotalEvents(
  events: BaseActivityEvent[],
  history: MarkdownHistoryScope | undefined,
): number | null {
  if (history && history.totalEvents == null) return null;
  return Math.max(history?.totalEvents ?? events.length, events.length);
}

/** The position's first event. A windowed page reads it off the opening
 *  balance; everywhere else the event array's own head is the answer. Null is
 *  an omission — the caller states no date rather than the window's. */
export function markdownFirstTimestamp(
  events: BaseActivityEvent[],
  history: MarkdownHistoryScope | undefined,
): number | null {
  return history ? history.firstTimestamp : (events[0]?.timestamp ?? null);
}

/** The scope a windowed page hands its Markdown serializer, from the window
 *  itself — so the snapshot's totals and tenure come from the same source as
 *  the page's own, and cannot drift from them.
 *
 *  A whole-history page passes nothing: its events answer for themselves. A
 *  window whose opening balance never arrived passes an unknown total and no
 *  first event, which is what the page shows on screen. */
export function markdownHistoryScope(
  window: TimelineWindow | undefined,
  events: BaseActivityEvent[],
  folders?: readonly ServedFolder[] | null,
): MarkdownHistoryScope | undefined {
  const members = folderMembers(folders);
  // ⚠️ A "whole" window means `events` IS the history and answers for itself —
  // which stops being true the moment a folder holds part of it. A grouped page
  // has a second contributor with no cut at all: on SparkLend `0xb137…ece5`
  // (2026-09-12) every one of 2,776 events sits in a folder, so `events` is
  // EMPTY and a snapshot that let it answer for itself stated "0 events" for a
  // position with 2,776. Whole or windowed, the folders are counted; a whole
  // window's tenure comes from the oldest thing the page holds rather than from
  // an opening balance it does not have.
  if (!window || window.state === "whole") {
    if (members === 0) return undefined;
    return {
      totalEvents: events.length + members,
      firstTimestamp: earliestHeldTimestamp(events, folders),
      folderMembers: members,
    };
  }
  if (window.state !== "ready") return { totalEvents: null, firstTimestamp: null, folderMembers: members };
  return {
    totalEvents: window.opening.totalEvents + events.length + members,
    firstTimestamp: window.opening.firstTimestamp,
    folderMembers: members,
  };
}

/** The menu's footnote: what each export carries when the page drew a window.
 *  The position figures and the CSV are whole-history; the Markdown's event
 *  table is a bounded tail. `figuresCover` names the subject in the page's own
 *  terms — a wallet, a position, a loan, a wallet within one market. */
export function exportScopeNote(
  window: TimelineWindow | undefined,
  events: BaseActivityEvent[],
  figuresCover: string,
  folders?: readonly ServedFolder[] | null,
): string | undefined {
  const scope = markdownHistoryScope(window, events, folders);
  if (!scope) return undefined;
  // The rows the snapshot WILL list, not the bound it lists up to. The two part
  // company on a grouped page, where the members are not in `events`: on
  // SparkLend `0xb137…ece5` every event is inside a folder, so the bound is 50
  // and the snapshot lists none of them.
  const listed = Math.min(MARKDOWN_EVENT_ROWS, events.length).toLocaleString("en-US");
  if (scope.totalEvents == null) {
    return (
      `The summary of everything before this page's window did not load, so the figures cover only the ` +
      `${events.length.toLocaleString("en-US")} events in view. The Markdown snapshot lists the most recent ` +
      `${listed}; the CSV downloads every event.`
    );
  }
  const total = scope.totalEvents.toLocaleString("en-US");
  // What the CSV DOES, not a promise about what the index will serve: where the
  // history exceeds what the source answers in one read, the download does not
  // happen and the menu says by how much it fell short.
  if (scope.folderMembers > 0) {
    return (
      `The position figures cover ${figuresCover}. The Markdown snapshot lists ${listed} of ` +
      `${total} events — the ${scope.folderMembers.toLocaleString("en-US")} inside collapsed groups are not ` +
      `among them; the CSV downloads the whole history.`
    );
  }
  return (
    `The position figures cover ${figuresCover}. The Markdown snapshot lists the most recent ` +
    `${listed} of ${total} events; the CSV downloads the whole history.`
  );
}
