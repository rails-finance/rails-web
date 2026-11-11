// The history tag's words (rails-ops decisions 0061 and 0063), one set per
// kind of roster `history` (lib/shared/protocols.ts): "none", an explorer not
// yet indexed, keeps 0061's "Read on visit"; "from-date", an explorer indexed
// from a start block after the protocol's deployment, names the start date.
// An explorer indexed from deployment has no `history` and no tag.
//
// Pure: scripts/test/history-tier.test.mjs reads it.

import { formatDate } from "../date";

export type HistoryKind = "none" | "from-date";

/** "none": read from the chain when a page opens, nothing indexed yet. */
export const HISTORY_NONE = {
  name: "Read on visit",
  line: "Figures are read from the chain when you open the page.",
  waits: "History, listings and holder counts arrive when Rails indexes this protocol.",
} as const;

/** The start date as the tag writes it ("7 Feb 2026", UTC), from the start
 *  block's time in unix seconds; null when no time was read. */
export const historyDate = (time: number | null | undefined): string | null =>
  time != null && Number.isFinite(time) && time > 0 ? formatDate(time) : null;

/** "from-date": indexed from a start date. The tag names a date and no block;
 *  with no date read, it says only that the history starts late. */
export const HISTORY_FROM_DATE = {
  name: (date: string | null) => (date ? `History from ${date}` : "History from a start date"),
  line: (date: string | null) =>
    date ? `Rails records this protocol from ${date}.` : "Rails records this protocol from a date after it launched.",
  /** The coverage legend's line, for every from-date explorer on a chain at once. */
  legend: "Rails records each of these protocols from the date on its tag.",
} as const;

/** The tag's name and line for one kind, with the start date where it has one. */
export function historyWords(kind: HistoryKind, date: string | null = null): { name: string; line: string } {
  return kind === "none"
    ? { name: HISTORY_NONE.name, line: HISTORY_NONE.line }
    : { name: HISTORY_FROM_DATE.name(date), line: HISTORY_FROM_DATE.line(date) };
}
