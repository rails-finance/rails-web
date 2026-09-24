"use client";

// THE SEGMENT PICKER — the months of a position's life, above its timeline,
// as a persistent in-view tool (rails-ops decision 0019, amendment
// 2026-09-24, rule 1). The page holds one segment of time; this is how a
// reader moves it.
//
// Desktop: the year-row by month-column matrix the activity map draws, kept
// short. The loaded segment is banded, a thin bar under a cell marks the rows
// in view, a click on a month outside the band loads it on release, a click
// inside scrolls to it. Nothing loads while a pointer moves.
//
// Phone: a sticky strip of month labels that scrolls sideways, three in view,
// a year at each January, the loaded month underlined; heat is the
// underline's opacity and nothing else. A tap, or a swipe that settles, loads.
// No year-level jump, no vertical rail (both judged and set aside).
//
// Every count here is the whole life's, from `lifeDays` (lib/shared/
// timeline-segments.ts). Marks are drawn for the loaded rows only: the other
// months are counted, not marked. The row cap is never a number here.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MONTH_NAMES, bucketClass, relLevel } from "@/components/shared/transaction-heatmap";
import type { SignificanceMarks } from "@/lib/shared/timeline-navigator";
import {
  dayStartOf,
  monthCounts,
  monthEndTs,
  monthIdxOf,
  monthLabel,
  monthStartTs,
} from "@/lib/shared/timeline-segments";

export interface TimelineSegmentPickerProps {
  /** The whole life's events per UTC day. */
  lifeDays: ReadonlyMap<number, number>;
  /** The loaded segment's extent in seconds: the band. */
  loaded: { from: number; to: number };
  /** The rows in view, newest and oldest, or null while nothing is. */
  inView: { newest: number; oldest: number } | null;
  /** Marks over the loaded rows. */
  marks: SignificanceMarks | null;
  /** The month being loaded, while one is. */
  loadingMonth: number | null;
  /** A month outside the band: load it. */
  onPick: (monthIdx: number) => void;
  /** A month inside the band: scroll the rows to it. */
  onScrollTo: (monthIdx: number) => void;
}

/** A month is inside the band when the loaded rows reach its first day: the
 *  newest month is always open at its end, and the oldest loaded month, when
 *  the rows open part way through it, is a month to load whole. */
function inBand(idx: number, loaded: { from: number; to: number }): boolean {
  return monthStartTs(idx) >= dayStartOf(loaded.from) && monthStartTs(idx) <= loaded.to;
}

function fracOfMonth(ts: number): number {
  const idx = monthIdxOf(ts);
  return (ts - monthStartTs(idx)) / (monthEndTs(idx) - monthStartTs(idx) + 1);
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

const n = (v: number) => v.toLocaleString("en-US");

export function TimelineSegmentPicker({
  lifeDays,
  loaded,
  inView,
  marks,
  loadingMonth,
  onPick,
  onScrollTo,
}: TimelineSegmentPickerProps) {
  const months = useMemo(() => monthCounts(lifeDays), [lifeDays]);
  const { first, last, max } = useMemo(() => {
    let first = Infinity;
    let last = -Infinity;
    let max = 0;
    for (const [idx, count] of months) {
      if (count <= 0) continue;
      if (idx < first) first = idx;
      if (idx > last) last = idx;
      if (count > max) max = count;
    }
    return { first, last, max };
  }, [months]);

  const commit = useCallback(
    (idx: number) => {
      if (inBand(idx, loaded)) onScrollTo(idx);
      else onPick(idx);
    },
    [loaded, onPick, onScrollTo],
  );

  if (!Number.isFinite(first)) return null;

  return (
    <div data-segment-picker="" className="sticky top-0 z-30 -mx-1 bg-background px-1 pb-2 pt-1">
      <MonthMatrix
        months={months}
        first={first}
        last={last}
        max={max}
        loaded={loaded}
        inView={inView}
        marks={marks}
        loadingMonth={loadingMonth}
        onCommit={commit}
      />
      <MonthStrip
        months={months}
        first={first}
        last={last}
        max={max}
        loaded={loaded}
        inView={inView}
        loadingMonth={loadingMonth}
        onCommit={commit}
      />
    </div>
  );
}

// ── Desktop: the matrix ─────────────────────────────────────────────────────

interface GridProps {
  months: ReadonlyMap<number, number>;
  first: number;
  last: number;
  max: number;
  loaded: { from: number; to: number };
  inView: { newest: number; oldest: number } | null;
  loadingMonth: number | null;
  onCommit: (idx: number) => void;
}

function MonthMatrix({
  months,
  first,
  last,
  max,
  loaded,
  inView,
  marks,
  loadingMonth,
  onCommit,
}: GridProps & { marks: SignificanceMarks | null }) {
  const [armed, setArmed] = useState<number | null>(null);
  const bandLo = monthIdxOf(loaded.from);
  const bandHi = monthIdxOf(loaded.to);
  const viewLo = inView ? monthIdxOf(inView.oldest) : null;
  const viewHi = inView ? monthIdxOf(inView.newest) : null;
  const years: number[] = [];
  for (let y = Math.floor(first / 12); y <= Math.floor(last / 12); y++) years.push(y);
  const anyOwner = marks ? [...marks.month.values()].some((m) => m.owner) : false;
  const anyLiquidation = marks ? [...marks.month.values()].some((m) => m.liquidation) : false;

  const release = (e: React.PointerEvent<HTMLElement>) => {
    if (armed == null) return;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const cell = under?.closest?.("[data-segment-cell]") as HTMLElement | null;
    const idx = cell ? Number(cell.dataset.segmentCell) : NaN;
    setArmed(null);
    if (idx === armed) onCommit(idx);
  };

  return (
    <div className="hidden sm:block" data-segment-matrix="">
      <div
        className="grid select-none items-center gap-x-1 gap-y-[3px] text-[10px] text-rb-500"
        style={{ gridTemplateColumns: "auto repeat(12, minmax(0, 1fr))" }}
        onPointerUp={release}
        onPointerCancel={() => setArmed(null)}
      >
        <div />
        {MONTH_NAMES.map((m) => (
          <div key={m} className="text-center">
            {m}
          </div>
        ))}
        {years.map((y) => (
          <FragmentRow key={y}>
            <div className="pr-2 text-right tabular-nums">{y}</div>
            {MONTH_NAMES.map((_, m) => {
              const idx = y * 12 + m;
              const live = idx >= first && idx <= last;
              const count = months.get(idx) ?? 0;
              const selectable = live && count > 0;
              const banded = live && idx >= bandLo && idx <= bandHi;
              const bandEdge =
                banded && bandLo !== bandHi && Math.floor(bandLo / 12) === Math.floor(bandHi / 12)
                  ? idx === bandLo
                    ? "left"
                    : idx === bandHi
                      ? "right"
                      : "middle"
                  : "alone";
              const mark = marks?.month.get(idx);
              const barOn = viewLo != null && viewHi != null && idx >= viewLo && idx <= viewHi;
              const barL = barOn && idx === viewLo && inView ? fracOfMonth(inView.oldest) : 0;
              const barR = barOn && idx === viewHi && inView ? fracOfMonth(inView.newest) : 1;
              const barW = Math.max(barR - barL, 0.06);
              const label = live ? `${MONTH_NAMES[m]} ${y} · ${n(count)} ${count === 1 ? "event" : "events"}` : "";
              return (
                <button
                  key={idx}
                  type="button"
                  data-segment-cell={idx}
                  data-cell-live={live ? "" : undefined}
                  data-cell-band={banded ? "" : undefined}
                  data-cell-in-view={barOn ? "" : undefined}
                  tabIndex={selectable ? 0 : -1}
                  aria-label={label || undefined}
                  aria-disabled={!selectable || undefined}
                  title={label}
                  onPointerDown={() => selectable && setArmed(idx)}
                  onKeyDown={(e) => {
                    if (!selectable || (e.key !== "Enter" && e.key !== " ")) return;
                    e.preventDefault();
                    onCommit(idx);
                  }}
                  className={`relative h-3.5 rounded-sm transition-colors ${live ? bucketClass(relLevel(count, max)) : "bg-transparent"} ${
                    selectable ? "cursor-pointer hover:shadow-[inset_0_0_0_1px_var(--foreground)]" : "cursor-default"
                  } ${armed === idx ? "shadow-[0_0_0_1px_var(--color-teal-400)]" : ""} ${
                    loadingMonth === idx ? "animate-pulse" : ""
                  } focus-visible:outline-2 focus-visible:outline-teal-400`}
                >
                  {banded && (
                    <span
                      aria-hidden
                      className={`pointer-events-none absolute -inset-y-[3px] border-y border-teal-500/55 bg-teal-500/15 dark:border-teal-400/55 dark:bg-teal-400/15 ${
                        bandEdge === "alone"
                          ? "-inset-x-[3px] rounded-[5px] border-x"
                          : bandEdge === "left"
                            ? "-left-[3px] -right-1 rounded-l-[5px] border-l"
                            : bandEdge === "right"
                              ? "-left-1 -right-[3px] rounded-r-[5px] border-r"
                              : "-inset-x-1"
                      }`}
                    />
                  )}
                  {mark?.liquidation && (
                    <span
                      aria-hidden
                      data-cell-mark="liquidation"
                      className="pointer-events-none absolute left-[1px] top-[1px] h-1 w-1 rounded-full bg-red-500"
                    />
                  )}
                  {mark?.owner && (
                    <span
                      aria-hidden
                      data-cell-mark="owner"
                      className="pointer-events-none absolute inset-x-[1px] bottom-0 h-[2px] rounded-sm bg-foreground/60"
                    />
                  )}
                  {barOn && (
                    <span
                      aria-hidden
                      data-cell-bar=""
                      className="pointer-events-none absolute -bottom-1.5 h-[2px] rounded-sm bg-foreground"
                      style={{ left: `${(barL * 100).toFixed(1)}%`, width: `${(barW * 100).toFixed(1)}%` }}
                    />
                  )}
                </button>
              );
            })}
          </FragmentRow>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[10px] text-rb-500">
        <span className="max-w-[78ch] leading-snug">
          Marks are drawn for the loaded segment; the other months are counted, not marked.
        </span>
        <span className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-3 rounded-[3px] border border-teal-500/55 bg-teal-500/15 dark:border-teal-400/55 dark:bg-teal-400/15" />
            loaded
          </span>
          <span className="flex items-center gap-1">
            <span className="h-[2px] w-3 rounded-sm bg-foreground" />
            in view
          </span>
          {anyOwner && (
            <span className="flex items-center gap-1">
              <span className="h-[2px] w-3 rounded-sm bg-foreground/60" />
              signed by the owner
            </span>
          )}
          {anyLiquidation && (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              liquidation
            </span>
          )}
          <span className="flex items-center gap-1">
            <span>Less</span>
            {[0, 1, 2, 3, 4].map((level) => (
              <span key={level} className={`inline-block h-2.5 w-2.5 rounded-sm ${bucketClass(level)}`} />
            ))}
            <span>More</span>
          </span>
        </span>
      </div>
    </div>
  );
}

/** A grid row is its cells: no wrapper, so the grid's own columns place them. */
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// ── Phone: the strip ────────────────────────────────────────────────────────

function MonthStrip({ months, first, last, max, loaded, inView, loadingMonth, onCommit }: GridProps) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const programmatic = useRef(false);
  const settleTimer = useRef<number | null>(null);
  // A settle loads only after a READER's gesture: the strip also scrolls
  // itself, to follow the rows and to centre a tapped label, and a settle
  // read off one of those scrolls mid-animation would load whichever month
  // the label passed over.
  const gesture = useRef(false);
  const bandLo = monthIdxOf(loaded.from);
  const bandHi = monthIdxOf(loaded.to);
  // The month whose rows are at the top of the screen carries the full
  // accent; the other months of the band a lighter one.
  const here = inView ? monthIdxOf(inView.newest) : bandHi;
  const [centred, setCentred] = useState<number | null>(null);

  const centreOn = useCallback((idx: number, smooth: boolean) => {
    const strip = stripRef.current;
    const label = strip?.querySelector<HTMLElement>(`[data-strip-month="${idx}"]`);
    if (!strip || !label) return;
    programmatic.current = true;
    strip.scrollTo({
      left: label.offsetLeft - (strip.clientWidth - label.offsetWidth) / 2,
      behavior: smooth && !reducedMotion() ? "smooth" : "auto",
    });
    window.setTimeout(
      () => {
        programmatic.current = false;
      },
      smooth ? 450 : 50,
    );
  }, []);

  // Follow the rows: when the month at the top of the screen changes, the
  // strip centres on it. Only while the strip is on screen (a desktop reader
  // has the matrix instead, and this is `display: none` there).
  useEffect(() => {
    if (here === centred) return;
    const strip = stripRef.current;
    if (!strip || strip.clientWidth === 0) return;
    setCentred(here);
    centreOn(here, centred != null);
  }, [here, centred, centreOn]);

  const centreMonth = (): number | null => {
    const strip = stripRef.current;
    if (!strip) return null;
    const r = strip.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    let best: number | null = null;
    let bestDistance = Infinity;
    strip.querySelectorAll<HTMLElement>("[data-strip-month]").forEach((el) => {
      const b = el.getBoundingClientRect();
      const d = Math.abs(b.left + b.width / 2 - cx);
      if (d < bestDistance) {
        bestDistance = d;
        best = Number(el.dataset.stripMonth);
      }
    });
    return best;
  };

  const settleTo = (idx: number) => {
    const count = months.get(idx) ?? 0;
    if (count === 0) {
      centreOn(here, true);
      return;
    }
    setCentred(idx);
    onCommit(idx);
  };

  // A swipe that settles: the label nearest the centre once scrolling stops.
  const onScroll = () => {
    if (programmatic.current || !gesture.current) return;
    if (settleTimer.current != null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      gesture.current = false;
      if (loadingMonth != null) return;
      const idx = centreMonth();
      if (idx != null && idx !== here) settleTo(idx);
    }, 160);
  };
  const onGesture = () => {
    gesture.current = true;
  };
  const onTap = (idx: number, empty: boolean) => {
    // The tap is the pick; the scroll it causes is not a swipe.
    gesture.current = false;
    if (settleTimer.current != null) window.clearTimeout(settleTimer.current);
    settleTimer.current = null;
    if (!empty) settleTo(idx);
  };

  const labels: number[] = [];
  for (let i = first; i <= last; i++) labels.push(i);

  return (
    <div
      ref={stripRef}
      data-segment-strip=""
      onScroll={onScroll}
      onTouchStart={onGesture}
      onPointerDown={onGesture}
      onWheel={onGesture}
      className="flex select-none snap-x snap-mandatory overflow-x-auto border-b border-rb-200/60 pt-1 [scrollbar-width:none] sm:hidden dark:border-rb-800/60 [&::-webkit-scrollbar]:hidden"
    >
      <div className="shrink-0 basis-1/3" aria-hidden />
      {labels.map((idx) => {
        const count = months.get(idx) ?? 0;
        const empty = count === 0;
        const banded = idx >= bandLo && idx <= bandHi;
        const isHere = idx === here;
        const showYear = idx === first || idx % 12 === 0;
        const opacity = empty ? 0.15 : 0.25 + (0.75 * relLevel(count, max)) / 4;
        return (
          <button
            key={idx}
            type="button"
            data-strip-month={idx}
            data-strip-band={banded ? "" : undefined}
            data-strip-here={isHere ? "" : undefined}
            tabIndex={empty ? -1 : 0}
            aria-label={`${monthLabel(idx)}, ${n(count)} ${count === 1 ? "event" : "events"}`}
            aria-disabled={empty || undefined}
            onClick={() => onTap(idx, empty)}
            className={`relative grid shrink-0 basis-1/3 snap-center justify-items-center gap-px px-1.5 pb-2 pt-1 text-[13px] ${
              empty ? "cursor-default" : "cursor-pointer"
            } ${banded || isHere ? "text-foreground" : "text-rb-500"} ${isHere ? "font-semibold" : ""} ${
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
                isHere
                  ? "h-[3px] bg-teal-500 dark:bg-teal-400"
                  : banded
                    ? "h-[3px] bg-teal-500 dark:bg-teal-400"
                    : "h-[2px] bg-rb-500"
              }`}
              style={{ opacity: isHere ? 1 : banded ? 0.5 : opacity }}
            />
          </button>
        );
      })}
      <div className="shrink-0 basis-1/3" aria-hidden />
    </div>
  );
}
