"use client";

// One chain's asset chart on TradingView's Lightweight Charts (rails-ops
// reference/asset-key-map.md, "The chart engine"; anatomy A3, A3.4–A3.7):
// every line as a step line on one time scale, the main line in its hue and
// the others thin, a pane under the prices with each other line's deviation
// from the main line, range buttons, scroll or pinch to zoom, drag to pan,
// double-click to reset. Each line's colour and dash follow its key
// (lib/shared/chart-series-style.ts), shared by its legend row, its spread
// line and its spread row; a row hovered or focused, or the line nearest the
// cursor, lights that line in both panes and dims the others, and a legend
// row pressed hides its line (the main line stays). The lines are drawn on the uniform grid of
// lib/shared/asset-chart-grid.ts, so the axis stays proportional to time;
// zoomed in on stored rounds, the grid's cells read detail windows of
// `/api/prices/rounds` (cached by step and chunk). The span before the main
// line's stored rounds, where it is the daily store, is shaded across both
// panes (behind the transparent canvas). The library loads with
// this component only (a dynamic import). Licence: Apache-2.0, the NOTICE in
// the site's footers (components/shared/lw-attribution.tsx).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, LineData, Time, UTCTimestamp, WhitespaceData } from "lightweight-charts";
import { AssetSpreadStrip } from "@/components/assets/asset-spread-strip";
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
import { fmtSignedSpread, type LineSpread } from "@/lib/shared/asset-spread";
import {
  CHUNK_MAX,
  DAY_S,
  cellAt,
  cellOf,
  cellTime,
  gridChunks,
  gridFor,
  inForce,
  lineTrack,
  needsRegrid,
  sampleSpread,
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
const PRICE_H = 240;
const SPREAD_H = 112;
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
}: {
  /** Main line first. */
  lines: LwLine[];
  chain: number;
  spreads: { main: PageLine; others: { line: PageLine; spread: LineSpread }[] } | null;
  help: LearnMoreContent;
  /** The join under the chart ("From 25 Oct 2026 the lines are…"), the chart's source line. */
  joinNote: string | null;
  /** Where `via` makes another line the main one, the line most protocols read. */
  usual?: string | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
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

  // The chart: made once the library is in, its series rebuilt when the lines change.
  const chart = useRef<IChartApi | null>(null);
  const priceSeries = useRef<ISeriesApi<"Line">[]>([]);
  const spreadSeries = useRef<ISeriesApi<"Line">[]>([]);
  const guideSeries = useRef<ISeriesApi<"Line"> | null>(null);
  // The shade over the daily-only span: from the first stored day to where
  // the main line's stored rounds start, placed on every range or size change.
  const shade = useRef<HTMLDivElement>(null);
  const joinTs = mainRounds?.from.ts ?? null;
  const placeShade = useCallback(() => {
    const el = shade.current;
    const c = chart.current;
    const g = gridRef.current;
    if (!el) return;
    const ts = c?.timeScale();
    if (ts) setAxisH(ts.height());
    const x = (t: number) =>
      ts && g
        ? ts.timeToCoordinate(cellTime(g, Math.max(0, Math.min(g.count - 1, cellOf(g, t)))) as UTCTimestamp)
        : null;
    const left = Math.max(0, x(bounds.t0) ?? 0);
    const right = Math.min(ts?.width() ?? 0, joinTs != null && joinTs > bounds.t0 ? (x(joinTs) ?? -1) : -1);
    if (!ts || right <= left) {
      el.style.width = "0px";
      return;
    }
    el.style.left = `${left}px`;
    el.style.width = `${right - left}px`;
    el.style.height = `${Math.max(0, (box.current?.clientHeight ?? 0) - ts.height())}px`;
  }, [bounds.t0, joinTs]);
  const placeShadeRef = useRef(placeShade);
  placeShadeRef.current = placeShade;
  const [ready, setReady] = useState(0);
  // Each cell's value per line, price and spread, for the line nearest the cursor.
  const sampled = useRef<{ price: (number | null)[][]; spread: (number | null)[][] }>({ price: [], spread: [] });
  // The spread pane's top, for the lit line's label there.
  const [axisH, setAxisH] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!lib || !el) return;
    const c = lib.createChart(el, {
      autoSize: true,
      // The attribution is in the site's footers (Miles, 26 Oct 2026).
      layout: { background: { type: lib.ColorType.Solid, color: "transparent" }, attributionLogo: false, fontSize: 11 },
      crosshair: { mode: lib.CrosshairMode.Normal },
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
    // The thin lines first, so the main line draws over them.
    const thin = others.map(() =>
      c.addSeries(lib.LineSeries, {
        ...step,
        lineWidth: 1,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        priceFormat: usd,
        title: "",
      }),
    );
    const m = c.addSeries(lib.LineSeries, { ...step, lineWidth: 2, lastValueVisible: true, priceFormat: usd });
    priceSeries.current = [m, ...thin];
    // The spread pane's guide: no line of its own, it holds the ±1 % lines
    // and keeps them in range whichever lines are hidden.
    guideSeries.current = others.length
      ? c.addSeries(
          lib.LineSeries,
          {
            color: "transparent",
            lineWidth: 1,
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
            priceFormat: pct,
            autoscaleInfoProvider: () => ({ priceRange: { minValue: -1.2, maxValue: 1.2 } }),
          },
          1,
        )
      : null;
    spreadSeries.current = others.map(() =>
      c.addSeries(
        lib.LineSeries,
        { ...step, lineWidth: 1, lastValueVisible: false, crosshairMarkerVisible: false, priceFormat: pct },
        1,
      ),
    );
    if (others.length) {
      const pane = c.panes()[1];
      pane?.setHeight(SPREAD_H);
      pane?.getHTMLElement()?.setAttribute("data-anatomy", "A3.6");
    }
    const onShade = () => placeShadeRef.current();
    c.timeScale().subscribeVisibleLogicalRangeChange(onShade);
    c.timeScale().subscribeSizeChange(onShade);
    c.subscribeCrosshairMove((param) => {
      const g = gridRef.current;
      if (!param.point) light(null, "chart");
      // A crosshair the code placed (a gap's row) sets the cursor itself.
      if (!g || param.logical == null || !param.sourceEvent || !param.point) return;
      pendingCross.current = null;
      const i = Math.round(param.logical);
      if (i < 0 || i >= g.count) return;
      setCursorTs(cellAt(g, i));
      // The line nearest the cursor in the pane it is over, by each line's value in that cell.
      const inSpread = (param.paneIndex ?? 0) === 1;
      const ys = lines.map((l, k) => {
        if (hiddenRef.current.has(l.line.id)) return { id: l.line.id, y: null };
        const s = inSpread ? (k > 0 ? spreadSeries.current[k - 1] : undefined) : priceSeries.current[k];
        const v = inSpread ? sampled.current.spread[k - 1]?.[i] : sampled.current.price[k]?.[i];
        return { id: l.line.id, y: s && v != null ? s.priceToCoordinate(v) : null };
      });
      light(nearestLine(param.point.y, ys, NEAR_PX), "chart");
    });
    let timer: ReturnType<typeof setTimeout> | null = null;
    let touched = 0;
    const touch = () => {
      touched = Date.now();
    };
    for (const e of ["pointerdown", "wheel", "touchstart", "keydown"]) el.addEventListener(e, touch, { passive: true });
    c.timeScale().subscribeVisibleLogicalRangeChange(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const g = gridRef.current;
        const r = c.timeScale().getVisibleLogicalRange();
        if (!g || !r) return;
        const w = c.timeScale().width();
        // A change no reader made (the price axis widening) keeps the window shown.
        if (Date.now() - touched > USER_MS) {
          const v = view.current;
          c.timeScale().setVisibleLogicalRange({
            from: (v.from - g.start) / g.step,
            to: (v.to - g.start) / g.step - 1,
          });
          return;
        }
        const v = { from: cellTime(g, r.from), to: cellTime(g, r.to + 1) };
        view.current = v;
        setShown(v);
        if (needsRegrid(g, v, bounds, w)) setGrid(gridFor(v, bounds, w));
      }, SETTLE_MS);
    });
    chart.current = c;
    setReady((n) => n + 1);
    return () => {
      if (timer) clearTimeout(timer);
      for (const e of ["pointerdown", "wheel", "touchstart", "keydown"]) el.removeEventListener(e, touch);
      c.timeScale().unsubscribeVisibleLogicalRangeChange(onShade);
      c.timeScale().unsubscribeSizeChange(onShade);
      chart.current = null;
      priceSeries.current = [];
      spreadSeries.current = [];
      guideSeries.current = null;
      c.remove();
    };
    // The series follow the lines' ids; their data follows the tracks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib, lineKey, bounds]);

  // Colours for the theme.
  useEffect(() => {
    const c = chart.current;
    if (!c || !palette) return;
    c.applyOptions({
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
    const g = guideSeries.current;
    if (g) {
      for (const p of g.priceLines()) g.removePriceLine(p);
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

  // The price axis's range once it has rescaled to the lines shown (a hook for the checks).
  const noteScale = useCallback(() => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const r = priceSeries.current[0]?.priceScale().getVisibleRange();
        if (r) wrap.current?.setAttribute("data-asset-lw-scale", `${r.from},${r.to}`);
      }),
    );
  }, []);

  // Each line's colour, dash and weight: the lit line full and a pixel wider,
  // the others dimmed; a hidden line left out of both panes (and their scales).
  useEffect(() => {
    if (!chart.current || !palette) return;
    const drawn: Record<string, { color: string; alpha: number; visible: boolean; width: number; style: number }> = {};
    lines.forEach((l, i) => {
      const id = l.line.id;
      const st = styleOf(id);
      const base = i === 0 ? palette.main : palette[`s${(st?.slot ?? 0) + 1}` as "s1"];
      const own = i === 0 ? 1 : retiredLine(l) ? RETIRED_ALPHA : THIN_ALPHA;
      const alpha = litId == null || litId === id ? (litId === id ? 1 : own) : own * DIM_ALPHA;
      const width = ((i === 0 ? 2 : 1) + (litId === id ? 1 : 0)) as 1 | 2 | 3;
      const style = i === 0 ? 0 : LW_LINE_STYLE[st?.dash ?? "solid"];
      const visible = !hidden.has(id);
      const opts = { color: withAlpha(base, alpha), lineWidth: width, lineStyle: style, visible };
      priceSeries.current[i]?.applyOptions(opts);
      if (i > 0) spreadSeries.current[i - 1]?.applyOptions(opts);
      drawn[id] = { color: base, alpha, visible, width, style };
    });
    wrap.current?.setAttribute("data-asset-lw-drawn", JSON.stringify(drawn));
    noteScale();
  }, [palette, ready, lines, styleOf, litId, hidden, noteScale]);

  // The data, on every new grid or detail window; then the window and any pending crosshair.
  useEffect(() => {
    const c = chart.current;
    if (!c || !grid || !tracks || !lib) return;
    const kept = c.timeScale().getVisibleLogicalRange();
    const times = Array.from({ length: grid.count }, (_, i) => cellTime(grid, i) as UTCTimestamp);
    const rows = (vals: (number | null)[]): (LineData | WhitespaceData)[] =>
      vals.map((v, i) => (v == null ? { time: times[i] } : { time: times[i], value: v }));
    const samples = tracks.map((t) => sampleTrack(grid, t.track));
    sampled.current = { price: samples, spread: [] };
    priceSeries.current.forEach((s, i) => {
      // Series 0 is the main line; the thin ones follow in the lines' order.
      s.setData(rows(samples[i]));
    });
    const byDay = (i: number) => spreads?.others[i]?.spread.byDay ?? new Map<number, number>();
    spreadSeries.current.forEach((s, i) => {
      const dev = sampleSpread(grid, tracks[0].track, tracks[i + 1].track, byDay(i)).map((d) =>
        d == null ? null : d * 100,
      );
      sampled.current.spread[i] = dev;
      s.setData(rows(dev));
    });
    guideSeries.current?.setData(times.map((time) => ({ time, value: 0 })));
    const end = grid.start + grid.count * grid.step;
    c.applyOptions({
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
    if (same && kept) c.timeScale().setVisibleLogicalRange(kept);
    else {
      const v = view.current;
      c.timeScale().setVisibleLogicalRange({
        from: (v.from - grid.start) / grid.step,
        to: (v.to - grid.start) / grid.step - 1,
      });
    }
    // A crosshair the code placed stays on its moment through a new grid.
    const at = pendingCross.current;
    if (at != null) {
      const i = Math.max(0, Math.min(grid.count - 1, cellOf(grid, at)));
      const value = samples[0][i];
      if (value != null) c.setCrosshairPosition(value, times[i], priceSeries.current[0]);
      setCursorTs(cellAt(grid, i));
    }
    placeShade();
    noteScale();
  }, [grid, tracks, lib, ready, applyN, spreads, bounds, placeShade, noteScale]);

  // Double-click (or double-tap) puts the opening window back.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const reset = () => show(home);
    el.addEventListener("dblclick", reset);
    return () => el.removeEventListener("dblclick", reset);
  }, [home, show]);

  // The readout: the cursor's moment (the checkpoint until the cursor moves).
  const at = cursorTs ?? bounds.t1;
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
  const onJump = useCallback(
    (day: number, ts?: number) => {
      const t = ts ?? day * DAY_S + DAY_S - 1;
      const half = ts != null ? DAY_S / 2 : 15 * DAY_S;
      show({ from: t - half, to: t + half }, t);
    },
    [show],
  );
  const active = (span: number | null) => {
    const w = shown.to - shown.from;
    const want = span ?? bounds.t1 - bounds.t0;
    return Math.abs(w - want) <= want * 0.03 && Math.abs(shown.to - bounds.t1) <= want * 0.03;
  };
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
  // The lit line's name and spread, over the spread pane.
  const litLabel = (() => {
    if (!litId || litId === main.line.id) return null;
    const l = others.find((o) => o.line.id === litId);
    return l ? { id: litId, name: `${l.line.oracle.name} · ${lineReaders(l.line)}`, dev: spreadAt(litId) } : null;
  })();
  const [helpOpen, setHelpOpen] = useState(false);
  const tx = (h: string) => explorerUrl(chain as ChainId, "tx", h);

  return (
    <div
      ref={wrap}
      data-asset-lw-chart=""
      data-asset-lw-step={grid?.step ?? ""}
      data-asset-lw-reads={reads}
      data-asset-lw-from={Math.round(shown.from)}
      data-asset-lw-to={Math.round(shown.to)}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex gap-1" role="group" aria-label="Span shown" data-anatomy="A3.4">
          {RANGES.map(([word, span]) => (
            <button
              key={word}
              type="button"
              aria-pressed={active(span)}
              onClick={() =>
                show(span == null ? { from: bounds.t0, to: bounds.t1 } : { from: bounds.t1 - span, to: bounds.t1 })
              }
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
            <LearnMoreButton onClick={() => setHelpOpen(true)} ariaLabel="How to read the price chart" />
            {helpOpen && <LearnMoreModal content={help} onClose={() => setHelpOpen(false)} anatomy="A3.7" />}
          </span>
        </span>
      </div>
      <div className="mb-2 text-xs" data-asset-lw-readout={at} data-anatomy="A3.5">
        <div className="flex flex-wrap items-baseline gap-x-2 text-rb-500 tabular-nums">
          <span className="text-foreground">{grid ? cellWords(grid, at, firstRound) : roundTime(at)}</span>
          {cursorTs == null && <span>latest</span>}
          {round && (
            <span data-asset-lw-round={round[6] ?? ""}>
              {leg?.kind === "cap" ? "cap row" : round[6] ? roundName(round[6]) : "round"}
              {mainRounds && mainRounds.legs.length > 1 && leg?.kind === "feed" ? ` of ${legName(leg.name)}` : ""},
              block {round[4].toLocaleString("en-US")},{" "}
              <a href={tx(round[5])} target="_blank" rel="noreferrer" className="font-mono hover:underline">
                {round[5].slice(0, 10)}…
              </a>
            </span>
          )}
        </div>
        <ul className="mt-1 space-y-0.5" data-asset-lw-legend="">
          {lines.map((l, i) => {
            const id = l.line.id;
            const v = valueOf(tracks?.[i]?.track);
            const off = hidden.has(id);
            const name = l.line.oracle.name;
            const readers = lineReaders(l.line);
            const body = (
              <>
                <span className="flex min-w-0 items-baseline gap-1.5">
                  {keyOf(id, i === 0)}
                  <span className={`min-w-0 ${i === 0 ? "font-semibold text-foreground" : "text-rb-500"}`}>
                    {name}
                    <span className="font-normal text-rb-500"> · {readers}</span>
                    {off && <span className="font-normal text-rb-500"> · hidden</span>}
                  </span>
                </span>
                <span
                  className={`shrink-0 tabular-nums ${i === 0 ? "text-foreground" : "text-rb-500"}`}
                  data-asset-lw-value={v ?? ""}
                >
                  {v == null ? "–" : formatPrice(v, "USD")}
                </span>
              </>
            );
            return (
              <li
                key={id}
                className={`transition-opacity ${(litId != null && litId !== id) || off ? "opacity-50" : ""}`}
                data-asset-lw-line={id}
                data-asset-lw-slot={i === 0 ? "main" : (styleOf(id)?.slot ?? "")}
                data-asset-lw-dash={i === 0 ? "solid" : (styleOf(id)?.dash ?? "")}
                data-asset-lw-hidden={off ? "" : undefined}
                data-asset-lw-lit={litId === id ? "" : undefined}
                {...rowHover(id)}
              >
                {i === 0 ? (
                  <div className="flex items-baseline justify-between gap-3 px-1" title="The main line stays drawn">
                    {body}
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-pressed={!off}
                    aria-label={`Show ${name}, ${readers}`}
                    title={off ? "Show this line" : "Hide this line"}
                    onClick={() => focus.toggle(id)}
                    onFocus={() => light(id, "row")}
                    onBlur={() => light(null, "row")}
                    className="flex w-full items-baseline justify-between gap-3 rounded px-1 text-left hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--rb-500)]"
                  >
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {hidden.size > 0 && (
          <button
            type="button"
            onClick={focus.showAll}
            className="mt-1 px-1 text-rb-500 underline-offset-2 hover:text-foreground hover:underline"
            data-asset-lw-show-all=""
          >
            Show all lines
          </button>
        )}
      </div>
      <div
        ref={box}
        className="relative isolate w-full"
        style={{ height: PRICE_H + (others.length ? SPREAD_H : 0) }}
        data-asset-lw-box=""
      >
        <div
          ref={shade}
          aria-hidden
          className="pointer-events-none absolute top-0 -z-10 w-0 bg-[var(--surface-sunken)] opacity-60"
          data-asset-lw-shade={joinTs ?? ""}
        />
        {litLabel && (
          <div
            className="pointer-events-none absolute left-1 z-10 flex max-w-[calc(100%-4rem)] items-baseline gap-1.5 rounded bg-[var(--background)]/85 px-1 text-xs"
            style={{ top: `calc(100% - ${axisH + SPREAD_H - 2}px)` }}
            data-asset-lw-spread-label={litLabel.id}
          >
            {keyOf(litLabel.id, false)}
            <span className="min-w-0 truncate text-foreground">{litLabel.name}</span>
            <span className="shrink-0 tabular-nums text-rb-500">
              {litLabel.dev == null ? "–" : fmtSignedSpread(litLabel.dev)}
            </span>
          </div>
        )}
        {!lib && <p className="py-6 text-center text-sm text-rb-500">Drawing the chart…</p>}
      </div>
      {spreads && (
        <AssetSpreadStrip
          main={spreads.main}
          others={spreads.others}
          cursorDay={null}
          cursorTs={at}
          stamp={grid ? cellWords(grid, at, firstRound) : null}
          valueAt={spreadAt}
          onJump={onJump}
          keyOf={(id) => keyOf(id, false)}
          rowHover={rowHover}
          lit={litId}
          hidden={hidden}
        />
      )}
      {joinNote && (
        <p className="mt-2 text-xs text-rb-500" data-asset-chart-source="">
          {joinNote}
        </p>
      )}
    </div>
  );
}
