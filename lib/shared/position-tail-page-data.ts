// The server-side read behind a position detail page whose history is INDEXED
// and WINDOWED — the shape every explorer on the rails-server backbone shares.
// ----------------------------------------------------------------------------
// SERVER-ONLY. Imported only from a position page's server component.
//
// Three legs. The TIMELINE is the one every caller has. A separate POSITIONS
// read is the ordinary case but not universal — f(x) serves the row from the
// timeline route itself. The windowed history's OPENING BALANCE is read only
// when the timeline came back with a cutoff block naming one, which most
// explorers never do.
//
// This owns the timing and the failure rules, which are the same for every
// protocol on it. What a positions response CONTAINS is not the same for every
// protocol — Maple's per-pool chain state rides the same envelope as its row —
// so the response comes back whole and each binding takes what its page needs.
//
// A position has two shelf-lives and this loader takes the long one. The TAIL is
// the replayed summary and the event history. The HEAD — getUserAccountData /
// getReserveData against the market's own Pool, and the IAaveOracle price merge
// for exited reserves — stays a client-side second wave, so no document waits on
// a chain round trip.
//
// Reads through THIS deployment's own /api/* routes with an ssrHop() baseUrl by
// default, because those routes can shape the backend's raw rows into what the
// page renders. Read what a proxy does before deciding it is only a hop; where
// all of them do forward unchanged, the caller passes `hop: boxHop` and the
// reads go to RAILS_API_URL with bearer auth instead, one function invocation
// cheaper each. Either way every read carries headers that name the reader, so
// the box's per-reader budget applies to the reader and not to the deployment.
//
// THE WINDOWED HISTORY IS PART OF THE TAIL. The timeline fetch asks for a window
// of the most recent events; a position large enough to need one gets back the
// block that window opened at, and everything below it is a declared opening
// balance from the /summary twin. On the client that is deliberately a second
// request — the rows land and the list is readable while it is in flight, and
// every whole-history figure declares itself unknown until it arrives. On the
// server there is no "while": one render, one document. So the opening balance
// is read here too, chained after the cutoff block that names it. It costs a
// second round trip on the handful of positions that need one; every other
// position skips it entirely, because `cutoffBlock` comes back null.
//
// Best-effort by design. Any failed read returns an empty tail rather than
// throwing, and the client half fetches for itself exactly as it did before the
// route had a server half — an SSR miss costs the first-paint win, not the page.

import { ssrHop, type SsrHop } from "@/lib/shared/listing-ssr";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";

// Bound the server wait. A force-dynamic page whose backend read runs long would
// otherwise hold the render until the platform kills it with a function-timeout
// 503. Same budget as the listing SSR driver — and it covers the whole tail,
// chained opening balance included.
const TAIL_FETCH_TIMEOUT_MS = 8000;

export interface PositionTail<Positions, Timeline extends TimelineRead = TimelineRead> {
  /** The positions response, whole. `null` when the read failed, when the
   *  timeline beside it did (see the seeding rule below), or when the explorer
   *  has no separate positions read to make. */
  positions: Positions | null;
  events: BaseActivityEvent[] | null;
  cutoffBlock: number | null;
  opening: TimelineOpeningBalance | null;
  /** The timeline response WHOLE, for a caller whose read answers in a shape
   *  richer than `events + cutoffBlock`. A GROUPED read is the case that needs
   *  it: its row plan is what puts the folders back between the ungrouped
   *  events, and dropping it here would mean fetching the same history a second
   *  time on the client to get it back. `null` on a failed or skipped read. */
  timeline: Timeline | null;
}

export interface TimelineRead {
  events: BaseActivityEvent[];
  cutoffBlock?: number | null;
}

const EMPTY = { positions: null, events: null, cutoffBlock: null, opening: null, timeline: null };

/**
 * One position's tail. Never throws: on any failure the caller gets an empty
 * tail and the client half fetches for itself.
 *
 * Note there is no `missing` flag. A wallet is not a position id — an address
 * the protocol has never seen is a legitimate empty answer for this page to
 * render, not a 404. Only a malformed address is a 404, and the page checks
 * that itself before calling here.
 */
export async function loadPositionTail<Positions, Timeline extends TimelineRead = TimelineRead>(opts: {
  /** Protocol id, for log lines only. */
  label: string;
  /** Omitted where the timeline response already carries the position — f(x)
   *  serves both from one route, so there is no second read to make and nothing
   *  for `positions` to hold. */
  readPositions?: (baseUrl: string, headers: Record<string, string>) => Promise<Positions>;
  readTimeline: (baseUrl: string, headers: Record<string, string>) => Promise<Timeline>;
  /** Omitted by the explorers whose timeline route is not windowed — those
   *  responses carry no `cutoffBlock`, so there is never an opening balance to
   *  name and no third read to make. */
  readOpening?: (
    baseUrl: string,
    cutoffBlock: number,
    headers: Record<string, string>,
  ) => Promise<TimelineOpeningBalance>;
  /** Where the reads go. The default is this deployment's own `/api/*` proxies
   *  (`ssrHop`), which is right whenever a proxy shapes what it forwards. An
   *  explorer whose three proxies only forward passes `boxHop` instead and
   *  drops three function invocations from the cold path. */
  hop?: () => Promise<SsrHop | null>;
}): Promise<PositionTail<Positions, Timeline>> {
  const hop = await (opts.hop ?? ssrHop)();
  if (!hop) return EMPTY;
  const { baseUrl: origin, headers } = hop;

  const deadline = Date.now() + TAIL_FETCH_TIMEOUT_MS;
  const remaining = () => Math.max(deadline - Date.now(), 0);
  const withTimeout = <T>(p: Promise<T>, what: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ms = remaining();
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${opts.label} ${what} exceeded its budget`)), ms);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
  };

  // Settled separately: a rejected positions read and a rejected timeline read
  // mean different things, and Promise.all would lose that by failing on the
  // first of them.
  const readPositions = opts.readPositions;
  const [positions, timeline] = await Promise.allSettled([
    readPositions ? withTimeout(readPositions(origin, headers), "positions read") : Promise.resolve(null),
    withTimeout(opts.readTimeline(origin, headers), "timeline read"),
  ]);

  if (positions.status === "rejected") {
    console.error(`${opts.label}-position-page-data: positions read failed; client will fetch`, positions.reason);
    return EMPTY;
  }
  // The tail seeds whole or not at all. `seeded` on the client half is one flag,
  // and the second wave reads only chain state — so a summary that arrived
  // beside a FAILED timeline would render an empty activity list, as a settled
  // fact, with nothing left to correct it. A timeline that answered with no
  // rows is a different thing and seeds fine.
  if (timeline.status === "rejected") {
    console.error(`${opts.label}-position-page-data: timeline read failed; client will fetch`, timeline.reason);
    return EMPTY;
  }

  const cutoffBlock = timeline.value.cutoffBlock ?? null;

  // Chained, because the cutoff block is what names it. A failure here does NOT
  // forfeit the seed: the client's own model has a place for an opening balance
  // that has not arrived — every whole-history figure states itself unknown
  // rather than stating the window's arithmetic as a lifetime — and the client
  // re-requests it on mount. That is the one part of this tail whose absence
  // the page already knows how to say out loud.
  let opening: TimelineOpeningBalance | null = null;
  if (cutoffBlock != null && opts.readOpening) {
    const readOpening = opts.readOpening;
    try {
      opening = await withTimeout(readOpening(origin, cutoffBlock, headers), "opening-balance read");
    } catch (err) {
      console.error(`${opts.label}-position-page-data: opening balance failed; client will fetch`, err);
    }
  }

  return {
    positions: positions.value as Positions | null,
    events: timeline.value.events ?? [],
    cutoffBlock,
    opening,
    timeline: timeline.value,
  };
}
