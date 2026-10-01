"use client";

// The Lifetime flows panel on a position with a series (rails-ops
// reference/lifetime-flows-scrubber.md): the headlines with the date on their
// row, the bars, and the collateral and debt line under them as a short strip,
// one cursor for both. The strip's horizontal axis is the slider: a press, a
// press and drag (mouse, pen and touch alike; hovering moves nothing) or the
// arrow keys move the cursor there, and play walks it along. The cursor stands on the line's points and on every day
// with events (tapping an event dot jumps to it); what the headlines and the
// bars state there is `combinedAt` (lib/shared/flows-combined.ts). The strip
// after the cursor is dimmed. The dashed outline marks where each bar ends today. Before the bars'
// window opens the bars grey out at the window's first day and say so. Under
// the strip, the playback controls, and on a page tied to its timeline "Apply
// to timeline". The line's key sits in the panel's Explanation and its basis
// beside the (i).

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight, List, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { Headline, Rescaled, Throughput, TrackEnds, useWidth } from "@/components/shared/lifetime-flows-busy";
import { FlowCursorContext, KEEP_PANEL, SegmentTipContext } from "@/components/shared/lifetime-flows-tip";
import { useFlowFocus, useFlowFocusState } from "@/components/shared/flow-focus-context";
import { CTRL_GHOST, CTRL_OFF, CTRL_ON_ACCENT } from "@/lib/shared/ui-grammar";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { assetsAt, axisFor, DAY_MS, dayStart, formatFlowUsd, type FlowModel } from "@/lib/shared/flows-timeline";
import { throughput } from "@/lib/shared/flows-busy";
import type { FlowBinSeries } from "@/lib/shared/flows-series";
import {
  combinedAt,
  combinedStops,
  eventStep,
  axisSpanDays,
  nearestStop,
  stopForDay,
  type CombinedStop,
} from "@/lib/shared/flows-combined";

/** Tick colours: the side an event moved; a liquidation in the critical red. */
export const FLOW_TICK: Record<FlowModel["ticks"][number]["tick"], string> = {
  collateral: "var(--color-blue-500)",
  debt: "var(--color-green-400)",
  both: "linear-gradient(to bottom, var(--color-blue-500) 50%, var(--color-green-400) 50%)",
  liquidation: "var(--color-red-500)",
};

/** The line's hues; the panel's Key draws the same. */
export const LINE_HUE = { collateral: "var(--color-blue-500)", debt: "var(--color-green-400)" };

const STRIP_H = 80;
/** The strip's inset each side. */
const PAD = 8;
/** The lead-in: the strip's time axis starts this share of its width before
 *  the first event's day, never under LEAD_MIN_PX, drawn at zero, so the first
 *  event never sits on the left border. */
const LEAD_SHARE = 0.06;
const LEAD_MIN_PX = 16;
const dayStamp = (tsSec: number) => `${shortDate(tsSec)} ${shortDateYear(tsSec)}`;
/** A walk of the whole line takes about this long, a point no faster than
 *  PLAY_MIN_MS nor slower than PLAY_MAX_MS. */
const PLAY_WALK_MS = 9000;
const PLAY_MIN_MS = 45;
const PLAY_MAX_MS = 220;

export interface CombinedFlowsProps {
  /** The whole life's model: the headlines and the line. */
  model: FlowModel;
  /** The model cut to the bars' window. */
  bars: FlowModel;
  /** The stop the bars' window opens on (0 where it covers the whole life). */
  from: number;
  busy: boolean;
  /** The line's series, or null while it loads. */
  series: FlowBinSeries | null;
  failed: boolean;
  /** A ledger's note while the cursor is off its last stop (Aave V4). */
  onLedgerNote?: (note: string | null) => void;
  /** The plain bars at a stop of `bars` (the scrubber's); `atLive` is the
   *  last stop, where no outline of today's length is drawn. */
  renderBars: (barStop: number, when: string, isLive: boolean, atLive: boolean) => ReactNode;
}

export function CombinedFlows({
  model,
  bars,
  from,
  busy,
  series,
  failed,
  onLedgerNote,
  renderBars,
}: CombinedFlowsProps) {
  // A cut restored from the address bar puts the cursor on its day, which
  // is a stop of its own where the line has no point there. Days here are
  // absolute UTC days: a stop counts from `model.start`, which moves where a
  // page's model is rebuilt over more of the life (a Liquity fork's whole
  // history landing after its preload).
  const startDay = model.start / DAY_MS;
  const [restoreDay, setRestoreDay] = useState<number | null>(null);
  const stops = useMemo(
    () => combinedStops(model, series, from, restoreDay == null ? null : restoreDay - model.start / DAY_MS),
    [model, series, from, restoreDay],
  );
  const last = stops.length - 1;
  const [at, setAt] = useState(last);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // A new series (the first read landing) puts the cursor at today, or on
  // the day a frozen cursor stands on (`keepDay`, kept below).
  const lastRef = useRef(last);
  lastRef.current = last;
  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  const keepDay = useRef<number | null>(null);
  useEffect(() => {
    const keep = keepDay.current == null ? null : keepDay.current - model.start / DAY_MS;
    const i = keep == null ? -1 : stopsRef.current.findIndex((x) => !x.live && x.stop === keep);
    setAt(i >= 0 ? i : lastRef.current);
  }, [model, series, from]);
  const halt = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPlaying(false);
  }, []);
  useEffect(() => halt, [halt]);
  useEffect(() => {
    if (playing && at >= last) halt();
  }, [playing, at, last, halt]);
  const go = (i: number) => {
    halt();
    setAt(Math.max(0, Math.min(last, i)));
  };
  const play = () => {
    if (timer.current) return halt();
    if (at >= last) setAt(0);
    setPlaying(true);
    const ms = Math.max(PLAY_MIN_MS, Math.min(PLAY_MAX_MS, PLAY_WALK_MS / Math.max(1, last)));
    timer.current = setInterval(() => setAt((i) => Math.min(last, i + 1)), ms);
  };

  // On a page that ties the panel to its timeline, the day is the unit the
  // two share. A click on the strip freezes the cursor on a day; the chart and
  // the bars show it and the list is untouched. "Apply to timeline" cuts the
  // list at the cursor's day close and brings that day's last card into
  // view; the cut stays where it is while the chart moves, until Apply is
  // pressed again or the timeline chip's × clears it. A card's "View on
  // chart" freezes the cursor on its day from the other side. The back and
  // forward steps go by days with events. A second click on the frozen day,
  // Escape or the jump to today releases the freeze. A click on a segment
  // opens a short tip with its line, value and share.
  const focus = useFlowFocus();
  const byDays = focus != null;
  const [frozen, setFrozen] = useState(false);
  useEffect(() => {
    if (!frozen) return;
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) setFrozen(false);
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [frozen]);
  /** A click or a tap on the strip: freeze there, or release where the
   *  freeze already stands. */
  const tapStop = (i: number) => {
    if (frozen && i === at) {
      setFrozen(false);
      return;
    }
    go(i);
    setFrozen(true);
  };
  const stepBack = () => go(byDays ? eventStep(stops, at, -1) : at - 1);
  const stepOn = () => go(byDays ? eventStep(stops, at, 1) : at + 1);
  const committed = stops[Math.min(at, last)];
  const committedEnd = committed
    ? committed.live
      ? Number.MAX_SAFE_INTEGER
      : dayStart(model, committed.stop) + 86_399
    : Number.MAX_SAFE_INTEGER;
  const committedWord =
    committed && !committed.live ? dayStamp(dayStart(model, committed.stop)) : dayStamp(Date.now() / 1000);
  useEffect(() => {
    focus?.store.set({ cursor: { endTs: committedEnd, word: committedWord, live: !!committed?.live } });
  }, [focus?.store, committedEnd, committedWord, committed?.live]);
  // Read by the series effect above in the next commit, so it holds the
  // stop the cursor was last put on. Only a move or a freeze writes it: in a
  // commit whose stops changed, `at` is still the old list's index until that
  // effect moves it.
  const tracked = useRef({ at, frozen, stops });
  useEffect(() => {
    const prev = tracked.current;
    tracked.current = { at, frozen, stops };
    if (prev.stops !== stops || (prev.at === at && prev.frozen === frozen)) return;
    keepDay.current = frozen && committed && !committed.live ? startDay + committed.stop : null;
  });
  // The frozen day, which a card's chart button hides on.
  const frozenDay =
    frozen && committed ? Math.floor((committed.live ? Date.now() / 1000 : committedEnd) / 86_400) : null;
  useEffect(() => {
    if (focus && focus.store.get().frozenDay !== frozenDay) focus.store.set({ frozenDay });
  }, [focus, frozenDay]);
  useEffect(() => () => focus?.store.set({ cursor: null, frozenDay: null }), [focus?.store]);
  // "Apply to timeline": the cut at the cursor's day close. Nothing to cut at
  // today, nor where that cut already stands.
  const applied = useFlowFocusState((s) => s.rewind?.endTs ?? null);
  const canApply = byDays && !!committed && !committed.live && applied !== committedEnd;
  // The page stays where it is (Miles, 1 Oct 2026): the cut's top card
  // flashes once the visitor scrolls it into view.
  const apply = () => {
    if (!focus || !canApply) return;
    focus.store.set({ rewind: { endTs: committedEnd, word: committedWord } });
  };
  const move = useFlowFocusState((s) => s.move);
  const moved = useRef<number | null>(null);
  useEffect(() => {
    if (!move || moved.current === move.n) return;
    moved.current = move.n;
    const i = stopForDay(stops, Math.floor(move.ts / 86_400) - model.start / DAY_MS);
    if (i != null) {
      halt();
      setAt(i);
      setFrozen(true);
    }
  }, [move, stops, model.start, halt]);
  // A cut restored from the address bar (`useRewindParam`): the cursor goes
  // to its day's close, frozen there.
  const restore = useFlowFocusState((s) => s.restore);
  const restored = useRef<number | null>(null);
  const restoreTo = useRef<number | null>(null);
  useEffect(() => {
    if (!restore || restored.current === restore.n) return;
    const day = Math.floor(restore.endTs / 86_400);
    const stop = day - model.start / DAY_MS;
    // A model that does not reach the day yet (a preload's) waits for the
    // one that does.
    if (stop < 0 || stop >= model.liveStop) return;
    restored.current = restore.n;
    // Taken once: a panel mounted later starts at today.
    focus?.store.set({ restore: null });
    halt();
    restoreTo.current = day;
    keepDay.current = day;
    setRestoreDay(day);
    setFrozen(true);
  }, [restore, model.start, model.liveStop, halt, focus?.store]);
  useEffect(() => {
    const to = restoreTo.current == null ? null : restoreTo.current - startDay;
    if (to == null) return;
    const i = stops.findIndex((x) => !x.live && x.stop === to);
    if (i < 0) return;
    restoreTo.current = null;
    setAt(i);
  }, [stops, restore]);

  const cur: CombinedStop = stops[Math.min(at, last)];
  const { head, bars: barState } = combinedAt(model, bars, cur);
  const assets = useMemo(() => assetsAt(model, cur.stop), [model, cur.stop]);
  const hasDebt = model.buckets.some((b) => b.side === "debt");
  const closed = !(model.heldAt[model.heldAt.length - 1] ?? []).some((h) => (h.amount ?? 0) > 0);
  const closeDay = dayStamp(dayStart(model, model.lastDay));
  const atClose = head.isLive && closed;
  const dateText = atClose
    ? `At close, ${closeDay}`
    : head.isLive
      ? (model.words.live ?? "Today, live prices")
      : dayStamp(dayStart(model, cur.stop));
  const when = atClose ? `the close on ${closeDay}` : head.isLive ? "now" : `the end of ${dateText}`;
  const dateLine = atClose
    ? `Position at close, ${closeDay}`
    : head.isLive
      ? `Position ${dateText.charAt(0).toLowerCase()}${dateText.slice(1)}`
      : `Position on ${dateText}`;
  const liveReceipts = head.isLive && !closed;
  const ledgerText = head.isLive ? null : closed ? "Shows the position at close" : "Shows the position today";
  useEffect(() => {
    onLedgerNote?.(ledgerText);
  }, [onLedgerNote, ledgerText]);
  useEffect(() => () => onLedgerNote?.(null), [onLedgerNote]);
  const outside = barState == null;
  const windowDay = dayStamp(dayStart(model, from));
  const through = useMemo(() => (busy ? throughput(bars) : null), [busy, bars]);
  // Outside the window the bars hold the window's first day, greyed.
  const barStop = cur.barStop ?? 0;
  const barAssets = useMemo(() => assetsAt(bars, barStop), [bars, barStop]);
  const btn = `${CTRL_GHOST} ${CTRL_OFF} size-11 shrink-0 rounded-md sm:size-9`;
  const tickHere = cur.event && !cur.live ? model.ticks.find((t) => t.day === cur.stop) : undefined;
  // What an open segment panel reads: the date in words and the cursor's
  // steps, so the panel restates its figures as the cursor moves.
  const cursor = useMemo(
    () => ({
      at: atClose ? `at close, ${closeDay}` : head.isLive ? `today (${dayStamp(Date.now() / 1000)})` : `at ${dateText}`,
      prev: stepBack,
      next: stepOn,
      canPrev: byDays ? eventStep(stops, at, -1) !== at : at > 0,
      canNext: at < last,
      live: !outside,
    }),
    // `go` closes over `last`, listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [atClose, closeDay, head.isLive, dateText, at, last, outside, byDays, stops],
  );

  return (
    <FlowCursorContext.Provider value={cursor}>
      <SegmentTipContext.Provider value={byDays || null}>
        <div className="text-sm" data-flows-combined="" data-flow-frozen={frozen ? "" : undefined}>
          <Steady>
            {through && <Throughput t={through} hasDebt={hasDebt} />}
            {/* The headlines, and the date they are at on the same row's
                right end. */}
            <div className="mb-2 flex flex-wrap items-center gap-x-6 gap-y-2" data-flow-headlines="" data-anatomy="F2">
              <Headline
                side="collateral"
                st={head.collateral}
                model={model}
                when={when}
                isLive={liveReceipts}
                assets={assets}
              />
              {hasDebt && (
                <Headline side="debt" st={head.debt} model={model} when={when} isLive={liveReceipts} assets={assets} />
              )}
              <p
                className="ml-auto min-w-0 text-xs font-semibold tabular-nums text-foreground sm:text-sm"
                aria-live="polite"
                data-flow-date=""
                data-anatomy="F2.1"
              >
                {dateLine}
              </p>
            </div>
            <div className="relative" data-flow-combined-bars={outside ? "outside" : "inside"} data-anatomy="F3">
              <div
                className={outside ? "pointer-events-none opacity-35 grayscale" : undefined}
                aria-hidden={outside || undefined}
                {...(outside ? { inert: true } : {})}
              >
                {busy ? (
                  <Rescaled
                    model={bars}
                    s={barState ?? combinedAt(model, bars, { stop: from, barStop: 0 }).bars!}
                    hasDebt={hasDebt}
                    when={when}
                    isLive={liveReceipts}
                    assets={barAssets}
                    headlines={false}
                    outline={!cur.live}
                  />
                ) : (
                  renderBars(barStop, when, liveReceipts, cur.live)
                )}
              </div>
              {outside && (
                <p
                  className="absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-md border border-rb-200 bg-raised px-2 py-1 text-xs font-medium text-rb-500 shadow-sm dark:border-rb-700"
                  data-flow-outside-window=""
                >
                  Before the bars&rsquo; window, {windowDay}
                </p>
              )}
            </div>
          </Steady>

          <div {...KEEP_PANEL}>
            <LineStrip
              model={model}
              series={series}
              failed={failed}
              stops={stops}
              at={Math.min(at, last)}
              head={{ collateral: head.collateral.now, debt: head.debt.now }}
              hasDebt={hasDebt}
              windowFrom={from > 0 ? model.start / DAY_MS + from : null}
              valueText={tickHere?.kinds.length ? `${dateLine}: ${tickHere.kinds.join(", ")}` : dateLine}
              onPick={go}
              ends={{ start: dayStamp(dayStart(model, 0)), end: closed ? closeDay : "Today" }}
              freeze={byDays ? { frozen, onTap: tapStop } : null}
            />
          </div>

          {/* The playback controls at the left; "Apply to timeline" at the
              right, on a page that ties the panel to its timeline. */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="-ml-2 flex items-center gap-x-1" data-flow-controls="" data-anatomy="F5" {...KEEP_PANEL}>
              <button type="button" className={btn} aria-label="Jump to opening" onClick={() => go(0)}>
                <SkipBack size={16} aria-hidden />
              </button>
              <button
                type="button"
                className={btn}
                aria-label={byDays ? "Previous day with events" : "Previous date"}
                onClick={stepBack}
              >
                <ChevronLeft size={18} aria-hidden />
              </button>
              <button type="button" className={btn} aria-label={playing ? "Pause" : "Play"} onClick={play}>
                {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
              </button>
              <button
                type="button"
                className={btn}
                aria-label={byDays ? "Next day with events" : "Next date"}
                onClick={stepOn}
              >
                <ChevronRight size={18} aria-hidden />
              </button>
              <button
                type="button"
                className={btn}
                aria-label={closed ? "Jump to close" : "Jump to today"}
                onClick={() => {
                  go(last);
                  setFrozen(false);
                }}
              >
                <SkipForward size={16} aria-hidden />
              </button>
            </div>
            {byDays && (
              <button
                type="button"
                className={`${CTRL_GHOST} ${canApply ? CTRL_ON_ACCENT : "text-rb-400 disabled:cursor-default dark:text-rb-600"} ml-auto min-h-11 gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-semibold sm:min-h-9`}
                disabled={!canApply}
                title={
                  canApply
                    ? `Show the timeline up to the end of ${committedWord}`
                    : committed?.live
                      ? "Move the cursor to a past day to cut the timeline there"
                      : `The timeline is cut at ${committedWord}`
                }
                onClick={apply}
                data-flow-apply=""
                data-anatomy="F6"
                {...KEEP_PANEL}
              >
                <List size={16} aria-hidden />
                Apply to timeline
              </button>
            )}
          </div>

          {head.stale.length > 0 && (
            <p className="mt-2 text-[11px] leading-snug text-rb-500">
              {`${model.daily ? "No newer price recorded" : "Valued at each asset's last event price"}: ${head.stale
                .map((x) => `${x.symbol} from ${dayStamp(x.pricedAt)}`)
                .join(", ")}.`}
            </p>
          )}
        </div>
      </SegmentTipContext.Provider>
    </FlowCursorContext.Provider>
  );
}

/** Holds its height at the tallest it has been at this width, so the strip
 *  under it stays put while the cursor moves (the lines under the bars wrap
 *  to more or fewer rows on a phone); otherwise the strip would slide out
 *  from under the pointer that is moving the cursor. */
function Steady({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [min, setMin] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = el.getBoundingClientRect().width;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      if (Math.abs(r.width - width) > 0.5) {
        width = r.width;
        setMin(0);
        return;
      }
      setMin((m) => Math.max(m, r.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div style={{ minHeight: min || undefined }}>
      <div ref={ref}>{children}</div>
    </div>
  );
}

type Point = { to: number; collateral: number | null; debt: number | null };

/** How near, in px, a pointer must be to an event tick to open it. */
const TICK_REACH = { mouse: 6, touch: 14 };

/** The collateral and debt line, short and unlabelled (the headlines carry the
 *  figures), with the event ticks over it and the bars' window shaded. Its
 *  horizontal axis is the slider; the cursor snaps to the nearest stop, and
 *  tapping a tick jumps to that day's events. */
function LineStrip({
  model,
  series,
  failed,
  stops,
  at,
  head,
  hasDebt,
  windowFrom,
  valueText,
  onPick,
  ends,
  freeze,
}: {
  model: FlowModel;
  series: FlowBinSeries | null;
  failed: boolean;
  stops: CombinedStop[];
  at: number;
  /** The headlines' figures, where the cursor's dots sit. */
  head: { collateral: number; debt: number };
  hasDebt: boolean;
  windowFrom: number | null;
  valueText: string;
  onPick: (i: number) => void;
  /** The words under the strip's two ends: the first event's day, and today
   *  or the close's day. */
  ends: { start: string; end: string };
  /** On a page that ties the panel to its timeline: a click or a tap
   *  (a press that does not drag) freezes the cursor. */
  freeze: { frozen: boolean; onTap: (i: number) => void } | null;
}) {
  const [ref, w] = useWidth();
  const pipRef = useRef<HTMLDivElement>(null);
  const [pip, setPip] = useState<{ x: number; text: string; day: number } | null>(null);
  const dragging = useRef(false);
  const startDay = model.start / DAY_MS;
  // The last point is today's, at the live figures.
  const points = useMemo<Point[]>(() => {
    const out = (series?.points ?? []).map(([, to, collateral, debt]) => ({ to, collateral, debt }));
    const tail = out[out.length - 1];
    if (tail) {
      tail.collateral = model.live.collateralUsd;
      tail.debt = model.live.debtUsd;
    }
    return out;
  }, [series, model.live]);
  const n = points.length;
  // Fixed per position: the line's points and every day's figures, so the
  // cursor's dots stay inside the strip on an event day too.
  const axis = useMemo(() => {
    let peak = 0;
    for (const p of points) peak = Math.max(peak, p.collateral ?? 0, hasDebt ? (p.debt ?? 0) : 0);
    for (const v of model.valued) peak = Math.max(peak, v.collateral, hasDebt ? v.debt : 0);
    return axisFor(peak);
  }, [points, hasDebt, model.valued]);
  // The time axis: the lead-in, then the start of the first event's day at
  // `x0`, and the end of today at the right. A day's figures are its close,
  // drawn at the end of that day, so a life of one day, today's included,
  // still runs from the lead-in through the day to Today. The axis spans at
  // least a week (axisSpanDays), so the stretch after a short life's last event keeps
  // its length in days.
  const today = series?.today ?? startDay + model.liveStop;
  const span = axisSpanDays(startDay, today);
  const inner = Math.max(0, w - PAD * 2);
  // The lead-in also holds the value labels, so it is never narrower than
  // the widest of them (about 6px a character at 10px, and some air).
  // Labels at least 24px apart: every k-th of the axis's ticks.
  const every = axis.ticks.length > 1 ? Math.ceil(24 / (((STRIP_H - 8) * axis.ticks[1]) / axis.max)) : 1;
  // A label that reads as the one under it ("$0" thrice on a position worth
  // cents) is left out.
  const yTicks = axis.ticks
    .filter((_, i) => i % every === 0)
    .filter((t, i, a) => i === 0 || formatFlowUsd(t) !== formatFlowUsd(a[i - 1]));
  const labelW = Math.max(0, ...yTicks.map((t) => formatFlowUsd(t).length)) * 6 + 8;
  const lead = Math.max(LEAD_MIN_PX, labelW, Math.round(inner * LEAD_SHARE));
  const x0 = PAD + Math.min(lead, inner);
  const run = Math.max(0, PAD + inner - x0);
  /** Where a day starts on the strip (absolute UTC day). */
  const xDay = (day: number) => x0 + ((day - startDay) / span) * run;
  /** Where a day's close sits: the end of that day. */
  const xClose = (day: number) => xDay(Math.min(day, today) + 1);
  const x = (i: number) => xClose(points[i].to);
  const y = (v: number) => STRIP_H - 2 - (v / axis.max) * (STRIP_H - 8);
  // A stop's place on the line: its day's close (the live stop at today's).
  const xStop = (s: CombinedStop) => (s.live ? xClose(today) : xClose(startDay + s.stop));

  /** The stop nearest the pointer, on the strip's time axis. */
  const nearest = (clientX: number): number | null => {
    const el = ref.current;
    if (!el || n === 0 || run <= 0) return null;
    const px = clientX - el.getBoundingClientRect().left;
    const day = startDay + ((px - x0) / run) * span - 1;
    const i = nearestStop(stops, day - startDay);
    // The live stop sits at today, which may lie past the last event's stop count.
    const last = stops.length - 1;
    if (i === last - 1 && Math.abs(xStop(stops[last]) - px) < Math.abs(xStop(stops[i]) - px)) return last;
    return i;
  };
  // Mouse, pen and touch scrub alike: only a press moves the cursor, a drag
  // carries it (held by pointer capture off the strip until release), and
  // hovering moves nothing. Where a press started tells a click or a tap
  // (which freezes, where the page has `freeze`) from a drag (which scrubs).
  const pressX = useRef<number | null>(null);
  const dragged = useRef(false);
  const [grabbing, setGrabbing] = useState(false);
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const i = nearest(e.clientX);
    if (i == null) return;
    dragging.current = true;
    pressX.current = e.clientX;
    dragged.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (!freeze) onPick(i);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const i = nearest(e.clientX);
    if (i == null) return;
    if (freeze && !dragged.current && Math.abs(e.clientX - (pressX.current ?? e.clientX)) < 5) return;
    // The hand closes only once the press drags: at rest the strip shows a
    // crosshair (Miles, 1 Oct 2026).
    if (!dragged.current) setGrabbing(true);
    dragged.current = true;
    onPick(i);
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const wasPress = dragging.current && !dragged.current;
    dragging.current = false;
    setGrabbing(false);
    if (freeze && wasPress) {
      const i = nearest(e.clientX);
      if (i != null) freeze.onTap(i);
    }
  };
  const onCancel = () => {
    dragging.current = false;
    setGrabbing(false);
  };
  const onKey = (e: KeyboardEvent) => {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowDown: -1,
      ArrowRight: 1,
      ArrowUp: 1,
      PageDown: -4,
      PageUp: 4,
    };
    if (freeze && e.key === "Enter") {
      e.preventDefault();
      freeze.onTap(at);
      return;
    }
    if (e.key === "Home") onPick(0);
    else if (e.key === "End") onPick(stops.length - 1);
    else if (e.key in step) onPick(at + step[e.key]);
    else return;
    e.preventDefault();
  };

  // The event ticks: the nearest within reach of the pointer names its day's
  // events; a tap or a click also moves the cursor to that day.
  const tickText = (t: FlowModel["ticks"][number]) =>
    `${dayStamp(dayStart(model, t.day))}${t.kinds.length ? `: ${t.kinds.join(", ")}` : ""}`;
  const tickAt = (clientX: number, reach: number) => {
    const el = pipRef.current;
    if (!el) return null;
    const px = clientX - el.getBoundingClientRect().left;
    let best: FlowModel["ticks"][number] | null = null;
    let bestD = Infinity;
    for (const t of model.ticks) {
      const d = Math.abs(xClose(startDay + t.day) - px);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best && bestD <= reach ? best : null;
  };
  const openTick = (t: FlowModel["ticks"][number]) => ({
    x: Math.max(80, Math.min(w - 80, xClose(startDay + t.day))),
    text: tickText(t),
    day: t.day,
  });
  // A tapped tick's tip closes once the cursor moves off its day.
  const atDay = stops[at]?.stop;
  useEffect(() => {
    setPip((p) => (p && p.day !== atDay ? null : p));
  }, [atDay]);
  useEffect(() => {
    if (!pip) return;
    const away = (e: globalThis.PointerEvent) => {
      if (!pipRef.current?.contains(e.target as Node)) setPip(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [pip]);

  const runs = (k: "collateral" | "debt") => {
    const out: number[][] = [];
    let cur: number[] = [];
    points.forEach((p, i) => {
      if (p[k] == null) {
        if (cur.length) out.push(cur);
        cur = [];
      } else cur.push(i);
    });
    if (cur.length) out.push(cur);
    return out;
  };
  // The first run of each side starts at zero in the lead-in and steps up at
  // the first event's day to that day's close.
  const firstClose = model.valued[0] ?? { collateral: model.live.collateralUsd, debt: model.live.debtUsd };
  const lineOf = (k: "collateral" | "debt", seq: number[]) => {
    const pts = seq.map((i) => `${x(i)},${y(points[i][k] as number)}`);
    const lead = seq[0] === 0 ? [`${PAD},${y(0)}`, `${x0},${y(0)}`, `${x0},${y(firstClose[k])}`] : [];
    return [...lead, ...pts].map((p, j) => `${j ? "L" : "M"}${p}`).join("");
  };
  const area = (k: "collateral" | "debt", seq: number[]) =>
    `${lineOf(k, seq)}L${x(seq[seq.length - 1])},${STRIP_H}L${seq[0] === 0 ? PAD : x(seq[0])},${STRIP_H}Z`;
  const shade = windowFrom != null && windowFrom > startDay ? xDay(windowFrom) : null;
  const per = series?.bin ?? "week";
  const cx = n > 0 && stops[at] ? xStop(stops[at]) : PAD + inner;
  // The strip after the cursor lies under a translucent layer, except at
  // today, where nothing is after it.
  const dim = n > 0 && stops[at] != null && !stops[at].live;
  const sides = hasDebt ? (["collateral", "debt"] as const) : (["collateral"] as const);

  return (
    <div className="mt-4">
      <div className="relative">
        <div
          ref={ref}
          role="slider"
          tabIndex={0}
          aria-label={`Date, by ${per === "day" ? "day" : `${per} and by day with events`}: moves the headlines and the bars`}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, stops.length - 1)}
          aria-valuenow={at}
          aria-valuetext={valueText}
          className={`relative mt-0.5 ${grabbing ? "cursor-grabbing" : "cursor-crosshair"} touch-none select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-rb-400`}
          style={{ height: STRIP_H }}
          data-flow-strip=""
          data-anatomy="F4"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onCancel}
          onLostPointerCapture={onCancel}
          onKeyDown={onKey}
        >
          {w > 0 && n > 0 ? (
            <svg width={w} height={STRIP_H} aria-hidden className="block">
              {shade != null && (
                <rect
                  x={shade}
                  y={0}
                  width={Math.max(0, w - PAD - shade)}
                  height={STRIP_H}
                  className="fill-rb-400/15 dark:fill-rb-500/15"
                  data-flow-window=""
                />
              )}
              {/* Faint gridlines at the value labels' ticks, the zero line
                  being the plot's floor. */}
              {yTicks
                .filter((t) => t > 0)
                .map((t) => (
                  <line
                    key={t}
                    x1={PAD}
                    x2={w - PAD}
                    y1={y(t)}
                    y2={y(t)}
                    className="stroke-rb-400/20 dark:stroke-rb-500/25"
                    strokeWidth={1}
                    data-flow-gridline=""
                  />
                ))}
              {sides.map((k) =>
                runs(k).map((seq) => (
                  <g key={`${k}${seq[0]}`}>
                    <path d={area(k, seq)} fill={LINE_HUE[k]} fillOpacity={k === "collateral" ? 0.14 : 0.12} />
                    <path
                      d={lineOf(k, seq)}
                      fill="none"
                      stroke={LINE_HUE[k]}
                      strokeWidth={1.5}
                      strokeLinejoin="round"
                    />
                  </g>
                )),
              )}
              {dim && (
                <rect
                  x={cx}
                  y={0}
                  width={Math.max(0, w - cx)}
                  height={STRIP_H}
                  style={{ fill: "var(--surface-raised)" }}
                  fillOpacity={0.7}
                  data-flow-after-cursor=""
                />
              )}
              <line x1={cx} x2={cx} y1={0} y2={STRIP_H} className="stroke-foreground" strokeWidth={1} />
              <circle
                cx={cx}
                cy={y(head.collateral)}
                r={3.5}
                fill={LINE_HUE.collateral}
                className="stroke-background"
                strokeWidth={1.5}
              />
              {hasDebt && (
                <circle
                  cx={cx}
                  cy={y(head.debt)}
                  r={3.5}
                  fill={LINE_HUE.debt}
                  className="stroke-background"
                  strokeWidth={1.5}
                />
              )}
            </svg>
          ) : null}
          {/* The value labels, in the lead-in at the plot's left, each just
              above its gridline (under it at the top). */}
          {w > 0 && n > 0 && (
            <div aria-hidden data-prov-exempt="" data-flow-line-axis="">
              {yTicks.map((t) => {
                const ty = y(t);
                return (
                  <span
                    key={t}
                    className="pointer-events-none absolute text-[10px] leading-none tabular-nums text-rb-500"
                    style={{ left: PAD + 1, ...(ty < 14 ? { top: ty + 2 } : { top: ty - 11 }) }}
                  >
                    {formatFlowUsd(t)}
                  </span>
                );
              })}
            </div>
          )}
          {w > 0 && n > 0 ? null : (
            <p className="flex h-full items-center justify-center text-xs text-rb-500">
              {failed ? "The line could not be read. Reload to try again." : "Reading the line…"}
            </p>
          )}
        </div>
      </div>
      {/* The event ticks, under the plot on the line's time axis, the cursor
          running through them. The keyboard hears each day's events through
          the slider's value. */}
      <div
        ref={pipRef}
        className="relative h-5 cursor-pointer sm:h-3.5"
        data-flow-pips=""
        data-anatomy="F4.1"
        onPointerMove={(e) => {
          if (e.pointerType !== "mouse") return;
          const t = tickAt(e.clientX, TICK_REACH.mouse);
          setPip(t ? openTick(t) : null);
        }}
        onPointerLeave={(e) => e.pointerType === "mouse" && setPip(null)}
        onClick={(e) => {
          const t = tickAt(e.clientX, TICK_REACH.touch);
          if (!t) return setPip(null);
          setPip(openTick(t));
          const i = stops.findIndex((s) => !s.live && s.stop === t.day);
          if (i >= 0) onPick(i);
        }}
      >
        <div aria-hidden>
          {w > 0 && n > 0 && (
            <i className="pointer-events-none absolute inset-y-0 w-px bg-foreground" style={{ left: cx - 0.5 }} />
          )}
          {w > 0 &&
            model.ticks.map((t, i) => (
              <i
                key={i}
                className="pointer-events-none absolute top-1 size-[5px] -translate-x-1/2 rounded-full"
                style={{
                  left: xClose(startDay + t.day),
                  background: FLOW_TICK[t.tick],
                  opacity: dim && xClose(startDay + t.day) > cx + 0.5 ? 0.35 : 1,
                }}
              />
            ))}
        </div>
        {pip && (
          <span
            role="tooltip"
            data-prov-hidden=""
            data-flow-pip-tip=""
            className="pointer-events-none absolute bottom-full z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg border px-2 py-1 text-xs font-medium tabular-nums text-foreground shadow-lg"
            style={{ left: pip.x, background: "var(--rb-tooltip-bg)", borderColor: "var(--rb-tooltip-border)" }}
          >
            {pip.text}
          </span>
        )}
      </div>
      {/* The first day sits under the end of the lead-in, and the end under
        today's close, a few px clear of the ticks. */}
      <div className="mt-1.5">
        <TrackEnds
          start={ends.start}
          end={ends.end}
          startInset={w > 0 ? Math.max(0, x0 - PAD) : 0}
          endInset={w > 0 ? Math.max(0, PAD + inner - xClose(today)) : 0}
        />
      </div>
    </div>
  );
}
