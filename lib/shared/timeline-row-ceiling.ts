// The index's row ceiling, declared rather than hidden.
// ----------------------------------------------------------------------------
// Eight rails-server timeline routes read their events MV under
// `ORDER BY block_number ASC … LIMIT 50000`, and until they carried a real
// COUNT(*) they reported the served row count as the position's total — a cut
// history presented as a whole one. They now return `totalEvents` (counted over
// the same predicate as the query) alongside `truncated` (the query came back
// at the ceiling), and this module reduces that pair to the one thing the page
// owes its reader.
//
// Two facts follow from that ORDER BY being ASCENDING, and both belong in the
// disclosure rather than in a reader's assumptions:
//
//   • the events the ceiling cut are the LATEST ones, not the oldest, so the
//     newest card on a capped timeline is not the position's newest event; and
//   • every figure the browser sums from the event array — the lifetime tower,
//     the filter counts — is summed from the served slice alone, because the
//     omitted events were never fetched at all.
//
// The Base arm's cap is the opposite case: there the replay runs server-side
// over the whole history and only the rendered list is trimmed, so its balances
// really do account for every event. Same disclosure slot, different sentence —
// see <TimelineCoverageFooter>, which holds both.
//
// Absent fields mean NOT truncated. The backend deploys on its own schedule, so
// a response that predates them carries no ceiling and the page reads exactly
// as it did before.

export interface TimelineRowCeiling {
  /** Events actually served — the length of the list on the page. */
  shown: number;
  /** The position's real event count, from the index's own COUNT(*). */
  total: number;
}

/** The upstream timeline-rows envelope, as far as the ceiling is concerned.
 *  Both fields optional: a backend that predates them is the silent case. */
export interface RowCeilingFields {
  totalEvents?: number;
  truncated?: boolean;
}

/**
 * Attach the ceiling to a transform result when — and only when — the backend
 * says the query came back at the limit AND its count exceeds what was served.
 * Equal counts mean a position holding exactly MAX_ROWS events: nothing is
 * missing, so nothing is claimed.
 */
export function withRowCeiling<T extends { events: unknown[] }>(
  result: T,
  upstream: RowCeilingFields | undefined,
): T & { rowCeiling?: TimelineRowCeiling } {
  const total = upstream?.totalEvents;
  if (upstream?.truncated !== true || typeof total !== "number") return result;
  const shown = result.events.length;
  if (!(total > shown)) return result;
  return { ...result, rowCeiling: { shown, total } };
}

/** The index's ceiling on one whole-history answer — rails-server's
 *  `MAX_ROWS = 50_000` on the eight index-served timeline routes (aaveV3,
 *  spark, fluid, pwn, liquityV1 and their siblings). A position above it
 *  cannot be exported whole: the CSV export refuses a short file. */
export const INDEX_ROW_CEILING = 50_000;

/** The ceiling of the four cursor-drained proxies (compound-v2, dolomite,
 *  frankencoin, llamalend `app/api/*\/timeline/route.ts`): `MAX_PAGES` × `PAGE_LIMIT`
 *  = 20 × 5,000. The deepest such position holds 44,896 events. */
export const DRAINED_ROW_CEILING = 100_000;

/**
 * Whether the CSV export can hand over this position's WHOLE history in one
 * answer — what lets the boundary card point a reader at the download rather
 * than only at a request. `total` is the position's event count when the page
 * knows it (null while a window's opening balance is in flight — then no);
 * `ceiling` is the arm's whole-answer limit, or null where the source has none.
 */
export function wholeHistoryExportable(total: number | null, ceiling: number | null): boolean {
  if (total == null) return false;
  return ceiling == null || total <= ceiling;
}
