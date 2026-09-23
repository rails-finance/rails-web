// A position whose history Rails is still pricing says so, with a date.
// ----------------------------------------------------------------------------
// A Base lane's oracle-at-block walk prices event blocks newest first, and a
// row below its frontier renders token-only until the walk reaches it — which
// on the page looks the same as a lane with no prices at all. The timeline
// answer carries the lane's walk (`coverage.fill`, rails-server
// api/src/services/price-walk-fill.ts), and this well states the wait above the
// timeline when THIS answer holds unpriced rows below the frontier of a walk
// that is running. Nothing is drawn on a lane with no walk, a finished walk, a
// walk that has stopped running, or a position whose rows are all above the
// frontier (rails-ops TO-DO-ui-jobs.md §40).
//
// The date: a hand-set one from lib/shared/fill-eta-overrides.ts wins;
// otherwise the event blocks left below the frontier over the last 24 hours'
// rate, counted from when the server read them, as a UTC calendar day. Once
// that day has ended with the walk unfinished, the date clause is dropped.
// Same panel as the listing's "still being assembled" banner
// (base-lending-coverage-banner.tsx).

import type { TimelineFillState } from "@/lib/api/fetch-chain-timeline";
import { FILL_ETA_OVERRIDES } from "@/lib/shared/fill-eta-overrides";

const DAY_MS = 86_400_000;

export interface FillWellState {
  /** UTC midnight of the expected day, or null when no date is stated. */
  expectedBy: Date | null;
  source: "override" | "rate" | null;
}

/** Whether the well shows, and with what date. `null` = no well. */
export function fillWellState(
  fill: TimelineFillState | undefined,
  now: number = Date.now(),
  overrides: Record<string, string> = FILL_ETA_OVERRIDES,
): FillWellState | null {
  if (!fill || !fill.filling || fill.unpricedRowsBelowFrontier <= 0) return null;
  let expectedBy: Date | null = null;
  let source: FillWellState["source"] = null;
  const override = overrides[fill.lane];
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) {
    expectedBy = new Date(`${override}T00:00:00Z`);
    source = "override";
  } else if (fill.remainingEventBlocks != null && fill.eventBlocksPerDay != null && fill.eventBlocksPerDay > 0) {
    const eta = Date.parse(fill.measuredAt) + (fill.remainingEventBlocks / fill.eventBlocksPerDay) * DAY_MS;
    if (Number.isFinite(eta)) {
      expectedBy = new Date(Math.floor(eta / DAY_MS) * DAY_MS);
      source = "rate";
    }
  }
  // The stated day has ended and the walk has not: say it is in hand, no date.
  if (expectedBy && expectedBy.getTime() + DAY_MS <= now) {
    expectedBy = null;
    source = null;
  }
  return { expectedBy, source };
}

function longDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
}

export function TimelineFillWell({ fill }: { fill: TimelineFillState | undefined }) {
  const s = fillWellState(fill);
  if (!s || !fill) return null;
  return (
    <div
      className="mb-3 rounded-xl bg-raised p-4 text-[13px] leading-relaxed"
      data-fill-well={fill.lane}
      data-fill-eta-source={s.source ?? "none"}
    >
      <p className="font-medium text-foreground">
        USD values for part of this position&rsquo;s history are still being filled in.
      </p>
      <p className="mt-1 text-rb-500">
        Rails is processing them{s.expectedBy ? <>; expected by {longDate(s.expectedBy)}.</> : "."}
      </p>
    </div>
  );
}
