"use client";

// THE SEGMENT PICKER — the months of a position's life, above its timeline
// (rails-ops decision 0019, amendment 2026-09-24, rule 1). The page holds one
// segment of time; this is how a reader moves it.
//
// One grid: year rows by month columns, every month the position lived
// through drawn as a plain clickable label. A click shows that month's rows in
// place of the month the page holds. Previous and Next step to the
// neighbouring month that holds events, and Newest goes back to the rows the
// page opened with. A month the position did not live through is drawn and
// refuses the click.
//
// Phone: the same months as a strip that scrolls sideways, a year at each
// January, the loaded month underlined. A tap loads it.
//
// ⚠️ CUT BACK TO A LOW-FI NAVIGATOR, 2026-09-24 evening. Miles: "for the date
// navigator, while i think the dynamic highlights in the nav are a clever
// feature i would prefer to keep the navigator more low-fi, we don't need the
// infinite scroll type just a more rudimentary navigator that is clickable
// between months." What went with that: the significance marks (liquidation
// dot, owner underline, market-note ring), the band of loaded months and its
// in-view bar, the heat ramp, the click that scrolled to a month already on
// the page, and the phone strip's swipe-to-load. A click loads, and that is
// the whole grammar.
//
// Every count here is the whole life's, from `lifeDays`
// (lib/shared/timeline-segments.ts). The row cap is never a number here.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MONTH_NAMES } from "@/components/shared/transaction-heatmap";
import { monthCounts, monthLabel } from "@/lib/shared/timeline-segments";

export interface TimelineSegmentPickerProps {
  /** The whole life's events per UTC day. */
  lifeDays: ReadonlyMap<number, number>;
  /** The month the page holds as its segment, or null at rest — when the page
   *  holds the rows it opened with, whose newest month is where a reader is. */
  month: number | null;
  /** The month being loaded, while one is. */
  loadingMonth: number | null;
  /** Show that month's rows in place of the current month's. */
  onPick: (monthIdx: number) => void;
  /** Back to the rows the page opened with. Null at rest. */
  onReset: (() => void) | null;
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

const n = (v: number) => v.toLocaleString("en-US");

export function TimelineSegmentPicker({ lifeDays, month, loadingMonth, onPick, onReset }: TimelineSegmentPickerProps) {
  const months = useMemo(() => monthCounts(lifeDays), [lifeDays]);
  /** The months that hold events, oldest first: what Previous and Next step
   *  through, and the grid's own extent. */
  const live = useMemo(
    () =>
      [...months.entries()]
        .filter(([, count]) => count > 0)
        .map(([idx]) => idx)
        .sort((a, b) => a - b),
    [months],
  );
  const first = live[0];
  const last = live[live.length - 1];
  // At rest the page holds its newest rows, so the newest month is where a
  // reader stands and Previous steps back from there.
  const current = month ?? last;
  const at = live.indexOf(current);
  const previous = at > 0 ? live[at - 1] : null;
  const next = at >= 0 && at < live.length - 1 ? live[at + 1] : null;

  if (live.length === 0) return null;

  return (
    <div data-segment-picker="" className="sticky top-0 z-30 -mx-1 bg-background px-1 pb-2 pt-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-1.5 text-[11px] text-rb-500">
        <div className="flex items-center gap-1">
          <StepButton
            data-segment-prev=""
            label={previous == null ? "No earlier month" : `Previous month, ${monthLabel(previous)}`}
            disabled={previous == null || loadingMonth != null}
            onPress={() => previous != null && onPick(previous)}
          >
            ‹ Previous
          </StepButton>
          <StepButton
            data-segment-next=""
            label={next == null ? "No later month" : `Next month, ${monthLabel(next)}`}
            disabled={next == null || loadingMonth != null}
            onPress={() => next != null && onPick(next)}
          >
            Next ›
          </StepButton>
        </div>
        <span data-segment-current-label="" className="text-foreground">
          {monthLabel(loadingMonth ?? current)}
        </span>
        {onReset && (
          <StepButton
            data-segment-reset=""
            label="Back to the newest events"
            disabled={loadingMonth != null}
            onPress={onReset}
          >
            Newest
          </StepButton>
        )}
      </div>
      <MonthMatrix
        months={months}
        first={first}
        last={last}
        current={current}
        loadingMonth={loadingMonth}
        onPick={onPick}
      />
      <MonthStrip months={months} live={live} current={current} loadingMonth={loadingMonth} onPick={onPick} />
    </div>
  );
}

function StepButton({
  children,
  label,
  disabled,
  onPress,
  ...rest
}: {
  children: React.ReactNode;
  label: string;
  disabled: boolean;
  onPress: () => void;
} & Record<`data-${string}`, string>) {
  return (
    <button
      type="button"
      {...rest}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onPress}
      className="rounded-sm border border-rb-200 px-1.5 py-0.5 text-[11px] leading-tight text-rb-600 hover:border-rb-400 hover:text-foreground disabled:cursor-default disabled:border-rb-200/60 disabled:text-rb-400 disabled:hover:text-rb-400 focus-visible:outline-2 focus-visible:outline-teal-400 dark:border-rb-800 dark:text-rb-400 dark:hover:border-rb-600 dark:disabled:border-rb-800/60"
    >
      {children}
    </button>
  );
}

// ── Desktop: the grid ───────────────────────────────────────────────────────

function MonthMatrix({
  months,
  first,
  last,
  current,
  loadingMonth,
  onPick,
}: {
  months: ReadonlyMap<number, number>;
  first: number;
  last: number;
  /** The month the page stands on: the loaded segment, or the newest month
   *  at rest. */
  current: number;
  loadingMonth: number | null;
  onPick: (idx: number) => void;
}) {
  const years: number[] = [];
  for (let y = Math.floor(first / 12); y <= Math.floor(last / 12); y++) years.push(y);

  return (
    <div className="hidden sm:block" data-segment-matrix="">
      <div
        className="grid select-none items-center gap-1 text-[10px] text-rb-500"
        style={{ gridTemplateColumns: "auto repeat(12, minmax(0, 1fr))" }}
      >
        {years.map((y) => (
          <FragmentRow key={y}>
            <div className="pr-2 text-right tabular-nums">{y}</div>
            {MONTH_NAMES.map((name, m) => {
              const idx = y * 12 + m;
              const live = idx >= first && idx <= last;
              const count = months.get(idx) ?? 0;
              const selectable = live && count > 0;
              const here = idx === current;
              const label = live
                ? `${name} ${y} · ${n(count)} ${count === 1 ? "event" : "events"}`
                : `${name} ${y} · no events`;
              return (
                <button
                  key={idx}
                  type="button"
                  data-segment-cell={idx}
                  data-cell-live={live ? "" : undefined}
                  data-cell-current={here ? "" : undefined}
                  tabIndex={selectable ? 0 : -1}
                  aria-label={label}
                  aria-disabled={!selectable || undefined}
                  title={label}
                  onClick={() => selectable && onPick(idx)}
                  className={`rounded-sm border py-[3px] text-center leading-tight ${
                    here
                      ? "border-teal-500 bg-teal-500/15 font-semibold text-foreground dark:border-teal-400 dark:bg-teal-400/15"
                      : selectable
                        ? "border-rb-200 text-rb-600 hover:border-rb-400 hover:text-foreground dark:border-rb-800 dark:text-rb-400 dark:hover:border-rb-600"
                        : "border-rb-200/40 text-rb-400/60 dark:border-rb-800/40"
                  } ${selectable ? "cursor-pointer" : "cursor-default"} ${
                    loadingMonth === idx ? "animate-pulse" : ""
                  } focus-visible:outline-2 focus-visible:outline-teal-400`}
                >
                  {name}
                </button>
              );
            })}
          </FragmentRow>
        ))}
      </div>
      <div className="mt-2 text-[10px] leading-snug text-rb-500">
        A month shows its own rows in place of the month on the page. Months the position did not live through are drawn
        and take no click.
      </div>
    </div>
  );
}

/** A grid row is its cells: no wrapper, so the grid's columns place them. */
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// ── Phone: the strip ────────────────────────────────────────────────────────

function MonthStrip({
  months,
  live,
  current,
  loadingMonth,
  onPick,
}: {
  months: ReadonlyMap<number, number>;
  live: readonly number[];
  current: number;
  loadingMonth: number | null;
  onPick: (idx: number) => void;
}) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [centred, setCentred] = useState<number | null>(null);

  const centreOn = useCallback((idx: number, smooth: boolean) => {
    const strip = stripRef.current;
    const label = strip?.querySelector<HTMLElement>(`[data-strip-month="${idx}"]`);
    if (!strip || !label) return;
    strip.scrollTo({
      left: label.offsetLeft - (strip.clientWidth - label.offsetWidth) / 2,
      behavior: smooth && !reducedMotion() ? "smooth" : "auto",
    });
  }, []);

  // The strip follows the SELECTION, and nothing else: a reader's own sideways
  // scroll loads nothing (Miles, 2026-09-24 evening — a tap is the pick).
  useEffect(() => {
    if (current === centred) return;
    const strip = stripRef.current;
    if (!strip || strip.clientWidth === 0) return;
    setCentred(current);
    centreOn(current, centred != null);
  }, [current, centred, centreOn]);

  const labels: number[] = [];
  for (let i = live[0]; i <= live[live.length - 1]; i++) labels.push(i);

  return (
    <div
      ref={stripRef}
      data-segment-strip=""
      className="flex select-none snap-x snap-mandatory overflow-x-auto border-b border-rb-200/60 pt-1 [scrollbar-width:none] sm:hidden dark:border-rb-800/60 [&::-webkit-scrollbar]:hidden"
    >
      <div className="shrink-0 basis-1/3" aria-hidden />
      {labels.map((idx) => {
        const count = months.get(idx) ?? 0;
        const empty = count === 0;
        const isHere = idx === current;
        const showYear = idx === live[0] || idx % 12 === 0;
        return (
          <button
            key={idx}
            type="button"
            data-strip-month={idx}
            data-strip-here={isHere ? "" : undefined}
            tabIndex={empty ? -1 : 0}
            aria-label={`${monthLabel(idx)}, ${n(count)} ${count === 1 ? "event" : "events"}`}
            aria-disabled={empty || undefined}
            onClick={() => !empty && onPick(idx)}
            className={`relative grid shrink-0 basis-1/3 snap-center justify-items-center gap-px px-1.5 pb-2 pt-1 text-[13px] ${
              empty ? "cursor-default" : "cursor-pointer"
            } ${isHere ? "font-semibold text-foreground" : "text-rb-500"} ${
              loadingMonth === idx ? "animate-pulse" : ""
            } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-400`}
          >
            <span className="h-[11px] text-[9px] leading-[11px] tracking-wide text-rb-500 tabular-nums">
              {showYear ? Math.floor(idx / 12) : ""}
            </span>
            <span className={`leading-[18px] ${empty ? "opacity-35" : ""}`}>{MONTH_NAMES[idx % 12]}</span>
            <span
              aria-hidden
              className={`absolute inset-x-3 bottom-0 rounded-sm ${
                isHere ? "h-[3px] bg-teal-500 dark:bg-teal-400" : "h-[2px] bg-rb-500/25"
              }`}
            />
          </button>
        );
      })}
      <div className="shrink-0 basis-1/3" aria-hidden />
    </div>
  );
}
