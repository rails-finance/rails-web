"use client";

// A Trove's 7-day rate-change cooldown, while it runs, in the timeline's head
// slot (rails-ops TO-DO-ui-jobs 831; anatomy L7.3). Liquity V2 and each fork's
// Trove page draw it the same way. The deadline is read from the rows the page
// holds (lib/liquity-v2/rate-cooldown.ts); a Trove with no cooldown running,
// a closed or zombie Trove and a shut-down branch draw none. Live only: no row
// states a cooldown that has ended.
//
// It stands in the slot through `ChainTruthTimeline`'s `liveWindow`: a fact
// about this one Trove at now, so it is outside every count and every filter,
// and the market notes switch leaves it standing. The frame is the T1 shape of
// <NoteRowShell>: the hourglass node, the words, the time left in the date
// column, no ⋮ and no number.

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { LinkedValue } from "@/components/shared/linked-value";
import { NoteRowShell } from "@/components/shared/note-row-shell";
import { Prov, type Provenance, type ProvInput } from "@/components/shared/provenance";
import { formatDate } from "@/lib/date";
import { formatTimestamp } from "@/lib/shared/format-event";
import { useChainId } from "@/lib/shared/chain-context";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAsymmetryEvent, isBasedollarEvent, isEbisuEvent, isLiquityEvent } from "@/lib/shared/types/event-shape";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import {
  cooldownLeft,
  INTEREST_RATE_ADJ_COOLDOWN,
  rateCooldown,
  type CooldownRow,
  type CooldownStart,
  type RateCooldown,
  type RateCooldownClock,
} from "@/lib/liquity-v2/rate-cooldown";

/** The page's rows as the cooldown reads them: Liquity V2's and the three
 *  forks' Trove events. Anything else (a surplus claim) is left out. */
export function cooldownRows(events: readonly BaseActivityEvent[]): CooldownRow[] {
  const out: CooldownRow[] = [];
  for (const e of events) {
    const base = { id: e.id, timestamp: e.timestamp, blockNumber: e.blockNumber, txHash: e.txHash };
    if (isLiquityEvent(e)) {
      const d = e.context.data;
      out.push({
        ...base,
        op: d.operation,
        batchManager:
          d.batchManager ?? d.stateAfter?.interestBatchManager ?? d.batchUpdate?.interestBatchManager ?? null,
      });
    } else if (isEbisuEvent(e) || isAsymmetryEvent(e) || isBasedollarEvent(e)) {
      const d = e.context.data;
      out.push({ ...base, op: d.eventType, batchManager: d.batchManager ?? null });
    }
  }
  return out;
}

/** Seconds now, ticking each minute; null until mounted, so the server and
 *  the first client render draw nothing. */
function useNowSeconds(active: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [active]);
  return active ? now : null;
}

/** The head slot's row for a Trove page, or undefined where no cooldown runs:
 *  pass it as `ChainTruthTimeline`'s `liveWindow`. `active` is false on a
 *  closed or zombie Trove and on a shut-down branch. */
export function useRateCooldownWindow({
  events,
  folders,
  active,
  positionPath,
  cooldown = INTEREST_RATE_ADJ_COOLDOWN,
}: {
  events: readonly BaseActivityEvent[];
  /** The Trove page's path, which the event links hang off. */
  positionPath: string;
  folders?: readonly ServedFolder[] | null;
  active: boolean;
  cooldown?: number;
}): (() => ReactNode) | undefined {
  const now = useNowSeconds(active);
  const rows = useMemo(() => cooldownRows(events), [events]);
  const state = useMemo(
    () => (now == null ? null : rateCooldown(rows, { now, cooldown, folders: folders ?? [] })),
    [rows, now, cooldown, folders],
  );
  if (!active || now == null || !state) return undefined;
  return () => <RateCooldownRow state={state} now={now} positionPath={positionPath} />;
}

/** "28 Nov 2026, 14:32 UTC". */
const dateTime = (ts: number) => `${formatDate(ts)}, ${formatTimestamp(ts)} UTC`;

/** What started a clock, as the clause after "when". */
const STARTED: Record<CooldownStart, string> = {
  open: "the Trove opened",
  "open-batch": "the Trove opened in the batch",
  rate: "the Trove's rate changed",
  join: "the Trove joined the batch",
  leave: "the Trove left the batch",
  "batch-rate": "the delegate changed the batch's rate",
};

const COOLDOWN_INPUT: ProvInput = {
  label: "INTEREST_RATE_ADJ_COOLDOWN",
  value: "7 days",
  kind: "chain",
  definition: true,
  note: "Dependencies/Constants.sol",
};

/** A clock's time as a receipt leaf: the block time of the event that set it. */
function clockInput(label: string, clock: RateCooldownClock, chainId: ChainId): ProvInput {
  return {
    label,
    value: dateTime(clock.row.timestamp),
    kind: "chain",
    contract: { name: "TroveManager" },
    note: `set to the block's time when ${STARTED[clock.start]}, block ${clock.row.blockNumber.toLocaleString("en-US")}`,
    verify: {
      kind: "etherscan",
      href: explorerUrl(chainId, "tx", clock.row.txHash),
      text: "To check: open the transaction and read its block's time.",
    },
  };
}

/** The receipt behind the deadline the fee test reads. */
function deadlineProv(state: RateCooldown, chainId: ChainId): Provenance {
  const batched = state.batchManager != null;
  const inputs = batched
    ? [
        clockInput("Trove lastInterestRateAdjTime", state.troveClock, chainId),
        ...(state.delegate ? [clockInput("batch lastInterestRateAdjTime", state.delegate, chainId)] : []),
        COOLDOWN_INPUT,
      ]
    : [clockInput("lastInterestRateAdjTime", state.clock, chainId), COOLDOWN_INPUT];
  return {
    kind: "chain-derived",
    summary: batched
      ? "End of the Trove's rate-change cooldown — the later of the Trove's and the batch's lastInterestRateAdjTime plus INTEREST_RATE_ADJ_COOLDOWN; leaving the batch at another rate before it costs an Upfront Borrowing Fee. Liquity's docs call it the premature adjustment fee."
      : "End of the Trove's rate-change cooldown — its lastInterestRateAdjTime plus INTEREST_RATE_ADJ_COOLDOWN; a rate change before it costs an Upfront Borrowing Fee. Liquity's docs call it the premature adjustment fee.",
    formula: batched
      ? "max(Trove, batch lastInterestRateAdjTime) + INTEREST_RATE_ADJ_COOLDOWN"
      : "lastInterestRateAdjTime + INTEREST_RATE_ADJ_COOLDOWN",
    inputs,
    source: { block: state.clock.row.blockNumber, txHash: state.clock.row.txHash },
  };
}

/** The receipt behind the delegate's cooldown on the batch's rate. */
function delegateProv(clock: RateCooldownClock, chainId: ChainId): Provenance {
  return {
    kind: "chain-derived",
    summary:
      "End of the batch's rate-change cooldown — the batch's lastInterestRateAdjTime plus INTEREST_RATE_ADJ_COOLDOWN; a batch rate change before it costs the batch an Upfront Borrowing Fee.",
    formula: "batch lastInterestRateAdjTime + INTEREST_RATE_ADJ_COOLDOWN",
    inputs: [clockInput("batch lastInterestRateAdjTime", clock, chainId), COOLDOWN_INPUT],
    source: { block: clock.row.blockNumber, txHash: clock.row.txHash },
  };
}

/** The event page each start opens, as its tooltip names it. */
const STARTED_EVENT: Record<CooldownStart, string> = {
  open: "Opening event →",
  "open-batch": "Opening event →",
  rate: "Rate change event →",
  join: "Batch join event →",
  leave: "Batch leave event →",
  "batch-rate": "Batch rate change event →",
};

/** The words for the row that set a clock, linked to its event page: a
 *  LinkedValue (anatomy L14) whose tooltip names that page. */
export function CooldownEventLink({ clock, positionPath }: { clock: RateCooldownClock; positionPath: string }) {
  return (
    <LinkedValue
      href={`${positionPath}/event/${encodeURIComponent(clock.row.id)}`}
      tip={STARTED_EVENT[clock.start]}
      label={STARTED[clock.start]}
      className="underline decoration-dotted underline-offset-2"
      dataAttrs={{ "data-rate-cooldown-event": clock.row.id }}
    >
      {STARTED[clock.start]}
    </LinkedValue>
  );
}

export function RateCooldownRow({
  state,
  now,
  positionPath,
}: {
  state: RateCooldown;
  now: number;
  positionPath: string;
}) {
  const chainId = useChainId();
  const eventLink = (clock: RateCooldownClock) => <CooldownEventLink clock={clock} positionPath={positionPath} />;
  const batched = state.batchManager != null;
  const ends = dateTime(state.clock.endsAt);
  const left = cooldownLeft(state.clock.endsAt - now);
  const words = batched
    ? `Leaving the batch at another rate before ${ends} costs an Upfront Borrowing Fee`
    : `A rate change before ${ends} costs an Upfront Borrowing Fee`;
  const prov = deadlineProv(state, chainId);
  const fee = <>The fee is 7 days of average interest on the Trove&apos;s debt, added to the debt.</>;
  const fromBatch = batched && state.clock.start === "batch-rate";

  return (
    <div
      data-anatomy="L7.3"
      data-note-item="rate-cooldown"
      data-rate-cooldown-ends={state.clock.endsAt}
      data-rate-cooldown-start={state.clock.start}
      data-rate-cooldown-batched={batched ? "" : undefined}
    >
      <NoteRowShell
        icon="cooldown"
        label={`Rate-change cooldown, ${words}, ${left} left`}
        marker={{ attr: "data-rate-cooldown", value: state.clock.row.id }}
        header={
          // Long words wrap inside their cell, so the chevron and the
          // time left keep the row's right end.
          <span
            className="min-w-0 max-w-full text-sm text-rb-500 max-sm:text-center max-sm:text-xs sm:flex-1"
            data-head-kind=""
          >
            {words}
          </span>
        }
        meta={
          <span className="evt-meta ml-auto inline-flex min-h-6 items-center gap-2 whitespace-nowrap">
            <span className="text-xs text-foreground tabular-nums" data-rate-cooldown-left="">
              {left}
            </span>
          </span>
        }
      >
        <div className="space-y-2.5 px-5 pb-3 pt-3 text-sm max-sm:text-xs">
          {batched ? (
            <p data-rate-cooldown-clock="">
              The Trove&apos;s clock started on {dateTime(state.troveClock.row.timestamp)}, when{" "}
              {eventLink(state.troveClock)}.
              {fromBatch && (
                <>
                  {" "}
                  On {dateTime(state.clock.row.timestamp)} {eventLink(state.clock)}, and the later of the two clocks
                  counts.
                </>
              )}{" "}
              Leaving the batch at another rate before{" "}
              <Prov info={prov} value={String(state.clock.endsAt)}>
                {ends}
              </Prov>{" "}
              costs an Upfront Borrowing Fee.
            </p>
          ) : (
            <p data-rate-cooldown-clock="">
              The Trove&apos;s clock started on {dateTime(state.clock.row.timestamp)}, when {eventLink(state.clock)}. A
              rate change before{" "}
              <Prov info={prov} value={String(state.clock.endsAt)}>
                {ends}
              </Prov>{" "}
              costs an Upfront Borrowing Fee.
            </p>
          )}
          <p data-rate-cooldown-fee="">{fee}</p>
          <p data-rate-cooldown-same="">
            {batched ? "Leaving at the batch's rate pays nothing." : "A change to the same rate pays nothing."}
          </p>
          {state.delegate && (
            <p data-rate-cooldown-delegate="">
              The delegate&apos;s cooldown on the batch&apos;s rate runs until{" "}
              <Prov info={delegateProv(state.delegate, chainId)} value={String(state.delegate.endsAt)}>
                {dateTime(state.delegate.endsAt)}
              </Prov>
              : a batch rate change before then costs the batch an Upfront Borrowing Fee, shared across its Troves.
            </p>
          )}
          <p className="text-xs text-rb-500">Not counted in this page&apos;s events.</p>
        </div>
      </NoteRowShell>
    </div>
  );
}
