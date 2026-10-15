// The group rule for a client-grouped timeline.
// ----------------------------------------------------------------------------
// Five or more consecutive transactions of the same act, unbroken by any other
// row, are one group whatever its length (rails-ops decision 0039). The web's
// route pass (lib/shared/timeline-grouping.ts) and the index apply the same
// rule; the shared cases are in scripts/verify/verify-group-rule.ts.
//
// TODO (decision 0039, rule 1): this pass has no shape runs. The repeating set
// (the same ordered keys in each transaction) is found only by the route pass
// (`findShapeStretches`), whose specs carry `shape`; no client-grouped family
// declares one yet.

/** The one floor: a run of fewer transactions than this stays as rows. */
export const GROUP_MIN_TRANSACTIONS = 5;

/** How many distinct transactions `items` span. */
export function transactionCount<T>(items: readonly T[], txHashOf: (item: T) => string): number {
  const seen = new Set<string>();
  for (const item of items) seen.add(txHashOf(item));
  return seen.size;
}

/** What a client-grouped page's run spec declares about grouping — the fields
 *  of `TimelineRunSpec` (components/shared/chain-truth-timeline.tsx) this pass
 *  reads. */
export interface RunGroupingSpec<E> {
  match: (e: E) => boolean;
  /** Read only by an `asOneEvent` spec, in rows. A group qualifies at
   *  `GROUP_MIN_TRANSACTIONS` whatever this says. */
  min?: number;
  sameRun?: (prev: E, next: E) => boolean;
  /** One event's row drawn from several logs of one transaction: not a group,
   *  and qualified at its own `min`. */
  asOneEvent?: boolean;
}

/** The member lists settled so far, by their first member: a few per member,
 *  dropped with the events. */
const settledLists = new WeakMap<object, unknown[][]>();
const LISTS_PER_FIRST = 8;

/**
 * The list settled before with the same members in the same order, or `kept`.
 * A run's member array keeps its identity across a resettle that leaves it
 * whole (a filter, a cursor move or a range elsewhere on the list), so its
 * header sums, memoised on that identity (`runMemo`, lib/shared/run-folders.tsx),
 * are added once.
 */
export function internMembers<E extends object>(kept: E[]): E[] {
  const first = kept[0];
  const lists = (settledLists.get(first) ?? []) as E[][];
  for (const prev of lists) {
    if (prev.length !== kept.length) continue;
    let same = true;
    for (let k = 0; k < kept.length && same; k++) same = prev[k] === kept[k];
    if (same) return prev;
  }
  lists.push(kept);
  if (lists.length > LISTS_PER_FIRST) lists.shift();
  settledLists.set(first, lists);
  return kept;
}

export type SettledRunRow<E, S> =
  | { kind: "event"; event: E; flatIdx: number }
  | { kind: "run"; spec: S; events: E[]; flatIdx: number };

/**
 * Settle a client-grouped page's list into rows, in the list's display order.
 *
 * `all` is the list before the date range and the cut, and `inRange` admits
 * what the page shows. A run is found and qualified on `all`, then sliced to
 * `inRange`: a slice of two or more members stays a group whose header sums
 * the slice, and a lone member sits loose. `flatIdx` counts the admitted
 * events only: it indexes the page's shown list. A run's `events` is interned
 * (`internMembers`): the same members settle to the same array.
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
    out.push({ kind: "run", spec, events: internMembers(kept), flatIdx });
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
    if (spec.asOneEvent) {
      const min = spec.min ?? 1;
      if (stretch.length < min) for (const e of stretch) loose(e);
      else run(spec, stretch, min);
    } else if (transactionCount(stretch, (e) => e.txHash) < GROUP_MIN_TRANSACTIONS) {
      for (const e of stretch) loose(e);
    } else {
      run(spec, stretch, 2);
    }
    i = j;
  }
  return out;
}
