"use client";

// The Lifetime flows panel on a position with a series (rails-ops
// reference/lifetime-flows-scrubber.md): the bars with the collateral and debt
// line under them as a short strip, one cursor for both. The strip's
// horizontal axis is the slider: pointing previews a point, a tap, a drag or
// the arrow keys move the cursor there, and play walks it along. The cursor
// stands on the line's points and on every day with events (tapping an event
// tick jumps to it); what the headlines and the bars state there is
// `combinedAt` (lib/shared/flows-combined.ts). The dashed outline marks where
// each bar ends today. Before the bars' window opens the bars grey out at the
// window's first day and say so.

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
import { ChevronLeft, ChevronRight, History, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { Prov } from "@/components/shared/provenance";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { flowSegmentProv } from "@/lib/shared/flows-timeline-provenance";
import { DateRow, Headline, Rescaled, Throughput, TrackEnds, useWidth } from "@/components/shared/lifetime-flows-busy";
import {
  fillStyle,
  FlowCursorContext,
  KEEP_PANEL,
  SegmentLabelContext,
  type SegmentLabel,
} from "@/components/shared/lifetime-flows-tip";
import { useFlowFocus, useFlowFocusState } from "@/components/shared/flow-focus-context";
import { CTRL_GHOST, CTRL_OFF } from "@/lib/shared/ui-grammar";
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
  const stops = useMemo(() => combinedStops(model, series, from), [model, series, from]);
  const last = stops.length - 1;
  const [at, setAt] = useState(last);
  const [preview, setPreview] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // A new series (the first read landing) puts the cursor at today.
  useEffect(() => setAt(last), [last]);
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
  // two share. A click on the strip freezes the cursor on a day, and the
  // freeze is the timeline's rewind: the list holds every event up to that
  // day's close, its last event on top and open. The tag's "Timeline to …"
  // brings the list into view; a day mark's button on the timeline freezes
  // the cursor on its day from the other side. The back and forward steps go
  // by days with events and move both. A second click on the same day,
  // Escape, the tag's × or the timeline chip's × releases both. A segment
  // states its name and value under the bars and opens no panel.
  const focus = useFlowFocus();
  const byDays = focus != null;
  const [frozen, setFrozen] = useState(false);
  const [segShown, setSegShown] = useState<SegmentLabel["shown"]>(null);
  const segLabel = useMemo<SegmentLabel | null>(
    () => (byDays ? { shown: segShown, show: setSegShown } : null),
    [byDays, segShown],
  );
  useEffect(() => {
    if (!frozen) return;
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setFrozen(false);
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
    setPreview(null);
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
  useEffect(() => () => focus?.store.set({ cursor: null, rewind: null }), [focus?.store]);
  // The freeze, published as the timeline's rewind.
  const rewindWord =
    committed && !committed.live
      ? dayStamp(dayStart(model, committed.stop))
      : !(model.heldAt[model.heldAt.length - 1] ?? []).some((h) => (h.amount ?? 0) > 0)
        ? dayStamp(dayStart(model, model.lastDay))
        : "today";
  const rewindEnd = committed && !committed.live ? committedEnd : null;
  useEffect(() => {
    if (!focus) return;
    const cur = focus.store.get().rewind;
    const next = frozen ? { endTs: rewindEnd, word: rewindWord } : null;
    if (cur?.endTs === next?.endTs && cur?.word === next?.word) return;
    focus.store.set({ rewind: next });
  }, [focus, frozen, rewindEnd, rewindWord]);
  // The timeline's chip × (or a month picked in Dates) releases the freeze.
  const release = useFlowFocusState((s) => s.release);
  const released = useRef(release);
  useEffect(() => {
    if (released.current === release) return;
    released.current = release;
    setFrozen(false);
  }, [release]);
  const move = useFlowFocusState((s) => s.move);
  const moved = useRef<number | null>(null);
  useEffect(() => {
    if (!move || moved.current === move.n) return;
    moved.current = move.n;
    const i = stopForDay(stops, Math.floor(move.ts / 86_400) - model.start / DAY_MS);
    if (i != null) {
      halt();
      setAt(i);
      setPreview(null);
      setFrozen(true);
    }
  }, [move, stops, model.start, halt]);

  const shown = frozen ? at : (preview ?? at);
  const cur: CombinedStop = stops[Math.min(shown, last)];
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
  // "Timeline to …": the rewound list comes into view.
  const toTimeline = () => {
    if (!focus) return;
    focus.store.set({ go: focus.store.get().go + 1 });
  };
  const tag =
    byDays && frozen ? <FreezeTag word={rewindWord} onView={toTimeline} onRelease={() => setFrozen(false)} /> : null;
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
      <SegmentLabelContext.Provider value={segLabel}>
        <div className="text-sm" data-flows-combined="" data-flow-frozen={frozen ? "" : undefined}>
          <Steady>
            <DateRow>{dateLine}</DateRow>
            {through && <Throughput t={through} hasDebt={hasDebt} />}
            <div className="mb-2 flex flex-wrap gap-x-6 gap-y-2" data-flow-headlines="">
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
            </div>
            <div className="relative" data-flow-combined-bars={outside ? "outside" : "inside"}>
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
            {segLabel && <SegmentLabelLine shown={segShown} when={when} isLive={liveReceipts} daily={model.daily} />}
          </Steady>

          <div {...KEEP_PANEL}>
            <LineStrip
              model={model}
              series={series}
              failed={failed}
              stops={stops}
              at={Math.min(shown, last)}
              head={{ collateral: head.collateral.now, debt: head.debt.now }}
              hasDebt={hasDebt}
              windowFrom={from > 0 ? model.start / DAY_MS + from : null}
              valueText={tickHere?.kinds.length ? `${dateLine}: ${tickHere.kinds.join(", ")}` : dateLine}
              onPreview={setPreview}
              onPick={go}
              ends={{ start: dayStamp(dayStart(model, 0)), end: closed ? closeDay : "Today" }}
              freeze={byDays ? { frozen, onTap: tapStop, tag } : null}
            />
          </div>

          <div className="mt-1 flex items-center justify-center gap-x-1" data-flow-controls="" {...KEEP_PANEL}>
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
              onClick={() => go(last)}
            >
              <SkipForward size={16} aria-hidden />
            </button>
          </div>

          {head.stale.length > 0 && (
            <p className="mt-2 text-[11px] leading-snug text-rb-500">
              {`${model.daily ? "No newer price recorded" : "Valued at each asset's last event price"}: ${head.stale
                .map((x) => `${x.symbol} from ${dayStamp(x.pricedAt)}`)
                .join(", ")}.`}
            </p>
          )}
        </div>
      </SegmentLabelContext.Provider>
    </FlowCursorContext.Provider>
  );
}

/** The line a pointed-at segment is named in, in the Key's grammar: its
 *  swatch, its name and its figure. It holds its height while empty, so the
 *  strip under it stays put. */
function SegmentLabelLine({
  shown,
  when,
  isLive,
  daily,
}: {
  shown: SegmentLabel["shown"];
  when: string;
  isLive: boolean;
  daily: boolean;
}) {
  return (
    <p
      className="mt-1.5 flex min-h-5 items-center gap-1.5 text-xs text-rb-500"
      aria-live="polite"
      data-flow-seg-label=""
    >
      {shown && (
        <>
          <i
            aria-hidden
            className="inline-block h-3 w-4 shrink-0 rounded-[2px]"
            style={fillStyle(shown.side, shown.seg)}
          />
          <span>{shown.seg.label}</span>
          <span className="font-semibold tabular-nums text-foreground">
            <Prov info={flowSegmentProv(shown.seg, shown.side, when, isLive, daily)}>
              {formatFlowUsd(shown.seg.value)}
            </Prov>
          </span>
        </>
      )}
    </p>
  );
}

/** The frozen cursor's tag: "Timeline to …", the rewind it holds, and a
 *  release. */
function FreezeTag({ word, onView, onRelease }: { word: string; onView: () => void; onRelease: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-lg border py-0.5 pl-0.5 pr-0.5 text-xs font-medium tabular-nums text-foreground shadow-sm"
      style={{ background: "var(--rb-tooltip-bg)", borderColor: "var(--rb-tooltip-border)" }}
      data-flow-freeze-tag=""
    >
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-blue-600 hover:underline sm:min-h-7 dark:text-blue-300"
        onClick={onView}
        data-flow-view-timeline=""
      >
        <History size={14} aria-hidden />
        <span data-flow-freeze-date="">Timeline to {word}</span>
      </button>
      <button
        type="button"
        className={`${CTRL_GHOST} ${CTRL_OFF} size-11 rounded-md sm:size-7`}
        aria-label="Release the cursor and the timeline"
        onClick={onRelease}
        data-flow-freeze-release=""
      >
        <X size={14} aria-hidden />
      </button>
    </span>
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
  onPreview,
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
  onPreview: (i: number | null) => void;
  onPick: (i: number) => void;
  /** The words under the strip's two ends: the first event's day, and today
   *  or the close's day. */
  ends: { start: string; end: string };
  /** On a page that ties the panel to its timeline: a click or a tap
   *  (a press that does not drag) freezes the cursor, and the frozen
   *  cursor's tag. */
  freeze: { frozen: boolean; onTap: (i: number) => void; tag: ReactNode } | null;
}) {
  const phone = useMediaQuery(PHONE_QUERY);
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
  const yTicks = axis.ticks.filter((_, i) => i % every === 0);
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
  // Where a press started, to tell a click or a tap (which freezes, where
  // the page has `freeze`) from a drag (which scrubs).
  const pressX = useRef<number | null>(null);
  const dragged = useRef(false);
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    const i = nearest(e.clientX);
    if (i == null) return;
    dragging.current = true;
    pressX.current = e.clientX;
    dragged.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onPreview(null);
    if (!freeze) onPick(i);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const i = nearest(e.clientX);
    if (i == null) return;
    if (dragging.current) {
      if (freeze && !dragged.current && Math.abs(e.clientX - (pressX.current ?? e.clientX)) < 5) return;
      dragged.current = true;
      onPick(i);
    } else if (e.pointerType === "mouse" && !freeze?.frozen) onPreview(i);
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const wasPress = dragging.current && !dragged.current;
    dragging.current = false;
    if (freeze && wasPress) {
      const i = nearest(e.clientX);
      if (i != null) freeze.onTap(i);
    }
  };
  const onCancel = () => {
    dragging.current = false;
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
    onPreview(null);
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
          className="relative mt-0.5 cursor-crosshair touch-none select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-rb-400"
          style={{ height: STRIP_H }}
          data-flow-strip=""
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onCancel}
          onPointerLeave={() => onPreview(null)}
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
        {/* The frozen cursor's tag, beside the cursor over the strip; on a
          phone it sits under the strip instead. */}
        {freeze?.tag && !phone && w > 0 && (
          <div
            className="absolute top-1 z-10"
            style={cx > w / 2 ? { right: Math.max(0, w - cx + 6) } : { left: Math.min(w, cx + 6) }}
          >
            {freeze.tag}
          </div>
        )}
      </div>
      {/* The event ticks, under the plot on the line's time axis, the cursor
          running through them. The keyboard hears each day's events through
          the slider's value. */}
      <div
        ref={pipRef}
        className="relative h-5 cursor-pointer sm:h-3.5"
        data-flow-pips=""
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
          if (i >= 0) {
            onPreview(null);
            onPick(i);
          }
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
                className="pointer-events-none absolute top-0.5 h-2.5 w-[2px] -translate-x-1/2 rounded-[1px]"
                style={{ left: xClose(startDay + t.day), background: FLOW_TICK[t.tick] }}
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
        today's close. */}
      <TrackEnds
        start={ends.start}
        end={ends.end}
        startInset={w > 0 ? Math.max(0, x0 - PAD) : 0}
        endInset={w > 0 ? Math.max(0, PAD + inner - xClose(today)) : 0}
      />
      {freeze?.tag && phone && <div className="mt-1.5 flex justify-center">{freeze.tag}</div>}
      {/* The line's key: its two sides and what each point is. */}
      <ul
        className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-[11px] text-rb-500"
        aria-label="Key to the line"
        data-flow-line-key=""
      >
        {sides.map((k) => (
          <li key={k} className="inline-flex items-center gap-1.5">
            <i
              aria-hidden
              className="inline-block h-0.5 w-4 shrink-0 rounded-full"
              style={{ background: LINE_HUE[k] }}
            />
            {k === "collateral" ? model.labels.collateral : model.labels.debt}
          </li>
        ))}
        <li>USD at each {per}&rsquo;s close</li>
      </ul>
    </div>
  );
}
