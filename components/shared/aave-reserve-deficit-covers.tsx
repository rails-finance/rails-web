"use client";

// The Deficit section's covers (anatomy M3.9, ui-jobs 552 stage B): who
// covered the deficit, from rails-server's reserve-deficit `covers`, and the
// outstanding deficit over time.
//
// RULES.
// - The covers table is on D1, newest first: Date · Covered · Paid by. "Paid
//   by" is the Umbrella event beside the Pool's DeficitCovered, in words
//   (PAID_BY); the addresses are in the receipts (decision 0059).
// - The step chart draws the running Σ written off − Σ covered: a write-off
//   steps up, a cover steps down, and it ends at the record's outstanding. One
//   series, one neutral stroke (color-grammar §1); a readout above follows the
//   cursor, the last step otherwise, each figure with its receipt.

import { useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, Time, UTCTimestamp } from "lightweight-charts";
import { Prov } from "@/components/shared/provenance";
import { lwTickLabel, useLwColors, useLwLib } from "@/components/shared/lw-chart-kit";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table/data-table";
import type { DeficitCovers, ReserveDeficit } from "@/lib/api/fetch-aave-reserve-reads";
import { PAID_BY, coverProv, deficitStepProv, type TxExplorer } from "@/lib/shared/aave-reserve-reads-provenance";
import { formatCompact } from "@/lib/shared/format-compact";
import { shiftDecimal } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";

type HeldCovers = Extract<DeficitCovers, { status: "held" }>;

const tokensOf = (raw: string, decimals: number | null): number | null =>
  decimals == null ? null : Number(shiftDecimal(raw, decimals));

/** A token amount: grouped whole tokens from 100, two places from 1, compact below. */
function words(n: number): string {
  const a = Math.abs(n);
  if (a >= 100) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (a >= 1) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return formatCompact(n);
}

export function CoversTable({
  d,
  c,
  symbol,
  ex,
}: {
  d: ReserveDeficit;
  c: HeldCovers;
  symbol: string;
  ex: TxExplorer;
}) {
  const rows = [...c.rows].reverse();
  const dec = d.asset.decimals;
  return (
    <DataTable
      label={`${symbol} covers`}
      stacked
      tableClassName="text-[13px]"
      className="mt-2"
      data-deficit-covers-table={c.totals.count}
    >
      <DataTableHead>
        <DataTableHeader label="Date" />
        <DataTableHeader label="Covered" align="right" />
        <DataTableHeader label="Paid by" />
      </DataTableHead>
      <DataTableBody>
        {rows.map((r) => {
          const info = coverProv(r, symbol, d, c, ex);
          const n = tokensOf(r.amount.raw, dec);
          return (
            <DataTableRow
              key={`${r.txHash}:${r.logIndex}`}
              data-deficit-cover={r.txHash}
              data-deficit-cover-paid={r.umbrella?.event ?? "unpaired"}
            >
              <DataTableCell rowHeader label="Date" className="whitespace-nowrap tabular-nums">
                {formatDate(new Date(r.timestamp * 1000))}
              </DataTableCell>
              <DataTableCell label="Covered" align="right" data-deficit-cover-raw={r.amount.raw}>
                <span className="whitespace-nowrap tabular-nums">
                  <Prov info={info}>
                    <span title={dec == null ? undefined : `${shiftDecimal(r.amount.raw, dec)} ${symbol}`}>
                      {n == null ? r.amount.raw : words(n)}
                    </span>
                  </Prov>{" "}
                  <span className="text-rb-500">{symbol}</span>
                </span>
              </DataTableCell>
              <DataTableCell label="Paid by">
                {r.umbrella ? (
                  PAID_BY[r.umbrella.event].words
                ) : (
                  <span className="text-rb-500">Not paired with an Umbrella event</span>
                )}
              </DataTableCell>
            </DataTableRow>
          );
        })}
      </DataTableBody>
    </DataTable>
  );
}

interface Step {
  time: number;
  block: number;
  txHash: string;
  kind: "write-off" | "cover";
  /** This step, raw and unsigned. */
  raw: bigint;
  /** Outstanding after it, raw. */
  running: bigint;
}

/** Every write-off and cover in chain order, with the running outstanding. */
export function deficitSteps(d: ReserveDeficit, c: HeldCovers): Step[] {
  const events = [
    ...d.rows.map((w) => ({
      block: w.block,
      time: w.timestamp,
      order: w.logIndex,
      txHash: w.txHash,
      kind: "write-off" as const,
      raw: BigInt(w.writtenOff.raw),
    })),
    ...c.rows.map((r) => ({
      block: r.block,
      time: r.timestamp,
      order: 1e6 + r.logIndex,
      txHash: r.txHash,
      kind: "cover" as const,
      raw: BigInt(r.amount.raw),
    })),
  ].sort((a, b) => a.block - b.block || a.order - b.order);
  let running = BigInt(0);
  return events.map(({ order: _o, ...e }) => {
    running += e.kind === "write-off" ? e.raw : -e.raw;
    return { ...e, running };
  });
}

interface Day {
  time: UTCTimestamp;
  /** The last step at or before the day's end; -1 before the first. */
  last: number;
  writtenOff: bigint;
  covered: bigint;
  changes: number;
}

/** One point per UTC day, from the day before the first step to today, so the axis keeps time. */
export function deficitDays(steps: Step[], nowS: number): Day[] {
  if (!steps.length) return [];
  const DAY = 86_400;
  const first = Math.floor(steps[0].time / DAY) * DAY - DAY;
  const end = Math.max(Math.floor(nowS / DAY) * DAY, Math.floor(steps[steps.length - 1].time / DAY) * DAY);
  const out: Day[] = [];
  let i = 0;
  for (let t = first; t <= end; t += DAY) {
    let w = BigInt(0);
    let cv = BigInt(0);
    let n = 0;
    while (i < steps.length && steps[i].time < t + DAY) {
      if (steps[i].kind === "write-off") w += steps[i].raw;
      else cv += steps[i].raw;
      n++;
      i++;
    }
    out.push({ time: t as UTCTimestamp, last: i - 1, writtenOff: w, covered: cv, changes: n });
  }
  return out;
}

const PALETTE = {
  fg: ["var(--foreground)"],
  text: ["var(--rb-500)"],
  grid: ["var(--rb-chart-grid)", 0.7],
  cross: ["var(--rb-500)", 0.8],
} as const;
const CHART_H = 200;

export function DeficitStepChart({
  d,
  c,
  symbol,
  ex,
}: {
  d: ReserveDeficit;
  c: HeldCovers;
  symbol: string;
  ex: TxExplorer;
}) {
  const lib = useLwLib();
  const box = useRef<HTMLDivElement>(null);
  const palette = useLwColors(box, PALETTE);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Line"> | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const steps = useMemo(() => deficitSteps(d, c), [d, c]);
  const dec = d.asset.decimals ?? 18;
  const tok = (raw: bigint) => Number(shiftDecimal(raw.toString(), dec));

  useEffect(() => {
    const el = box.current;
    if (!lib || !el) return;
    const ch = lib.createChart(el, {
      autoSize: true,
      layout: { background: { type: lib.ColorType.Solid, color: "transparent" }, attributionLogo: false, fontSize: 11 },
      crosshair: { mode: lib.CrosshairMode.Magnet },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.02 } },
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
    const s = ch.addSeries(lib.LineSeries, {
      lineType: lib.LineType.WithSteps,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      pointMarkersVisible: false,
      priceFormat: { type: "custom", formatter: (v: number) => formatCompact(v), minMove: 1e-9 },
      autoscaleInfoProvider: (base: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const r = base();
        return r ? { ...r, priceRange: { minValue: 0, maxValue: r.priceRange.maxValue } } : r;
      },
    });
    ch.subscribeCrosshairMove((p) => {
      if (!p.point || p.logical == null) return setCursor(null);
      setCursor(Math.round(p.logical));
    });
    chart.current = ch;
    series.current = s;
    return () => {
      chart.current = null;
      series.current = null;
      ch.remove();
    };
  }, [lib]);

  useEffect(() => {
    const ch = chart.current;
    if (!ch || !palette) return;
    ch.applyOptions({
      layout: { textColor: palette.text, fontFamily: palette.font },
      grid: { vertLines: { visible: false }, horzLines: { color: palette.grid } },
      crosshair: {
        vertLine: { color: palette.cross, labelBackgroundColor: palette.text },
        horzLine: { color: palette.cross, labelBackgroundColor: palette.text },
      },
    });
    series.current?.applyOptions({ color: palette.fg });
  }, [palette, lib]);

  const days = useMemo(() => deficitDays(steps, Math.floor(Date.now() / 1000)), [steps]);

  useEffect(() => {
    const s = series.current;
    if (!s || !days.length) return;
    s.setData(days.map((p) => ({ time: p.time, value: p.last < 0 ? 0 : tok(steps[p.last].running) })));
    chart.current?.timeScale().fitContent();
    // `tok` reads `dec`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, steps, dec, lib]);

  const day = cursor != null && cursor >= 0 && cursor < days.length ? days[cursor] : days[days.length - 1];
  const step = day && day.last >= 0 ? steps[day.last] : null;

  return (
    <div data-deficit-chart="" data-deficit-steps={steps.length}>
      <div
        className="mb-2 flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-rb-500"
        data-deficit-chart-readout=""
      >
        {day && (
          <>
            <span className="text-foreground">{formatDate(day.time)}</span>
            {cursor == null && <span>today</span>}
            <span>
              Outstanding{" "}
              {step ? (
                <Prov
                  info={deficitStepProv(
                    symbol,
                    d,
                    {
                      block: step.block,
                      txHash: step.txHash,
                      raw: step.raw.toString(),
                      runningRaw: step.running.toString(),
                      kind: step.kind,
                    },
                    ex,
                  )}
                >
                  <span className="text-foreground" data-deficit-chart-outstanding={step.running.toString()}>
                    {words(tok(step.running))}
                  </span>
                </Prov>
              ) : (
                <span className="text-foreground" data-prov-exempt="">
                  0
                </span>
              )}{" "}
              {symbol}
            </span>
            {day.writtenOff > BigInt(0) && (
              <span>
                Written off that day <span className="text-foreground">+{words(tok(day.writtenOff))}</span> {symbol}
              </span>
            )}
            {day.covered > BigInt(0) && (
              <span>
                Covered that day <span className="text-foreground">−{words(tok(day.covered))}</span> {symbol}
              </span>
            )}
          </>
        )}
      </div>
      <div ref={box} style={{ height: CHART_H }} data-deficit-chart-canvas="" />
    </div>
  );
}
