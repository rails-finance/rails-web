"use client";

// The Lifetime flows panel's value line and price chart on TradingView's
// Lightweight Charts (rails-ops reference/lifetime-flows-scrubber.md, "The
// chart engine"; ui-jobs 328 steps 4c and 4d), on every family. One chart: the
// value pane (collateral and debt, their areas, a dotted second series over a
// stretch on an old price) over the price pane (the held asset's price, dotted
// over carried days, and the liquidation level as a step line), on the time
// grid of lib/shared/asset-chart-grid.ts, with a time axis in UTC. Sides with
// no common unit (Frankencoin, PWN) take a value pane each, on its token's
// axis; the price chart alone (the one-day rule) is the price pane alone.
//
// RULES (Miles, 26 Oct 2026).
// - The cursor is the panel's (CombinedFlows and the flow-focus state); the
//   chart draws it. The scrubber is a series primitive in each pane: a line at
//   the cursor's day close, the strip after it dimmed, the cursor's dots; the
//   bars' window is shaded under the series. The library's crosshair is the
//   faint hover only, hidden on touch.
// - A drag never pans: the panel's slider takes the press and the drag. The
//   wheel scrolls the page (Miles, 26 Oct 2026): a pinch, Ctrl or ⌘ with the
//   wheel (a trackpad's pinch arrives so), and Safari's gesture events zoom; a
//   two-finger sideways swipe pans, and a gesture that starts upright stays the
//   page's (`onWheel`). The range buttons (`LwRanges`) set the window; a cursor
//   that leaves the window, by a step, a drag near an edge, a card's "View on
//   chart" or a restored link, brings the window to it (`reveal`). Only the
//   chart moves.
// - The cursor stops on day closes; the grid is never finer than MIN_STEP.
// - The price tip stands over the price pane, HTML placed at the cursor's x;
//   the events row under the chart is the panel's drawing, on this axis
//   (`onAxis`, sent again on every zoom, pan or resize).
// - No attribution on the chart: the site footer carries TradingView's on
//   every page (Miles, 26 Oct 2026).
// The library loads only once the charts are first shown.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  Logical,
  ISeriesPrimitive,
  AreaData,
  LineData,
  MouseEventParams,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  SeriesType,
  Time,
  UTCTimestamp,
  WhitespaceData,
} from "lightweight-charts";
import { lwTickLabel, useLwColors, useLwLib, type LwColors } from "@/components/shared/lw-chart-kit";
import { OldPriceTip, oldLineTip } from "@/components/shared/flow-old-price";
import type { FlowsLwApi, FlowsLwAxis, FlowsLwView } from "@/components/shared/lifetime-flows-lw-axis";
import { flowsBounds } from "@/lib/shared/flows-combined";
import type { LineScale, PriceScale } from "@/components/shared/lifetime-flows-combined";
import {
  DAY_S,
  cellTime,
  gridFor,
  logicalOf,
  needsRegrid,
  sampleJoined,
  sampleRuns,
  type Grid,
} from "@/lib/shared/asset-chart-grid";
import { formatPrice, priceAxisLabels, type FlowPriceSeries } from "@/lib/shared/flows-price";
import { formatFlowToken, formatFlowUsd, type FlowModel } from "@/lib/shared/flows-timeline";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";

/** The value pane, a side's pane where the sides have no common unit, and
 *  the price pane's line under its tip. */
const VALUE_H = 96;
const SIDE_H = 72;
const PRICE_LINE_H = 84;
/** Room between the tip and the price line. */
const TIP_GAP = 8;
/** The grid's finest cell: the data is daily, so the zoom stops at about a
 *  day across the chart's width. */
const MIN_STEP = 7200;
/** The narrowest window a range or a reveal sets. */
const MIN_SPAN = 2 * DAY_S;
/** A cursor this share of the window from an edge is brought further in. */
const REVEAL_MARGIN = 0.08;
const SETTLE_MS = 200;
/** A range change this long after the reader's last zoom was not theirs
 *  (the price axis widening): the window the chart last set is kept. */
const USER_MS = 2500;
/** Wheel events this close together are one gesture, which keeps the axis
 *  its first event took. */
const GESTURE_MS = 160;
/** A wheel's zoom: one notch (100 px of delta) widens or narrows the window by this share. */
const ZOOM_PER_NOTCH = 0.1;
/** The chart's colours as site tokens: the panel's line hues (LINE_HUE), the
 *  liquidation red, the panel's ground for the strip after the cursor. */
const COLORS = {
  collateral: ["var(--color-blue-500)"],
  collateralFill: ["var(--color-blue-500)", 0.14],
  debt: ["var(--color-green-400)"],
  debtFill: ["var(--color-green-400)", 0.12],
  liq: ["var(--color-red-500)"],
  warn: ["var(--color-amber-500)"],
  fg: ["var(--foreground)"],
  bg: ["var(--background)"],
  after: ["var(--surface-raised)", 0.7],
  ground: ["var(--surface-raised)"],
  shade: ["var(--rb-500)", 0.12],
  text: ["var(--rb-500)"],
  grid: ["var(--rb-chart-grid)", 0.7],
  cross: ["var(--rb-500)", 0.35],
} as const;
type Colors = LwColors<keyof typeof COLORS>;

type Seg = "solid" | "dotted";
/** A line as vertices `[ts, value]` (null breaks it) and each segment's kind. */
interface Verts {
  v: [number, number | null][];
  kind: Seg[];
}
type Side = "collateral" | "debt";

const closeTs = (day: number) => (day + 1) * DAY_S;

/** The x of a moment on the grid. The library places whole logical indices
 *  alone (a fractional one reads 0), and a day's close falls inside a cell
 *  wherever a cell is longer than a day (a phone's width, a long life): the x
 *  is read between the two cells either side. */
function xOf(c: IChartApi, g: Grid, ts: number): number | null {
  const t = c.timeScale();
  const l = logicalOf(g, ts);
  const a = Math.floor(l);
  const xa = t.logicalToCoordinate(a as Logical);
  if (xa == null || l === a) return xa;
  const xb = t.logicalToCoordinate((a + 1) as Logical);
  return xb == null ? xa : xa + (xb - xa) * (l - a);
}

/** The value line of one side: no line before the side
 *  first holds anything, the step up from zero at the first event's day (or at
 *  its first point above zero), each point at its day's close, a segment into
 *  a point on an old price or an unread figure dotted, a null point a break. */
function sideVerts(model: FlowModel, scale: LineScale, k: Side, today: number): Verts {
  const startDay = model.start / 86_400_000;
  const pts = scale.points;
  const n = pts.length;
  const out: Verts = { v: [], kind: [] };
  const first = pts.findIndex((p) => (p[k] ?? 0) > 0);
  if (first < 0) return out;
  const oldAt = (i: number) =>
    i < n - 1 &&
    ((model.stale.get(pts[i].to - startDay) ?? []).some((x) => x.side === k) ||
      (model.unsure.get(pts[i].to - startDay) ?? []).some((x) => x.side === k));
  const firstClose = model.valued[0] ?? { collateral: model.live.collateralUsd, debt: model.live.debtUsd };
  const push = (ts: number, value: number | null, kind: Seg) => {
    if (out.v.length) out.kind.push(kind);
    out.v.push([ts, value]);
  };
  if (first === 0 && firstClose[k] > 0) {
    push(startDay * DAY_S, 0, "solid");
    push(startDay * DAY_S + 1, firstClose[k], "solid");
  } else push(closeTs(Math.min(pts[first].to, today)) - 1, 0, "solid");
  let lastTs = -Infinity;
  for (let i = first; i < n; i++) {
    const ts = closeTs(Math.min(pts[i].to, today));
    if (ts <= lastTs) continue;
    lastTs = ts;
    push(ts, pts[i][k], oldAt(i) ? "dotted" : "solid");
  }
  return out;
}

/** The price line's solid and dotted pieces as one line of vertices, each
 *  segment's kind kept, a break between pieces that do not touch; lone days
 *  apart. */
function priceVerts(scale: PriceScale): { line: Verts; dots: [number, number][] } {
  const segs: { a: [number, number]; b: [number, number]; kind: Seg }[] = [];
  const dots: [number, number][] = [];
  for (const [list, kind] of [
    [scale.pieces.solid, "solid"],
    [scale.pieces.dotted, "dotted"],
  ] as const)
    for (const p of list) {
      if (p.length === 1) dots.push([closeTs(p[0][0]), p[0][1]]);
      for (let i = 1; i < p.length; i++) segs.push({ a: p[i - 1], b: p[i], kind });
    }
  segs.sort((x, y) => x.a[0] - y.a[0]);
  const line: Verts = { v: [], kind: [] };
  for (const s of segs) {
    const last = line.v[line.v.length - 1];
    const a = closeTs(s.a[0]);
    if (!last || last[0] !== a) {
      if (last) {
        line.kind.push("solid");
        line.v.push([last[0] + 1, null]);
        line.kind.push("solid");
      }
      line.v.push([a, s.a[1]]);
    }
    line.kind.push(s.kind);
    line.v.push([closeTs(s.b[0]), s.b[1]]);
  }
  return { line, dots };
}

/** A step line's runs as `[ts, value]`: the event grain's flat pieces, or the
 *  liquidation level's runs of consecutive days. */
const stepRuns = (runs: [number, number][][]) =>
  runs.map((r) => r.map(([d, v]) => [closeTs(d), v] as [number, number]));

/** The liquidation level's runs: consecutive days, a day without a level a break. */
function levelRuns(level: [number, number][]): [number, number][][] {
  const out: [number, number][][] = [];
  for (const [d, v] of level) {
    const run = out[out.length - 1];
    if (run && run[run.length - 1][0] === d - 1) run.push([d, v]);
    else out.push([[d, v]]);
  }
  return out;
}

// ── The scrubber: a series primitive in each pane ──────────────────────────

/** What the scrubber draws, shared by the two panes' primitives. */
interface MarkState {
  grid: Grid | null;
  /** The cursor's moment (its day's close), or null before the chart has one. */
  ts: number | null;
  dim: boolean;
  /** Where the bars' window opens, shaded to the end. */
  shadeTs: number | null;
  colors: Colors | null;
}
type Dot = { series: ISeriesApi<SeriesType>; value: number; color: string };
type Target = Parameters<IPrimitivePaneRenderer["draw"]>[0];

class ScrubberMark implements ISeriesPrimitive<Time> {
  private req: (() => void) | null = null;
  private chart: IChartApi | null = null;
  dots: Dot[] = [];
  private readonly views: IPrimitivePaneView[];
  /** `lineOnly`: the pane between the value line and the price line, where
   *  the tip stands: the cursor's line runs through it, nothing dimmed. */
  constructor(
    private readonly st: MarkState,
    private readonly lineOnly = false,
  ) {
    const view = (z: PrimitivePaneViewZOrder, draw: (t: Target) => void): IPrimitivePaneView => ({
      zOrder: () => z,
      renderer: () => ({ draw }),
    });
    this.views = [view("bottom", (t) => this.drawShade(t)), view("top", (t) => this.drawCursor(t))];
  }
  attached(p: SeriesAttachedParameter<Time, SeriesType>) {
    this.req = p.requestUpdate;
    this.chart = p.chart as IChartApi;
  }
  detached() {
    this.req = null;
    this.chart = null;
  }
  paneViews() {
    return this.views;
  }
  update() {
    this.req?.();
  }
  private x(ts: number): number | null {
    const g = this.st.grid;
    if (!g || !this.chart) return null;
    return xOf(this.chart, g, ts);
  }
  private drawShade(t: Target) {
    const { shadeTs, colors } = this.st;
    // The tip's pane is the panel's ground: its gridlines are covered.
    if (this.lineOnly && colors)
      t.useMediaCoordinateSpace(({ context: c, mediaSize }) => {
        c.fillStyle = colors.ground;
        c.fillRect(0, 0, mediaSize.width, mediaSize.height);
      });
    if (shadeTs == null || !colors || this.lineOnly) return;
    const x = this.x(shadeTs);
    if (x == null) return;
    t.useMediaCoordinateSpace(({ context: c, mediaSize }) => {
      const from = Math.max(0, x);
      if (from >= mediaSize.width) return;
      c.fillStyle = colors.shade;
      c.fillRect(from, 0, mediaSize.width - from, mediaSize.height);
    });
  }
  private drawCursor(t: Target) {
    const { ts, dim, colors } = this.st;
    if (ts == null || !colors) return;
    const x = this.x(ts);
    if (x == null) return;
    t.useMediaCoordinateSpace(({ context: c, mediaSize }) => {
      if (dim && !this.lineOnly && x < mediaSize.width) {
        c.fillStyle = colors.after;
        c.fillRect(Math.max(0, x), 0, mediaSize.width - Math.max(0, x), mediaSize.height);
      }
      if (x < -1 || x > mediaSize.width + 1) return;
      c.fillStyle = colors.fg;
      c.fillRect(Math.round(x) - 0.5, 0, 1, mediaSize.height);
      for (const d of this.dots) {
        const y = d.series.priceToCoordinate(d.value);
        if (y == null) continue;
        c.beginPath();
        c.arc(x, y, 3.5, 0, Math.PI * 2);
        c.fillStyle = d.color;
        c.fill();
        c.lineWidth = 1.5;
        c.strokeStyle = colors.bg;
        c.stroke();
      }
    });
  }
}

// ── The chart ───────────────────────────────────────────────────────────────

export interface LifetimeFlowsLwProps {
  model: FlowModel;
  scale: LineScale;
  hasDebt: boolean;
  /** The value panes: one for both sides, one per side (no common unit), or
   *  none (the price chart alone). */
  value: "one" | "split" | null;
  /** The price chart's series and scale (none: the value pane alone). */
  priced: FlowPriceSeries | null;
  priceScale: PriceScale | null;
  /** The first event's day and the axis's last day (absolute UTC days), and
   *  the days the axis spans from the first (a week at least). */
  startDay: number;
  today: number;
  span: number;
  /** The cursor's day (its close is drawn), and whether the strip after it
   *  is dimmed. */
  cursorDay: number;
  dim: boolean;
  /** The cursor's figures, where its dots sit. */
  at: { collateral: number; debt: number; price: number | null; level: number | null; warn?: number | null };
  /** Where the bars' window opens after the first event (absolute day). */
  windowFrom: number | null;
  /** The charts are shown (the panel expanded): the chart is made the first time. */
  shown: boolean;
  onAxis: (axis: FlowsLwAxis | null) => void;
  apiRef: React.MutableRefObject<FlowsLwApi | null>;
  /** The price tip, placed over the price pane. */
  tip: ReactNode;
}

export function LifetimeFlowsLw({
  model,
  scale,
  hasDebt,
  value,
  priced,
  priceScale,
  startDay,
  today,
  span,
  cursorDay,
  dim,
  at,
  windowFrom,
  shown,
  onAxis,
  apiRef,
  tip,
}: LifetimeFlowsLwProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const colors = useLwColors(wrap, COLORS);
  // The library loads once the charts are first shown.
  const [wanted, setWanted] = useState(shown);
  useEffect(() => {
    if (shown) setWanted(true);
  }, [shown]);
  const lib = useLwLib(wanted);
  // The sides the value panes draw: none on the price chart alone.
  const sides: Side[] = value == null ? [] : hasDebt ? ["collateral", "debt"] : ["collateral"];
  const hasPrice = priced != null && priceScale != null;
  // The panes, top to bottom: the value pane or a pane per side, then the
  // tip's pane and the price pane.
  const split = value === "split";
  const valuePanes: Side[][] = split ? sides.map((k) => [k]) : sides.length ? [sides] : [];
  const paneOf = (k: Side) => (split ? sides.indexOf(k) : 0);
  const nV = valuePanes.length;
  const spacerPane = nV;
  const pricePane = nV + 1;
  const valueH = valuePanes.map(() => (split ? SIDE_H : VALUE_H));
  const sideUnits = split ? model.sideUnits : undefined;
  /** The top of value pane `i` in the box (each pane over a 1 px separator). */
  const sideTop = (i: number) => valueH.slice(0, i).reduce((a, b) => a + b + 1, 0);

  const bounds = useMemo(() => flowsBounds(startDay, span), [startDay, span]);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  // The lines as vertices, then sampled on each grid.
  const valueLines = useMemo(
    () => Object.fromEntries(sides.map((k) => [k, sideVerts(model, scale, k, today)])) as Record<Side, Verts>,
    // `sides` follows hasDebt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, scale, today, hasDebt],
  );
  const priceLines = useMemo(() => {
    if (!priceScale) return null;
    const { line, dots } = priceVerts(priceScale);
    return {
      line,
      dots,
      step: stepRuns(priceScale.pieces.flat),
      level: stepRuns(levelRuns(priceScale.level.map((p) => [p[0], p[1]] as [number, number]))),
      warn: stepRuns(levelRuns(priceScale.warn.map((p) => [p[0], p[1]] as [number, number]))),
    };
  }, [priceScale]);

  const view = useRef<FlowsLwView>({ from: bounds.t0, to: bounds.t1 });
  /** A new grid is set and its window not yet applied. */
  const regrid = useRef(false);
  const [grid, setGrid] = useState<Grid | null>(null);
  const gridRef = useRef<Grid | null>(null);
  gridRef.current = grid;
  const [applyN, setApplyN] = useState(0);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<Record<string, ISeriesApi<SeriesType>>>({});
  const marks = useRef<{ value: ScrubberMark[]; price: ScrubberMark | null; spacer: ScrubberMark | null } | null>(null);
  const markState = useRef<MarkState>({ grid: null, ts: null, dim: false, shadeTs: null, colors: null });
  const touched = useRef(0);
  const plotW = useCallback(
    () => chart.current?.timeScale().width() || Math.max(200, (box.current?.clientWidth ?? 600) - 56),
    [],
  );

  // The axis for the panel's HTML, sent on the next frame after any change.
  const onAxisRef = useRef(onAxis);
  onAxisRef.current = onAxis;
  const frame = useRef<number | null>(null);
  const [axisN, setAxisN] = useState(0);
  const sendAxis = useCallback(() => {
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const c = chart.current;
      const g = gridRef.current;
      const w = c?.timeScale().width() ?? 0;
      if (!c || !g || w <= 0 || !box.current?.offsetParent) {
        onAxisRef.current(null);
        return;
      }
      const b = boundsRef.current;
      const r = c.timeScale().getVisibleLogicalRange();
      const v = r ? { from: cellTime(g, r.from), to: cellTime(g, r.to + 1) } : view.current;
      const end = b.t1;
      onAxisRef.current({
        xClose: (day: number) => xOf(c, g, Math.min(closeTs(day), end)) ?? -1e6,
        plotW: w,
        view: v,
        bounds: b,
      });
      setAxisN((n) => n + 1);
    });
  }, []);
  useEffect(() => () => onAxisRef.current(null), []);

  /** Sets the window (clamped to the axis), on the grid it fits. */
  const show = useCallback(
    (v: FlowsLwView) => {
      const b = boundsRef.current;
      const w = Math.min(b.t1 - b.t0, Math.max(MIN_SPAN, v.to - v.from));
      const from = Math.max(b.t0, Math.min(v.from, b.t1 - w));
      const target = { from, to: from + w };
      view.current = target;
      const g = gridRef.current;
      const c = chart.current;
      if (g && c && !needsRegrid(g, target, b, plotW(), MIN_STEP))
        c.timeScale().setVisibleLogicalRange({
          from: (target.from - g.start) / g.step,
          to: (target.to - g.start) / g.step - 1,
        });
      else {
        regrid.current = true;
        setGrid(gridFor(target, b, plotW(), MIN_STEP));
        setApplyN((n) => n + 1);
      }
    },
    [plotW],
  );
  // A new axis (a model rebuilt over more of the life) shows it whole.
  useEffect(() => {
    view.current = { from: bounds.t0, to: bounds.t1 };
    if (chart.current) show(view.current);
  }, [bounds, show]);

  apiRef.current = {
    reveal: (day) => {
      const c = chart.current;
      const g = gridRef.current;
      if (!c || !g) return;
      const r = c.timeScale().getVisibleLogicalRange();
      if (!r) return;
      const b = boundsRef.current;
      // While a new grid waits to be applied, the library's range is still
      // the old grid's: the window set is the one to hold.
      const v = regrid.current ? view.current : { from: cellTime(g, r.from), to: cellTime(g, r.to + 1) };
      const w = v.to - v.from;
      if (w >= b.t1 - b.t0) return;
      const ts = Math.min(closeTs(day), b.t1);
      const m = w * REVEAL_MARGIN;
      let from: number;
      // Near an end of the axis the window has nowhere further to go.
      if (ts < v.from + m && v.from > b.t0) from = ts - m;
      else if (ts > v.to - m && v.to < b.t1) from = ts + m - w;
      else return;
      show({ from, to: from + w });
    },
    showSpan: (days, day) => {
      const b = boundsRef.current;
      if (days == null) return show({ from: b.t0, to: b.t1 });
      const w = days * DAY_S;
      let from = b.t1 - w;
      const ts = closeTs(day);
      if (ts < from + w * REVEAL_MARGIN) from = ts - w / 2;
      show({ from, to: from + w });
    },
  };

  // The tip's height sets the price pane's room over its line.
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipH, setTipH] = useState(40);
  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTipH(Math.ceil(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasPrice, lib]);
  const spacerH = tipH + TIP_GAP;
  const [axisH, setAxisH] = useState(26);
  const paneHs = [...valueH, ...(hasPrice ? [spacerH, PRICE_LINE_H] : [])];
  // Each pane, and a 1 px separator between two.
  const boxH = paneHs.reduce((a, b) => a + b, 0) + Math.max(0, paneHs.length - 1) + axisH;

  // The old-price tip of a dotted stretch under the mouse.
  /** Where a dotted stretch of the price line touches a solid one: the days,
   *  and how many of them the two series meet on (a cell both draw). */
  const [meets, setMeets] = useState({ days: 0, met: 0 });
  const [oldTip, setOldTip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const sampled = useRef<Record<string, (number | null)[]>>({});
  const hoverRef = useRef<(p: MouseEventParams<Time>) => void>(() => {});
  hoverRef.current = (p) => {
    const g = gridRef.current;
    const c = chart.current;
    if (!g || !c || !p.point || p.logical == null || !p.sourceEvent || p.paneIndex == null || p.paneIndex >= nV) {
      if (oldTip) setOldTip(null);
      return;
    }
    const i = Math.round(p.logical);
    for (const k of sides) {
      if (paneOf(k) !== p.paneIndex) continue;
      const v = sampled.current[`dotted-${k}`]?.[i];
      const s = series.current[`dotted-${k}`];
      const y = v == null || !s ? null : s.priceToCoordinate(v);
      if (y == null || Math.abs(y - p.point.y) > 8) continue;
      // The dotted point nearest the pointer's day.
      const day = Math.floor((g.start + (i + 1) * g.step - 1) / DAY_S);
      let best: number | null = null;
      for (const pt of scale.points) {
        const stop = pt.to - startDay;
        const dotted =
          (model.stale.get(stop) ?? []).some((x) => x.side === k) ||
          (model.unsure.get(stop) ?? []).some((x) => x.side === k);
        if (dotted && (best == null || Math.abs(pt.to - day) < Math.abs(best - day))) best = pt.to;
      }
      const lines = best == null ? [] : oldLineTip(model, best - startDay, k);
      setOldTip(lines.length ? { x: p.point.x, y: y + sideTop(paneOf(k)), lines } : null);
      return;
    }
    if (oldTip) setOldTip(null);
  };

  // The chart, once the library is in and the charts are shown.
  const [ready, setReady] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!lib || !el) return;
    const c = lib.createChart(el, {
      autoSize: true,
      layout: {
        background: { type: lib.ColorType.Solid, color: "transparent" },
        attributionLogo: false,
        fontSize: 10,
        panes: { enableResize: false },
      },
      crosshair: { mode: lib.CrosshairMode.Normal },
      grid: { vertLines: { visible: false } },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        rightOffset: 0,
        lockVisibleTimeRangeOnResize: true,
        minBarSpacing: 0.05,
        maxBarSpacing: 60,
        tickMarkFormatter: (t: Time, type: number) => lwTickLabel(t, type),
      },
      localization: {
        locale: "en-GB",
        timeFormatter: (t: Time) => {
          const g = gridRef.current;
          // A day or more: the day whose close the cell shows; finer, the
          // cell's start, as the axis labels it.
          const ts = !g || g.step >= DAY_S ? (t as number) + (g?.step ?? DAY_S) - 1 : (t as number);
          const stamp = `${shortDate(ts)} ${shortDateYear(ts)}`;
          if (!g || g.step >= DAY_S) return stamp;
          const d = new Date((t as number) * 1000);
          return `${stamp} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
        },
      },
      // A drag is the cursor's (the panel's slider); the wheel is the page's
      // and `onWheel` takes the zoom and the sideways pan; a pinch zooms.
      handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false },
      handleScale: {
        mouseWheel: false,
        pinch: true,
        axisPressedMouseMove: { time: false, price: false },
        axisDoubleClickReset: false,
      },
      kineticScroll: { mouse: false, touch: false },
    });
    // The value axis: dollars, or the model's token (Morpho); a side's own
    // token where the sides have none in common.
    const unitOf = (k: Side) => sideUnits?.[k] ?? model.unit;
    const usd = (k: Side) => {
      const unit = unitOf(k);
      return {
        type: "custom" as const,
        // A token axis's hover label without the symbol, as its ticks, so the
        // axis keeps its width.
        formatter: (v: number) => (unit ? formatFlowToken(v, unit, false) : formatFlowUsd(v)),
        tickmarksFormatter: (vs: number[]) =>
          vs.map(sideUnits && unit ? (t: number) => formatFlowToken(t, unit, false) : scale.axisLabel),
        minMove: 0.01,
      };
    };
    const floor0 = (base: () => { priceRange: { minValue: number; maxValue: number } | null } | null) => {
      const r = base();
      return r?.priceRange ? { priceRange: { minValue: 0, maxValue: Math.max(r.priceRange.maxValue, 1e-9) } } : null;
    };
    const quiet = { priceLineVisible: false, lastValueVisible: false } as const;
    const s: Record<string, ISeriesApi<SeriesType>> = {};
    for (const k of sides) {
      const pane = paneOf(k);
      s[`area-${k}`] = c.addSeries(
        lib.AreaSeries,
        {
          ...quiet,
          lineVisible: false,
          crosshairMarkerVisible: false,
          priceFormat: usd(k),
          autoscaleInfoProvider: floor0,
        },
        pane,
      );
      s[`solid-${k}`] = c.addSeries(
        lib.LineSeries,
        {
          ...quiet,
          lineWidth: 2,
          priceFormat: usd(k),
          autoscaleInfoProvider: floor0,
        },
        pane,
      );
      s[`dotted-${k}`] = c.addSeries(
        lib.LineSeries,
        {
          ...quiet,
          lineWidth: 2,
          lineStyle: lib.LineStyle.SparseDotted,
          crosshairMarkerVisible: false,
          priceFormat: usd(k),
          autoscaleInfoProvider: floor0,
        },
        pane,
      );
    }
    // A side's pane keeps room over its line for its token's name.
    for (let i = 0; i < nV; i++)
      c.priceScale("right", i).applyOptions({ scaleMargins: { top: split ? 0.22 : 0.08, bottom: 0.02 } });
    if (hasPrice) {
      const unit = priced!.unitLabel;
      const px = {
        type: "custom" as const,
        // In a token, the hover label is the number alone, as the ticks are.
        formatter: (v: number) => formatPrice(v, unit).replace(` ${unit}`, ""),
        tickmarksFormatter: (vs: number[]) =>
          unit === "%" ? priceAxisLabels(vs.map((v) => v * 100)).map((l) => `${l}%`) : priceAxisLabels(vs),
        minMove: 1e-8,
      };
      // A flat stretch (a stablecoin in a zoomed window) is widened to ±1 %, as
      // the strips' axis widens it, so its labels stay round.
      const pxScale = {
        priceFormat: px,
        autoscaleInfoProvider: (base: () => { priceRange: { minValue: number; maxValue: number } | null } | null) => {
          const r = base();
          if (!r?.priceRange) return r;
          const { minValue: lo, maxValue: hi } = r.priceRange;
          if (hi - lo >= Math.abs(hi) * 1e-6) return r;
          const d = Math.abs(hi) * 0.01 || 1;
          return { ...r, priceRange: { minValue: lo - d, maxValue: hi + d } };
        },
      };
      // The tip's pane: a series with no values, its scale hidden.
      s.spacer = c.addSeries(
        lib.LineSeries,
        {
          ...quiet,
          lineVisible: false,
          color: "transparent",
          crosshairMarkerVisible: false,
          priceFormat: { type: "custom", formatter: () => "", tickmarksFormatter: (vs: number[]) => vs.map(() => "") },
        },
        spacerPane,
      );
      s.level = c.addSeries(lib.LineSeries, { ...quiet, lineWidth: 1, ...pxScale }, pricePane);
      s.warn = c.addSeries(
        lib.LineSeries,
        { ...quiet, lineWidth: 1, lineStyle: lib.LineStyle.Dashed, ...pxScale },
        pricePane,
      );
      s.price = c.addSeries(lib.LineSeries, { ...quiet, lineWidth: 2, ...pxScale }, pricePane);
      s.priceDotted = c.addSeries(
        lib.LineSeries,
        {
          ...quiet,
          lineWidth: 2,
          lineStyle: lib.LineStyle.SparseDotted,
          crosshairMarkerVisible: false,
          ...pxScale,
        },
        pricePane,
      );
      s.priceStep = c.addSeries(lib.LineSeries, { ...quiet, lineWidth: 2, ...pxScale }, pricePane);
      s.priceDots = c.addSeries(
        lib.LineSeries,
        {
          ...quiet,
          lineVisible: false,
          pointMarkersVisible: true,
          pointMarkersRadius: 1.5,
          crosshairMarkerVisible: false,
          ...pxScale,
        },
        pricePane,
      );
    }
    series.current = s;
    // A mark per value pane, on its first side's area.
    const mv = valuePanes.map((ks) => {
      const m = new ScrubberMark(markState.current);
      s[`area-${ks[0]}`].attachPrimitive(m);
      return m;
    });
    let mp: ScrubberMark | null = null;
    let ms: ScrubberMark | null = null;
    if (hasPrice) {
      ms = new ScrubberMark(markState.current, true);
      s.spacer.attachPrimitive(ms);
      mp = new ScrubberMark(markState.current);
      s.price.attachPrimitive(mp);
    }
    marks.current = { value: mv, price: mp, spacer: ms };
    const onRange = () => sendAxis();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const settle = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const g = gridRef.current;
        const r = c.timeScale().getVisibleLogicalRange();
        if (!g || !r) return;
        // A change no reader made (the price axis widening) keeps the window shown.
        if (Date.now() - touched.current > USER_MS) {
          const v = view.current;
          c.timeScale().setVisibleLogicalRange({
            from: (v.from - g.start) / g.step,
            to: (v.to - g.start) / g.step - 1,
          });
          return;
        }
        const v = { from: cellTime(g, r.from), to: cellTime(g, r.to + 1) };
        view.current = v;
        sendAxis();
        const w = c.timeScale().width();
        if (w > 0 && needsRegrid(g, v, boundsRef.current, w, MIN_STEP))
          setGrid(gridFor(v, boundsRef.current, w, MIN_STEP));
      }, SETTLE_MS);
    };
    const onSize = () => {
      sendAxis();
      setAxisH(Math.max(16, Math.round(c.timeScale().height())));
      settle();
    };
    c.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    c.timeScale().subscribeVisibleLogicalRangeChange(settle);
    c.timeScale().subscribeSizeChange(onSize);
    const onHover = (p: MouseEventParams<Time>) => hoverRef.current(p);
    c.subscribeCrosshairMove(onHover);
    // A zoom is the reader's: Ctrl or ⌘ with the wheel, a sideways swipe, or two fingers.
    const touch = (e: Event) => {
      if (((e as TouchEvent).touches?.length ?? 0) > 1) touched.current = Date.now();
    };
    /** The window moved by the reader: zoomed by `factor` about the plot's
     *  x `px`, then shifted `shift` cells; held inside the axis and no
     *  narrower than MIN_SPAN. */
    const nudge = (factor: number, px: number, shift: number) => {
      const g = gridRef.current;
      const r = c.timeScale().getVisibleLogicalRange();
      if (!g || !r) return;
      touched.current = Date.now();
      const b = boundsRef.current;
      const lo = (b.t0 - g.start) / g.step;
      const hi = (b.t1 - g.start) / g.step - 1;
      const w0 = r.to - r.from;
      const w = Math.min(hi - lo, Math.max(MIN_SPAN / g.step, w0 * factor));
      const pw = c.timeScale().width() || 1;
      const anchor = r.from + (Math.max(0, Math.min(pw, px)) / pw) * w0;
      let from = anchor - (anchor - r.from) * (w / w0) + shift;
      from = Math.max(lo, Math.min(from, hi - w));
      c.timeScale().setVisibleLogicalRange({ from, to: from + w });
    };
    const plotX = (clientX: number) => clientX - el.getBoundingClientRect().left;
    let gesture: { axis: "page" | "zoom" | "pan"; at: number } | null = null;
    const onWheel = (e: WheelEvent) => {
      const now = e.timeStamp;
      const fresh = !gesture || now - gesture.at > GESTURE_MS;
      const axis =
        e.ctrlKey || e.metaKey
          ? "zoom"
          : fresh
            ? Math.abs(e.deltaX) > Math.abs(e.deltaY)
              ? "pan"
              : "page"
            : gesture!.axis === "zoom"
              ? "page"
              : gesture!.axis;
      gesture = { axis, at: now };
      if (axis === "page") return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 120 : 1;
      const r = c.timeScale().getVisibleLogicalRange();
      const pw = c.timeScale().width() || 1;
      if (axis === "zoom") {
        const notches = Math.max(-1, Math.min(1, (e.deltaY * unit) / 100));
        nudge((1 + ZOOM_PER_NOTCH) ** notches, plotX(e.clientX), 0);
      } else if (r) nudge(1, 0, ((e.deltaX * unit) / pw) * (r.to - r.from));
    };
    // Safari's trackpad pinch: gesture events, each with the scale since its start.
    let pinch = 1;
    const onGesture = (e: Event) => {
      const g = e as Event & { scale: number; clientX: number };
      e.preventDefault();
      if (e.type === "gesturestart") pinch = 1;
      else if (g.scale > 0) {
        nudge(pinch / g.scale, plotX(g.clientX), 0);
        pinch = g.scale;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    for (const e of ["gesturestart", "gesturechange"]) el.addEventListener(e, onGesture, { passive: false });
    // The hover crosshair is the mouse's: a touch hides it, a mouse brings it back.
    const onPointer = (e: PointerEvent) => {
      const mode = e.pointerType === "mouse" ? lib.CrosshairMode.Normal : lib.CrosshairMode.Hidden;
      c.applyOptions({ crosshair: { mode } });
    };
    for (const e of ["touchstart", "touchmove"]) el.addEventListener(e, touch, { passive: true });
    el.addEventListener("pointerdown", onPointer);
    el.addEventListener("pointermove", onPointer);
    chart.current = c;
    regrid.current = true;
    setGrid(gridFor(view.current, boundsRef.current, plotW(), MIN_STEP));
    setApplyN((n) => n + 1);
    setReady((n) => n + 1);
    return () => {
      if (timer) clearTimeout(timer);
      for (const e of ["touchstart", "touchmove"]) el.removeEventListener(e, touch);
      el.removeEventListener("wheel", onWheel);
      for (const e of ["gesturestart", "gesturechange"]) el.removeEventListener(e, onGesture);
      el.removeEventListener("pointerdown", onPointer);
      el.removeEventListener("pointermove", onPointer);
      c.unsubscribeCrosshairMove(onHover);
      chart.current = null;
      series.current = {};
      marks.current = null;
      c.remove();
      onAxisRef.current(null);
    };
    // The series follow the panes and sides; their data follows the lines.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib, hasPrice, hasDebt, value, priced?.unitLabel]);

  // The panes' heights and the price pane's room for the tip, as stretch
  // factors, so a resize of the box keeps them.
  const paneKey = paneHs.join(",");
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const panes = c.panes();
    paneHs.forEach((h, i) => panes[i]?.setStretchFactor(h));
    if (hasPrice) c.priceScale("right", pricePane).applyOptions({ scaleMargins: { top: 0.08, bottom: 0.06 } });
    sendAxis();
    // `paneKey` stands for the heights.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hasPrice, paneKey, pricePane, sendAxis]);

  // Colours for the theme.
  useEffect(() => {
    const c = chart.current;
    if (!c || !colors) return;
    markState.current.colors = colors;
    c.applyOptions({
      layout: {
        textColor: colors.text,
        fontFamily: colors.font,
        panes: { separatorColor: "transparent", separatorHoverColor: "transparent" },
      },
      grid: { horzLines: { color: colors.grid } },
      crosshair: {
        vertLine: { color: colors.cross, labelBackgroundColor: colors.text },
        horzLine: { color: colors.cross, labelBackgroundColor: colors.text },
      },
    });
    const s = series.current;
    for (const k of sides) {
      const hue = colors[k];
      const fill = k === "collateral" ? colors.collateralFill : colors.debtFill;
      s[`area-${k}`]?.applyOptions({ topColor: fill, bottomColor: fill, lineColor: "transparent" });
      s[`solid-${k}`]?.applyOptions({ color: hue });
      s[`dotted-${k}`]?.applyOptions({ color: hue });
    }
    if (priced) {
      const hue = colors[priced.side];
      for (const n of ["price", "priceDotted", "priceStep", "priceDots"]) s[n]?.applyOptions({ color: hue });
      s.level?.applyOptions({ color: colors.liq });
      s.warn?.applyOptions({ color: colors.warn });
    }
    marks.current?.value.forEach((m) => m.update());
    marks.current?.price?.update();
    marks.current?.spacer?.update();
    // `sides` follows hasDebt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors, ready, priced?.side, hasDebt]);

  // The data, on every new grid or line; then the window.
  useEffect(() => {
    const c = chart.current;
    if (!c || !grid) return;
    const times = Array.from({ length: grid.count }, (_, i) => cellTime(grid, i) as UTCTimestamp);
    // The library joins a series' points across its whitespace; a point's
    // colour is the segment's out of it, so a point whose next cell has no
    // value draws its segment transparent, and a null cell is a break.
    const OFF = "transparent";
    const rows = (vals: (number | null)[], area: boolean): (LineData | AreaData | WhitespaceData)[] =>
      vals.map((v, i) => {
        if (v == null) return { time: times[i] };
        if (vals[i + 1] != null || i === vals.length - 1) return { time: times[i], value: v };
        return area
          ? { time: times[i], value: v, topColor: OFF, bottomColor: OFF, lineColor: OFF }
          : { time: times[i], value: v, color: OFF };
      });
    const out: Record<string, (number | null)[]> = {};
    for (const k of sides) {
      const l = valueLines[k];
      out[`area-${k}`] = sampleJoined(grid, l.v);
      out[`solid-${k}`] = sampleJoined(grid, l.v, (j) => l.kind[j] === "solid");
      out[`dotted-${k}`] = sampleJoined(grid, l.v, (j) => l.kind[j] === "dotted", true);
    }
    if (priceLines && series.current.price) {
      const l = priceLines.line;
      out.price = sampleJoined(grid, l.v, (j) => l.kind[j] === "solid");
      out.priceDotted = sampleJoined(grid, l.v, (j) => l.kind[j] === "dotted", true);
      out.priceStep = sampleRuns(grid, priceLines.step);
      out.level = sampleRuns(grid, priceLines.level);
      out.warn = sampleRuns(grid, priceLines.warn);
      const dots: (number | null)[] = new Array(grid.count).fill(null);
      for (const [ts, v] of priceLines.dots) {
        const i = Math.round(logicalOf(grid, ts));
        if (i >= 0 && i < grid.count) dots[i] = v;
      }
      out.priceDots = dots;
      // A flat, unseen line, so the pane has a scale to stand on.
      out.spacer = new Array(grid.count).fill(0);
    }
    for (const [name, vals] of Object.entries(out)) series.current[name]?.setData(rows(vals, name.startsWith("area-")));
    sampled.current = out;
    if (priceScale && out.price && out.priceDotted) {
      const { solid, dotted } = priceScale.pieces;
      const ends = (list: [number, number][][]) => new Set(list.flatMap((p) => [p[0][0], p[p.length - 1][0]]));
      const a = ends(solid);
      const touch = [...ends(dotted)].filter((d) => a.has(d));
      const met = touch.filter((d) => {
        const i = Math.round(logicalOf(grid, closeTs(d)));
        return [i - 1, i, i + 1].some((j) => out.price[j] != null && out.priceDotted[j] != null);
      }).length;
      setMeets((m) => (m.days === touch.length && m.met === met ? m : { days: touch.length, met }));
    }
    const end = grid.start + grid.count * grid.step;
    c.applyOptions({
      timeScale: {
        timeVisible: grid.step < DAY_S,
        secondsVisible: false,
        fixLeftEdge: grid.start <= bounds.t0,
        fixRightEdge: end >= bounds.t1,
      },
    });
    const v = view.current;
    c.timeScale().setVisibleLogicalRange({
      from: (v.from - grid.start) / grid.step,
      to: (v.to - grid.start) / grid.step - 1,
    });
    regrid.current = false;
    markState.current.grid = grid;
    marks.current?.value.forEach((m) => m.update());
    marks.current?.price?.update();
    marks.current?.spacer?.update();
    sendAxis();
    // `sides` follows the lines.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, applyN, ready, valueLines, priceLines, priceScale, bounds, sendAxis]);

  // The scrubber: the cursor's close, the dim after it, its dots, the window.
  useEffect(() => {
    const st = markState.current;
    st.ts = closeTs(Math.min(cursorDay, today));
    st.dim = dim;
    st.shadeTs = windowFrom != null && windowFrom > startDay ? windowFrom * DAY_S : null;
    const s = series.current;
    const cs = colors;
    if (marks.current && cs) {
      marks.current.value.forEach((m, i) => {
        m.dots = valuePanes[i].map((k) => ({ series: s[`area-${k}`], value: at[k], color: cs[k] }));
      });
      if (marks.current.price && priced)
        marks.current.price.dots = [
          ...(at.level != null && s.level ? [{ series: s.level, value: at.level, color: cs.liq }] : []),
          ...(at.warn != null && s.warn ? [{ series: s.warn, value: at.warn, color: cs.warn }] : []),
          ...(at.price != null && s.price ? [{ series: s.price, value: at.price, color: cs[priced.side] }] : []),
        ];
    }
    marks.current?.value.forEach((m) => m.update());
    marks.current?.price?.update();
    marks.current?.spacer?.update();
    // `sides` follows hasDebt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cursorDay,
    today,
    dim,
    windowFrom,
    startDay,
    at.collateral,
    at.debt,
    at.price,
    at.level,
    at.warn,
    colors,
    ready,
    priced,
  ]);

  // Shown again after being hidden: the axis is re-measured.
  useEffect(() => {
    sendAxis();
  }, [shown, sendAxis]);

  // The cursor's x for the HTML laid over the chart (the tip, the stem over
  // the time axis), re-read on every axis change.
  const c = chart.current;
  const g = grid;
  const cx = c && g ? xOf(c, g, closeTs(Math.min(cursorDay, today))) : null;
  const pw = c?.timeScale().width() ?? 0;
  // The tip's pane: under the value panes and their separators.
  const paneTop = sideTop(nV);
  void axisN;

  // The data hooks the verifiers read (a canvas leaves nothing in the DOM).
  const valueSig = useMemo(
    () => sides.map((k) => valueLines[k].v.map(([t, v]) => `${t}:${v ?? ""}`).join(",")).join("|"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [valueLines],
  );
  const levelHooks = priceScale ? levelRuns(priceScale.level.map((p) => [p[0], p[1]] as [number, number])) : [];
  const warnHooks = priceScale ? levelRuns(priceScale.warn.map((p) => [p[0], p[1]] as [number, number])) : [];
  const shaded = windowFrom != null && windowFrom > startDay;

  return (
    <div
      ref={wrap}
      className="relative"
      data-flow-chart-engine="lw"
      data-flow-chart-panes={[...(split ? sides : nV ? ["value"] : []), ...(hasPrice ? ["price"] : [])].join(",")}
      data-flow-lw-step={grid?.step ?? ""}
      data-flow-lw-from={Math.round(view.current.from)}
      data-flow-lw-to={Math.round(view.current.to)}
      data-flow-lw-plot-w={pw || ""}
      data-flow-lw-cursor-x={cx == null ? "" : cx.toFixed(1)}
    >
      <div ref={box} className="relative isolate w-full" style={{ height: boxH }} data-flow-lw-box="">
        {!lib && <p className="flex h-full items-center justify-center text-xs text-rb-500">Drawing the chart…</p>}
      </div>
      {/* Each side's pane names its token, in the side's hue. */}
      {sideUnits &&
        sides.map((k, i) => (
          <span
            key={k}
            aria-hidden
            className={`pointer-events-none absolute left-1 text-[10px] font-semibold leading-none ${k === "collateral" ? "text-blue-600 dark:text-blue-400" : "text-green-700 dark:text-green-400"}`}
            style={{ top: sideTop(i) + 3 }}
            data-flow-line-side-top={k}
          >
            {sideUnits[k].symbol}
          </span>
        ))}
      {hasPrice && (
        <div className="pointer-events-none absolute left-0" style={{ top: paneTop, width: pw || "100%" }}>
          <div ref={tipRef} className="pointer-events-auto" data-flow-price-tip="">
            {tip}
          </div>
        </div>
      )}
      {/* The cursor line carried over the time axis to the stem under it. */}
      {cx != null && cx >= 0 && cx <= pw && (
        <span
          aria-hidden
          className="pointer-events-none absolute w-px bg-foreground"
          style={{ left: cx - 0.5, top: boxH - axisH, height: axisH }}
          data-flow-axis-stem=""
        />
      )}
      {oldTip && (
        <span
          role="tooltip"
          data-prov-hidden=""
          data-flow-old-tip=""
          className="pointer-events-none absolute z-[var(--z-dropdown)] rounded-2xl border p-3 text-xs font-medium text-foreground shadow-lg"
          style={{
            left: Math.max(4, Math.min(pw - 286, oldTip.x - 141)),
            bottom: boxH - oldTip.y + 10,
            background: "var(--rb-tooltip-bg)",
            borderColor: "var(--rb-tooltip-border)",
          }}
        >
          <OldPriceTip lines={oldTip.lines} />
        </span>
      )}
      <div hidden data-flow-lw-hooks="">
        <span data-flow-value-line={valueSig} />
        {sides.map((k) => (valueLines[k].kind.includes("dotted") ? <span key={k} data-flow-old-line={k} /> : null))}
        {shaded && <span data-flow-window="" />}
        {dim && <span data-flow-after-cursor="" />}
        {priced && priceScale && (
          <span
            data-price-line={priced.key}
            data-price-grain={priced.grain}
            data-price-observed={priceScale.pieces.observed.join(",")}
            data-price-carried={priceScale.pieces.carried.join(",")}
            data-price-dotted={priceScale.pieces.dotted.flatMap((p) => p.map((v) => v[0])).join(",")}
            data-price-meets={`${meets.met}/${meets.days}`}
          />
        )}
        <span data-anatomy="F19.4">
          {levelHooks.map((run) => (
            <span
              key={run[0][0]}
              data-liq-level=""
              data-liq-days={run.map((p) => p[0]).join(",")}
              data-liq-values={run.map((p) => p[1]).join(",")}
            />
          ))}
        </span>
        <span data-anatomy="F19.9">
          {warnHooks.map((run) => (
            <span
              key={`w${run[0][0]}`}
              data-warn-level=""
              data-warn-days={run.map((p) => p[0]).join(",")}
              data-warn-values={run.map((p) => p[1]).join(",")}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
