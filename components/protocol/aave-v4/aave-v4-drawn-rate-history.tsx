"use client";

// An Aave V4 hub asset's history (anatomy M3.4, ui-jobs 548): each completed UTC
// day's closing drawn rate, from rails-server's hub-asset-history
// (lib/api/fetch-aave-v4-reserve.ts), stated as the borrow APY (lib/aave-v4/rates.ts),
// on Lightweight Charts (components/shared/lw-chart-kit.tsx). One pane, the APY solid in the
// foreground (color-grammar §1); a readout above follows the cursor, the latest
// day otherwise, with its receipt. 90D and 1Y narrow the loaded year; All asks
// the route for the asset's whole history. Utilization is not held for past
// days, so the page says so under the chart.

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, Time, UTCTimestamp } from "lightweight-charts";
import { Prov } from "@/components/shared/provenance";
import { lwTickLabel, useLwColors, useLwLib } from "@/components/shared/lw-chart-kit";
import { formatDate } from "@/lib/date";
import { ratePercentText } from "@/lib/shared/rate-percent";
import { v4Apy, v4ApyText } from "@/lib/aave-v4/rates";
import { historyRateProv } from "@/lib/aave-v4/market-provenance";
import type { V4History } from "@/lib/api/fetch-aave-v4-reserve";

export type HistorySpan = "90D" | "1Y" | "All";
const SPANS: HistorySpan[] = ["90D", "1Y", "All"];
const DAY_S = 86_400;
const H = 220;

const PALETTE = {
  fg: ["var(--foreground)"],
  text: ["var(--rb-500)"],
  grid: ["var(--rb-chart-grid)", 0.7],
  cross: ["var(--rb-500)", 0.8],
} as const;

const dayTime = (date: string) => (Date.parse(`${date}T00:00:00Z`) / 1000) as UTCTimestamp;

export function AaveV4DrawnRateHistory({
  h,
  symbol,
  hub,
  span,
  onSpan,
  loadingAll,
}: {
  h: V4History;
  symbol: string;
  hub: string;
  span: HistorySpan;
  onSpan: (s: HistorySpan) => void;
  loadingAll: boolean;
}) {
  const lib = useLwLib();
  const box = useRef<HTMLDivElement>(null);
  const palette = useLwColors(box, PALETTE);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Line"> | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const points = h.points;

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
    series.current = c.addSeries(lib.LineSeries, {
      priceLineVisible: false,
      lastValueVisible: false,
      lineWidth: 2,
      priceFormat: { type: "custom", formatter: (v: number) => ratePercentText(v / 100), minMove: 1e-6 },
    });
    c.subscribeCrosshairMove((param) => {
      if (!param.point || param.logical == null) return setCursor(null);
      setCursor(Math.round(param.logical));
    });
    chart.current = c;
    return () => {
      chart.current = null;
      series.current = null;
      c.remove();
    };
  }, [lib]);

  useEffect(() => {
    const c = chart.current;
    if (!c || !palette) return;
    c.applyOptions({
      layout: { textColor: palette.text, fontFamily: palette.font },
      grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
      crosshair: {
        vertLine: { color: palette.cross, labelBackgroundColor: palette.text },
        horzLine: { color: palette.cross, labelBackgroundColor: palette.text },
      },
    });
    series.current?.applyOptions({ color: palette.fg });
  }, [palette, lib]);

  useEffect(() => {
    const c = chart.current;
    const s = series.current;
    if (!c || !s || !points.length) return;
    s.setData(points.map((p) => ({ time: dayTime(p.date), value: v4Apy(p.drawnApr) * 100 })));
    const last = dayTime(points[points.length - 1].date);
    const width = span === "90D" ? 90 * DAY_S : span === "1Y" ? 365 * DAY_S : null;
    if (width == null) c.timeScale().fitContent();
    else
      c.timeScale().setVisibleRange({
        from: Math.max(dayTime(points[0].date), last - width) as UTCTimestamp,
        to: last,
      });
  }, [points, span, lib]);

  const at = cursor != null && cursor >= 0 && cursor < points.length ? cursor : points.length - 1;
  const p = points[at];
  return (
    <div
      data-reserve-history=""
      data-history-points={points.length}
      data-history-from={points[0]?.date ?? ""}
      data-history-to={points[points.length - 1]?.date ?? ""}
      data-history-range={span}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex gap-1" role="group" aria-label="Span shown">
          {SPANS.map((word) => (
            <button
              key={word}
              type="button"
              aria-pressed={span === word}
              onClick={() => onSpan(word)}
              className={`rounded px-2 py-0.5 tabular-nums ${span === word ? "bg-[var(--surface-sunken)] font-semibold text-foreground" : "text-rb-500 hover:text-foreground"}`}
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
        <div
          className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-rb-500"
          data-history-readout={p.date}
        >
          <span className="text-foreground">{formatDate(dayTime(p.date))}</span>
          {cursor == null && <span>latest</span>}
          <span className="inline-flex items-center gap-1.5">
            Borrow APY
            <Prov info={historyRateProv(symbol, hub, p)}>
              <span className="text-foreground" data-history-borrow="">
                {v4ApyText(p.drawnApr)}
              </span>
            </Prov>
          </span>
        </div>
      )}
      <div ref={box} style={{ height: H }} data-history-canvas="" />
    </div>
  );
}
