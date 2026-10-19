"use client";

import { useCallback, useContext, useEffect, useId, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { EventCard } from "@/components/shared/event-card";
import { SheetSkeleton, type EventSheet } from "@/components/shared/event-sheet";
import type { EventCardPrice } from "@/components/shared/event-price-row";
import { GroupSheetCollector, type CollectedCard } from "@/components/shared/group-sheet";
import {
  mergeDelegateRunSheet,
  PreviousEventContext,
  type DelegateRunStep,
} from "@/components/protocol/liquity/delegate-run-sheet";
import { isLiquityEvent, type BaseActivityEvent } from "@/lib/shared/types/activity";
import { batchRateDebtMove } from "@/lib/liquity/batch-rate-move";
import { CountChip } from "@/components/shared/count-chip";
import type { SpineColumnProps } from "@/components/shared/spine-column";
import { GroupFrame, GroupNumbersContext, groupMenuWords, groupRangeText } from "@/components/shared/group-frame";
import {
  groupExplainer,
  MAX_BULLETS,
  RunLandingContext,
  sheetFig,
  sheetSideBullets,
  spanWords,
} from "@/components/shared/timeline-run-card";
import { LinkedAddress } from "@/components/shared/linked-address";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { formatDate } from "@/lib/date";
import { troveWords } from "@/lib/liquity/event-templates";
import { troveNodes } from "@/lib/liquity/trove-nodes";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { DelegateRatePillShell } from "@/components/shared/rate-pill";

/**
 * Delegate-adjust run card — one row standing in for a stretch of consecutive
 * batch-manager rate adjustments (setBatchManagerAnnualInterestRate), the same
 * de-noising treatment RedemptionRunCard gives redemption touches: the events
 * are the delegate's automation, not the owner acting, and no single tick
 * matters — only where the rate went. Since the member events are already in
 * the client's timeline payload the row expands in place to the individual
 * cards.
 *
 * It draws as every group does (`group-frame.tsx`): the bracket, no node of
 * its own, the dotted segment for the members not drawn, and its ⋮ to show
 * them; its words are "Adjusted" with the count's chip after it (ui-jobs
 * 331), the delegate named in the spoken label alone. The spine's flank carries the rate after the
 * last change in the pink delegate pill, its arrow the way the members moved
 * the rate (`moves`).
 *
 * The run states its net effect (rails-ops decision 0039, rule 6): the rate
 * before the first member → the rate after the last, and the range the run
 * moved through where it went outside them; a nil net change reads
 * "unchanged at" the rate, with the range where the rate moved
 * (`DelegateRunRatePill`). Here it is a muted line in the opened card, beside
 * the breakdown switch (Miles 17 Oct 2026); the served fork `batch_rate`
 * folder still draws it as the header's pink pill.
 */

/** The rates a delegate run's header states (%), each optional. */
export interface DelegateRunRates {
  /** The rate before the chronologically first adjust. */
  fromRate?: number;
  /** The rate after the chronologically last adjust. */
  toRate?: number;
  /** The lowest and highest rate the run passed through, the from-rate
   *  included. */
  lowRate?: number;
  highRate?: number;
}

/** Which of the header's rates a receipt traces. */
export type DelegateRunRateWhich = "first" | "last" | "low" | "high";

const pct = (r: number) => `${r.toFixed(2)}%`;
const cents = (r: number) => Math.round(r * 100);

/** What the pill says, at the two decimals it shows: the net move, or
 *  none, and whether the range is drawn beside it. */
function rateReading({ fromRate, toRate, lowRate, highRate }: DelegateRunRates) {
  if (fromRate == null || toRate == null) return undefined;
  const low = Math.min(fromRate, toRate, lowRate ?? fromRate);
  const high = Math.max(fromRate, toRate, highRate ?? fromRate);
  const unchanged = cents(fromRate) === cents(toRate);
  const showRange = unchanged
    ? cents(low) !== cents(high)
    : cents(low) < Math.min(cents(fromRate), cents(toRate)) || cents(high) > Math.max(cents(fromRate), cents(toRate));
  return { from: fromRate, to: toRate, low, high, unchanged, showRange };
}

/** The receipt behind one of the header's rates. `span` is the run's
 *  chronological bounds; `count` its members. */
export function delegateRunRateProv(which: DelegateRunRateWhich, span: [number, number], count: number): Provenance {
  const day = (ts: number) => `${shortDate(ts)} ${shortDateYear(ts)}`;
  const note = troveWords("run_rate_note", { count });
  if (which === "low" || which === "high") {
    const bound = troveWords(which === "low" ? "run_lowest" : "run_highest");
    return {
      kind: "chain",
      summary: troveWords("run_rate_bound_summary", { bound }),
      inputs: [
        {
          label: troveWords("run_rate_bound_input", { count: count.toLocaleString("en-US") }),
          value: day(span[0]) === day(span[1]) ? day(span[0]) : `${day(span[0])} – ${day(span[1])}`,
          kind: "chain",
        },
      ],
    };
  }
  const first = which === "first";
  return {
    kind: "chain",
    summary: first
      ? troveWords("run_rate_from_summary")
      : troveWords("run_rate_summary", { which: troveWords("run_last") }),
    inputs: [
      {
        label: troveWords("run_rate_input", { which: troveWords(first ? "run_first" : "run_last") }),
        value: day(first ? span[0] : span[1]),
        kind: "chain",
        note,
      },
    ],
  };
}

/** The header's rate pill in the delegate's pink: "0.85% → 1.10%", or
 *  "unchanged at 0.90%", each followed by ", moved between 0.85% and 1.10%"
 *  where the run went beyond them. Nothing without both ends. */
export function DelegateRunRatePill({
  rates,
  prov,
  echoLast,
  plain,
}: {
  rates: DelegateRunRates;
  prov: (which: DelegateRunRateWhich) => Provenance;
  /** The last rate's receipt is registered by another figure (the spine's
   *  flank), so the pill echoes it. */
  echoLast?: boolean;
  /** The same words as a muted line, without the pill (the V2 run's opened
   *  card, Miles 17 Oct 2026). */
  plain?: boolean;
}) {
  const r = rateReading(rates);
  if (!r) return null;
  const fig = (which: DelegateRunRateWhich, v: number) => (
    <Prov echo={echoLast && which === "last"} info={prov(which)} value={pct(v)}>
      {pct(v)}
    </Prov>
  );
  const body = (
    <>
      {r.unchanged ? (
        <span>{troveNodes("run_rate_unchanged", { rate: fig("last", r.to) })}</span>
      ) : (
        <>
          <span>{fig("first", r.from)}</span>
          <span aria-hidden="true">→</span>
          <span>{fig("last", r.to)}</span>
        </>
      )}
      {r.showRange && (
        <span className={plain ? "-ml-1.5" : "-ml-1.5 font-normal"}>
          {troveNodes("run_rate_range", { low: fig("low", r.low), high: fig("high", r.high) })}
        </span>
      )}
    </>
  );
  if (plain)
    return (
      <span
        className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-rb-500"
        data-group-rate={r.unchanged ? "unchanged" : "moved"}
      >
        {body}
      </span>
    );
  return (
    <span className="leading-[0]" data-group-rate={r.unchanged ? "unchanged" : "moved"}>
      <DelegateRatePillShell>{body}</DelegateRatePillShell>
    </span>
  );
}

/** The pill's fact in the spoken label's words: ": 0.85% to 1.10%" or
 *  ": unchanged at 0.90%", the range after it as the pill draws it. */
export function delegateRunMovementWords(rates: DelegateRunRates): string {
  const r = rateReading(rates);
  if (!r) return "";
  const net = r.unchanged
    ? troveWords("run_movement_unchanged", { rate: pct(r.to) })
    : troveWords("run_movement", { from: pct(r.from), to: pct(r.to) });
  return r.showRange ? net + troveWords("run_rate_range", { low: pct(r.low), high: pct(r.high) }) : net;
}

export interface DelegateAdjustRunCardProps extends DelegateRunRates {
  count: number;
  /** Which way the members moved the rate: every change up, every change
   *  down, or "both" otherwise (changes both ways, or none that moved it). */
  moves?: "up" | "down" | "both";
  /** The delegate's display name — only when every member names the same one. */
  managerName?: string;
  /** Chronological bounds of the run (either display order). */
  firstTimestamp: number;
  lastTimestamp: number;
  isLast?: boolean;
  /** The run's adjustments, oldest first: the sheet's debt and rate. */
  events: BaseActivityEvent[];
  /** The run's member cards, rendered when expanded. */
  children: ReactNode;
}

export function DelegateAdjustRunCard({
  count,
  fromRate,
  toRate,
  lowRate,
  highRate,
  moves,
  managerName,
  firstTimestamp,
  lastTimestamp,
  isLast,
  events,
  children,
}: DelegateAdjustRunCardProps) {
  const [open, setOpen] = useState(false);
  // A `?at=` landing on a member opens the run, as `TimelineRunCard` does.
  const landing = useContext(RunLandingContext);
  useEffect(() => {
    if (landing) setOpen(true);
  }, [landing]);
  // The summary card's balance sheet, read from the members' own once it
  // opens (`delegate-run-sheet.tsx`); the skeleton stands until they are read.
  const [merged, setMerged] = useState<{ sheet: EventSheet; price?: EventCardPrice } | null | undefined>(undefined);
  const onSheet = useCallback(
    (m: { sheet: EventSheet; price?: EventCardPrice } | null | undefined) => setMerged(m),
    [],
  );
  // Each adjustment's rate and debt move, its accrual measured from the
  // Trove's previous event.
  const previousOf = useContext(PreviousEventContext);
  const steps = useMemo<DelegateRunStep[]>(
    () =>
      events.flatMap((e, i) => {
        if (!isLiquityEvent(e)) return [];
        const c = e.context.data;
        if (!c.stateBefore || !c.stateAfter) return [];
        const prev = previousOf?.(e.id) ?? (i > 0 ? events[i - 1] : undefined);
        return [
          {
            id: e.id,
            timestamp: e.timestamp,
            before: c.stateBefore.annualInterestRate,
            after: c.stateAfter.annualInterestRate,
            move: batchRateDebtMove(c, prev, e),
            debt: [c.stateBefore.debt, c.stateAfter.debt] as [number, number],
          },
        ];
      }),
    [events, previousOf],
  );
  const merge = useCallback((cards: CollectedCard[]) => mergeDelegateRunSheet(cards, steps), [steps]);

  const [fromTs, toTs] =
    firstTimestamp <= lastTimestamp ? [firstTimestamp, lastTimestamp] : [lastTimestamp, firstTimestamp];
  const sameDay = shortDate(fromTs) === shortDate(toTs) && shortDateYear(fromTs) === shortDateYear(toTs);
  const range = sameDay
    ? `${shortDate(fromTs)} ${shortDateYear(fromTs)}`
    : `${shortDate(fromTs)} ${shortDateYear(fromTs)} – ${shortDate(toTs)} ${shortDateYear(toTs)}`;

  const toggle = () => setOpen((v) => !v);
  const membersId = useId();

  const rateProv = (which: DelegateRunRateWhich) => delegateRunRateProv(which, [fromTs, toTs], count);
  const rates: DelegateRunRates = { fromRate, toRate, lowRate, highRate };

  // The run's words, as T1 states them: no asset moved, so the spine draws
  // no node and the words stand (set C gives the spine the rate).
  const words = (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="inline-flex items-center text-sm font-medium text-rb-500">
        {troveWords("run_adjusted")}
        <CountChip count={count} />
      </span>
      <span className="evt-meta ml-auto inline-flex items-center gap-2 whitespace-nowrap">
        <span className="text-xs text-foreground">{range}</span>
      </span>
    </div>
  );
  const numberRange = useContext(GroupNumbersContext);
  const rangeText = groupRangeText(numberRange);
  // The group opens from its row's ⋮ ("Show 48 grouped events") and closes
  // from a member's ("Group 48 events"); the range rides the items' sub-line.
  const words2 = groupMenuWords(count, rangeText);
  const showMenu = { ...words2.show, show: () => !open && toggle() };
  const hide = { ...words2.hide, hide: () => open && toggle() };
  // No asset moved: the members' % glyph, the rate after the last change on
  // its flank, and the words stand; the batch manager acted, so the line runs
  // dotted.
  const column: SpineColumnProps = {
    icon: "rate-change",
    rateSpan: toRate != null ? [fromRate ?? 0, toRate] : undefined,
    rateMoves: moves,
    rateTone: "delegate",
    rateProv: toRate != null ? { info: rateProv("last"), value: pct(toRate) } : undefined,
    dotted: true,
    isLast: !!isLast,
  };

  const spokenRange = sameDay
    ? formatDate(fromTs)
    : troveWords("run_range_days", { from: formatDate(fromTs), to: formatDate(toTs) });
  const movement = delegateRunMovementWords(rates);
  const by = managerName ? troveWords("run_by", { manager: managerName }) : "";
  const countText = troveWords(count === 1 ? "run_count_one" : "run_count_many", {
    count: count.toLocaleString("en-US"),
  });

  // ── T3: the run's Explanation (rails-ops TO-DO-ui-jobs 372), in the shared
  // group shape (`groupExplainer`): who adjusted the rate how often and when,
  // the rate's path, the debt's before and after, what the run added to it,
  // the range where the rate left its ends (dropped first for room), and
  // where the members are.
  const manager = useMemo(() => {
    const all = new Set(events.map((e) => (isLiquityEvent(e) ? e.context.data.batchManager : undefined)));
    return all.size === 1 ? [...all][0] : undefined;
  }, [events]);
  const rateFig = (which: DelegateRunRateWhich, v: number) => (
    <Prov echo info={rateProv(which)} value={pct(v)}>
      <strong className="font-semibold text-foreground">{pct(v)}</strong>
    </Prov>
  );
  const span = spanWords(fromTs, toTs);
  const countWord = count.toLocaleString("en-US");
  const bullets: ReactNode[] = [
    manager
      ? troveNodes("run_explain_happened", {
          manager: <LinkedAddress address={manager} label={managerName} />,
          count: countWord,
          span,
        })
      : troveNodes("run_explain_happened_unnamed", { count: countWord, span }),
  ];
  const reading = rateReading(rates);
  if (reading)
    bullets.push(
      reading.unchanged
        ? troveNodes("run_explain_rate_unchanged", { rate: rateFig("last", reading.to) })
        : troveNodes("run_explain_rate", { from: rateFig("first", reading.from), to: rateFig("last", reading.to) }),
    );
  bullets.push(...sheetSideBullets(merged?.sheet, new Set(["collateral"])));
  const debtRows = merged?.sheet.sides.find((s) => s.side === "debt" && !s.id)?.rows ?? [];
  // What the run added to the debt, as the sheet sums it, with the upfront
  // fees in the same bullet where there are any; a zero sum says nothing.
  const amountOf = (key: string) => {
    const a = debtRows.find((r) => r.key === key)?.amount;
    return a && Number(String(a.text).replace(/[^0-9.]/g, "")) > 0 ? a : undefined;
  };
  const interestAmt = amountOf("group-interest");
  const upfrontAmt = amountOf("group-upfront");
  if (interestAmt && upfrontAmt) {
    bullets.push(
      troveNodes("run_explain_interest_upfront", {
        amount: sheetFig(interestAmt, interestAmt.symbol),
        upfront: sheetFig(upfrontAmt, upfrontAmt.symbol),
        symbol: interestAmt.symbol ?? "",
      }),
    );
  } else if (interestAmt)
    bullets.push(
      troveNodes("run_explain_interest", {
        amount: sheetFig(interestAmt, interestAmt.symbol),
        symbol: interestAmt.symbol ?? "",
      }),
    );
  // The range takes a bullet only where the closing note still fits.
  if (reading?.showRange && bullets.length + 2 <= MAX_BULLETS)
    bullets.push(
      troveNodes("run_explain_range", { low: rateFig("low", reading.low), high: rateFig("high", reading.high) }),
    );
  const collector = (
    <GroupSheetCollector
      members={children}
      count={count}
      label={troveWords("run_adjusted")}
      merge={merge}
      onSheet={onSheet}
    />
  );
  // The collector mounts under whichever tab is open, so the sheet's figures
  // reach the bullets on the default tab.
  const explainer = groupExplainer(bullets, collector);

  return (
    <GroupFrame
      open={open}
      show={showMenu.show}
      hide={hide}
      membersId={membersId}
      range={numberRange}
      closed={
        <EventCard
          avatar={null}
          groupMenu={showMenu}
          slots={{
            spine: column,
            head: { row: <div className="pl-5 pt-4 pb-3">{words}</div> },
            caption: "",
            cells: { none: troveWords("run_cells_none") },
            // The rate move opens with the card, as a muted line beside the
            // breakdown switch.
            sheet: merged
              ? { ...merged.sheet, lead: <DelegateRunRatePill rates={rates} prov={rateProv} echoLast plain /> }
              : undefined,
            price: merged?.price,
            ledgers: { none: troveWords("run_ledgers_none") },
            notes: (
              <div data-group-summary="" data-group-sheet={merged ? "" : undefined}>
                {collector}
                {merged === undefined && <SheetSkeleton />}
              </div>
            ),
            explainer,
            learnMore: null,
          }}
          // On a phone the caption carries the word, the count's chip and the
          // range.
          phoneCaption={
            <>
              {troveWords("run_adjusted")}
              <CountChip count={count} />{" "}
              {troveNodes("run_phone_caption", { range: <span className="text-foreground">{range}</span> })}
            </>
          }
          spokenCaption={troveWords("run_spoken", { range: spokenRange })}
          label={troveWords("run_label", { count_text: countText, by, range: spokenRange, movement })}
          group="summary"
        />
      }
      members={children}
    />
  );
}
