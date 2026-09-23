// ============================================================================
// FETCH CHAIN TIMELINE — a wallet's history swept live from the chain's logs
// ============================================================================
//
// The index-free twin of fetch-aave-v3-timeline. On Ethereum a timeline comes
// from rails-server; on Base there is no index, so the route behind this sweeps
// the chain itself and this is what the page calls.
//
// The one shape difference is `coverage`, and it is not optional decoration.
// An indexed timeline's completeness is a property of the index, stated once on
// the explorer. A swept one's completeness is a property of THIS request: it
// depends on which block the sweep started at and whether every chunk of it
// came back. So the answer travels with the data, and the page renders it under
// the last event (see <TimelineCoverageFooter>).

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { settleFetchMark } from "@/lib/perf/settle-marks";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import type { TimelineCutSummary } from "@/lib/shared/timeline-boundary";

/** An inclusive block range the sweep could not read. */
export interface CoverageGap {
  from: number;
  to: number;
}

export interface ChainTimelineCoverage {
  /** Where the history actually starts: the deployment block when the sweep
   *  reached it, or the block it got to before running out of time. */
  fromBlock: number;
  /** Last block swept — the chain head when the sweep ran. */
  toBlock: number;
  /** True when `fromBlock` is the protocol contract's own deployment block, so
   *  no activity on it predates the sweep. This is what lets a swept timeline
   *  claim it is the position's WHOLE life rather than a window onto it. */
  fromDeployment: boolean;
  /** The contract's own first block — how far short of it a horizon fell. */
  deployBlock: number;
  /** Ranges INSIDE the swept span that would not answer. Empty ⇒ the span is
   *  whole. A hole is not the same as a horizon: it leaves the replayed
   *  balances after it short by whatever it hid. */
  gaps: CoverageGap[];
  /** Unix seconds of the oldest event SHOWN; null when there are none. */
  firstEventAt: number | null;
  /** Present when the list was capped: how many older events the replay
   *  accounted for but the list does not draw, and the block they run up to.
   *  The balances remain complete — only the rendering is capped. When the
   *  replay anchors owner-signed rows — draws them from below the cut however
   *  deep they sit (reference/timeline-attention-budget.md in rails-ops) —
   *  `anchored` says how many it drew, seeded or not, even at 0; it is absent
   *  only on a replay that cuts by depth alone (the chain sweeps, which hold
   *  a sender per DRAWN row and switch the anchor off). `anchoredComplete`
   *  is the disclosure's licence to state that everything the wallet signed
   *  itself is on the list: true when the reader had a sender for every row
   *  below the cut, so `anchored` is the WHOLE set of wallet-signed rows down
   *  there (an index read with no seed); false when a seed stands in for part
   *  of the history — the anchor stayed on over the rows the reader held, but
   *  the seed's rows were replayed into it and never there to anchor, so a
   *  wallet-signed row among them is not drawn. Present exactly when
   *  `anchored` is. */
  omitted?: {
    count: number;
    upToBlock: number;
    anchored?: number;
    anchoredComplete?: boolean;
    /** What the replay captured at the trim for the boundary card
     *  (rails-ops decision 0019): the position at the cut, the omitted rows
     *  by type and asset where it could count them, and the first/cut dates.
     *  Absent from a build that predates it — the card then draws from the
     *  count alone. */
    summary?: TimelineCutSummary;
  };
  /** Events left off the list because their block's timestamp could not be
   *  read — an undated event has no place on a timeline, and filling the blank
   *  with zero would date it to 1970. The balances and lifetime totals still
   *  include them. Absent when none. */
  undated?: number;
  /** Where the rows came from: a live sweep of the chain's logs (the default
   *  when absent), or the rails-server index read through the API. */
  source?: "sweep" | "index";
  /** The lane's oracle-at-block walk, when one prices this family's rows
   *  (rails-server api/src/services/price-walk-fill.ts). Absent on a sweep,
   *  on a lane with no walk, and from a server before the field. */
  fill?: TimelineFillState;
}

/** A running oracle-at-block walk as a timeline answer states it: the lane's
 *  frontier, what is left below it and how fast it moves, and how many of
 *  this answer's rows sit below it still unpriced. The page states the wait
 *  (components/shared/timeline-fill-well.tsx) only when `filling` and that
 *  count is above zero. */
export interface TimelineFillState {
  lane: string;
  /** A walk run is inside the lane's stale window and blocks remain below
   *  the frontier. */
  filling: boolean;
  complete: boolean | null;
  walkLow: number | null;
  remainingEventBlocks: number | null;
  eventBlocksPerDay: number | null;
  /** ISO time the lane state was read — the ETA counts from here. */
  measuredAt: string;
  unpricedRowsBelowFrontier: number;
}

/** The server's `fill` field, kept only when a walk prices the lane. */
export function timelineFillFromApi(raw: unknown): TimelineFillState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const f = raw as Record<string, unknown>;
  if (f.filler !== true || typeof f.lane !== "string" || typeof f.measuredAt !== "string") return undefined;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    lane: f.lane,
    filling: f.filling === true,
    complete: typeof f.complete === "boolean" ? f.complete : null,
    walkLow: num(f.walkLow),
    remainingEventBlocks: num(f.remainingEventBlocks),
    eventBlocksPerDay: num(f.eventBlocksPerDay),
    measuredAt: f.measuredAt,
    unpricedRowsBelowFrontier: num(f.unpricedRowsBelowFrontier) ?? 0,
  };
}

/** Per-reserve lifetime gross flows over the whole swept history — the shape
 *  the economics tower takes. Sent separately from the events because the event
 *  list is capped for very long histories and these are not: reducing a capped
 *  list into a bar labelled "all time" would state a recent window as a
 *  lifetime. */
export interface ChainLifetimeFlows {
  symbol: string;
  address?: string;
  decimals?: number;
  supplied: number;
  withdrawn: number;
  borrowed: number;
  repaid: number;
  liquidatedCollateral: number;
  liquidatedDebt: number;
  /** Debt the Pool burned as bad debt (DeficitCreated). The Base sweep does
   *  not read that topic and states 0; the Ethereum index lane carries it. */
  writtenOff: number;
  /** The highest running PRINCIPAL the replay recorded on each axis over the
   *  whole swept history — what a closed position's card shows as "highest
   *  recorded". Principal, not the rebased balance: the sweep replays emitted
   *  amounts, so interest accrued between events is not in these figures. */
  peakSupplied?: number;
  peakSuppliedRaw?: string;
  peakBorrowed?: number;
  peakBorrowedRaw?: string;
}

/** What every swept timeline carries, whatever the protocol: whose life it
 *  is, how many events that life holds, and the coverage that says what those
 *  events are a complete record OF. Where the events sit is the protocol's
 *  own choice — one flat list (Aave, Compound), or grouped per position
 *  (Morpho, where a position is a (market, wallet) pair) — which is why the
 *  fetch below is generic over this envelope rather than over one shape. */
export interface ChainTimelineEnvelope {
  wallet: string;
  totalEvents: number;
  coverage: ChainTimelineCoverage;
}

/** The flat shape: one chain-ordered event list plus per-market lifetime sums.
 *  `L` is the lifetime anatomy the explorer's own tower takes; the Aave-family
 *  default suits every Aave V3 fork, and a protocol whose flows differ
 *  (Moonwell's debt is emitted, not summed) names its own. */
export interface ChainTimelineResponse<L = ChainLifetimeFlows> extends ChainTimelineEnvelope {
  events: BaseActivityEvent[];
  lifetime: L[];
  /** Activity metadata over EVERY replayed row (not the rendered slice), for
   *  the position card's meta cluster: distinct transactions that were the
   *  wallet's own (liquidations excluded), and when the newest row landed.
   *  Absent from readers that have not yet reported them. */
  txCount?: number;
  lastActivityAt?: number | null;
  /** Liquidations over every replayed row — the whole life on an unseeded
   *  wallet, the tail on a seeded one whose seed carries the seized amounts
   *  and not a count (`lifetime` says whether any were seized before the
   *  cut). The drawn list is the newest thousand rows, so a count taken from
   *  it alone would miss every liquidation before the cut; the view adapters
   *  prefer this figure. Absent from readers that do not report it. */
  liquidationCount?: number;
}

/** Thrown when the route could not sweep at all — an unconfigured history
 *  endpoint, or an RPC that refused everything. Deliberately distinct from an
 *  empty timeline: "we could not look" and "there is nothing there" are
 *  different answers and the page must not print one for the other. */
export class ChainTimelineUnavailable extends Error {}

export async function fetchChainTimeline<T extends ChainTimelineEnvelope = ChainTimelineResponse>(p: {
  wallet: string;
  /** The sweep route for this explorer, e.g. `/api/chain/aave-v3-base/timeline`. */
  route: string;
  /** settle-mark label, so the waterfall names which sweep it timed. */
  mark?: string;
  baseUrl?: string;
  /** Extra query params a particular route understands. */
  params?: Record<string, string>;
}): Promise<T> {
  const qs = new URLSearchParams({ wallet: p.wallet, ...p.params });
  const url = `${p.baseUrl ?? ""}${p.route}?${qs.toString()}`;
  const done = settleFetchMark(p.mark ?? "chain-timeline");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    done(false);
    if (res.status === 503) throw new ChainTimelineUnavailable("The history endpoint did not answer.");
    throw new Error(`fetchChainTimeline failed: ${res.status} ${res.statusText}`);
  }
  // The route ships the lean wire shape (lib/shared/timeline-wire.ts). This is
  // the Base arm's only fetch client and it serves five explorers whose event
  // lists sit in different places, so the rehydrator handles both the flat
  // list and Morpho's per-position lists.
  const json = rehydrateChainTimelineWire(await res.json()) as T;
  done(true);
  return json;
}
