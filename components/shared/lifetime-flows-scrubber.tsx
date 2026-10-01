"use client";

// <LifetimeFlowsScrubber> — Lifetime flows as two horizontal bars on one USD
// axis, with a date scrubber under them (rails-ops
// reference/lifetime-flows-scrubber.md). The two headline figures share one
// row over the bars; the axis's labels sit once, under the last bar, and its
// gridlines run behind both. Solid is what is still there, each kind of exit
// its own hatch, named in the Key inside the panel's Explanation
// (`FlowsKeyContext`). Every figure is `stateAt(model, stop)` and
// `assetsAt(model, stop)` (lib/shared/flows-timeline.ts); this file only draws
// them. On a page that ties the panel to its timeline (flow-focus-context.tsx:
// the Aave and Liquity families) a click on a segment opens a short tip with
// its line, value and share; elsewhere (Sky Savings) a click opens its panel
// (lifetime-flows-tip.tsx): its assets, then its side's sum, one signed line
// per component in whole dollars, landing on what is held or owed.
//
// Where the position has a series (a family's route, or day rows the page
// holds), the panel is the bars with the collateral and debt line under them
// on one cursor (components/shared/lifetime-flows-combined.tsx); without one,
// the bars and their date slider.
//
// Accuracy: each segment is its own rounded block, 1px apart, laid out in
// pixels from the measured track; a non-zero segment is at least 2px, the
// width that takes comes off the largest segments, and the bar's total length
// stays exact on the axis (`layoutStrip`).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { ChevronLeft, ChevronRight, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { RevealTip } from "@/components/shared/reveal-tip";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import {
  fillStyle,
  FlowCursorContext,
  FlowPanelShell,
  sumSwatch,
  KEEP_PANEL,
  SegmentTipContext,
  SegmentTipBody,
  SegmentPanelBody,
  type PanelPart,
} from "@/components/shared/lifetime-flows-tip";
import { CTRL_GHOST, CTRL_OFF } from "@/lib/shared/ui-grammar";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import {
  assetsAt,
  buildFlowModel,
  DAY_MS,
  dayStart,
  longDay,
  formatFlowUsd,
  nextEventDay,
  prevEventDay,
  spokenUsd,
  stateAt,
  type FlowAssetHeld,
  type FlowModel,
  type FlowSegment,
  type FlowSide,
  type FlowSideState,
  type FlowTimeline,
  windowModel,
} from "@/lib/shared/flows-timeline";
import { isBusy } from "@/lib/shared/flows-busy";
import { AxisLabels, BusyFlows, DateRow, Headline, TrackEnds } from "@/components/shared/lifetime-flows-busy";
import { CombinedFlows, FLOW_TICK, LINE_HUE } from "@/components/shared/lifetime-flows-combined";
import {
  binInputFromTimeline,
  binSeries,
  lifetimeBinFor,
  seriesRouteBinFor,
  windowFromDay,
  WINDOW_ACTIVE_DAYS,
  type FlowBinSeries,
  type SeriesBin,
} from "@/lib/shared/flows-series";
import { fetchFlowBinSeries } from "@/lib/api/fetch-aave-v3-flow-series";

/** Days the slider advances per tick while playing, and the tick. */
const PLAY_DAYS = 7;
const PLAY_MS = 60;

/** Tick colours: the side an event moved; a liquidation in the critical red. */
const TICK = FLOW_TICK;

const pct = (v: number, max: number) => `${Math.max(0, (v / max) * 100)}%`;

/** "7 Feb '26": the timeline's day stamp (chain-truth-timeline). */
const dayStamp = (tsSec: number) => `${shortDate(tsSec)} ${shortDateYear(tsSec)}`;

/** A held line that names a token (the summed interest line names none). */
const isToken = (h: FlowAssetHeld) => h.amount != null;

/** The highlight key a segment answers to: its link group, else its own key. */
const hlKey = (s: FlowSegment) => (s.link ? `link:${s.link}` : s.key);

/** Set around the scrubber by a panel that draws a ledger under it (Aave V4):
 *  told what the ledger shows while the slider is off its last stop ("Shows
 *  the position today"), and null at the last stop, where the two agree. */
export const FlowsLedgerNoteContext = createContext<((note: string | null) => void) | null>(null);

/** The Key: each kind of exit the position has had over its life, and the
 *  dashed outline where it has other stops. The scrubber reports it; the panel
 *  draws it inside its Explanation, so the bars stand alone. */
export type FlowsKeyItems = {
  items: { side: FlowSide; s: FlowSegment }[];
  outline: string | null;
  /** The line's two sides, and the bars' window where it is shaded. */
  lines?: { label: string; color: string }[];
  shade?: string | null;
  /** The Key's line on what the bars and the line cover. */
  views?: string;
  /** The Explanation's line on the same, and how to read the panel. */
  explain?: string;
  /** How the line values a point ("USD at each day's close"), beside the
   *  panel's (i). */
  basis?: string;
};
export const FlowsKeyContext = createContext<((key: FlowsKeyItems | null) => void) | null>(null);

/** Gap between neighbouring segments, the least width a non-zero segment
 *  draws at, and the largest corner radius, all in px. */
const SEG_GAP = 1;
const SEG_MIN = 2;
const SEG_RADIUS = 3;
/** A segment's tip's width, in px. */
const TIP_W = 260;

type SegBox = { left: number; width: number };

/** Lays a strip's segments out in pixels on a track `trackPx` wide whose axis
 *  runs to `max`. The bar ends where its total sits on the axis; the gaps come
 *  out of that length; a segment the split leaves under SEG_MIN is raised to
 *  it, and what that adds is shaved off the largest segments (down to a common
 *  ceiling). A bar too short to hold every segment at SEG_MIN runs that much
 *  longer. Edges snap to device pixels. */
export function layoutStrip(widths: number[], max: number, trackPx: number, dpr = 1): SegBox[] {
  const n = widths.length;
  const total = widths.reduce((a, w) => a + w, 0);
  if (n === 0 || !(total > 0) || !(max > 0) || !(trackPx > 0)) return widths.map(() => ({ left: 0, width: 0 }));
  const length = Math.min(trackPx, (total / max) * trackPx);
  const room = length - SEG_GAP * (n - 1);
  let w: number[];
  if (room <= SEG_MIN * n) {
    w = widths.map(() => SEG_MIN);
  } else {
    w = widths.map((v) => (v / total) * room);
    const small = w.map((x) => x < SEG_MIN);
    const owed = w.reduce((a, x, i) => a + (small[i] ? SEG_MIN - x : 0), 0);
    if (owed > 0) {
      // The ceiling c over the rest where what lies above it equals `owed`.
      const big = w.filter((_, i) => !small[i]).sort((a, b) => b - a);
      let c = 0;
      let sum = 0;
      for (let k = 0; k < big.length; k++) {
        sum += big[k];
        c = (sum - owed) / (k + 1);
        if (k === big.length - 1 || c >= big[k + 1]) break;
      }
      w = w.map((x, i) => (small[i] ? SEG_MIN : Math.min(x, c)));
    }
  }
  const snap = (x: number) => Math.round(x * dpr) / dpr;
  const out: SegBox[] = [];
  let edge = 0;
  let start = 0;
  for (let i = 0; i < n; i++) {
    edge += w[i];
    const end = Math.max(start + SEG_MIN, snap(edge));
    out.push({ left: start, width: end - start });
    edge += SEG_GAP;
    start = end + SEG_GAP;
  }
  return out;
}

/** The track's width once measured, and whether it has been measured long
 *  enough for moves to animate (the first measured frame lands without one). */
function useTrackWidth(): [RefObject<HTMLDivElement | null>, number | null, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [settled, setSettled] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setWidth(r.width);
    });
    ro.observe(el);
    const raf = requestAnimationFrame(() => setSettled(true));
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
  return [ref, width, settled];
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/** A segment's assets, largest first, for its panel. */
type AssetSplit = Map<string, PanelPart[]>;

/** The open segment panel: the segment's key, and whether the keyboard
 *  opened it (focus then moves into the panel). */
export type OpenPanel = { key: string; keyboard: boolean } | null;

/** One strip: a bar or its drill-down. Fills are clipped to the rounded
 *  track; the segments' buttons ride a layer above, unclipped. A click, a tap
 *  or Enter on one opens its panel (lifetime-flows-tip.tsx). */
function Strip({
  side,
  segments,
  max,
  ticks,
  height,
  today,
  active,
  onHover,
  open,
  onOpen,
  label,
  motion,
  panel,
  focus,
}: {
  side: FlowSide;
  segments: FlowSegment[];
  max: number;
  ticks: number[];
  height: string;
  today?: number | null;
  active: string | null;
  onHover: (k: string | null) => void;
  open: OpenPanel;
  onOpen: (p: OpenPanel) => void;
  label: string;
  motion: string;
  /** The open segment's panel body. */
  panel: (s: FlowSegment) => ReactNode;
  /** On a page that ties the panel to its timeline (flow-focus-context.tsx):
   *  hovering shows nothing, and a click opens the segment's short tip
   *  (`panel` draws it) with no outline on the segment. */
  focus?: boolean;
}) {
  const shown = segments.filter((s) => s.width > 0);
  const [trackRef, trackPx, settled] = useTrackWidth();
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  // Until the track is measured (the server's render, the first paint) the
  // segments sit on percentages with no gaps; after it, on `layoutStrip`.
  const boxes = useMemo(() => {
    if (trackPx == null) {
      let at = 0;
      return shown.map((s) => {
        const box = { left: pct(at, max), width: pct(s.width, max), radius: SEG_RADIUS };
        at += s.width;
        return box;
      });
    }
    return layoutStrip(
      shown.map((s) => s.width),
      max,
      trackPx,
      dpr,
    ).map((b) => ({ left: `${b.left}px`, width: `${b.width}px`, radius: Math.min(SEG_RADIUS, b.width / 2) }));
    // `shown` is new each render; its widths are what the layout reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.map((s) => `${s.key}:${s.width}`).join("|"), max, trackPx, dpr]);
  const anim = trackPx != null && settled ? motion : "";
  const place = (i: number): CSSProperties => ({
    left: boxes[i].left,
    width: boxes[i].width,
    borderRadius: boxes[i].radius,
  });
  const openSeg = open ? shown.find((s) => s.key === open.key) : undefined;
  return (
    <div ref={trackRef} className={`relative ${height}`}>
      <div role="img" aria-label={label} className="absolute inset-0 overflow-hidden rounded-md bg-sunken">
        {ticks.slice(1).map((t) => (
          <i
            key={t}
            aria-hidden
            className="absolute inset-y-0 border-l border-rb-300/60 dark:border-rb-600"
            style={{ left: pct(t, max) }}
          />
        ))}
        {shown.map((s, i) => (
          <span
            key={s.key}
            className={`absolute inset-y-0 block ${anim}`}
            style={{ ...place(i), ...fillStyle(side, s) }}
          />
        ))}
      </div>
      <div
        className="absolute inset-0"
        data-flow-segments={side}
        data-anatomy={side === "collateral" ? "F3.1" : "F3.2"}
      >
        {shown.map((s, i) => {
          const on = active != null && active === hlKey(s);
          const isOpen = open?.key === s.key;
          return (
            <span key={s.key} className={`absolute inset-y-0 block ${anim}`} style={place(i)}>
              <button
                type="button"
                className={`block h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${!focus && (on || isOpen) ? "outline outline-2 -outline-offset-2 outline-foreground" : ""}`}
                style={{ borderRadius: boxes[i].radius }}
                aria-label={`${s.label}: ${spokenUsd(s.value)}`}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
                data-flow-seg={s.key}
                {...(focus
                  ? {}
                  : {
                      onMouseEnter: () => onHover(hlKey(s)),
                      onMouseLeave: () => onHover(null),
                    })}
                onClick={(e) => onOpen(isOpen ? null : { key: s.key, keyboard: e.detail === 0 })}
              />
            </span>
          );
        })}
      </div>
      {today != null && (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 left-0 rounded-md border border-dashed border-rb-500 ${anim}`}
          style={{ width: pct(today, max) }}
          data-flow-outline=""
        />
      )}
      {openSeg && open && (
        <FlowPanelShell
          label={`${openSeg.label}: ${spokenUsd(openSeg.value)}`}
          anchor={() => trackRef.current?.querySelector<HTMLElement>(`[data-flow-seg="${openSeg.key}"]`) ?? null}
          onClose={() => onOpen(null)}
          focusOnOpen={open.keyboard}
          width={focus ? TIP_W : undefined}
        >
          {panel(openSeg)}
        </FlowPanelShell>
      )}
    </div>
  );
}

function SideBlock({
  side,
  st,
  model,
  isLive,
  active,
  onHover,
  open,
  onOpen,
  motion,
  when,
  assets,
  last,
  atLive,
}: {
  side: FlowSide;
  st: FlowSideState;
  model: FlowModel;
  isLive: boolean;
  when: string;
  active: string | null;
  onHover: (k: string | null) => void;
  open: OpenPanel;
  onOpen: (p: OpenPanel) => void;
  motion: string;
  assets: ReturnType<typeof assetsAt>;
  /** The last bar drawn, which carries the axis labels under it. */
  last: boolean;
  /** The last stop, where no "today" outline is drawn (`isLive` there is
   *  false on a closed position: its receipts read as the close's). */
  atLive: boolean;
}) {
  const coll = side === "collateral";
  const word = coll ? model.labels.collateral : model.labels.debt;
  const outs = st.bar.filter((s) => s.fill === "out");
  const liquidated = outs.filter((s) => s.tone === "liquidation").reduce((a, s) => a + s.value, 0);
  const repaid = st.out - liquidated;
  const spoken = coll
    ? `${word}: ${spokenUsd(st.now)} ${(model.words.held ?? "Still supplied").toLowerCase()}, of ${spokenUsd(st.total)} that came in; ${spokenUsd(st.out)} has left.`
    : `${word}: ${spokenUsd(st.now)} owed, of ${spokenUsd(st.total)} owed in all; ${spokenUsd(repaid)} repaid` +
      (liquidated > 0 ? `, ${spokenUsd(liquidated)} liquidated.` : ".");
  // The strip's label names every segment it draws, so the bar reads without
  // the Key.
  const named = st.bar.filter((s) => s.width > 0).map((s) => `${s.label} ${spokenUsd(s.value)}`);
  const label = named.length > 0 ? `${spoken} Segments: ${named.join(", ")}.` : spoken;
  // Each segment's assets: held from the stop's balances, flows from the
  // day rows' per-asset totals.
  const sideHeld = assets.held.filter((h) => h.side === side);
  const split: AssetSplit = new Map();
  split.set(
    `${side}-held`,
    sideHeld.map((h) => ({ symbol: h.symbol, usd: h.usd, token: isToken(h) })),
  );
  for (const b of model.buckets) if (b.side === side) split.set(b.key, assets.flows.get(b.key) ?? []);
  const rest = st.sources.find((x) => x.fill === "estimate")?.label ?? "Market move and interest";
  // On a page that ties the panel to its timeline, a segment opens a short
  // tip with its line, value and share instead of its panel.
  const focus = useContext(SegmentTipContext) != null;

  return (
    <div className="mt-3 first:mt-0" data-flow-side={side}>
      <Strip
        side={side}
        segments={st.bar}
        max={model.axis.max}
        ticks={model.axis.ticks}
        height="h-10 sm:h-11"
        today={atLive ? null : coll ? model.today.collateral : model.today.debt}
        active={active}
        onHover={onHover}
        open={open}
        onOpen={onOpen}
        label={label}
        motion={motion}
        focus={focus}
        panel={(s) =>
          focus ? (
            <SegmentTipBody side={side} seg={s} st={st} when={when} isLive={isLive} daily={model.daily} />
          ) : (
            <SegmentPanelBody
              side={side}
              seg={s}
              title={s.label}
              // The held segment's assets are the sum's total, listed under it.
              parts={s.fill === "held" ? [] : (split.get(s.key) ?? [])}
              st={st}
              held={sideHeld}
              when={when}
              isLive={isLive}
              daily={model.daily}
              swatch={sumSwatch(side)}
              words={{ rest }}
            />
          )
        }
      />
      {last && <AxisLabels ticks={model.axis.ticks} max={model.axis.max} />}
    </div>
  );
}

/** The Key, drawn inside the panel's Explanation: the hatches the bars
 *  draw, by name, for each kind of exit the position has had over its life.
 *  The segments' tips carry the figures. Where the position has other stops,
 *  the dashed outline too: where each bar ends at the last stop. */
export function FlowsKey({ items, outline, lines, shade, views }: FlowsKeyItems) {
  if (items.length === 0 && !outline && !lines?.length && !shade && !views) return null;
  return (
    <div className="mt-3 first:mt-0" data-flow-key="" data-anatomy="F10">
      <p className="text-xs font-semibold text-foreground">Key</p>
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-rb-500" aria-label="Key">
        {items.map(({ side, s }) => (
          <li key={`${side}:${s.key}`} className="inline-flex items-center gap-1.5">
            <i aria-hidden className="inline-block h-3 w-4 shrink-0 rounded-[2px]" style={fillStyle(side, s)} />
            {s.label}
          </li>
        ))}
        {outline && (
          <li className="inline-flex items-center gap-1.5" data-flow-key-outline="">
            <i aria-hidden className="inline-block h-3 w-4 shrink-0 rounded-[2px] border border-dashed border-rb-500" />
            {outline}
          </li>
        )}
        {lines?.map(({ label, color }) => (
          <li key={label} className="inline-flex items-center gap-1.5" data-flow-key-line="">
            <i aria-hidden className="inline-block h-0.5 w-4 shrink-0" style={{ background: color }} />
            {label}
          </li>
        ))}
        {shade && (
          <li className="inline-flex items-center gap-1.5" data-flow-key-shade="">
            <i aria-hidden className="inline-block h-3 w-4 shrink-0 rounded-[2px] bg-rb-400/25 dark:bg-rb-500/25" />
            {shade}
          </li>
        )}
      </ul>
      {views && (
        <p className="mt-1.5 text-xs leading-relaxed text-rb-500" data-flow-key-views="">
          {views}
        </p>
      )}
    </div>
  );
}

/** The line's basis beside the panel's (i): how a point is valued. */
export function FlowsBasis({ text }: { text: string }) {
  return (
    <span className="self-center text-[11px] text-rb-500" data-flow-basis="" data-anatomy="F7">
      {text}
    </span>
  );
}

/** Where a pip under the pointer sits from the strip's left edge, and what
 *  its tip says. */
type PipOpen = { x: number; text: string };

/** The event pips' tip: one bubble over the strip, held inside the viewport. */
function PipTip({ at }: { at: PipOpen }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [dx, setDx] = useState(0);
  useLayoutEffect(() => {
    const b = ref.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const left = r.left - dx;
    const right = r.right - dx;
    setDx(left < 8 ? 8 - left : right > vw - 8 ? vw - 8 - right : 0);
    // Measured once per position of the tip; `dx` is this render's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at.x, at.text]);
  return (
    <span
      ref={ref}
      role="tooltip"
      data-prov-hidden=""
      className="pointer-events-none absolute bottom-full z-50 mb-1.5 whitespace-nowrap rounded-lg border px-2 py-1 text-xs font-medium tabular-nums text-foreground shadow-lg"
      style={{
        left: at.x,
        transform: `translateX(calc(-50% + ${dx}px))`,
        background: "var(--rb-tooltip-bg)",
        borderColor: "var(--rb-tooltip-border)",
      }}
    >
      {at.text}
    </span>
  );
}

/** Where the panel reads the line's series: the family's route
 *  (`/api/spark/flows/series`) and the position's parameters. */
export type FlowSeriesSource = { path: string; params: Record<string, string> };

/** The panel's chart (rails-ops reference/lifetime-flows-scrubber.md): the
 *  bars, cut to the last WINDOW_ACTIVE_DAYS active days, with the collateral
 *  and debt line per day, week or month from the open under them on one cursor.
 *  The bars take the busy treatment (lib/shared/flows-busy.ts) where their
 *  window is busy. Without a series the bars keep their date slider. */
export function LifetimeFlowsScrubber({
  timeline,
  series,
}: {
  timeline: FlowTimeline;
  /** The family's series route; absent, the line bins the timeline's day rows
   *  (a page that holds them all, Sky Savings), and without a daily price
   *  series there is no line. */
  series?: FlowSeriesSource;
}) {
  const model = useMemo(() => buildFlowModel(timeline), [timeline]);
  const from = model ? windowFromDay(model.eventDays) : 0;
  const bars = useMemo(() => (model ? windowModel(model, from) : null), [model, from]);
  const busy = bars ? isBusy(bars) : false;
  const ledgerNote = useContext(FlowsLedgerNoteContext);
  const reportKey = useContext(FlowsKeyContext);
  // A page that ties the panel to its timeline: the words say a tap lists events.
  const focused = useFlowFocus() != null;
  const [hatches, setHatches] = useState<Pick<FlowsKeyItems, "items" | "outline"> | null>(null);

  // The line's series: from the family's route, or binned here from the
  // page's rows.
  const startDay = model ? model.start / DAY_MS : 0;
  // A page that ties the panel to its timeline (the Aave family from its
  // series route, the Liquity family from its replay) draws a life of up to a
  // year by day, so a day's mark lands on its point; the other rows binned
  // here (Sky Savings) keep weeks and months.
  const spanDays = model ? (timeline.today ?? startDay + model.liveStop) - startDay : 0;
  const bin: SeriesBin = model ? (series || focused ? seriesRouteBinFor(spanDays) : lifetimeBinFor(spanDays)) : "week";
  const binInput = useMemo(() => (series ? null : binInputFromTimeline(timeline)), [series, timeline]);
  const lined = series != null || binInput != null;
  const [lifetime, setLifetime] = useState<{ series: FlowBinSeries | null; failed: boolean } | null>(null);
  const seriesKey = series ? `${series.path}?${new URLSearchParams(series.params).toString()}&bin=${bin}` : null;
  useEffect(() => setLifetime(null), [seriesKey, timeline]);
  useEffect(() => {
    if (lifetime) return;
    if (!series) {
      if (binInput) setLifetime({ series: binSeries(binInput, bin), failed: false });
      return;
    }
    const ctl = new AbortController();
    fetchFlowBinSeries(series.path, series.params, bin, ctl.signal)
      .then((s) => setLifetime({ series: s, failed: false }))
      .catch((err) => {
        if (ctl.signal.aborted) return;
        console.warn("Lifetime flows series not read:", err);
        setLifetime({ series: null, failed: true });
      });
    return () => ctl.abort();
    // `seriesKey` stands for `series`, which a caller may build afresh each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifetime, seriesKey, binInput, bin]);

  const words = useMemo(
    () => (bars && model ? panelWords(model, bars, from, bin, lined, busy, focused) : null),
    [model, bars, from, bin, lined, busy, focused],
  );
  useEffect(() => {
    if (!words) return;
    const drawn = busy ? null : hatches;
    reportKey?.({
      items: drawn?.items ?? [],
      // With the line, the outline is drawn on the plain and the busy bars alike.
      outline: lined ? words.outline : (drawn?.outline ?? null),
      lines: lined ? words.lines : undefined,
      shade: lined && from > 0 ? "The bars' window" : null,
      views: words.key,
      explain: words.explain,
      basis: lined ? `USD at each ${bin}’s close` : undefined,
    });
  }, [reportKey, busy, hatches, words, from, lined, bin]);
  useEffect(() => () => reportKey?.(null), [reportKey]);

  if (!model || !bars || !words) return null;
  if (!lined)
    return busy ? (
      <BusyFlows model={bars} onLedgerNote={ledgerNote ?? undefined} />
    ) : (
      <ScrubberBody model={bars} onKey={setHatches} />
    );
  return (
    <CombinedFlows
      model={model}
      bars={bars}
      from={from}
      busy={busy}
      series={lifetime?.series ?? null}
      failed={lifetime?.failed ?? false}
      onLedgerNote={ledgerNote ?? undefined}
      renderBars={(stop, when, isLive, atLive) => (
        <PlainBars model={bars} stop={stop} when={when} isLive={isLive} atLive={atLive} onKey={setHatches} />
      )}
    />
  );
}

/** How the chart and the timeline meet, on a page that ties them. */
const FOCUS_READ =
  "A click on the line freezes the cursor on a day, and the line after it is dimmed; “Apply to timeline” then cuts the timeline below at that day's close and brings its last event into view. Each day's last event has a chart button that brings the chart to its day, and a month or range picked in the timeline's Dates is bracketed on the line. Each event's card adds up its side as of that event, line by line.";

/** The Key's and the Explanation's lines on what the bars and the line cover
 *  and how to read them, and the line's two sides for the Key. */
function panelWords(
  model: FlowModel,
  bars: FlowModel,
  from: number,
  bin: SeriesBin,
  lined: boolean,
  busy: boolean,
  focused = false,
): {
  key: string | undefined;
  explain: string;
  lines: { label: string; color: string }[];
  /** The Key's name for the dashed outline, where there is more than one stop. */
  outline: string | null;
} {
  const closed = !(model.heldAt[model.heldAt.length - 1] ?? []).some((h) => (h.amount ?? 0) > 0);
  const opens = longDay(dayStart(bars, 0));
  const ends = closed ? `the close on ${longDay(dayStart(model, model.lastDay))}` : "today";
  const days = (n: number) => `${n.toLocaleString("en-US")} day${n === 1 ? "" : "s"} with events`;
  const hasDebt = model.buckets.some((b) => b.side === "debt");
  const what = hasDebt
    ? `${model.labels.collateral.toLowerCase()} and ${model.labels.debt.toLowerCase()}`
    : model.labels.collateral.toLowerCase();
  const barsCover =
    from > 0 ? `the last ${WINDOW_ACTIVE_DAYS} active days, from ${opens}` : `every active day since ${opens}`;
  // One bar on a one-sided position (savings, a lender).
  const [bs, cov, them, heads, each] = hasDebt
    ? ["bars", "cover", "them", "the headlines and the bars are", "each bar ends"]
    : ["bar", "covers", "it", "the headline and the bar are", "the bar ends"];
  const cover =
    from > 0
      ? `The ${bs} ${cov} the last ${WINDOW_ACTIVE_DAYS} of the position's ${days(model.eventDays.length)}, from ${opens} to ${ends}, and start${hasDebt ? "" : "s"} with what was held as that window opens. `
      : `The ${bs} ${cov} all ${days(bars.eventDays.length)}, from ${opens} to ${ends}; a position with more than ${WINDOW_ACTIVE_DAYS} such days shows its last ${WINDOW_ACTIVE_DAYS}. `;
  const read = focused
    ? busy
      ? `The ${bs} ${hasDebt ? "are" : "is"} drawn at the scale of what is held: the headline is the bar, and a click on ${hasDebt ? "one" : "it"} names what it holds. ${FOCUS_READ}`
      : `A bar's length is everything that came in: the headline is the solid part of the bar, and a click on a part names it with its share of the bar. ${FOCUS_READ}`
    : busy
      ? `The ${bs} ${hasDebt ? "are" : "is"} drawn at the scale of what is held: the headline is the bar, and a tap on ${hasDebt ? "one" : "it"} opens how that side's flows add up to it, line by line.`
      : "A bar's length is everything that came in: the headline is the solid part of the bar, and a tap on any part opens its assets and that side's sum, line by line to what is held.";
  const today = closed ? "at the close" : "today";
  return {
    key: lined ? `${hasDebt ? "Bars" : "Bar"}: ${barsCover} · Line: ${what} by ${bin} since the open` : undefined,
    explain: lined
      ? cover +
        `The line under ${them} draws ${what} at the end of each ${bin} since the open, ${model.words.linePrices ?? "at the daily prices the index records"}` +
        `${from > 0 ? `, with the ${bs}' window shaded` : ""}${model.words.linePrices ? "" : `, and leaves a gap where a held asset has no price that ${bin}`}. ` +
        `One cursor moves both; press the line and drag to scrub it. It stops at the end of each ${bin === "day" ? "day (tap a tick to go to a day with events)" : `${bin}, on each day with events (tap a tick to go to it)`} and ${today}; at each stop ${heads} the position at the end of that day, the balances its last event left at that day's prices, so they state the same figure. ` +
        `${read} The dashed outline is where ${each} ${today}.` +
        (from > 0
          ? ` Before the ${bs}' window opens ${hasDebt ? "they grey" : "it greys"} out at its first day; the ${hasDebt ? "headlines still follow" : "headline still follows"} the line.`
          : "")
      : cover + read,
    outline: model.liveStop > 0 ? (closed ? "Length at close" : "Today's length") : null,
    lines: [
      { label: model.labels.collateral, color: LINE_HUE.collateral },
      ...(hasDebt ? [{ label: model.labels.debt, color: LINE_HUE.debt }] : []),
    ],
  };
}

/** Each kind of exit the position has had, from the whole history: the Key's hatches. */
function keyHatches(model: FlowModel): { side: FlowSide; s: FlowSegment }[] {
  const end = stateAt(model, model.liveStop);
  const seen = new Set<string>();
  const out: { side: FlowSide; s: FlowSegment }[] = [];
  for (const side of ["collateral", "debt"] as const)
    for (const seg of end[side].bar) {
      const id = `${seg.label}|${seg.tone === "exit" ? side : seg.tone}`;
      if (seg.fill !== "out" || !(seg.value >= 0.5) || seen.has(id)) continue;
      seen.add(id);
      out.push({ side, s: seg });
    }
  return out;
}

/** The two bars at a stop, under the line's cursor: the scrubber's bars with
 *  the cursor held elsewhere, and the outline of today's length off the last
 *  stop. */
function PlainBars({
  model,
  stop,
  when,
  isLive,
  atLive,
  onKey,
}: {
  model: FlowModel;
  stop: number;
  when: string;
  isLive: boolean;
  /** The last stop, where no outline is drawn. */
  atLive: boolean;
  onKey: (key: Pick<FlowsKeyItems, "items" | "outline"> | null) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenPanel>(null);
  const reduced = useReducedMotion();
  const motion = reduced ? "" : "transition-all duration-200 ease-out";
  const s = stateAt(model, stop);
  const assets = useMemo(() => assetsAt(model, stop), [model, stop]);
  const hasDebt = model.buckets.some((b) => b.side === "debt");
  const keyItems = useMemo(() => keyHatches(model), [model]);
  useEffect(() => {
    onKey({ items: keyItems, outline: null });
  }, [onKey, keyItems]);
  useEffect(() => () => onKey(null), [onKey]);
  const cursor = useContext(FlowCursorContext);
  // The open panel follows the cursor: it restates its figures at the new
  // date, and closes where its segment has no width there, or while the bars
  // are greyed before their window.
  const openHere = open && [...s.collateral.bar, ...s.debt.bar].some((x) => x.key === open.key && x.width > 0);
  useEffect(() => {
    if (open && (!openHere || cursor?.live === false)) setOpen(null);
  }, [open, openHere, cursor?.live]);
  const openSeg = open ? [...s.collateral.bar, ...s.debt.bar].find((x) => x.key === open.key) : undefined;
  const active = openSeg ? hlKey(openSeg) : hover;
  const side = (sd: FlowSide, last: boolean) => (
    <SideBlock
      side={sd}
      st={s[sd]}
      model={model}
      isLive={isLive}
      atLive={atLive}
      active={active}
      onHover={setHover}
      open={open}
      onOpen={setOpen}
      motion={motion}
      when={when}
      assets={assets}
      last={last}
    />
  );
  return (
    <div>
      {side("collateral", !hasDebt)}
      {hasDebt && side("debt", true)}
    </div>
  );
}

function ScrubberBody({
  model,
  onKey,
}: {
  model: FlowModel;
  /** The Key's hatches and outline, for the panel's Explanation. */
  onKey: (key: Pick<FlowsKeyItems, "items" | "outline"> | null) => void;
}) {
  const [stop, setStop] = useState(model.liveStop);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenPanel>(null);
  const [dragging, setDragging] = useState(false);
  const [pip, setPip] = useState<PipOpen | null>(null);
  const pipRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const motion = reduced ? "" : "transition-all duration-200 ease-out";
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // A new position (or a refreshed live read) keeps the reader's stop within range.
  useEffect(() => setStop((s) => Math.min(s, model.liveStop)), [model.liveStop]);

  const halt = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPlaying(false);
  }, []);
  useEffect(() => halt, [halt]);

  // The date tip rides the handle while it is dragged.
  useEffect(() => {
    if (!dragging) return;
    const up = () => setDragging(false);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging]);

  const play = () => {
    if (timer.current) return halt();
    if (stop >= model.liveStop) setStop(0);
    setPlaying(true);
    timer.current = setInterval(() => {
      setStop((s) => Math.min(model.liveStop, s + PLAY_DAYS));
    }, PLAY_MS);
  };
  useEffect(() => {
    if (playing && stop >= model.liveStop) halt();
  }, [playing, stop, model.liveStop, halt]);

  const s = stateAt(model, stop);
  const hasDebt = model.buckets.some((b) => b.side === "debt");
  // The key: each kind of exit the position has had, from the whole history.
  const keyItems = useMemo(() => keyHatches(model), [model]);
  // Every stop: the headline icons and each segment's tip list the assets.
  const assets = useMemo(() => assetsAt(model, stop), [model, stop]);
  const openSeg = open ? [...s.collateral.bar, ...s.debt.bar].find((x) => x.key === open.key) : undefined;
  const active = openSeg ? hlKey(openSeg) : hover;
  useEffect(() => {
    if (open && !(openSeg && openSeg.width > 0)) setOpen(null);
  }, [open, openSeg]);
  // Closed: nothing held after the last event, so the last stop is its close.
  const closed = !(model.heldAt[model.heldAt.length - 1] ?? []).some((h) => (h.amount ?? 0) > 0);
  // A closed position's last stop is stated as the close: its day, its prices.
  const atClose = s.isLive && closed;
  const closeDay = dayStamp(dayStart(model, model.lastDay));
  const dateText = atClose
    ? `At close, ${closeDay}`
    : s.isLive
      ? (model.words.live ?? "Today, live prices")
      : dayStamp(dayStart(model, stop));
  const when = atClose ? `the close on ${closeDay}` : s.isLive ? "now" : `the end of ${dateText}`;
  const dateLine = atClose
    ? `Position at close, ${closeDay}`
    : s.isLive
      ? `Position ${dateText.charAt(0).toLowerCase()}${dateText.slice(1)}`
      : `Position on ${dateText}`;
  // Receipts read the live stop as the close's where the position closed.
  const liveReceipts = s.isLive && !closed;
  const repricedHere = s.isLive ? [] : model.repricings.filter((r) => r.day === stop);
  // The Key goes to the panel's Explanation. Its dashed outline, which marks
  // where each bar ends at the last stop, is named wherever there is another stop.
  const keyOutline = model.liveStop > 0 ? (closed ? "Length at close" : "Today's length") : null;
  useEffect(() => {
    onKey({ items: keyItems, outline: keyOutline });
  }, [onKey, keyItems, keyOutline]);
  useEffect(() => () => onKey(null), [onKey]);
  // The ledger under the panel shows the last stop; say so while the slider is elsewhere.
  const ledgerNote = useContext(FlowsLedgerNoteContext);
  const ledgerText = s.isLive ? null : closed ? "Shows the position at close" : "Shows the position today";
  useEffect(() => {
    ledgerNote?.(ledgerText);
  }, [ledgerNote, ledgerText]);
  useEffect(() => () => ledgerNote?.(null), [ledgerNote]);
  // A pip's tip: the day and the timeline's names for its events.
  const pipText = (t: FlowModel["ticks"][number]) =>
    `${dayStamp(dayStart(model, t.day))}${t.kinds.length ? `: ${t.kinds.join(", ")}` : ""}`;
  const pipAt = (clientX: number): PipOpen | null => {
    const el = pipRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    let best: FlowModel["ticks"][number] | null = null;
    let bestD = Infinity;
    for (const t of model.ticks) {
      const d = Math.abs((t.day / model.liveStop) * r.width - (clientX - r.left));
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best && bestD <= 8 ? { x: (best.day / model.liveStop) * r.width, text: pipText(best) } : null;
  };
  // A tap elsewhere closes a pip's tip.
  useEffect(() => {
    if (!pip) return;
    const away = (e: PointerEvent) => {
      if (!pipRef.current?.contains(e.target as Node)) setPip(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [pip]);
  const tickHere = model.ticks.find((t) => t.day === stop);
  const btn = `${CTRL_GHOST} ${CTRL_OFF} size-11 shrink-0 rounded-md sm:size-9`;
  const go = (to: number) => {
    halt();
    setStop(to);
  };
  const cursor = {
    at: atClose ? `at close, ${closeDay}` : s.isLive ? `today (${dayStamp(Date.now() / 1000)})` : `at ${dateText}`,
    prev: () => go(prevEventDay(model, stop)),
    next: () => go(nextEventDay(model, stop)),
    canPrev: stop > 0,
    canNext: stop < model.liveStop,
  };
  return (
    <FlowCursorContext.Provider value={cursor}>
      <div className="text-sm">
        <DateRow>{dateLine}</DateRow>
        <div className="mb-2 flex flex-wrap gap-x-6 gap-y-2" data-flow-headlines="" data-anatomy="F2">
          <Headline
            side="collateral"
            st={s.collateral}
            model={model}
            when={when}
            isLive={liveReceipts}
            assets={assets}
          />
          {hasDebt && (
            <Headline side="debt" st={s.debt} model={model} when={when} isLive={liveReceipts} assets={assets} />
          )}
        </div>
        <SideBlock
          side="collateral"
          st={s.collateral}
          model={model}
          isLive={liveReceipts}
          atLive={s.isLive}
          active={active}
          onHover={setHover}
          open={open}
          onOpen={setOpen}
          motion={motion}
          when={when}
          assets={assets}
          last={!hasDebt}
        />
        {/* A one-sided position (savings, a lender) names no debt bucket and
          draws a single bar. */}
        {hasDebt && (
          <SideBlock
            side="debt"
            st={s.debt}
            model={model}
            isLive={liveReceipts}
            atLive={s.isLive}
            active={active}
            onHover={setHover}
            open={open}
            onOpen={setOpen}
            motion={motion}
            when={when}
            assets={assets}
            last
          />
        )}

        <div className="relative mt-3" {...KEEP_PANEL}>
          {/* Event pips over the line, coloured by the side each event moved.
            Hovering or tapping one names its day's events; the keyboard hears
            the same through the slider's value. */}
          <div
            ref={pipRef}
            className="relative mx-2 h-4 sm:h-3"
            data-flow-pips=""
            data-anatomy="F4.1"
            onPointerMove={(e) => e.pointerType === "mouse" && setPip(pipAt(e.clientX))}
            onPointerLeave={(e) => e.pointerType === "mouse" && setPip(null)}
            onClick={(e) => setPip(pipAt(e.clientX))}
          >
            <div aria-hidden>
              {model.ticks.map((t, i) => (
                <i
                  key={i}
                  className="pointer-events-none absolute bottom-0 h-2.5 w-[2px] rounded-[1px]"
                  style={{ left: pct(t.day, model.liveStop), background: TICK[t.tick] }}
                />
              ))}
            </div>
            {pip && <PipTip at={pip} />}
          </div>
          <div className="relative">
            <input
              type="range"
              min={0}
              max={model.liveStop}
              step={1}
              value={stop}
              aria-label="Date"
              aria-valuetext={tickHere?.kinds.length ? `${dateText}: ${tickHere.kinds.join(", ")}` : dateText}
              onChange={(e) => {
                halt();
                setStop(Number(e.target.value));
              }}
              onPointerDown={() => setDragging(true)}
              className="block h-11 w-full cursor-pointer accent-[var(--color-rb-500)] sm:h-7"
            />
            {dragging && (
              <span
                aria-hidden
                data-prov-hidden=""
                className="pointer-events-none absolute bottom-full z-50 -translate-x-1/2 whitespace-nowrap rounded-lg border px-2 py-1 text-xs font-medium tabular-nums text-foreground shadow-lg"
                style={{
                  left: `calc(${stop / model.liveStop} * (100% - 16px) + 8px)`,
                  background: "var(--rb-tooltip-bg)",
                  borderColor: "var(--rb-tooltip-border)",
                }}
              >
                {atClose ? "Close" : s.isLive ? "Today" : dateText}
              </span>
            )}
          </div>
          {/* A marker where an event repriced an asset whose price had gone stale. */}
          {model.repricings.length > 0 && (
            <div className="relative mx-2 h-3">
              {model.repricings.map((r, i) => (
                <span key={i} className="absolute top-0 -translate-x-1/2" style={{ left: pct(r.day, model.liveStop) }}>
                  <RevealTip
                    tip={`Repriced ${dayStamp(dayStart(model, r.day))}: ${r.symbol} last priced ${dayStamp(r.from)}`}
                    label={`Repriced ${dayStamp(dayStart(model, r.day))}: ${r.symbol} last priced ${dayStamp(r.from)}`}
                  >
                    <span className="block size-2 rotate-45 border border-rb-500" />
                  </RevealTip>
                </span>
              ))}
            </div>
          )}
          <TrackEnds start={dayStamp(dayStart(model, 0))} end={closed ? closeDay : "Today"} />
        </div>

        <div
          className="mt-1 flex items-center justify-center gap-x-1"
          data-flow-controls=""
          data-anatomy="F5"
          {...KEEP_PANEL}
        >
          <button type="button" className={btn} aria-label="Jump to opening" onClick={() => go(0)}>
            <SkipBack size={16} aria-hidden />
          </button>
          <button
            type="button"
            className={btn}
            aria-label="Previous event"
            onClick={() => go(prevEventDay(model, stop))}
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button type="button" className={btn} aria-label={playing ? "Pause" : "Play"} onClick={play}>
            {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
          </button>
          <button type="button" className={btn} aria-label="Next event" onClick={() => go(nextEventDay(model, stop))}>
            <ChevronRight size={18} aria-hidden />
          </button>
          <button
            type="button"
            className={btn}
            aria-label={closed ? "Jump to close" : "Jump to today"}
            onClick={() => go(model.liveStop)}
          >
            <SkipForward size={16} aria-hidden />
          </button>
        </div>

        {(s.stale.length > 0 || repricedHere.length > 0) && (
          <p className="mt-2 text-[11px] leading-snug text-rb-500">
            {repricedHere.map((r) => `${r.symbol} repriced on this day, last priced ${dayStamp(r.from)}. `).join("")}
            {s.stale.length > 0 &&
              `${model.daily ? "No newer price recorded" : "Valued at each asset's last event price"}: ${s.stale
                .map((x) => `${x.symbol} from ${dayStamp(x.pricedAt)}`)
                .join(", ")}.`}
          </p>
        )}
      </div>
    </FlowCursorContext.Provider>
  );
}
