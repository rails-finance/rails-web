// Chunked chronological interior for a collapsed timeline run.
// ----------------------------------------------------------------------------
// A long run of third-party events expands into folders of ~CHUNK_TARGET
// consecutive events in TRUE order, instead of re-bucketing them by kind or
// counterparty — chronology is the one promise a timeline makes, and it wins
// inside the run too. Each folder's header then carries aggregates and counts
// scoped to its own slice, with a tight date range that paints the churn's
// rhythm over time on the spine. Design note (the wrong versions this
// replaced, and why): rails-ops reference/timeline-attention-budget.md,
// revision 2026-09-01. Reached through lib/shared/run-folders.tsx's
// renderRunFolders, which every protocol's run spec now renders with.

import { monthIdxOf } from "@/lib/shared/timeline-segments";

/** How many events one folder aims to hold. Flexes by a few rows so a
 *  transaction's rows never split (see below). */
export const CHUNK_TARGET = 100;

/**
 * Slice `items` (already in display order) into chronological chunks of
 * ~`target`, never splitting a transaction: the boundary always lands between
 * txHashes — a liquidation with its repay leg and seize transfers is one act,
 * and one act never straddles two folders. A chunk therefore closes at the
 * first transaction boundary AT or past the target, a few rows over.
 *
 * A trailing remnant smaller than `minTail` joins the previous chunk rather
 * than standing as a folder of two.
 */
export function chunkByTransaction<T>(
  items: T[],
  txHashOf: (item: T) => string,
  target: number = CHUNK_TARGET,
  minTail = 2,
): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let i = 0;
  while (i < items.length) {
    // One act = consecutive rows of the same transaction. Same-tx rows are
    // adjacent in any block/logIndex ordering, so a plain forward scan holds.
    const tx = txHashOf(items[i]);
    let j = i + 1;
    while (j < items.length && txHashOf(items[j]) === tx) j++;
    for (let k = i; k < j; k++) current.push(items[k]);
    if (current.length >= target) {
      chunks.push(current);
      current = [];
    }
    i = j;
  }
  if (current.length > 0) {
    if (chunks.length > 0 && current.length < minTail) {
      for (const item of current) chunks[chunks.length - 1].push(item);
    } else {
      chunks.push(current);
    }
  }
  return chunks;
}

// ──────────────────────────── the month cut ─────────────────────────────────
//
// rails-ops decision 0021, amendment 2026-09-29 (Miles): a run qualifies as a
// group on its FULL length against its kind's floor, and is then cut at 00:00
// UTC on the 1st of each month. A piece of two or more rows stays a group with
// its own header sums and date range; a single leftover row sits loose. So a
// month filter never clips a group, and a group's header always sums what that
// month shows. Every kind takes the cut. The index carries the same function
// (rails-server `api/src/services/timeline-folders.ts`), and the shared cases
// are in scripts/verify/verify-month-cut.ts.

/**
 * Cut `items` (a qualifying run, in either chain order) into its UTC calendar
 * months. A cut only ever falls between transactions: a transaction takes the
 * month of its first row, so its rows stay together whatever their stamps.
 */
export function splitAtMonths<T>(items: T[], timestampOf: (item: T) => number, txHashOf: (item: T) => string): T[][] {
  const pieces: T[][] = [];
  let current: T[] = [];
  let month: number | null = null;
  let i = 0;
  while (i < items.length) {
    const tx = txHashOf(items[i]);
    let j = i + 1;
    while (j < items.length && txHashOf(items[j]) === tx) j++;
    const m = monthIdxOf(timestampOf(items[i]));
    if (month !== null && m !== month) {
      pieces.push(current);
      current = [];
    }
    month = m;
    for (let k = i; k < j; k++) current.push(items[k]);
    i = j;
  }
  if (current.length > 0) pieces.push(current);
  return pieces;
}

/** What a client-grouped page's run spec declares about grouping — the fields
 *  of `TimelineRunSpec` (components/shared/chain-truth-timeline.tsx) this pass
 *  reads. */
export interface RunGroupingSpec<E> {
  match: (e: E) => boolean;
  min: number;
  sameRun?: (prev: E, next: E) => boolean;
  /** One event's row drawn from several logs of one transaction: no group,
   *  so the month cut does not reach it. */
  asOneEvent?: boolean;
}

export type SettledRunRow<E, S> =
  | { kind: "event"; event: E; flatIdx: number }
  | { kind: "run"; spec: S; events: E[]; flatIdx: number };

/**
 * Settle a client-grouped page's list into rows, in the list's display order.
 *
 * `all` is the list under every filter EXCEPT the date range, and `inRange`
 * is the date range. Runs are found and qualified on `all`, so a run's floor
 * reads its full length whatever range is chosen; each qualifying run is cut
 * at month boundaries, and only then is the range applied — to whole pieces
 * under a month filter, and member by member under a custom range, where a
 * piece left with two or more members is still a group. `flatIdx` counts the
 * in-range events only: it indexes the page's date-filtered list.
 */
export function settleRunRows<E extends { txHash: string; timestamp: number }, S extends RunGroupingSpec<E>>(
  all: E[],
  specs: readonly S[],
  inRange: (e: E) => boolean,
): SettledRunRow<E, S>[] {
  const out: SettledRunRow<E, S>[] = [];
  let flatIdx = 0;
  const loose = (e: E) => {
    if (inRange(e)) out.push({ kind: "event", event: e, flatIdx: flatIdx++ });
  };
  const run = (spec: S, events: E[], floor: number) => {
    const kept = events.filter(inRange);
    if (kept.length === 0) return;
    if (kept.length < floor) {
      for (const e of kept) loose(e);
      return;
    }
    out.push({ kind: "run", spec, events: kept, flatIdx });
    flatIdx += kept.length;
  };
  let i = 0;
  while (i < all.length) {
    const spec = specs.find((s) => s.match(all[i]));
    if (!spec) {
      loose(all[i]);
      i++;
      continue;
    }
    let j = i + 1;
    while (j < all.length && spec.match(all[j]) && (!spec.sameRun || spec.sameRun(all[j - 1], all[j]))) j++;
    const stretch = all.slice(i, j);
    if (stretch.length < spec.min) {
      for (const e of stretch) loose(e);
    } else if (spec.asOneEvent) {
      run(spec, stretch, spec.min);
    } else {
      for (const piece of splitAtMonths(
        stretch,
        (e) => e.timestamp,
        (e) => e.txHash,
      ))
        run(spec, piece, 2);
    }
    i = j;
  }
  return out;
}
