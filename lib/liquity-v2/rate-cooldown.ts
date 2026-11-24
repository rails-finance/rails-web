// The 7-day rate-change cooldown of a Liquity V2 Trove (and each fork's), read
// from the Trove's own timeline rows (rails-ops TO-DO-ui-jobs 831;
// reference/liquity-v2-fees-and-interest.md (a)).
//
// The rule, from the contracts. `Troves[id].lastInterestRateAdjTime` is set on
// open, on a rate change, on joining a batch and on leaving one. A rate change
// (`adjustTroveInterestRate`) inside INTEREST_RATE_ADJ_COOLDOWN of it charges
// the Upfront Borrowing Fee. A batched Trove cannot change its rate; leaving
// its batch at another rate is the change, and `_removeFromBatch` tests the
// Trove's `getLatestTroveData` time, which on a batched Trove is the later of
// the batch's clock and the Trove's (`_getLatestTroveDataFromBatch`). The
// batch's clock is set by every `setBatchManagerAnnualInterestRate`. A join
// always charges, so it never has a cooldown of its own to state.
//
// Live only (Miles, 24 Nov 2026): the answer is the cooldown running now, or
// nothing. Rows the page does not hold cannot settle a clock, so where a
// served folder newer than the clock row may hold a clock-setting member the
// answer is nothing.
//
// No `@/` imports: scripts/test/rate-cooldown.test.mjs runs it as it stands.

/** `INTEREST_RATE_ADJ_COOLDOWN` in `Dependencies/Constants.sol`: 7 days on
 *  Liquity V2 and on each fork Rails reads (Ebisu, Asymmetry, Basedollar). */
export const INTEREST_RATE_ADJ_COOLDOWN = 7 * 86_400;

/** What set the Trove's clock. */
export type CooldownStart = "open" | "open-batch" | "rate" | "join" | "leave" | "batch-rate";

/** One timeline row, as the cooldown reads it. `op` is the family's operation
 *  name (Liquity V2's `operation`, a fork's `eventType`). */
export interface CooldownRow {
  id: string;
  op: string;
  timestamp: number;
  blockNumber: number;
  txHash: string;
  /** The batch manager the Trove is in after this row, where the row says. */
  batchManager?: string | null;
}

/** A served folder, as the cooldown reads it: its span and its members' kinds. */
export interface CooldownFolder {
  kind: string;
  lastAt: number;
  counts: { key: string; count: number }[];
}

/** The operations that set the Trove's own clock, and what each started. */
const TROVE_CLOCK: Record<string, CooldownStart> = {
  openTrove: "open",
  openTroveAndJoinBatch: "open-batch",
  adjustTroveInterestRate: "rate",
  setInterestBatchManager: "join",
  removeFromBatch: "leave",
};
const BATCH_RATE = "setBatchManagerAnnualInterestRate";

export interface RateCooldownClock {
  /** The row that set this clock. */
  row: CooldownRow;
  start: CooldownStart;
  /** Unix seconds the cooldown ends: the row's time plus the cooldown. */
  endsAt: number;
}

export interface RateCooldown {
  cooldown: number;
  /** The clock the fee test reads: the Trove's, or on a batched Trove the
   *  later of the Trove's (its join) and the batch's. */
  clock: RateCooldownClock;
  /** The Trove's own clock, which on a batched Trove its join set. */
  troveClock: RateCooldownClock;
  /** The batch manager, on a batched Trove; null otherwise. */
  batchManager: string | null;
  /** The batch's clock, where a rate change of the delegate's since the join
   *  is still inside its cooldown. */
  delegate: RateCooldownClock | null;
}

/** Rows in time order. A batch switch is a leave then a join in one
 *  transaction (`switchBatchManager`), and rows carry no log index, so in one
 *  block a leave goes first. */
const byTime = (a: CooldownRow, b: CooldownRow) =>
  a.timestamp - b.timestamp ||
  a.blockNumber - b.blockNumber ||
  (a.op === "removeFromBatch" ? 0 : 1) - (b.op === "removeFromBatch" ? 0 : 1);

/** A folder newer than `ts` that may hold one of `ops`. */
function folderHides(folders: readonly CooldownFolder[], ts: number, ops: readonly string[]): boolean {
  return folders.some(
    (f) =>
      f.lastAt >= ts &&
      (f.counts.length === 0
        ? f.kind !== "redemption" && f.kind !== "liquidation"
        : f.counts.some((c) => ops.includes(c.key) && c.count > 0)),
  );
}

/** The cooldown running at `now`, or null: none runs, or the rows the page
 *  holds cannot settle it. */
export function rateCooldown(
  rows: readonly CooldownRow[],
  {
    now,
    cooldown = INTEREST_RATE_ADJ_COOLDOWN,
    folders = [],
  }: { now: number; cooldown?: number; folders?: readonly CooldownFolder[] },
): RateCooldown | null {
  const sorted = [...rows].sort(byTime);
  let last: CooldownRow | null = null;
  for (const r of sorted) if (TROVE_CLOCK[r.op]) last = r;
  if (!last) return null;
  if (folderHides(folders, last.timestamp, Object.keys(TROVE_CLOCK))) return null;
  const start = TROVE_CLOCK[last.op];
  const troveClock: RateCooldownClock = { row: last, start, endsAt: last.timestamp + cooldown };
  const batched = start === "join" || start === "open-batch";

  if (!batched) {
    return troveClock.endsAt > now
      ? { cooldown, clock: troveClock, troveClock, batchManager: null, delegate: null }
      : null;
  }

  // The batch's clock: its newest rate change the Trove carried since the join.
  const joined = last;
  const manager = joined.batchManager?.toLowerCase() ?? null;
  let batchRow: CooldownRow | null = null;
  for (const r of sorted)
    if (
      r.op === BATCH_RATE &&
      byTime(r, joined) >= 0 &&
      (manager == null || r.batchManager == null || r.batchManager.toLowerCase() === manager)
    )
      batchRow = r;
  if (folderHides(folders, batchRow?.timestamp ?? joined.timestamp, [BATCH_RATE])) return null;
  const batchClock: RateCooldownClock | null = batchRow
    ? { row: batchRow, start: "batch-rate", endsAt: batchRow.timestamp + cooldown }
    : null;
  const clock = batchClock && batchClock.endsAt > troveClock.endsAt ? batchClock : troveClock;
  if (clock.endsAt <= now) return null;
  return {
    cooldown,
    clock,
    troveClock,
    batchManager: manager,
    delegate: batchClock && batchClock.endsAt > now ? batchClock : null,
  };
}

/** The time left, on one short scale: "5d 3h", "3h 12m", "12m", "under 1m". */
export function cooldownLeft(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins < 1) return "under 1m";
  const days = Math.floor(mins / 1440);
  const hrs = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (days > 0) return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`;
  if (hrs > 0) return m > 0 ? `${hrs}h ${m}m` : `${hrs}h`;
  return `${m}m`;
}
