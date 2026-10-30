"use client";

// Protocol activity under a position's Lifetime flows chart (ui-jobs 452): a
// protocol-wide daily series (lib/shared/flows-pace.ts; Liquity V2's branch
// redemptions first) drawn as its own chart under the events row, titled by
// its scope, on its own value axis, with its own readout and its own show and
// hide.
//
// RULES.
// - The time axis is the Lifetime flows chart's (`FlowsLwLink`): the same
//   grid and window, so a range button, a zoom or a pan there moves this one;
//   a wheel or a pinch here moves that chart's window, which this one follows.
// - The hover crosshair runs on both charts at once; the cursor is the
//   panel's, drawn here as there (`ScrubberMark`), the strip after it dimmed.
// - The bars are neutral grey: the orange is the position's redemption mark
//   on the events row, and the bars are every position's.
// - It starts shown where the series explains the position
//   (`ProtocolActivity.explains`), hidden otherwise; the reader's choice
//   holds for the page.
// - The readout reads the cursor's day, zero on a day the source lists none.
// - The scale is the square root of the amount: a bar's height grows with
//   the square root of its day's total, and the axis marks round amounts
//   (`sqrtTicks`) as price lines at their heights, the library's own ticks
//   left blank.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  IChartApi,
  IPrimitivePaneView,
  ISeriesApi,
  IPriceLine,
  ISeriesPrimitive,
  Logical,
  MouseEventParams,
  SeriesAttachedParameter,
  SeriesType,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import { Plus, X } from "lucide-react";
import { lwTickLabel, useLwColors, useLwLib, type LwColors } from "@/components/shared/lw-chart-kit";
import { ScrubberMark, closeTs, xOf, type MarkState } from "@/components/shared/lifetime-flows-lw";
import type { FlowsLwLink } from "@/components/shared/lifetime-flows-lw-axis";
import { Prov } from "@/components/shared/provenance";
import { DAY_S, cellTime, type Grid } from "@/lib/shared/asset-chart-grid";
import { priceAxisLabels } from "@/lib/shared/flows-price";
import {
  activityTitle,
  paceAt,
  paceMax,
  paceWords,
  sqrtTicks,
  type PaceDay,
  type ProtocolActivity,
} from "@/lib/shared/flows-pace";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { CTRL_GHOST, CTRL_OFF } from "@/lib/shared/ui-grammar";

/** The bars' plot over the time axis. */
const PLOT_H = 80;
const COLORS = {
  bar: ["var(--rb-500)", 0.6],
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

const dayStamp = (day: number) => `${shortDate(day * DAY_S)} ${shortDateYear(day * DAY_S)}`;

// ── The bars: a series primitive on an unseen flat line ─────────────────────

interface BarState {
  grid: Grid | null;
  days: PaceDay[];
  colors: Colors | null;
}

/** A drawn bar, in the plot's media pixels, as the verifiers read it. */
interface BarDrawn {
  day: number;
  x0: number;
  x1: number;
  y: number;
}

class ActivityBars implements ISeriesPrimitive<Time> {
  private req: (() => void) | null = null;
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private readonly views: IPrimitivePaneView[];
  constructor(
    private readonly st: BarState,
    private readonly onDrawn: (bars: BarDrawn[]) => void,
  ) {
    this.views = [{ zOrder: () => "normal", renderer: () => ({ draw: (t) => this.draw(t) }) }];
  }
  attached(p: SeriesAttachedParameter<Time, SeriesType>) {
    this.req = p.requestUpdate;
    this.chart = p.chart as IChartApi;
    this.series = p.series;
  }
  detached() {
    this.req = null;
    this.chart = null;
    this.series = null;
  }
  paneViews() {
    return this.views;
  }
  update() {
    this.req?.();
  }
  /** The tallest day's amount in the logical range. */
  maxIn(a: number, b: number): number {
    const g = this.st.grid;
    if (!g) return 0;
    const from = Math.floor(cellTime(g, a) / DAY_S);
    const to = Math.floor((cellTime(g, b + 1) - 1) / DAY_S);
    let m = 0;
    for (const d of this.st.days) if (d.day >= from && d.day <= to && d.amount > m) m = d.amount;
    return m;
  }
  /** The scale: zero to the square root of the tallest day in the window. */
  autoscaleInfo(a: Logical, b: Logical) {
    if (!this.st.grid) return null;
    const m = this.maxIn(a, b);
    return { priceRange: { minValue: 0, maxValue: m > 0 ? Math.sqrt(m) : 1 } };
  }
  /** Each day's bar in the plot now, from the time and value scales. */
  place(): BarDrawn[] {
    const { grid: g, days } = this.st;
    const c = this.chart;
    const s = this.series;
    if (!g || !c || !s) return [];
    const out: BarDrawn[] = [];
    for (const d of days) {
      if (!(d.amount > 0)) continue;
      const x0 = xOf(c, g, d.day * DAY_S);
      const x1 = xOf(c, g, closeTs(d.day));
      const y = s.priceToCoordinate(Math.sqrt(d.amount));
      if (x0 == null || x1 == null || y == null) continue;
      out.push({ day: d.day, x0, x1, y });
    }
    return out;
  }
  private draw(t: Parameters<NonNullable<ReturnType<IPrimitivePaneView["renderer"]>>["draw"]>[0]) {
    const colors = this.st.colors;
    const s = this.series;
    if (!colors || !s) return;
    const placed = this.place();
    const drawn: BarDrawn[] = [];
    t.useMediaCoordinateSpace(({ context: c, mediaSize }) => {
      const base = s.priceToCoordinate(0) ?? mediaSize.height;
      c.fillStyle = colors.bar;
      for (const p of placed) {
        // A day at least a pixel wide; a gap between days wider than 3 px.
        if (p.x1 <= 0 || p.x0 >= mediaSize.width) continue;
        const gap = p.x1 - p.x0 > 3 ? 1 : 0;
        const a = Math.max(0, p.x0 + gap / 2);
        const b = Math.min(mediaSize.width, Math.max(a + 1, p.x1 - gap / 2));
        if (b <= 0 || a >= mediaSize.width) continue;
        drawn.push(p);
        c.fillRect(a, p.y, b - a, Math.max(1, base - p.y));
      }
    });
    this.onDrawn(drawn);
  }
}

// ── The panel ───────────────────────────────────────────────────────────────

export interface ProtocolActivityChartProps {
  activity: ProtocolActivity;
  /** The Lifetime flows chart's axis; null until it is drawn. */
  link: FlowsLwLink | null;
  /** The axis's first and last days (absolute UTC days). */
  startDay: number;
  today: number;
  /** The cursor's day, and whether the strip after it is dimmed. */
  cursorDay: number;
  dim: boolean;
  isLive: boolean;
  /** Wraps the plot: the panel's slider, so a press or a drag here moves the
   *  cursor as on the chart above. */
  frame?: (plot: ReactNode) => ReactNode;
}

export function ProtocolActivityChart({
  activity,
  link,
  startDay,
  today,
  cursorDay,
  dim,
  isLive,
  frame = (p) => p,
}: ProtocolActivityChartProps) {
  const title = activityTitle(activity);
  // The default follows `explains` (it can turn as the history lands) until
  // the reader presses the button.
  const [choice, setChoice] = useState<boolean | null>(null);
  const shown = choice ?? activity.explains;
  const bodyId = `protocol-activity-${activity.unit}-${activity.from}`;

  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const colors = useLwColors(wrap, COLORS);
  const lib = useLwLib(shown && link != null);
  const chart = useRef<IChartApi | null>(null);
  const base = useRef<ISeriesApi<SeriesType> | null>(null);
  const markState = useRef<MarkState>({ grid: null, ts: null, dim: false, shadeTs: null, colors: null });
  const mark = useRef<ScrubberMark | null>(null);
  const barState = useRef<BarState>({ grid: null, days: [], colors: null });
  const bars = useRef<ActivityBars | null>(null);
  const barHook = useRef<HTMLSpanElement>(null);
  const gridRef = useRef<Grid | null>(null);
  /** The chart above's hover drew the crosshair here, its horizontal line hidden. */
  const linkHover = useRef(false);
  /** The axis's round amounts, as price lines on the unseen series. */
  const tickLines = useRef<IPriceLine[]>([]);
  const colorsRef = useRef<Colors | null>(null);
  colorsRef.current = colors;
  /** Marks the window's round amounts on the axis. */
  const setTicks = useRef<() => void>(() => {});
  setTicks.current = () => {
    const c = chart.current;
    const s = base.current;
    const b = bars.current;
    const cs = colorsRef.current;
    const r = c?.timeScale().getVisibleLogicalRange();
    if (!c || !s || !b || !cs || !r) return;
    for (const l of tickLines.current) s.removePriceLine(l);
    tickLines.current = sqrtTicks(b.maxIn(r.from, r.to)).map((v) =>
      s.createPriceLine({
        price: Math.sqrt(v),
        color: cs.grid,
        lineWidth: 1,
        lineStyle: 0,
        axisLabelVisible: true,
        axisLabelColor: cs.ground,
        axisLabelTextColor: cs.text,
        title: "",
      }),
    );
  };
  const linkRef = useRef(link);
  linkRef.current = link;
  const [ready, setReady] = useState(0);
  // Re-read the cursor's x for the readout after any move of the window.
  const [axisN, setAxisN] = useState(0);
  const days = activity.days.filter((d) => d.day >= startDay && d.day <= today);

  // The chart, once the library is in and the panel is shown.
  useEffect(() => {
    const el = box.current;
    if (!lib || !el || !shown) return;
    const c = lib.createChart(el, {
      autoSize: true,
      layout: {
        background: { type: lib.ColorType.Solid, color: "transparent" },
        attributionLogo: false,
        fontSize: 10,
        panes: { enableResize: false },
      },
      crosshair: { mode: lib.CrosshairMode.Normal },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0 } },
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
          const ts = !g || g.step >= DAY_S ? (t as number) + (g?.step ?? DAY_S) - 1 : (t as number);
          return `${shortDate(ts)} ${shortDateYear(ts)}`;
        },
      },
      // The window is the chart above's: nothing here scrolls or scales it.
      handleScroll: false,
      handleScale: false,
      kineticScroll: { mouse: false, touch: false },
    });
    const s = c.addSeries(lib.LineSeries, {
      priceLineVisible: false,
      lastValueVisible: false,
      lineVisible: false,
      color: "transparent",
      crosshairMarkerVisible: false,
      // The values are square roots: a label squares them back; the
      // library's ticks are blank, the round amounts drawn as price lines.
      priceFormat: {
        type: "custom",
        formatter: (v: number) => priceAxisLabels([Math.max(0, v) ** 2])[0],
        tickmarksFormatter: (vs: number[]) => vs.map(() => ""),
        minMove: 0.01,
      },
    });
    const m = new ScrubberMark(markState.current);
    s.attachPrimitive(m);
    const b = new ActivityBars(barState.current, (drawn) => {
      const h = barHook.current;
      if (h)
        h.dataset.flowPaceDrawn = drawn
          .map((d) => `${d.day}:${d.x0.toFixed(1)}:${d.x1.toFixed(1)}:${d.y.toFixed(1)}`)
          .join(",");
    });
    s.attachPrimitive(b);
    Object.assign(el, { flowPacePlace: () => b.place() });
    // The hover is drawn on the chart above too.
    const onHover = (p: MouseEventParams<Time>) => {
      if (!p.sourceEvent) return;
      linkRef.current?.hover(p.time == null ? null : (p.time as number));
    };
    c.subscribeCrosshairMove(onHover);
    const onLeave = () => linkRef.current?.hover(null);
    const onWheel = (e: WheelEvent) => linkRef.current?.wheel(e);
    const onGesture = (e: Event) => linkRef.current?.gesture(e);
    // Applied on a change only: each applyOptions redraws the chart.
    let crossMode: number = lib.CrosshairMode.Normal;
    const onPointer = (e: PointerEvent) => {
      const mode = e.pointerType === "mouse" ? lib.CrosshairMode.Normal : lib.CrosshairMode.Hidden;
      if (mode === crossMode && !linkHover.current) return;
      crossMode = mode;
      linkHover.current = false;
      c.applyOptions({ crosshair: { mode, horzLine: { visible: true, labelVisible: true } } });
    };
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("wheel", onWheel, { passive: false });
    for (const e of ["gesturestart", "gesturechange"]) el.addEventListener(e, onGesture, { passive: false });
    el.addEventListener("pointerdown", onPointer);
    el.addEventListener("pointermove", onPointer);
    chart.current = c;
    base.current = s;
    mark.current = m;
    bars.current = b;
    setReady((n) => n + 1);
    return () => {
      c.unsubscribeCrosshairMove(onHover);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("wheel", onWheel);
      for (const e of ["gesturestart", "gesturechange"]) el.removeEventListener(e, onGesture);
      el.removeEventListener("pointerdown", onPointer);
      el.removeEventListener("pointermove", onPointer);
      chart.current = null;
      base.current = null;
      tickLines.current = [];
      mark.current = null;
      bars.current = null;
      c.remove();
    };
  }, [lib, shown]);

  // The grid and window of the chart above, on every new grid; then each of
  // its moves and hovers.
  useEffect(() => {
    const c = chart.current;
    const s = base.current;
    if (!c || !s || !link) return;
    const g = link.grid;
    gridRef.current = g;
    s.setData(Array.from({ length: g.count }, (_, i) => ({ time: cellTime(g, i) as UTCTimestamp, value: 0 })));
    c.applyOptions({ timeScale: { timeVisible: g.step < DAY_S, secondsVisible: false } });
    markState.current.grid = g;
    barState.current.grid = g;
    // Both plots one width: the wider value axis sets the other's.
    let frame: number | null = null;
    const align = () => {
      if (frame != null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const mw = link.chart.priceScale("right").width();
        const sw = c.priceScale("right").width();
        if (mw > sw) c.applyOptions({ rightPriceScale: { minimumWidth: mw } });
        else if (sw > mw) link.chart.applyOptions({ rightPriceScale: { minimumWidth: sw } });
        setTicks.current();
        setAxisN((n) => n + 1);
      });
    };
    const sync = () => {
      const r = link.chart.timeScale().getVisibleLogicalRange();
      if (r) c.timeScale().setVisibleLogicalRange(r);
      align();
    };
    const mirror = (p: MouseEventParams<Time>) => {
      if (!p.sourceEvent) return;
      if (p.time == null) return c.clearCrosshairPosition();
      if (!linkHover.current) {
        linkHover.current = true;
        c.applyOptions({ crosshair: { horzLine: { visible: false, labelVisible: false } } });
      }
      c.setCrosshairPosition(0, p.time, s);
    };
    sync();
    bars.current?.update();
    mark.current?.update();
    link.chart.timeScale().subscribeVisibleLogicalRangeChange(sync);
    link.chart.timeScale().subscribeSizeChange(sync);
    link.chart.subscribeCrosshairMove(mirror);
    // Its value axis lays out after the first draw: the widths are held level then too.
    c.timeScale().subscribeSizeChange(align);
    return () => {
      c.timeScale().unsubscribeSizeChange(align);
      if (frame != null) cancelAnimationFrame(frame);
      link.chart.timeScale().unsubscribeVisibleLogicalRangeChange(sync);
      link.chart.timeScale().unsubscribeSizeChange(sync);
      link.chart.unsubscribeCrosshairMove(mirror);
    };
  }, [link, ready]);

  // The bars' days.
  const daysKey = `${activity.from}:${activity.to}:${days.length}:${startDay}:${today}`;
  useEffect(() => {
    barState.current.days = days;
    bars.current?.update();
    setTicks.current();
    // `daysKey` stands for the days.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysKey, ready]);

  // Colours for the theme.
  useEffect(() => {
    const c = chart.current;
    if (!c || !colors) return;
    markState.current.colors = colors;
    barState.current.colors = colors;
    c.applyOptions({
      layout: {
        textColor: colors.text,
        fontFamily: colors.font,
        panes: { separatorColor: "transparent", separatorHoverColor: "transparent" },
      },
      crosshair: {
        vertLine: { color: colors.cross, labelBackgroundColor: colors.text },
        horzLine: { color: colors.cross, labelBackgroundColor: colors.text },
      },
    });
    bars.current?.update();
    mark.current?.update();
    setTicks.current();
  }, [colors, ready]);

  // The cursor, drawn as on the chart above.
  useEffect(() => {
    markState.current.ts = closeTs(Math.min(cursorDay, today));
    markState.current.dim = dim;
    mark.current?.update();
  }, [cursorDay, today, dim, ready]);

  // The readout at the cursor's x, on the chart above's axis.
  void axisN;
  const at = paceAt(activity, Math.min(cursorDay, today));
  const cx = link ? xOf(link.chart, link.grid, closeTs(Math.min(cursorDay, today))) : null;
  const pw = link?.chart.timeScale().width() ?? 0;
  // This chart's window and plot, for the verifiers to hold against the chart above's.
  const ownRange = chart.current?.timeScale().getVisibleLogicalRange();
  const ownGrid = gridRef.current;
  const ownWindow = ownRange && ownGrid ? [cellTime(ownGrid, ownRange.from), cellTime(ownGrid, ownRange.to + 1)] : null;
  const ownW = chart.current?.timeScale().width() ?? 0;
  const hasAt = at != null;
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipW, setTipW] = useState(180);
  useEffect(() => {
    const el = tipRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTipW(Math.ceil(el.getBoundingClientRect().width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [shown, hasAt]);
  const tipLeft = cx == null ? 0 : Math.max(0, Math.min(pw - tipW, cx - tipW / 2));
  const caret = cx == null ? tipW / 2 : Math.max(8, Math.min(tipW - 8, cx - tipLeft));
  const dayWord = isLive ? `today, ${dayStamp(cursorDay)}` : dayStamp(cursorDay);
  const visible = cx != null && cx >= 0 && cx <= pw;

  return (
    <section
      ref={wrap}
      aria-label="Protocol activity"
      className="mt-5 border-t border-rb-200 pt-3 dark:border-rb-800"
      data-protocol-activity={title}
      data-protocol-activity-shown={shown ? "" : undefined}
      data-protocol-activity-explains={activity.explains ? "" : undefined}
      data-anatomy="F19.11"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3
          className="flex min-h-8 items-center text-sm font-semibold text-rb-500 pointer-coarse:min-h-11"
          data-protocol-activity-title=""
        >
          {title}
        </h3>
        <button
          type="button"
          onClick={() => setChoice(!shown)}
          aria-expanded={shown}
          aria-controls={bodyId}
          className={`${CTRL_GHOST} ${CTRL_OFF} h-8 shrink-0 gap-1.5 rounded-lg bg-sunken px-2.5 text-xs font-medium pointer-coarse:h-11`}
          data-protocol-activity-toggle={shown ? "shown" : "hidden"}
        >
          {shown ? <X size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      <div id={bodyId} className={shown ? "relative mt-1" : "hidden"}>
        {/* The cursor's day over the bars. */}
        <div className="relative h-8" aria-live="polite">
          {at && (
            <div
              ref={tipRef}
              className="absolute top-0 whitespace-nowrap rounded-lg border border-[var(--color-rb-200)] bg-[var(--surface-overlay)] px-2 py-1 text-xs tabular-nums dark:border-[var(--color-rb-800)] dark:bg-[var(--color-rb-900)]"
              style={{ left: tipLeft, visibility: visible ? undefined : "hidden" }}
              data-pace-readout=""
              data-pace-day={at.day}
              data-pace-amount={at.amount}
              data-pace-count={at.count}
            >
              <span className="font-semibold text-foreground">
                <Prov info={activity.prov(at, dayWord)} value={String(at.amount)}>
                  {paceWords(activity, at)}
                </Prov>
              </span>
              <i
                aria-hidden
                className="absolute top-full size-2 -translate-x-1/2 -translate-y-1 rotate-45 border-b border-r border-[var(--color-rb-200)] bg-[var(--surface-overlay)] dark:border-[var(--color-rb-800)] dark:bg-[var(--color-rb-900)]"
                style={{ left: caret }}
              />
            </div>
          )}
        </div>
        {frame(
          <div
            ref={box}
            className="relative isolate w-full"
            style={{ height: PLOT_H + 26 }}
            data-protocol-activity-box=""
          >
            {!lib && <p className="flex h-full items-center justify-center text-xs text-rb-500">Drawing the chart…</p>}
          </div>,
        )}
        <div hidden data-protocol-activity-hooks="">
          <span
            ref={barHook}
            data-flow-pace={title}
            data-pace-from={activity.from}
            data-pace-to={activity.to}
            data-pace-max={paceMax(activity, startDay, today)}
            data-pace-days={days.map((d) => `${d.day}:${d.amount}:${d.count}`).join(",")}
            data-flow-pace-drawn=""
          />
          <span
            data-activity-lw-from={ownWindow ? Math.round(ownWindow[0]) : ""}
            data-activity-lw-to={ownWindow ? Math.round(ownWindow[1]) : ""}
            data-activity-lw-plot-w={ownW || ""}
          />
        </div>
      </div>
    </section>
  );
}
