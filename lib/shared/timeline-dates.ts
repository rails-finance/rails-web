// How a position timeline picks a day (rails-ops TO-DO-ui-jobs 764): by the
// Lifetime flows chart where it draws with its cursor tied to the timeline
// ("Sync to chart", the cards' "View on chart"), and by the Date pill and its
// month grid on every other timeline. Read at runtime from what the chart
// draws (the flow-focus store, lib/shared/flow-focus.ts). Pure, and imports
// nothing through `@/`, so scripts/test/timeline-dates.test.mjs runs it.

/** `chart`: the chart's cursor ties to the timeline and the toolbar draws no
 *  Date pill. `pill`: the Date pill and its month grid. `waiting`: the page's
 *  panel is still reading, or the page has not hydrated, and the toolbar
 *  holds the pill's place empty so a tied page never shows it. */
export type TimelineDates = "chart" | "pill" | "waiting";

/** Where the page's Lifetime flows panel stands (the store's `flows`). */
export type FlowsStanding = "waiting" | "settled" | null;

/** The timeline's mode from the store the page wears (null where it wears
 *  none: Sky Savings, an Alchemix V2 position). `hydrated`: the panel has had
 *  its first commit to say. A store whose panel has not said, after
 *  hydration, is a page with no panel, and keeps the pill. `waitedOut`: the
 *  panel has read for longer than `DATES_WAIT_MS`, so the pill stands until a
 *  tie takes over; no page goes without both the pill and "Sync to chart". */
export function timelineDates(
  s: { cursor: unknown; flows: FlowsStanding } | null,
  hydrated: boolean,
  waitedOut = false,
): TimelineDates {
  if (!s) return "pill";
  if (s.cursor != null) return "chart";
  if ((!hydrated || s.flows === "waiting") && !waitedOut) return "waiting";
  return "pill";
}

/** How long the timeline holds its Date pill back for a panel still reading. */
export const DATES_WAIT_MS = 15_000;

/** What a panel writes to the store's `flows` at each step (`useFlowsWaiting`
 *  in components/shared/flow-focus-context.tsx): `waiting` before paint
 *  (`layout`), `settled` after the commit's effects (`effect`), so a child's
 *  cursor lands first, and `settled` on `unmount`. Null where the store
 *  already says it. */
export function flowsPatch(
  step: "layout" | "effect" | "unmount",
  waiting: boolean,
  current: FlowsStanding,
): "waiting" | "settled" | null {
  const next = step === "layout" ? (waiting ? "waiting" : null) : step === "effect" && waiting ? null : "settled";
  return next == null || next === current ? null : next;
}

/** The tie dropped (the cursor gone after it stood): the chart's cut goes
 *  with it, so no cut stands beside a pill with no "Sync to chart". */
export function tieDropped(prev: TimelineDates, next: TimelineDates): boolean {
  return prev === "chart" && next !== "chart";
}

/** On the tie's arrival: a month the Date pill's grid read, or is reading, as
 *  its own segment goes with the pill. A month the cut asked for stays. */
export function resetMonthOnTie(s: {
  tied: boolean;
  month: number | null;
  loading: number | null;
  askedByCut: boolean;
}): boolean {
  return s.tied && !s.askedByCut && (s.month != null || s.loading != null);
}

/** The address bar's search without a lone `to` once the timeline settles
 *  on the pill: `?to=` alone is the chart's cut, which a pill timeline has
 *  none of. Null where nothing changes. A `from`-and-`to` range stays. */
export function withoutLoneTo(search: string, dates: TimelineDates): string | null {
  if (dates !== "pill") return null;
  const sp = new URLSearchParams(search);
  if (!sp.has("to") || sp.has("from")) return null;
  sp.delete("to");
  const q = sp.toString();
  return q ? `?${q}` : "";
}
