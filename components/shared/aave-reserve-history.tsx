"use client";

// The reserve's history (anatomy M3.4, ui-jobs 541): each completed UTC day's
// closing borrow and supply rates and its utilisation, from rails-server's
// reserve-history (lib/api/fetch-aave-reserve-reads.ts), on Lightweight
// Charts (components/shared/lw-chart-kit.tsx).
//
// RULES.
// - Two panes on one time axis: the rates above, utilisation below on its own
//   0 to 100% scale. One scale per pane (no second axis on a pane).
// - The rates are drawn as the rate curve (M3.3) draws them: borrow solid in
//   the foreground, supply dashed in rb-500; utilisation solid in the
//   foreground. Neutral strokes (color-grammar §1).
// - A day with no utilisation is a gap, and one line under the chart says why
//   (the route's reason keys).
// - The configurator's cap, reserve factor, collateral and freeze changes are
//   marks under the time axis, each with its changes in a tip.
// - A readout above follows the cursor (the latest day otherwise), each figure
//   with its receipt (lib/shared/aave-reserve-reads-provenance.ts).
// - 90D and 1Y narrow the loaded year; All asks the route for the reserve's
//   whole history.

import { useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, LineData, Time, UTCTimestamp, WhitespaceData } from "lightweight-charts";
import { Prov } from "@/components/shared/provenance";
import { lwTickLabel, useLwColors, useLwLib } from "@/components/shared/lw-chart-kit";
import { formatDate } from "@/lib/date";
import { ratePercentText } from "@/lib/shared/rate-percent";
import { historyRateProv, historyUtilisationProv } from "@/lib/shared/aave-reserve-reads-provenance";
import type { ReserveChange } from "@/lib/shared/aave-reserve-config-words";
import type { HistoryPoint, ReserveHistory } from "@/lib/api/fetch-aave-reserve-reads";

export type HistoryRange = "90D" | "1Y" | "All";
const RANGES: HistoryRange[] = ["90D", "1Y", "All"];
const DAY_S = 86_400;
const RATES_H = 200;
const UTIL_H = 96;
const MARK_GAP = 12;

const PALETTE = {
  fg: ["var(--foreground)"],
  muted: ["var(--rb-500)"],
  text: ["var(--rb-500)"],
  grid: ["var(--rb-chart-grid)", 0.7],
  cross: ["var(--rb-500)", 0.8],
} as const;

const dayTime = (date: string) => (Date.parse(`${date}T00:00:00Z`) / 1000) as UTCTimestamp;
const pctAxis = (v: number) => ratePercentText(v / 100);

/** The legend's stroke sample. */
function Swatch({ dashed = false }: { dashed?: boolean }) {
  return (
    <svg width="16" height="6" aria-hidden className="shrink-0">
      <line
        x1="0"
        y1="3"
        x2="16"
        y2="3"
        stroke={dashed ? "var(--rb-500)" : "var(--foreground)"}
        strokeWidth="2"
        strokeDasharray={dashed ? "4 3" : undefined}
      />
    </svg>
  );
}

export function ReserveHistoryChart({
  h,
  symbol,
  changes,
  range,
  onRange,
  loadingAll,
}: {
  h: ReserveHistory;
  symbol: string;
  /** The config log in words, newest first; the marked kinds are drawn. */
  changes: ReserveChange[] | null;
  range: HistoryRange;
  onRange: (r: HistoryRange) => void;
  /** All was asked for and is on its way. */
  loadingAll: boolean;
}) {
  const lib = useLwLib();
  const box = useRef<HTMLDivElement>(null);
  const palette = useLwColors(box, PALETTE);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Line">[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [frame, setFrame] = useState(0);
  const [tip, setTip] = useState<number | null>(null);
  const points = h.points;
  const index = useMemo(() => new Map(points.map((p, i) => [p.date, i])), [points]);

  // The marked changes, by the index of their day (the next held day where the change's own has no point).
  const marks = useMemo(() => {
    if (!changes || !points.length) return [];
    const byIdx = new Map<number, ReserveChange[]>();
    const first = dayTime(points[0].date);
    for (const c of changes) {
      if (!c.row.kind || !MARKED.has(c.row.kind)) continue;
      const day = Math.floor(c.row.timestamp / DAY_S) * DAY_S;
      if (day < first) continue;
      const date = new Date(day * 1000).toISOString().slice(0, 10);
      let i = index.get(date);
      if (i == null) i = points.findIndex((p) => p.date >= date);
      if (i < 0) continue;
      byIdx.set(i, [...(byIdx.get(i) ?? []), c]);
    }
    return [...byIdx.entries()].map(([i, cs]) => ({ i, cs: [...cs].reverse() })).sort((a, b) => a.i - b.i);
  }, [changes, points, index]);

  useEffect(() => {
    const el = box.current;
    if (!lib || !el) return;
    const c = lib.createChart(el, {
      autoSize: true,
      layout: { background: { type: lib.ColorType.Solid, color: "transparent" }, attributionLogo: false, fontSize: 11 },
      crosshair: { mode: lib.CrosshairMode.Magnet },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        rightOffset: 0,
        fixLeftEdge: true,
        fixRightEdge: true,
        lockVisibleTimeRangeOnResize: true,
        tickMarkFormatter: (t: Time, type: number) => lwTickLabel(t, type),
      },
      localization: { locale: "en-GB", timeFormatter: (t: Time) => formatDate(t as number) },
      handleScroll: { vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: { time: true, price: false } },
    });
    const rate = { type: "custom" as const, formatter: pctAxis, minMove: 1e-6 };
    const base = { priceLineVisible: false, lastValueVisible: false, lineWidth: 2 as const };
    const supply = c.addSeries(lib.LineSeries, { ...base, lineStyle: lib.LineStyle.Dashed, priceFormat: rate });
    const borrow = c.addSeries(lib.LineSeries, { ...base, priceFormat: rate });
    const util = c.addSeries(
      lib.LineSeries,
      {
        ...base,
        priceFormat: { type: "custom", formatter: (v: number) => `${Math.round(v)}%`, minMove: 0.01 },
        autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
      },
      1,
    );
    c.panes()[0]?.setHeight(RATES_H);
    c.panes()[1]?.setHeight(UTIL_H);
    series.current = [borrow, supply, util];
    c.subscribeCrosshairMove((param) => {
      if (!param.point || param.logical == null) return setCursor(null);
      setCursor(Math.round(param.logical));
    });
    const moved = () => setFrame((n) => n + 1);
    c.timeScale().subscribeVisibleLogicalRangeChange(moved);
    c.timeScale().subscribeSizeChange(moved);
    chart.current = c;
    return () => {
      c.timeScale().unsubscribeVisibleLogicalRangeChange(moved);
      c.timeScale().unsubscribeSizeChange(moved);
      chart.current = null;
      series.current = [];
      c.remove();
    };
  }, [lib]);

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
    const [borrow, supply, util] = series.current;
    borrow?.applyOptions({ color: palette.fg });
    supply?.applyOptions({ color: palette.muted });
    util?.applyOptions({ color: palette.fg });
  }, [palette, lib]);

  // The data, and the window the range names.
  useEffect(() => {
    const c = chart.current;
    const [borrow, supply, util] = series.current;
    if (!c || !borrow || !points.length) return;
    const rows = (f: (p: HistoryPoint) => number | null) =>
      points.map((p): LineData | WhitespaceData => {
        const v = f(p);
        return v == null ? { time: dayTime(p.date) } : { time: dayTime(p.date), value: v };
      });
    borrow.setData(rows((p) => p.borrowApr * 100));
    supply.setData(rows((p) => p.supplyApr * 100));
    util.setData(rows((p) => (p.utilisation == null ? null : p.utilisation * 100)));
    const last = dayTime(points[points.length - 1].date);
    const span = range === "90D" ? 90 * DAY_S : range === "1Y" ? 365 * DAY_S : null;
    if (span == null) c.timeScale().fitContent();
    else
      c.timeScale().setVisibleRange({
        from: Math.max(dayTime(points[0].date), last - span) as UTCTimestamp,
        to: last,
      });
  }, [points, range, lib]);

  const at = cursor != null && cursor >= 0 && cursor < points.length ? cursor : points.length - 1;
  const p = points[at];
  const ts = chart.current?.timeScale();
  const width = box.current?.clientWidth ?? 0;
  // Marks closer than MARK_GAP px share one, its tip listing both days' changes.
  const placed: { i: number; x: number; cs: ReserveChange[] }[] = [];
  if (ts)
    for (const m of marks) {
      const x = ts.logicalToCoordinate(m.i as never);
      if (x == null || x < 0 || x > width - 48) continue;
      const prev = placed[placed.length - 1];
      if (prev && x - prev.x < MARK_GAP) prev.cs = [...m.cs, ...prev.cs];
      else placed.push({ i: m.i, x, cs: m.cs });
    }
  void frame;
  const tipMark = placed.find((m) => m.i === tip) ?? null;
  const nulls = points.filter((q) => q.utilisation == null).length;

  return (
    <div
      data-reserve-history=""
      data-history-points={points.length}
      data-history-gaps={nulls}
      data-history-from={points[0]?.date ?? ""}
      data-history-to={points[points.length - 1]?.date ?? ""}
      data-history-range={range}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex gap-1" role="group" aria-label="Span shown">
          {RANGES.map((word) => (
            <button
              key={word}
              type="button"
              aria-pressed={range === word}
              onClick={() => onRange(word)}
              className={`rounded px-2 py-0.5 tabular-nums ${range === word ? "bg-[var(--surface-sunken)] font-semibold text-foreground" : "text-rb-500 hover:text-foreground"}`}
              data-history-range-button={word}
            >
              {word}
            </button>
          ))}
          {loadingAll && <span className="self-center px-1 text-rb-500">Reading…</span>}
        </div>
        <span className="text-rb-500">Day closes, UTC</span>
      </div>
      {p && (
        <div className="mb-2 text-xs" data-history-readout={p.date}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums text-rb-500">
            <span className="text-foreground">{formatDate(dayTime(p.date))}</span>
            {cursor == null && <span>latest</span>}
            <span className="inline-flex items-center gap-1.5">
              <Swatch />
              Borrow rate
              <Prov info={historyRateProv("borrow", symbol, p, h)}>
                <span className="text-foreground" data-history-borrow="">
                  {ratePercentText(p.borrowApr)}
                </span>
              </Prov>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Swatch dashed />
              Supply rate
              <Prov info={historyRateProv("supply", symbol, p, h)}>
                <span className="text-foreground" data-history-supply="">
                  {ratePercentText(p.supplyApr)}
                </span>
              </Prov>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Swatch />
              Utilisation (lower pane)
              {p.utilisation != null ? (
                <Prov info={historyUtilisationProv(symbol, p, h)}>
                  <span className="text-foreground" data-history-utilisation="">
                    {(p.utilisation * 100).toFixed(1)}%
                  </span>
                </Prov>
              ) : (
                <span data-history-utilisation="" data-prov-exempt="">
                  not drawn
                </span>
              )}
            </span>
          </div>
        </div>
      )}
      <div className="relative">
        <div ref={box} style={{ height: RATES_H + UTIL_H + 30 }} data-history-canvas="" />
        <div className="relative h-4" data-history-marks={placed.length} aria-label="Configuration changes">
          {placed.map((m) => (
            <button
              key={m.i}
              type="button"
              className="absolute top-0.5 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-[var(--rb-500)] bg-raised focus-ring hover:border-foreground"
              style={{ left: m.x }}
              aria-label={m.cs.map((c) => `${formatDate(c.row.timestamp)}: ${c.words}`).join("; ")}
              onMouseEnter={() => setTip(m.i)}
              onMouseLeave={() => setTip(null)}
              onFocus={() => setTip(m.i)}
              onBlur={() => setTip(null)}
              data-history-mark={points[m.i].date}
            />
          ))}
          {tipMark && (
            <div
              role="tooltip"
              className="pointer-events-none absolute bottom-5 z-20 w-max max-w-64 rounded-md bg-background px-2 py-1.5 text-[11px] shadow-md ring-1 ring-[var(--edge-row-hover)]"
              style={{ left: Math.min(Math.max(0, tipMark.x - 128), Math.max(0, width - 256)) }}
              data-history-mark-tip=""
            >
              {tipMark.cs.map((c, k) => (
                <div key={k} className="text-foreground">
                  <span className="text-rb-500">{formatDate(c.row.timestamp)}</span> {c.words}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const MARKED = new Set(["supply-cap", "borrow-cap", "reserve-factor", "collateral", "frozen"]);
