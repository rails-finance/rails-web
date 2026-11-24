"use client";

// One chain's asset charts on TradingView's Lightweight Charts (rails-ops
// reference/asset-key-map.md, "The chart engine"; anatomy A3, A3.1,
// A3.4–A3.7; ui-jobs 818): the price chart draws the main line alone (with
// `via`, the price the protocol uses), with its range buttons, readout and
// price axis; under it the gap chart draws each other line's deviation from
// the main line in percent, 0 % its reference and dashed guides at ±1 %, with
// one legend giving each line's price and gap (AssetGapLegend). The two
// charts share one window and one cursor: a pan or zoom on either moves both,
// and the cursor over either shows its moment in both. The legends read the
// cursor's moment while it lies in the window, else the window's last
// (`legendMoment`). Each line's colour and dash follow its key
// (lib/shared/chart-series-style.ts); a legend row hovered or focused, or the
// gap line nearest the cursor, lights that line and dims the others, and a
// row pressed hides its line (the main line stays). The lines are drawn on
// the uniform grid of lib/shared/asset-chart-grid.ts, so the axis stays
// proportional to time; zoomed in on stored rounds, the grid's cells read
// detail windows of `/api/prices/rounds` (cached by step and chunk). The span
// before the main line's stored rounds, where it is the daily store, is
// shaded on both charts (behind the transparent canvas). The library loads
// with this component only (a dynamic import). Licence: Apache-2.0, the
// NOTICE in the site's footers (components/shared/lw-attribution.tsx).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, LineData, Time, UTCTimestamp, WhitespaceData } from "lightweight-charts";
import { AssetGapLegend, type GapRow } from "@/components/assets/asset-gap-legend";
import { legName, roundName, roundTime } from "@/components/assets/round-time";
import { LINE_HUE } from "@/components/shared/lifetime-flows-combined";
import { LearnMoreButton, LearnMoreModal, type LearnMoreContent } from "@/components/shared/learn-more-modal";
import { lwTickLabel, useLwColors, useLwLib } from "@/components/shared/lw-chart-kit";
import { LineKey, useLineFocus } from "@/components/shared/lw-line-key";
import { LW_LINE_STYLE, nearestLine, seriesStyles, type SeriesStyle } from "@/lib/shared/chart-series-style";
import { fetchPriceRounds, type RoundsAnswer } from "@/lib/api/fetch-price-rounds";
import { formatDate } from "@/lib/date";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import { formatPrice } from "@/lib/shared/flows-price";
import { lineReaders, type PageLine } from "@/lib/shared/asset-roster";
import { dashReason, fmtSignedSpread, type DashReason, type LineSpread } from "@/lib/shared/asset-spread";
import {
  CHUNK_MAX,
  DAY_S,
  cellAt,
  cellOf,
  cellTime,
  gapSeries,
  gridChunks,
  gridFor,
  inForce,
  legendMoment,
  lineTrack,
  needsRegrid,
  rangePressed,
  sampleTrack,
  withDetail,
  type Grid,
  type Track,
} from "@/lib/shared/asset-chart-grid";
import { opensOnRounds, type PriceSeries, type RoundPricePoint } from "@/lib/shared/price-series";

const RANGES = [
  ["1D", DAY_S],
  ["7D", 7 * DAY_S],
  ["30D", 30 * DAY_S],
  ["1Y", 365 * DAY_S],
  ["All", null],
] as const;
const PRICE_H = 260;
const GAP_H = 220;
/** The price axes' width at least, so the two charts' time axes line up. */
const AXIS_W = 72;
/** How near the cursor a line must be to light, in px. */
const NEAR_PX = 16;
/** Oracles a rounds read takes at most. */
const READ_ORACLES = 12;
/** Detail windows kept per chart. */
const CACHE_MAX = 64;
const SETTLE_MS = 200;
/** A range change this long after the reader's last touch was not theirs. */
const USER_MS = 2500;

export interface LwLine {
  line: PageLine;
  /** The drawn series, joined above by its stored rounds where it has them. */
  series: PriceSeries;
}

/** The chart's colours, as site tokens (lw-chart-kit reads them for the canvas). */
const PALETTE = {
  main: [LINE_HUE.collateral],
  s1: ["var(--chart-series-1)"],
  s2: ["var(--chart-series-2)"],
  s3: ["var(--chart-series-3)"],
  s4: ["var(--chart-series-4)"],
  text: ["var(--rb-500)"],
  grid: ["var(--rb-chart-grid)", 0.7],
  cross: ["var(--rb-500)", 0.8],
  caution: ["var(--caution)", 0.8],
  zero: ["var(--rb-500)"],
} as const;

/** The price axis's labels, with the decimals their spacing needs ("$0.99995" beside "$1.00000"). */
function usdTicks(prices: number[]): string[] {
  const sorted = [...prices].sort((a, b) => a - b);
  let gap = Infinity;
  for (let i = 1; i < sorted.length; i++) if (sorted[i] > sorted[i - 1]) gap = Math.min(gap, sorted[i] - sorted[i - 1]);
  const digits = Number.isFinite(gap) ? Math.max(0, Math.min(8, Math.ceil(-Math.log10(gap) - 1e-9))) : 2;
  return prices.map(
    (v) => `$${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`,
  );
}

/** One cell's time in words: its day on a grid of a day or more or before
 *  the stored rounds (`roundsFrom`), else its moment. */
const cellWords = (g: Grid, ts: number, roundsFrom: number | null) =>
  g.step >= DAY_S || roundsFrom == null || ts < roundsFrom ? formatDate(new Date(ts * 1000)) : roundTime(ts);

type Chunk = { from: number; to: number; answer: RoundsAnswer | null };

/** A line whose every series is a market Maker has retired: drawn quieter. */
const retiredLine = (l: LwLine) => l.line.series.length > 0 && l.line.series.every((s) => s.retired);
/** An rgba() colour at `alpha` times its own. */
function withAlpha(rgba: string, alpha: number): string {
  const m = rgba.match(/rgba?\(([^)]+)\)/);
  if (!m) return rgba;
  const [r, g, b, a = "1"] = m[1].split(",").map((x) => x.trim());
  return `rgba(${r}, ${g}, ${b}, ${(Number(a) * alpha).toFixed(3)})`;
}
/** The thin lines' strength, a retired line's, and a line's when another is lit. */
const THIN_ALPHA = 0.85;
const RETIRED_ALPHA = 0.45;
const DIM_ALPHA = 0.2;

export function AssetLwChart({
  lines,
  chain,
  spreads,
  help,
  joinNote,
  usual = null,
  gapCaption = null,
}: {
  /** Main line first. */
  lines: LwLine[];
  chain: number;
  spreads: { main: PageLine; others: { line: PageLine; spread: LineSpread }[] } | null;
  help: LearnMoreContent;
  /** The join under the charts ("From 25 Oct 2026 the lines are…"), their source line. */
  joinNote: string | null;
  /** Where `via` makes another line the main one, the line most protocols read. */
  usual?: string | null;
  /** The caption over the gap chart. */
  gapCaption?: string | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const gapBox = useRef<HTMLDivElement>(null);
  const palette = useLwColors(wrap, PALETTE);
  const lib = useLwLib();

  const main = lines[0];
  const others = lines.slice(1);
  const mainRounds = main.series.rounds;
  const lineKey = lines.map((l) => l.line.id).join(",");
  // The styles go to every line but the one most protocols read (the main
  // line without `via`); where `via` makes another line the main one, the
  // most read takes the style the new main line leaves, so no other line moves.
  const usualId = usual ?? main.line.id;
  const styles = useMemo(() => {
    const ids = lineKey.split(",");
    const out = seriesStyles(ids.filter((id) => id !== usualId));
    const mainId = ids[0];
    if (mainId !== usualId && out.has(mainId)) out.set(usualId, out.get(mainId)!);
    return out;
  }, [lineKey, usualId]);
  const styleOf = useCallback((id: string): SeriesStyle | undefined => styles.get(id), [styles]);
  const focus = useLineFocus(main.line.id);
  const { lit, hidden, light } = focus;
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  // The lit line, unless it is hidden.
  const litId = lit && !hidden.has(lit.id) ? lit.id : null;
  // The data's span: the first stored day to the checkpoint (or the end of the last stored day).
  const bounds = useMemo(() => {
    const t0 = Math.min(...lines.map((l) => l.series.points[0][0] * DAY_S));
    const t1 = Math.max(...lines.map((l) => l.series.rounds?.asOf.ts ?? (l.series.points.at(-1)![0] + 1) * DAY_S - 1));
    return { t0, t1 };
  }, [lines]);
  const home = useMemo(
    () =>
      mainRounds && opensOnRounds(mainRounds)
        ? { from: mainRounds.from.ts, to: bounds.t1 }
        : { from: bounds.t0, to: bounds.t1 },
    [mainRounds, bounds],
  );

  // Where the first stored rounds start: before it a cell is named by its day.
  const firstRound = useMemo(() => {
    const ts = lines.flatMap((l) => (l.series.rounds ? [l.series.rounds.from.ts] : []));
    return ts.length ? Math.min(...ts) : null;
  }, [lines]);
  const firstRoundRef = useRef(firstRound);
  firstRoundRef.current = firstRound;
  // The window shown, and the grid drawn under it.
  const view = useRef(home);
  const [shown, setShown] = useState(home);
  // No range button presses until a reader chooses one.
  const [rangeChosen, setRangeChosen] = useState(false);
  const [grid, setGrid] = useState<Grid | null>(null);
  const gridRef = useRef<Grid | null>(null);
  gridRef.current = grid;
  const [cursorTs, setCursorTs] = useState<number | null>(null);
  const pendingCross = useRef<number | null>(null);
  const applied = useRef<{ grid: Grid | null; n: number }>({ grid: null, n: -1 });
  const [applyN, setApplyN] = useState(0);
  // The time scale's width, as the visible-range handler reads it.
  const width = useCallback(
    () => chart.current?.timeScale().width() || Math.max(200, box.current?.clientWidth ?? 600) - 56,
    [],
  );
  const show = useCallback(
    (v: { from: number; to: number }, crossAt?: number) => {
      const w = Math.max(600, v.to - v.from);
      const from = Math.max(bounds.t0 - w * 0.02, Math.min(v.from, bounds.t1 - w));
      const target = { from, to: from + w };
      view.current = target;
      setShown(target);
      pendingCross.current = crossAt ?? null;
      setGrid(gridFor(target, bounds, width()));
      setApplyN((n) => n + 1);
    },
    [bounds, width],
  );
  useEffect(() => show(home), [home, show]);

  // Detail windows of the stored rounds, for lines whose first read was thinned.
  const cache = useRef(new Map<string, Chunk | "pending">());
  const [reads, setReads] = useState(0);
  const [detailN, setDetailN] = useState(0);
  const thinned = useMemo(() => lines.filter((l) => l.series.rounds?.thinned), [lines]);
  useEffect(() => {
    if (!grid || thinned.length === 0) return;
    const from = Math.min(...thinned.map((l) => l.series.rounds!.from.ts));
    for (const c of gridChunks(grid, { from, to: bounds.t1 }))
      for (let b = 0; b * READ_ORACLES < thinned.length; b++) {
        const key = `${grid.step}:${c.k}:${b}`;
        if (cache.current.has(key)) continue;
        cache.current.set(key, "pending");
        while (cache.current.size > CACHE_MAX) cache.current.delete(cache.current.keys().next().value!);
        const oracles = thinned.slice(b * READ_ORACLES, (b + 1) * READ_ORACLES).map((l) => l.line.oracle.address);
        setReads((n) => n + 1);
        fetchPriceRounds(chain, oracles, { from: c.from, to: c.to, max: CHUNK_MAX })
          .then((answer) => cache.current.set(key, { from: c.from, to: c.to, answer }))
          .catch(() => cache.current.set(key, { from: c.from, to: c.to, answer: null }))
          .finally(() => setDetailN((n) => n + 1));
      }
  }, [grid, thinned, chain, bounds.t1]);

  /** A line's rounds with the loaded detail windows of this grid in place. */
  const detailed = useCallback(
    (l: LwLine, g: Grid): { points: RoundPricePoint[]; covered: (ts: number) => boolean } | null => {
      const r = l.series.rounds;
      if (!r) return null;
      if (!r.thinned) return { points: r.points, covered: () => true };
      const addr = l.line.oracle.address.toLowerCase();
      const chunks: { from: number; to: number; points: RoundPricePoint[] }[] = [];
      for (const c of gridChunks(g, { from: r.from.ts, to: bounds.t1 })) {
        const b = Math.floor(thinned.indexOf(l) / READ_ORACLES);
        const hit = cache.current.get(`${g.step}:${c.k}:${b}`);
        const wire = hit && hit !== "pending" && hit.answer?.lane === "on" ? hit.answer.lines[addr] : undefined;
        if (!wire || !("points" in wire)) continue;
        const div = 10 ** wire.scale;
        chunks.push({
          from: c.from,
          to: c.to,
          points: wire.points
            .map(
              ([ts, raw, block, leg, src, tx, round]): RoundPricePoint => [
                ts,
                Number(raw) / div,
                block,
                leg,
                src,
                tx,
                round,
              ],
            )
            .filter((p) => Number.isFinite(p[1]) && p[1] > 0),
        });
      }
      return {
        points: withDetail(r.points, chunks),
        covered: (ts) => chunks.some((c) => ts >= c.from && ts < c.to),
      };
    },
    // detailN: a window arrived.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bounds.t1, thinned, detailN],
  );

  const tracks = useMemo(() => {
    if (!grid) return null;
    return lines.map((l) => {
      const d = detailed(l, grid);
      const r = l.series.rounds;
      return {
        l,
        rounds: d,
        track: lineTrack(l.series.points, r && d ? { ...r, points: d.points } : null, grid.step, bounds.t1),
      };
    });
  }, [grid, lines, detailed, bounds.t1]);

  // The charts: made once the library is in, their series rebuilt when the lines change.
  const chart = useRef<IChartApi | null>(null);
  const gapChart = useRef<IChartApi | null>(null);
  const mainSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const spreadSeries = useRef<ISeriesApi<"Line">[]>([]);
  const guideSeries = useRef<ISeriesApi<"Line"> | null>(null);
  // The shade over the daily-only span: from the first stored day to where
  // the main line's stored rounds start, placed on every range or size change.
  const shade = useRef<HTMLDivElement>(null);
  const gapShade = useRef<HTMLDivElement>(null);
  const joinTs = mainRounds?.from.ts ?? null;
  const placeShade = useCallback(() => {
    const c = chart.current;
    const g = gridRef.current;
    const ts = c?.timeScale();
    const x = (t: number) =>
      ts && g
        ? ts.timeToCoordinate(cellTime(g, Math.max(0, Math.min(g.count - 1, cellOf(g, t)))) as UTCTimestamp)
        : null;
    const left = Math.max(0, x(bounds.t0) ?? 0);
    const right = Math.min(ts?.width() ?? 0, joinTs != null && joinTs > bounds.t0 ? (x(joinTs) ?? -1) : -1);
    const pairs = [
      [shade.current, box.current, chart.current],
      [gapShade.current, gapBox.current, gapChart.current],
    ] as const;
    for (const [el, b, cc] of pairs) {
      if (!el) continue;
      if (!ts || right <= left) {
        el.style.width = "0px";
        continue;
      }
      el.style.left = `${left}px`;
      el.style.width = `${right - left}px`;
      el.style.height = `${Math.max(0, (b?.clientHeight ?? 0) - (cc?.timeScale().height() ?? 0))}px`;
    }
  }, [bounds.t0, joinTs]);
  const placeShadeRef = useRef(placeShade);
  placeShadeRef.current = placeShade;
  // The two price axes at one width, so the charts' time axes line up.
  const alignAxes = useCallback(() => {
    const a = chart.current;
    const b = gapChart.current;
    if (!a || !b) return;
    const w = Math.max(AXIS_W, a.priceScale("right").width(), b.priceScale("right").width());
    for (const c of [a, b])
      if (c.priceScale("right").width() < w) c.applyOptions({ rightPriceScale: { minimumWidth: w } });
  }, []);
  const [ready, setReady] = useState(0);
  // Each cell's value, the main line's price and each other line's gap, for the cursor.
  const sampled = useRef<{ price: (number | null)[]; spread: (number | null)[][] }>({ price: [], spread: [] });
  useEffect(() => {
    const el = box.current;
    const gel = gapBox.current;
    if (!lib || !el) return;
    const make = (target: HTMLElement) =>
      lib.createChart(target, {
        autoSize: true,
        // The attribution is in the site's footers (Miles, 26 Oct 2026).
        layout: {
          background: { type: lib.ColorType.Solid, color: "transparent" },
          attributionLogo: false,
          fontSize: 11,
        },
        crosshair: { mode: lib.CrosshairMode.Normal },
        rightPriceScale: { borderVisible: false, minimumWidth: AXIS_W },
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
            const i = g ? cellOf(g, t as number) : 0;
            return g ? cellWords(g, cellAt(g, i), firstRoundRef.current) : roundTime(t as number);
          },
        },
        handleScroll: { vertTouchDrag: false },
        handleScale: { axisPressedMouseMove: { time: true, price: false } },
      });
    const usd = {
      type: "custom" as const,
      formatter: (v: number) => formatPrice(v, "USD"),
      tickmarksFormatter: usdTicks,
      minMove: 1e-8,
    };
    const pct = { type: "custom" as const, formatter: (v: number) => fmtSignedSpread(v / 100), minMove: 1e-6 };
    const step = { lineType: lib.LineType.WithSteps, priceLineVisible: false };
    const c = make(el);
    mainSeries.current = c.addSeries(lib.LineSeries, {
      ...step,
      lineWidth: 2,
      lastValueVisible: true,
      priceFormat: usd,
    });
    const g = others.length && gel ? make(gel) : null;
    if (g) {
      // The guide: no line of its own, it holds the 0 % and ±1 % lines and
      // keeps ±1 % in range whichever lines are hidden.
      guideSeries.current = g.addSeries(lib.LineSeries, {
        color: "transparent",
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        priceFormat: pct,
        autoscaleInfoProvider: () => ({ priceRange: { minValue: -1.2, maxValue: 1.2 } }),
      });
      spreadSeries.current = others.map(() =>
        g.addSeries(lib.LineSeries, {
          ...step,
          lineWidth: 1,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          priceFormat: pct,
        }),
      );
    }
    const onSize = () => {
      placeShadeRef.current();
      alignAxes();
    };
    // One window: a range change on either chart moves the other.
    const same = (a: { from: number; to: number } | null, b: { from: number; to: number }) =>
      a != null && Math.abs(a.from - b.from) < 1e-3 && Math.abs(a.to - b.to) < 1e-3;
    const follow = (to: IChartApi | null) => (r: { from: number; to: number } | null) => {
      if (!to || !r) return;
      if (!same(to.timeScale().getVisibleLogicalRange(), r)) to.timeScale().setVisibleLogicalRange(r);
    };
    const toGap = follow(g);
    const toPrice = follow(c);
    c.timeScale().subscribeVisibleLogicalRangeChange(toGap);
    g?.timeScale().subscribeVisibleLogicalRangeChange(toPrice);
    c.timeScale().subscribeVisibleLogicalRangeChange(onSize);
    c.timeScale().subscribeSizeChange(onSize);
    g?.timeScale().subscribeSizeChange(onSize);
    // One cursor: the reader's cursor over either chart puts the other's on its moment.
    // The cell is the bar the crosshair snapped to (its time), the logical index without one.
    const barOf = (grid: Grid, param: { time?: Time; logical?: number }) =>
      param.time != null ? cellOf(grid, param.time as number) : Math.round(param.logical ?? -1);
    c.subscribeCrosshairMove((param) => {
      const grid = gridRef.current;
      // A crosshair the code placed (a gap's row, the other chart) sets the cursor itself.
      if (!grid || param.logical == null || !param.sourceEvent || !param.point) return;
      pendingCross.current = null;
      const i = barOf(grid, param);
      if (i < 0 || i >= grid.count) return;
      setCursorTs(cellAt(grid, i));
      if (g && guideSeries.current) g.setCrosshairPosition(0, cellTime(grid, i) as UTCTimestamp, guideSeries.current);
    });
    g?.subscribeCrosshairMove((param) => {
      const grid = gridRef.current;
      if (!param.point) light(null, "chart");
      if (!grid || param.logical == null || !param.sourceEvent || !param.point) return;
      pendingCross.current = null;
      const i = barOf(grid, param);
      if (i < 0 || i >= grid.count) return;
      setCursorTs(cellAt(grid, i));
      const v = sampled.current.price[i];
      if (v != null && mainSeries.current)
        c.setCrosshairPosition(v, cellTime(grid, i) as UTCTimestamp, mainSeries.current);
      else c.clearCrosshairPosition();
      // The gap line nearest the cursor, by each line's value in that cell.
      const ys = others.map((l, k) => {
        if (hiddenRef.current.has(l.line.id)) return { id: l.line.id, y: null };
        const s = spreadSeries.current[k];
        const d = sampled.current.spread[k]?.[i];
        return { id: l.line.id, y: s && d != null ? s.priceToCoordinate(d) : null };
      });
      light(nearestLine(param.point.y, ys, NEAR_PX), "chart");
    });
    const leavePrice = () => g?.clearCrosshairPosition();
    const leaveGap = () => {
      c.clearCrosshairPosition();
      light(null, "chart");
    };
    el.addEventListener("pointerleave", leavePrice);
    gel?.addEventListener("pointerleave", leaveGap);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let touched = 0;
    const touch = () => {
      touched = Date.now();
    };
    const boxes = gel && g ? [el, gel] : [el];
    for (const b of boxes)
      for (const e of ["pointerdown", "wheel", "touchstart", "keydown"])
        b.addEventListener(e, touch, { passive: true });
    c.timeScale().subscribeVisibleLogicalRangeChange(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const grid = gridRef.current;
        const r = c.timeScale().getVisibleLogicalRange();
        if (!grid || !r) return;
        const w = c.timeScale().width();
        // A change no reader made (a price axis widening) keeps the window shown.
        if (Date.now() - touched > USER_MS) {
          const v = view.current;
          c.timeScale().setVisibleLogicalRange({
            from: (v.from - grid.start) / grid.step,
            to: (v.to - grid.start) / grid.step - 1,
          });
          return;
        }
        const v = { from: cellTime(grid, r.from), to: cellTime(grid, r.to + 1) };
        view.current = v;
        setShown(v);
        if (needsRegrid(grid, v, bounds, w)) setGrid(gridFor(v, bounds, w));
      }, SETTLE_MS);
    });
    chart.current = c;
    gapChart.current = g;
    setReady((n) => n + 1);
    return () => {
      if (timer) clearTimeout(timer);
      for (const b of boxes)
        for (const e of ["pointerdown", "wheel", "touchstart", "keydown"]) b.removeEventListener(e, touch);
      el.removeEventListener("pointerleave", leavePrice);
      gel?.removeEventListener("pointerleave", leaveGap);
      c.timeScale().unsubscribeVisibleLogicalRangeChange(toGap);
      c.timeScale().unsubscribeVisibleLogicalRangeChange(onSize);
      c.timeScale().unsubscribeSizeChange(onSize);
      g?.timeScale().unsubscribeVisibleLogicalRangeChange(toPrice);
      g?.timeScale().unsubscribeSizeChange(onSize);
      chart.current = null;
      gapChart.current = null;
      mainSeries.current = null;
      spreadSeries.current = [];
      guideSeries.current = null;
      c.remove();
      g?.remove();
    };
    // The series follow the lines' ids; their data follows the tracks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib, lineKey, bounds]);

  // Colours for the theme.
  useEffect(() => {
    if (!palette) return;
    for (const c of [chart.current, gapChart.current]) {
      c?.applyOptions({
        layout: {
          textColor: palette.text,
          fontFamily: palette.font,
          panes: { separatorColor: palette.grid, separatorHoverColor: palette.grid },
        },
        grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
        crosshair: {
          vertLine: { color: palette.cross, labelBackgroundColor: palette.text },
          horzLine: { color: palette.cross, labelBackgroundColor: palette.text },
        },
      });
    }
    const g = guideSeries.current;
    if (g) {
      for (const p of g.priceLines()) g.removePriceLine(p);
      g.createPriceLine({
        price: 0,
        color: palette.zero,
        lineWidth: 1,
        lineStyle: 0,
        axisLabelVisible: false,
        title: "",
      });
      for (const price of [1, -1])
        g.createPriceLine({
          price,
          color: palette.caution,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: false,
          title: "",
        });
    }
  }, [palette, ready]);

  // Each chart's axis range once it has rescaled to the lines shown (hooks for the checks).
  const noteScale = useCallback(() => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const r = mainSeries.current?.priceScale().getVisibleRange();
        if (r) wrap.current?.setAttribute("data-asset-lw-scale", `${r.from},${r.to}`);
        const q = guideSeries.current?.priceScale().getVisibleRange();
        if (q) wrap.current?.setAttribute("data-asset-lw-gap-scale", `${q.from},${q.to}`);
        alignAxes();
      }),
    );
  }, [alignAxes]);

  // Each line's colour, dash and weight: the lit line full and a pixel wider,
  // the other gap lines dimmed; a hidden line left out of the gap chart (and its scale).
  useEffect(() => {
    if (!chart.current || !palette) return;
    const drawn: Record<string, { color: string; alpha: number; visible: boolean; width: number; style: number }> = {};
    lines.forEach((l, i) => {
      const id = l.line.id;
      const st = styleOf(id);
      const base = i === 0 ? palette.main : palette[`s${(st?.slot ?? 0) + 1}` as "s1"];
      const own = i === 0 ? 1 : retiredLine(l) ? RETIRED_ALPHA : THIN_ALPHA;
      // The main line has the price chart alone: another line lit leaves it full.
      const alpha = i === 0 || litId == null || litId === id ? (litId === id ? 1 : own) : own * DIM_ALPHA;
      const width = ((i === 0 ? 2 : 1) + (litId === id ? 1 : 0)) as 1 | 2 | 3;
      const style = i === 0 ? 0 : LW_LINE_STYLE[st?.dash ?? "solid"];
      const visible = !hidden.has(id);
      const opts = { color: withAlpha(base, alpha), lineWidth: width, lineStyle: style, visible };
      if (i === 0) mainSeries.current?.applyOptions(opts);
      else spreadSeries.current[i - 1]?.applyOptions(opts);
      drawn[id] = { color: base, alpha, visible, width, style };
    });
    wrap.current?.setAttribute("data-asset-lw-drawn", JSON.stringify(drawn));
    noteScale();
  }, [palette, ready, lines, styleOf, litId, hidden, noteScale]);

  // The data, on every new grid or detail window; then the window and any pending crosshair.
  useEffect(() => {
    const c = chart.current;
    const g = gapChart.current;
    if (!c || !grid || !tracks || !lib) return;
    const kept = c.timeScale().getVisibleLogicalRange();
    const times = Array.from({ length: grid.count }, (_, i) => cellTime(grid, i) as UTCTimestamp);
    const rows = (vals: (number | null)[]): (LineData | WhitespaceData)[] =>
      vals.map((v, i) => (v == null ? { time: times[i] } : { time: times[i], value: v }));
    const price = sampleTrack(grid, tracks[0].track);
    mainSeries.current?.setData(rows(price));
    const gaps = gapSeries(
      grid,
      tracks[0].track,
      tracks.slice(1).map((t, k) => ({ track: t.track, byDay: spreads?.others[k]?.spread.byDay ?? new Map() })),
    );
    sampled.current = { price, spread: gaps };
    spreadSeries.current.forEach((s, k) => s.setData(rows(gaps[k] ?? [])));
    guideSeries.current?.setData(times.map((time) => ({ time, value: 0 })));
    const end = grid.start + grid.count * grid.step;
    const charts = g ? [c, g] : [c];
    for (const x of charts)
      x.applyOptions({
        timeScale: {
          timeVisible: grid.step < DAY_S,
          secondsVisible: false,
          fixLeftEdge: grid.start <= bounds.t0,
          fixRightEdge: end >= bounds.t1,
        },
      });
    // A detail window arriving on the same grid keeps the range the reader is on.
    const same = applied.current.grid === grid && applied.current.n === applyN;
    applied.current = { grid, n: applyN };
    const v = view.current;
    const range =
      same && kept ? kept : { from: (v.from - grid.start) / grid.step, to: (v.to - grid.start) / grid.step - 1 };
    for (const x of charts) x.timeScale().setVisibleLogicalRange(range);
    // A crosshair the code placed stays on its moment through a new grid.
    const at = pendingCross.current;
    if (at != null) {
      const i = Math.max(0, Math.min(grid.count - 1, cellOf(grid, at)));
      const value = price[i];
      if (value != null && mainSeries.current) c.setCrosshairPosition(value, times[i], mainSeries.current);
      if (g && guideSeries.current) g.setCrosshairPosition(0, times[i], guideSeries.current);
      setCursorTs(cellAt(grid, i));
    }
    placeShade();
    noteScale();
  }, [grid, tracks, lib, ready, applyN, spreads, bounds, placeShade, noteScale]);

  // Double-click (or double-tap) on either chart puts the opening window back.
  useEffect(() => {
    const els = [box.current, gapBox.current].filter((x): x is HTMLDivElement => x != null);
    const reset = () => show(home);
    for (const el of els) el.addEventListener("dblclick", reset);
    return () => {
      for (const el of els) el.removeEventListener("dblclick", reset);
    };
  }, [home, show]);

  // The legends' moment: the cursor's while it lies in the window shown, else the window's last.
  const moment = legendMoment(cursorTs, shown, bounds.t1, grid);
  const at = moment.ts;
  const valueOf = (t: Track | undefined) =>
    t && t.points.length && at >= t.points[0][0] && at <= t.end + (grid?.step ?? 0)
      ? inForce(t.points, Math.min(at, t.end))
      : null;
  const mainTrack = tracks?.[0];
  const round = (() => {
    const d = mainTrack?.rounds;
    if (!d || !mainRounds || at < mainRounds.from.ts || !d.covered(at)) return null;
    const pts = d.points;
    let lo = 0;
    let hi = pts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid][0] <= at) lo = mid + 1;
      else hi = mid;
    }
    return lo ? pts[lo - 1] : null;
  })();
  const leg = round && mainRounds ? mainRounds.legs[round[3]] : null;
  const spreadAt = useCallback(
    (lineId: string) => {
      if (!tracks) return null;
      const i = lines.findIndex((l) => l.line.id === lineId);
      const m = tracks[0]?.track;
      const o = tracks[i]?.track;
      if (!m || !o || i < 1) return null;
      const both = m.roundsFrom != null && o.roundsFrom != null ? Math.max(m.roundsFrom, o.roundsFrom) : null;
      if (both != null && at >= both) {
        const a = inForce(m.points, Math.min(at, m.end));
        const b = inForce(o.points, Math.min(at, o.end));
        return a != null && b != null && a > 0 ? b / a - 1 : null;
      }
      return spreads?.others[i - 1]?.spread.byDay.get(Math.floor(at / DAY_S)) ?? null;
    },
    [tracks, lines, at, spreads],
  );
  // Why a line has no deviation at the moment.
  const reasonAt = useCallback(
    (lineId: string): DashReason => {
      const i = lines.findIndex((l) => l.line.id === lineId);
      const m = tracks?.[0]?.track;
      const o = tracks?.[i]?.track;
      const both = m?.roundsFrom != null && o?.roundsFrom != null ? Math.max(m.roundsFrom, o.roundsFrom) : null;
      return dashReason(spreads?.others[i - 1]?.spread, Math.floor(at / DAY_S), both != null && at >= both);
    },
    [tracks, lines, at, spreads],
  );
  const onJump = useCallback(
    (day: number, ts?: number) => {
      const t = ts ?? day * DAY_S + DAY_S - 1;
      const half = ts != null ? DAY_S / 2 : 15 * DAY_S;
      show({ from: t - half, to: t + half }, t);
    },
    [show],
  );
  const active = (span: number | null) => rangePressed(shown, bounds, span, rangeChosen);
  /** A line's key: the main hue, or its slot's token and dash. */
  const keyOf = (id: string, isMain: boolean) => {
    const st = styleOf(id);
    const l = lines.find((x) => x.line.id === id);
    return (
      <LineKey
        color={isMain ? LINE_HUE.collateral : (st?.token ?? "var(--rb-500)")}
        dash={isMain ? "solid" : st?.dash}
        main={isMain}
        quiet={l ? retiredLine(l) : false}
      />
    );
  };
  /** A row's hover, by a mouse or pen only (a tap toggles, it does not light). */
  const rowHover = (id: string) => ({
    onPointerEnter: (e: React.PointerEvent) => e.pointerType !== "touch" && light(id, "row"),
    onPointerLeave: (e: React.PointerEvent) => e.pointerType !== "touch" && light(null, "row"),
  });
  // The lit line's name and gap, over the gap chart.
  const litLabel = (() => {
    if (!litId || litId === main.line.id) return null;
    const l = others.find((o) => o.line.id === litId);
    return l ? { id: litId, name: `${l.line.oracle.name} · ${lineReaders(l.line)}`, dev: spreadAt(litId) } : null;
  })();
  const gapRows: GapRow[] = (spreads?.others ?? []).map((o, k) => ({
    line: o.line,
    spread: o.spread,
    price: valueOf(tracks?.[k + 1]?.track),
    gap: spreadAt(o.line.id),
    reason: reasonAt(o.line.id),
    slot: styleOf(o.line.id)?.slot ?? "",
    dash: styleOf(o.line.id)?.dash ?? "",
  }));
  const stamp = grid ? cellWords(grid, at, firstRound) : roundTime(at);
  const [helpOpen, setHelpOpen] = useState(false);
  const tx = (h: string) => explorerUrl(chain as ChainId, "tx", h);
  const mainValue = valueOf(tracks?.[0]?.track);
  const card = "rounded-lg border border-rb-200 p-3 dark:border-rb-700";

  return (
    <div
      ref={wrap}
      data-asset-lw-chart=""
      data-asset-lw-step={grid?.step ?? ""}
      data-asset-lw-reads={reads}
      data-asset-lw-from={Math.round(shown.from)}
      data-asset-lw-to={Math.round(shown.to)}
    >
      <div className={card} data-asset-lw-price="">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex gap-1" role="group" aria-label="Span shown" data-anatomy="A3.4">
            {RANGES.map(([word, span]) => (
              <button
                key={word}
                type="button"
                aria-pressed={active(span)}
                onClick={() => {
                  setRangeChosen(true);
                  show(span == null ? { from: bounds.t0, to: bounds.t1 } : { from: bounds.t1 - span, to: bounds.t1 });
                }}
                className={`rounded px-2 py-0.5 tabular-nums ${active(span) ? "bg-[var(--surface-sunken)] font-semibold text-foreground" : "text-rb-500 hover:text-foreground"}`}
                data-asset-range={word}
              >
                {word}
              </button>
            ))}
          </div>
          <span className="flex items-center gap-2 text-rb-500">
            Times in UTC
            <span className="shrink-0" data-flow-help="A3.7">
              <LearnMoreButton onClick={() => setHelpOpen(true)} ariaLabel="How to read the price charts" />
              {helpOpen && <LearnMoreModal content={help} onClose={() => setHelpOpen(false)} anatomy="A3.7" />}
            </span>
          </span>
        </div>
        <div className="mb-2 text-xs" data-asset-lw-readout={at} data-anatomy="A3.5">
          <div className="flex flex-wrap items-baseline gap-x-2 text-rb-500 tabular-nums">
            <span className="text-foreground" data-asset-lw-stamp="">
              {stamp}
            </span>
            {!moment.cursor && at >= bounds.t1 && <span>latest</span>}
            {round && (
              <span data-asset-lw-round={round[6] ?? ""}>
                {leg?.kind === "cap"
                  ? "cap row"
                  : leg?.kind === "rate"
                    ? "rate row"
                    : round[6]
                      ? roundName(round[6])
                      : "round"}
                {mainRounds && mainRounds.legs.length > 1 && leg?.kind === "feed" ? ` of ${legName(leg.name)}` : ""},
                block {round[4].toLocaleString("en-US")},{" "}
                <a href={tx(round[5])} target="_blank" rel="noopener" className="font-mono hover:underline">
                  {round[5].slice(0, 10)}…
                </a>
              </span>
            )}
          </div>
          <ul className="mt-1" data-asset-lw-legend="">
            <li data-asset-lw-line={main.line.id} data-asset-lw-slot="main" data-asset-lw-dash="solid">
              <div className="flex items-baseline justify-between gap-3 px-1" title="The main line stays drawn">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  {keyOf(main.line.id, true)}
                  <span className="min-w-0 font-semibold text-foreground">
                    {main.line.oracle.name}
                    <span className="font-normal text-rb-500"> · {lineReaders(main.line)}</span>
                  </span>
                </span>
                <span className="shrink-0 text-foreground tabular-nums" data-asset-lw-value={mainValue ?? ""}>
                  {mainValue == null ? "–" : formatPrice(mainValue, "USD")}
                </span>
              </div>
            </li>
          </ul>
        </div>
        <div ref={box} className="relative isolate w-full" style={{ height: PRICE_H }} data-asset-lw-box="">
          <div
            ref={shade}
            aria-hidden
            className="pointer-events-none absolute top-0 -z-10 w-0 bg-[var(--surface-sunken)] opacity-60"
            data-asset-lw-shade={joinTs ?? ""}
          />
          {!lib && <p className="py-6 text-center text-sm text-rb-500">Drawing the chart…</p>}
        </div>
      </div>
      {others.length > 0 && (
        <div className="mt-5" data-asset-lw-gap="" data-anatomy="A3.6">
          {gapCaption && (
            <p className="mb-3 text-sm text-rb-500" data-asset-gap-caption="">
              {gapCaption}
            </p>
          )}
          <div className={card}>
            {spreads && (
              <AssetGapLegend
                main={spreads.main}
                rows={gapRows}
                stamp={stamp}
                onJump={onJump}
                keyOf={(id) => keyOf(id, false)}
                rowHover={rowHover}
                lit={litId}
                hidden={hidden}
                toggle={focus.toggle}
                light={light}
                showAll={focus.showAll}
                usual={usual && usual !== main.line.id ? usual : null}
              />
            )}
            <div ref={gapBox} className="relative isolate w-full" style={{ height: GAP_H }} data-asset-lw-gap-box="">
              <div
                ref={gapShade}
                aria-hidden
                className="pointer-events-none absolute top-0 -z-10 w-0 bg-[var(--surface-sunken)] opacity-60"
              />
              {litLabel && (
                <div
                  className="pointer-events-none absolute top-0.5 left-1 z-10 flex max-w-[calc(100%-5rem)] items-baseline gap-1.5 rounded bg-[var(--background)]/85 px-1 text-xs"
                  data-asset-lw-spread-label={litLabel.id}
                >
                  {keyOf(litLabel.id, false)}
                  <span className="min-w-0 truncate text-foreground">{litLabel.name}</span>
                  <span className="shrink-0 text-rb-500 tabular-nums">
                    {litLabel.dev == null ? "–" : fmtSignedSpread(litLabel.dev)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {joinNote && (
        <p className="mt-2 text-xs text-rb-500" data-asset-chart-source="">
          {joinNote}
        </p>
      )}
    </div>
  );
}
