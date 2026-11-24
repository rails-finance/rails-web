"use client";

// One chain's asset chart on TradingView's Lightweight Charts (rails-ops
// reference/asset-key-map.md, "The chart engine"; anatomy A3, A3.4, A3.5,
// A3.7; ui-jobs 818): the main line alone (with `via`, the price the protocol
// uses), with its range buttons, readout and price axis. The readout reads the
// cursor's moment while it lies in the window, else the window's last
// (`legendMoment`). The line is drawn on the uniform grid of
// lib/shared/asset-chart-grid.ts, so the axis stays proportional to time;
// zoomed in on stored rounds, the grid's cells read detail windows of
// `/api/prices/rounds` (cached by step and chunk). The span before the line's
// stored rounds, where it is the daily store, is shaded (behind the
// transparent canvas). The library loads with this component only (a dynamic
// import). Licence: Apache-2.0, the NOTICE in the site's footers
// (components/shared/lw-attribution.tsx).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, LineData, Time, UTCTimestamp, WhitespaceData } from "lightweight-charts";
import { legName, roundName, roundTime } from "@/components/assets/round-time";
import { LINE_HUE } from "@/components/shared/lifetime-flows-combined";
import { LearnMoreButton, LearnMoreModal, type LearnMoreContent } from "@/components/shared/learn-more-modal";
import { lwTickLabel, useLwColors, useLwLib } from "@/components/shared/lw-chart-kit";
import { LineKey } from "@/components/shared/lw-line-key";
import { fetchPriceRounds, type RoundsAnswer } from "@/lib/api/fetch-price-rounds";
import { formatDate } from "@/lib/date";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import { formatPrice } from "@/lib/shared/flows-price";
import { lineReaders, type PageLine } from "@/lib/shared/asset-roster";
import {
  CHUNK_MAX,
  DAY_S,
  cellAt,
  cellOf,
  cellTime,
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
/** Detail windows kept. */
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
  text: ["var(--rb-500)"],
  grid: ["var(--rb-chart-grid)", 0.7],
  cross: ["var(--rb-500)", 0.8],
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

/** A line whose every series is a market Maker has retired: its key drawn quieter. */
const retiredLine = (l: LwLine) => l.line.series.length > 0 && l.line.series.every((s) => s.retired);

export function AssetLwChart({
  line: main,
  chain,
  help,
  joinNote,
}: {
  line: LwLine;
  chain: number;
  help: LearnMoreContent;
  /** The join under the chart ("From 25 Oct 2026 the line is…"), its source line. */
  joinNote: string | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const palette = useLwColors(wrap, PALETTE);
  const lib = useLwLib();

  const mainRounds = main.series.rounds;
  // The data's span: the first stored day to the checkpoint (or the end of the last stored day).
  const bounds = useMemo(
    () => ({
      t0: main.series.points[0][0] * DAY_S,
      t1: main.series.rounds?.asOf.ts ?? (main.series.points.at(-1)![0] + 1) * DAY_S - 1,
    }),
    [main],
  );
  const home = useMemo(
    () =>
      mainRounds && opensOnRounds(mainRounds)
        ? { from: mainRounds.from.ts, to: bounds.t1 }
        : { from: bounds.t0, to: bounds.t1 },
    [mainRounds, bounds],
  );

  // Where the stored rounds start: before it a cell is named by its day.
  const firstRound = mainRounds?.from.ts ?? null;
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
  const applied = useRef<{ grid: Grid | null; n: number }>({ grid: null, n: -1 });
  const [applyN, setApplyN] = useState(0);
  // The time scale's width, as the visible-range handler reads it.
  const width = useCallback(
    () => chart.current?.timeScale().width() || Math.max(200, box.current?.clientWidth ?? 600) - 56,
    [],
  );
  const show = useCallback(
    (v: { from: number; to: number }) => {
      const w = Math.max(600, v.to - v.from);
      const from = Math.max(bounds.t0 - w * 0.02, Math.min(v.from, bounds.t1 - w));
      const target = { from, to: from + w };
      view.current = target;
      setShown(target);
      setGrid(gridFor(target, bounds, width()));
      setApplyN((n) => n + 1);
    },
    [bounds, width],
  );
  useEffect(() => show(home), [home, show]);

  // Detail windows of the stored rounds, where the first read was thinned.
  const cache = useRef(new Map<string, Chunk | "pending">());
  const [reads, setReads] = useState(0);
  const [detailN, setDetailN] = useState(0);
  const thinned = mainRounds?.thinned ? mainRounds : null;
  const oracle = main.line.oracle.address;
  useEffect(() => {
    if (!grid || !thinned) return;
    for (const c of gridChunks(grid, { from: thinned.from.ts, to: bounds.t1 })) {
      const key = `${grid.step}:${c.k}`;
      if (cache.current.has(key)) continue;
      cache.current.set(key, "pending");
      while (cache.current.size > CACHE_MAX) cache.current.delete(cache.current.keys().next().value!);
      setReads((n) => n + 1);
      fetchPriceRounds(chain, [oracle], { from: c.from, to: c.to, max: CHUNK_MAX })
        .then((answer) => cache.current.set(key, { from: c.from, to: c.to, answer }))
        .catch(() => cache.current.set(key, { from: c.from, to: c.to, answer: null }))
        .finally(() => setDetailN((n) => n + 1));
    }
  }, [grid, thinned, chain, oracle, bounds.t1]);

  /** The line's rounds with the loaded detail windows of this grid in place. */
  const detailed = useCallback(
    (g: Grid): { points: RoundPricePoint[]; covered: (ts: number) => boolean } | null => {
      const r = mainRounds;
      if (!r) return null;
      if (!r.thinned) return { points: r.points, covered: () => true };
      const addr = oracle.toLowerCase();
      const chunks: { from: number; to: number; points: RoundPricePoint[] }[] = [];
      for (const c of gridChunks(g, { from: r.from.ts, to: bounds.t1 })) {
        const hit = cache.current.get(`${g.step}:${c.k}`);
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
    [bounds.t1, mainRounds, oracle, detailN],
  );

  const tracked = useMemo(() => {
    if (!grid) return null;
    const d = detailed(grid);
    const r = main.series.rounds;
    return {
      rounds: d,
      track: lineTrack(main.series.points, r && d ? { ...r, points: d.points } : null, grid.step, bounds.t1),
    };
  }, [grid, main, detailed, bounds.t1]);

  // The chart: made once the library is in, its series rebuilt when the line changes.
  const chart = useRef<IChartApi | null>(null);
  const mainSeries = useRef<ISeriesApi<"Line"> | null>(null);
  // The shade over the daily-only span: from the first stored day to where
  // the stored rounds start, placed on every range or size change.
  const shade = useRef<HTMLDivElement>(null);
  const joinTs = mainRounds?.from.ts ?? null;
  const placeShade = useCallback(() => {
    const el = shade.current;
    const c = chart.current;
    const g = gridRef.current;
    const ts = c?.timeScale();
    if (!el) return;
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
  const lineId = main.line.id;
  useEffect(() => {
    const el = box.current;
    if (!lib || !el) return;
    const c = lib.createChart(el, {
      autoSize: true,
      // The attribution is in the site's footers (Miles, 26 Oct 2026).
      layout: {
        background: { type: lib.ColorType.Solid, color: "transparent" },
        attributionLogo: false,
        fontSize: 11,
      },
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
    mainSeries.current = c.addSeries(lib.LineSeries, {
      lineType: lib.LineType.WithSteps,
      priceLineVisible: false,
      lineWidth: 2,
      lastValueVisible: true,
      priceFormat: {
        type: "custom" as const,
        formatter: (v: number) => formatPrice(v, "USD"),
        tickmarksFormatter: usdTicks,
        minMove: 1e-8,
      },
    });
    const onSize = () => placeShadeRef.current();
    c.timeScale().subscribeVisibleLogicalRangeChange(onSize);
    c.timeScale().subscribeSizeChange(onSize);
    // The cell is the bar the crosshair snapped to (its time), the logical index without one.
    c.subscribeCrosshairMove((param) => {
      const grid = gridRef.current;
      if (!grid || param.logical == null || !param.sourceEvent || !param.point) return;
      const i = param.time != null ? cellOf(grid, param.time as number) : Math.round(param.logical ?? -1);
      if (i < 0 || i >= grid.count) return;
      setCursorTs(cellAt(grid, i));
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
    setReady((n) => n + 1);
    return () => {
      if (timer) clearTimeout(timer);
      for (const e of ["pointerdown", "wheel", "touchstart", "keydown"]) el.removeEventListener(e, touch);
      c.timeScale().unsubscribeVisibleLogicalRangeChange(onSize);
      c.timeScale().unsubscribeSizeChange(onSize);
      chart.current = null;
      mainSeries.current = null;
      c.remove();
    };
  }, [lib, lineId, bounds]);

  // Colours for the theme, and the line's (a hook for the checks).
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
    mainSeries.current?.applyOptions({ color: palette.main, lineWidth: 2, lineStyle: 0 });
    wrap.current?.setAttribute(
      "data-asset-lw-drawn",
      JSON.stringify({ [lineId]: { color: palette.main, alpha: 1, visible: true, width: 2, style: 0 } }),
    );
  }, [palette, ready, lineId]);

  // The axis range once it has rescaled (a hook for the checks).
  const noteScale = useCallback(() => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const r = mainSeries.current?.priceScale().getVisibleRange();
        if (r) wrap.current?.setAttribute("data-asset-lw-scale", `${r.from},${r.to}`);
      }),
    );
  }, []);

  // The data, on every new grid or detail window; then the window.
  useEffect(() => {
    const c = chart.current;
    if (!c || !grid || !tracked || !lib) return;
    const kept = c.timeScale().getVisibleLogicalRange();
    const times = Array.from({ length: grid.count }, (_, i) => cellTime(grid, i) as UTCTimestamp);
    const price = sampleTrack(grid, tracked.track);
    mainSeries.current?.setData(
      price.map((v, i): LineData | WhitespaceData => (v == null ? { time: times[i] } : { time: times[i], value: v })),
    );
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
    const v = view.current;
    c.timeScale().setVisibleLogicalRange(
      same && kept ? kept : { from: (v.from - grid.start) / grid.step, to: (v.to - grid.start) / grid.step - 1 },
    );
    placeShade();
    noteScale();
  }, [grid, tracked, lib, ready, applyN, bounds, placeShade, noteScale]);

  // Double-click (or double-tap) on the chart puts the opening window back.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const reset = () => show(home);
    el.addEventListener("dblclick", reset);
    return () => el.removeEventListener("dblclick", reset);
  }, [home, show]);

  // The readout's moment: the cursor's while it lies in the window shown, else the window's last.
  const moment = legendMoment(cursorTs, shown, bounds.t1, grid);
  const at = moment.ts;
  const t = tracked?.track;
  const mainValue =
    t && t.points.length && at >= t.points[0][0] && at <= t.end + (grid?.step ?? 0)
      ? inForce(t.points, Math.min(at, t.end))
      : null;
  const round = (() => {
    const d = tracked?.rounds;
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
  const active = (span: number | null) => rangePressed(shown, bounds, span, rangeChosen);
  const stamp = grid ? cellWords(grid, at, firstRound) : roundTime(at);
  const [helpOpen, setHelpOpen] = useState(false);
  const tx = (h: string) => explorerUrl(chain as ChainId, "tx", h);
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
              <LearnMoreButton onClick={() => setHelpOpen(true)} ariaLabel="How to read the price chart" />
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
              <div className="flex items-baseline justify-between gap-3 px-1">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <LineKey color={LINE_HUE.collateral} dash="solid" main quiet={retiredLine(main)} />
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
      {joinNote && (
        <p className="mt-2 text-xs text-rb-500" data-asset-chart-source="">
          {joinNote}
        </p>
      )}
    </div>
  );
}
