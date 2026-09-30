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
import { ChevronLeft, ChevronRight, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { DateRow, Headline, Rescaled, Throughput, TrackEnds, useWidth } from "@/components/shared/lifetime-flows-busy";
import { FlowCursorContext, KEEP_PANEL } from "@/components/shared/lifetime-flows-tip";
import { CTRL_GHOST, CTRL_OFF } from "@/lib/shared/ui-grammar";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { assetsAt, axisFor, DAY_MS, dayStart, type FlowModel } from "@/lib/shared/flows-timeline";
import { throughput } from "@/lib/shared/flows-busy";
import type { FlowBinSeries } from "@/lib/shared/flows-series";
import { combinedAt, combinedStops, nearestStop, type CombinedStop } from "@/lib/shared/flows-combined";

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

  const shown = preview ?? at;
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
  const tickHere = cur.event && !cur.live ? model.ticks.find((t) => t.day === cur.stop) : undefined;
  // What an open segment panel reads: the date in words and the cursor's
  // steps, so the panel restates its figures as the cursor moves.
  const cursor = useMemo(
    () => ({
      at: atClose ? `at close, ${closeDay}` : head.isLive ? `today (${dayStamp(Date.now() / 1000)})` : `at ${dateText}`,
      prev: () => go(at - 1),
      next: () => go(at + 1),
      canPrev: at > 0,
      canNext: at < last,
      live: !outside,
    }),
    // `go` closes over `last`, listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [atClose, closeDay, head.isLive, dateText, at, last, outside],
  );

  return (
    <FlowCursorContext.Provider value={cursor}>
      <div className="text-sm" data-flows-combined="">
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
          />
          <TrackEnds start={dayStamp(dayStart(model, 0))} end={closed ? closeDay : "Today"} />
        </div>

        <div className="mt-1 flex items-center justify-center gap-x-1" data-flow-controls="" {...KEEP_PANEL}>
          <button type="button" className={btn} aria-label="Jump to opening" onClick={() => go(0)}>
            <SkipBack size={16} aria-hidden />
          </button>
          <button type="button" className={btn} aria-label="Previous date" onClick={() => go(at - 1)}>
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button type="button" className={btn} aria-label={playing ? "Pause" : "Play"} onClick={play}>
            {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
          </button>
          <button type="button" className={btn} aria-label="Next date" onClick={() => go(at + 1)}>
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
  onPreview,
  onPick,
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
  const first = series?.first ?? startDay;
  const today = series?.today ?? startDay + model.liveStop;
  const span = Math.max(1, today - first);
  const inner = Math.max(0, w - PAD * 2);
  const xDay = (day: number) => PAD + ((day - first) / span) * inner;
  const x = (i: number) => (n <= 1 ? PAD + inner : xDay(points[i].to));
  const y = (v: number) => STRIP_H - 2 - (v / axis.max) * (STRIP_H - 8);
  // A stop's place on the line: its day (the live stop at today).
  const xStop = (s: CombinedStop) => (s.live ? xDay(today) : xDay(startDay + s.stop));

  /** The stop nearest the pointer, on the strip's time axis. */
  const nearest = (clientX: number): number | null => {
    const el = ref.current;
    if (!el || n === 0 || inner <= 0) return null;
    const px = clientX - el.getBoundingClientRect().left;
    const day = first + ((px - PAD) / inner) * span;
    const i = nearestStop(stops, day - startDay);
    // The live stop sits at today, which may lie past the last event's stop count.
    const last = stops.length - 1;
    if (i === last - 1 && Math.abs(xStop(stops[last]) - px) < Math.abs(xStop(stops[i]) - px)) return last;
    return i;
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    const i = nearest(e.clientX);
    if (i == null) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onPreview(null);
    onPick(i);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const i = nearest(e.clientX);
    if (i == null) return;
    if (dragging.current) onPick(i);
    else if (e.pointerType === "mouse") onPreview(i);
  };
  const onUp = () => {
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
      const d = Math.abs(xDay(startDay + t.day) - px);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best && bestD <= reach ? best : null;
  };
  const openTick = (t: FlowModel["ticks"][number]) => ({
    x: Math.max(80, Math.min(w - 80, xDay(startDay + t.day))),
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
  const line = (k: "collateral" | "debt", run: number[]) =>
    run.map((i, j) => `${j ? "L" : "M"}${x(i)},${y(points[i][k] as number)}`).join("");
  const area = (k: "collateral" | "debt", run: number[]) =>
    `${line(k, run)}L${x(run[run.length - 1])},${STRIP_H}L${x(run[0])},${STRIP_H}Z`;
  const shade = windowFrom != null && windowFrom > first ? xDay(windowFrom) : null;
  const per = series?.bin === "month" ? "month" : "week";
  const cx = n > 0 && stops[at] ? xStop(stops[at]) : PAD + inner;

  return (
    <div className="mt-4">
      {/* The event ticks, on the line's time axis. The keyboard hears each
          day's events through the slider's value. */}
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
          {w > 0 &&
            model.ticks.map((t, i) => (
              <i
                key={i}
                className="pointer-events-none absolute bottom-0 h-2.5 w-[2px] -translate-x-1/2 rounded-[1px]"
                style={{ left: xDay(startDay + t.day), background: FLOW_TICK[t.tick] }}
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
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={`Date, by ${per} and by day with events: moves the headlines and the bars`}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, stops.length - 1)}
        aria-valuenow={at}
        aria-valuetext={valueText}
        className="relative mt-0.5 cursor-crosshair touch-none select-none rounded-md bg-sunken outline-none focus-visible:ring-2 focus-visible:ring-rb-400"
        style={{ height: STRIP_H }}
        data-flow-strip=""
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
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
            {(hasDebt ? (["collateral", "debt"] as const) : (["collateral"] as const)).map((k) =>
              runs(k).map((run) => (
                <g key={`${k}${run[0]}`}>
                  <path d={area(k, run)} fill={LINE_HUE[k]} fillOpacity={k === "collateral" ? 0.14 : 0.12} />
                  <path d={line(k, run)} fill="none" stroke={LINE_HUE[k]} strokeWidth={1.5} strokeLinejoin="round" />
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
        ) : (
          <p className="flex h-full items-center justify-center text-xs text-rb-500">
            {failed ? "The line could not be read. Reload to try again." : "Reading the line…"}
          </p>
        )}
      </div>
    </div>
  );
}
