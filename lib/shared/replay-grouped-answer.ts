// SERVER-ONLY — a replay-served history as ROWS: the preload and a month.
// ----------------------------------------------------------------------------
// The Base lanes' routes replay a wallet's rows in the web's server half
// (rails-ops decision 0019, "Implementation note 2026-09-13 — leg C"). Every
// event then carries the running figures a replay over the whole list gives
// it, so grouping after the replay is a pure transform, and so is slicing the
// replay by time: a month below the preload is the replayed events inside it,
// grouped the same way and trimmed to the same row cap. Nothing is replayed
// from a month's first row, so its running figures are the whole replay's.
//
// Two answers, one per read:
//
//   • THE PRELOAD (`groupReplayRest`) — every replayed event grouped, trimmed
//     from the oldest end to the row cap at a block boundary. Past the cap the
//     family's replay runs again with its render cut at the trim and the
//     anchor off (`recut`), so `coverage.omitted` states the rows
//     below the served ones. `belowByDay` is those events per UTC day, which
//     the page's month grid needs to draw the months the preload does not
//     hold (a seed's rows have no days; they stay drawn and refused).
//   • A SPAN (`groupReplaySpan`) — the events inside [from, to], grouped with
//     ordinals over the whole history, trimmed to the cap from the oldest end,
//     echoing the span it answered (hooks/useTimelineSegment.ts reads the echo
//     to learn that this route groups a span).
//
// The answers are kept in memory for a minute per (family, wallet, span), so
// opening a folder follows a page load without a second index read and replay
// (the members route resolves against the same answer the page drew).

import type { TimelineRowPlanEntry } from "@/lib/shared/timeline-folder";
import type { OpeningBucket } from "@/lib/shared/timeline-opening-balance";
import {
  groupIntoRows,
  trimToRowCap,
  type GroupedRows,
  type GroupingAccess,
  type GroupingSpec,
  type TrimmedRows,
} from "@/lib/shared/timeline-grouping";

export interface ReplayGroupedAnswer<R extends { events: E[] }, E> {
  /** The replay the page states its figures from: at the row cap's cut for a
   *  preload longer than the cap, the whole replay otherwise and for a span.
   *  Its `events` are every event it drew; the body keeps the ungrouped ones. */
  result: R;
  grouped: GroupedRows<E>;
  trimmed: TrimmedRows<E>;
  /** Every event key the trimmed answer serves, in a row or in a folder. */
  kept: Set<string>;
  /** The span a month read answered; null on the preload. */
  span: { from: number; to: number } | null;
  /** The replayed events below the preload's cut, per UTC day; null on a span
   *  and where nothing was cut. */
  belowByDay: OpeningBucket[] | null;
}

function keptOf<E>(grouped: GroupedRows<E>, trimmed: TrimmedRows<E>, access: GroupingAccess<E>) {
  const kept = new Set<string>();
  let first: string | null = null;
  for (const row of trimmed.rows) {
    const list = row.kind === "event" ? [row.event] : (grouped.members.get(row.folder.responseId) ?? []);
    for (const e of list) {
      const key = access.eventKey(e);
      if (first == null) first = key;
      kept.add(key);
    }
  }
  return { kept, first };
}

/** Events per UTC day, oldest first — the heatmap's day key. */
export function eventsByDay<E>(events: readonly E[], timestamp: (e: E) => number): OpeningBucket[] {
  const days = new Map<number, number>();
  for (const e of events) {
    const day = Math.floor(timestamp(e) / 86400) * 86400;
    days.set(day, (days.get(day) ?? 0) + 1);
  }
  return [...days].sort((a, b) => a[0] - b[0]).map(([day, count]) => ({ key: String(day), count }));
}

/**
 * The preload. `full` is the replay with its render cut lifted, so its events
 * are every event the tail holds, ascending. `ordinalBase` is the first one's
 * place in the whole history (after a seed's rows). `recut` replays again with
 * the render cut at `cutoffBlock` and the anchor off.
 */
export function groupReplayRest<R extends { events: E[] }, E>(o: {
  full: R;
  specs: readonly GroupingSpec<E>[];
  access: GroupingAccess<E>;
  ordinalBase: number;
  cap: number;
  recut: (cutoffBlock: number) => R;
  label: string;
}): ReplayGroupedAnswer<R, E> {
  const grouped = groupIntoRows(o.full.events, o.specs, o.access, { ordinalBase: o.ordinalBase });
  const trimmed = trimToRowCap(grouped, o.access, o.cap);
  const { kept, first } = keptOf(grouped, trimmed, o.access);
  let result = o.full;
  let belowByDay: OpeningBucket[] | null = null;
  if (trimmed.cutoffBlock != null) {
    const cutoff = trimmed.cutoffBlock;
    // The replay cuts by ROW and the trim by event at a block boundary; the
    // recut is handed the block so the two agree however rows became events.
    // Checked rather than assumed: a boundary card over a different cut would
    // state a count the page contradicts.
    const cut = o.recut(cutoff);
    if (cut.events.length !== trimmed.eventsKept || (cut.events[0] && o.access.eventKey(cut.events[0])) !== first) {
      throw new Error(
        `${o.label} grouped cut disagrees with the replay's: ${cut.events.length} events from ${
          cut.events[0] ? o.access.eventKey(cut.events[0]) : "none"
        } against ${trimmed.eventsKept} from ${first}`,
      );
    }
    result = cut;
    belowByDay = eventsByDay(
      o.full.events.filter((e) => o.access.blockNumber(e) < cutoff),
      o.access.timestamp,
    );
  }
  return { result, grouped, trimmed, kept, span: null, belowByDay };
}

/**
 * A month (or the week or day it shrank to): the replayed events inside
 * [from, to], unix seconds inclusive. `eventsBefore` is how many events of the
 * whole history precede `full.events[0]` (a seed's rows), so ordinals run over
 * the whole history as the preload's do.
 */
export function groupReplaySpan<R extends { events: E[] }, E>(o: {
  full: R;
  specs: readonly GroupingSpec<E>[];
  access: GroupingAccess<E>;
  eventsBefore: number;
  cap: number;
  span: { from: number; to: number };
}): ReplayGroupedAnswer<R, E> {
  const all = o.full.events;
  let lo = 0;
  while (lo < all.length && o.access.timestamp(all[lo]) < o.span.from) lo++;
  let hi = lo;
  while (hi < all.length && o.access.timestamp(all[hi]) <= o.span.to) hi++;
  const grouped = groupIntoRows(all.slice(lo, hi), o.specs, o.access, { ordinalBase: o.eventsBefore + lo + 1 });
  const trimmed = trimToRowCap(grouped, o.access, o.cap);
  const { kept } = keptOf(grouped, trimmed, o.access);
  return { result: o.full, grouped, trimmed, kept, span: o.span, belowByDay: null };
}

/** The route's body: the replay's envelope with `events` narrowed to the
 *  ungrouped ones and the row plan beside them (`GroupedTimelineFields`), plus
 *  `cutoffBlock` and, on a span, the span echoed. A span answer carries no
 *  envelope beyond that: the page keeps its preload's whole-history figures
 *  and reads only the rows. */
export function replayGroupedBody<
  R extends { events: E[]; wallet: string; totalEvents: number; coverage: { omitted?: { count: number } } },
  E,
>(a: ReplayGroupedAnswer<R, E>) {
  const rowPlan: TimelineRowPlanEntry[] = a.trimmed.rows.map((row) =>
    row.kind === "event" ? { kind: "event" } : { kind: "folder", folder: row.folder },
  );
  const rows = {
    events: a.trimmed.rows.flatMap((row) => (row.kind === "event" ? [row.event] : [])),
    grouped: true as const,
    rowPlan,
    eventsServed: a.trimmed.eventsKept,
    boundBy: a.trimmed.boundBy,
    cutoffBlock: a.trimmed.cutoffBlock,
  };
  if (a.span) return { wallet: a.result.wallet, ...rows, span: a.span };
  // The whole history's count: what the rows cover and what sits below them.
  // Moonwell's replay states it already; Aave's counts the events it drew.
  return {
    ...a.result,
    ...rows,
    totalEvents: (a.result.coverage.omitted?.count ?? 0) + a.trimmed.eventsKept,
    belowByDay: a.belowByDay,
  };
}

/** A route's `?from=&to=` pair: two unix-second integers, `from` ≤ `to`, or
 *  null for none. A half or malformed pair is an error the route states. */
export function spanParam(
  params: URLSearchParams,
): { ok: true; span: { from: number; to: number } | null } | { ok: false; message: string } {
  const f = params.get("from");
  const t = params.get("to");
  if (f == null && t == null) return { ok: true, span: null };
  const from = Number(f);
  const to = Number(t);
  if (f == null || t == null || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from > to || from < 0)
    return { ok: false, message: "from and to must both be unix seconds, from at or before to" };
  return { ok: true, span: { from, to } };
}

// ── The answers the members route opens against ────────────────────────────
// Held on `globalThis` because each route handler is a separate bundle and a
// module-level map would be one per route. A stale entry is never wrong about
// its members; a page that drew a newer grouping sees `stale` on the
// folder it opened (`FolderMembersProvider`).

const ANSWER_TTL_MS = 60_000;

/** `entries` bounds the store: a whole replay of a seeded wallet's tail is
 *  tens of thousands of events, so a replay store holds a few. */
export function answerStore<A>(name: string, entries = 32) {
  const sym = Symbol.for(`rails.${name}.groupedAnswers`);
  const g = globalThis as unknown as Record<symbol, Map<string, { at: number; answer: A }>>;
  if (!g[sym]) g[sym] = new Map();
  const map = g[sym];
  const keyOf = (wallet: string, span: { from: number; to: number } | null) =>
    span ? `${wallet.toLowerCase()}|${span.from}|${span.to}` : wallet.toLowerCase();
  return {
    get(wallet: string, span: { from: number; to: number } | null): A | null {
      const hit = map.get(keyOf(wallet, span));
      return hit && Date.now() - hit.at < ANSWER_TTL_MS ? hit.answer : null;
    },
    set(wallet: string, span: { from: number; to: number } | null, answer: A): void {
      const key = keyOf(wallet, span);
      map.delete(key);
      map.set(key, { at: Date.now(), answer });
      while (map.size > entries) {
        const oldest = map.keys().next();
        if (oldest.done) break;
        map.delete(oldest.value);
      }
    },
  };
}
