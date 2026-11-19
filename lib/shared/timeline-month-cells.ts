// Which months of the Date panel's grid (L1.8) a click may filter, and which
// it must read or refuse (rails-ops ui-jobs 764, decision 0019's two paths). A
// month is filtered on the page only where the loaded rows hold all of it: a
// click on a month the rows hold in part would list part of it. Where they do
// not, the page reads the month from the index as its own segment (`reach`),
// or the cell refuses the click and says the month is not loaded. Pure, and
// imports nothing through `@/`, so scripts/test/timeline-month-cells.test.mjs
// runs it.

const DAY = 86_400;

/** Year*12 + month (0-based), UTC: the grid's month key. */
export const monthIdxOf = (ts: number): number => {
  const d = new Date(ts * 1000);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};

/** With the whole life's days from the index (`lifeDays`, day-start seconds
 *  to a count) and the span the page holds: every day of the month that has
 *  events lies inside the held span. Without a held span the page holds the
 *  whole life. */
export function monthWhollyHeld(
  idx: number,
  lifeDays: ReadonlyMap<number, number>,
  held: [number, number] | null,
): boolean {
  if (!held) return true;
  const from = Math.floor(held[0] / DAY) * DAY;
  for (const [day, count] of lifeDays) {
    if (count <= 0 || monthIdxOf(day) !== idx) continue;
    if (day < from || day > held[1]) return false;
  }
  return true;
}

/** Without the index's days: the loaded rows (their oldest month
 *  `windowMinIdx`), whether they are the whole history (`whole`), and the
 *  opening balance's days where the page has one (`priorDays`). A month at or
 *  after the oldest loaded month is loaded in full when the history is whole,
 *  or, on a cut history, when it is newer than the oldest loaded month, or is
 *  that month with an opening balance holding none of its days. Everything
 *  older is below the cut. */
export function monthLoaded(
  idx: number,
  s: { windowMinIdx: number; whole: boolean; priorDays?: { key: string; count: number }[] | null },
): boolean {
  if (idx < s.windowMinIdx) return false;
  if (s.whole || idx > s.windowMinIdx) return true;
  // The oldest loaded month of a cut history: whole only where the opening
  // balance says nothing of it happened before the cut.
  if (!s.priorDays || s.priorDays.length === 0) return false;
  return !s.priorDays.some((b) => b.count > 0 && monthIdxOf(Number(b.key)) === idx);
}

/** A refused cell's count is a floor where it came from the loaded rows of a
 *  month they hold in part, with no index count for the rest: the oldest
 *  loaded month of a cut list that carries no opening balance. */
export function monthCountIsFloor(
  idx: number,
  s: { windowMinIdx: number; whole: boolean; priorDays?: { key: string; count: number }[] | null },
): boolean {
  return !s.whole && idx === s.windowMinIdx && (!s.priorDays || s.priorDays.length === 0);
}
