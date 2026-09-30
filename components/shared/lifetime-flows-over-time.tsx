"use client";

// The Lifetime view (rails-ops reference/lifetime-flows-scrubber.md, "The two
// views"): collateral and debt at the end of each week (a month on a life of
// more than three years) from the open to today, from the family's series
// route (lib/shared/flows-series.ts). The figures above are today's, the
// same as the bars'; the last point is today's. The bars' window is shaded.
// A bin where a held asset recorded no price draws a gap.

import { useMemo, useState, type KeyboardEvent } from "react";
import { Prov } from "@/components/shared/provenance";
import { Headline, useWidth } from "@/components/shared/lifetime-flows-busy";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { assetsAt, axisFor, dayStart, formatFlowUsd, stateAt, type FlowModel } from "@/lib/shared/flows-timeline";
import type { FlowBinSeries } from "@/lib/shared/flows-series";

const HUE = { collateral: "var(--color-blue-500)", debt: "var(--color-green-400)" };
const CHART_H = 150;
/** The chart's inset each side. */
const PAD = 8;
const DAY_S = 86_400;
const dayStamp = (tsSec: number) => `${shortDate(tsSec)} ${shortDateYear(tsSec)}`;

type Point = { from: number; to: number; collateral: number | null; debt: number | null };

export function LifetimeOverTime({
  model,
  series,
  failed,
  windowFrom,
}: {
  /** The whole life's model: today's figures, the labels, the close. */
  model: FlowModel;
  /** The family's series, or null while it loads. */
  series: FlowBinSeries | null;
  failed: boolean;
  /** UTC day the bars' window opens, where it opens after the first event. */
  windowFrom: number | null;
}) {
  const hasDebt = model.buckets.some((b) => b.side === "debt");
  const s = stateAt(model, model.liveStop);
  const assets = useMemo(() => assetsAt(model, model.liveStop), [model]);
  const closed = !(model.heldAt[model.heldAt.length - 1] ?? []).some((h) => (h.amount ?? 0) > 0);
  const closeDay = dayStamp(dayStart(model, model.lastDay));
  const dateLine = closed
    ? `Position at close, ${closeDay}`
    : `Position ${(model.words.live ?? "Today, live prices").replace(/^./, (c) => c.toLowerCase())}`;
  const when = closed ? `the close on ${closeDay}` : "now";

  return (
    <div className="text-sm" data-flows-lifetime="">
      <p className="mb-1 font-semibold tabular-nums text-foreground" aria-live="polite">
        {dateLine}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
        <Headline side="collateral" st={s.collateral} model={model} when={when} isLive={!closed} assets={assets} />
        {hasDebt && <Headline side="debt" st={s.debt} model={model} when={when} isLive={!closed} assets={assets} />}
      </div>
      {series && series.points.length > 0 ? (
        <Chart model={model} series={series} hasDebt={hasDebt} windowFrom={windowFrom} />
      ) : (
        <p className="mt-3 flex h-[150px] items-center justify-center rounded-md bg-sunken text-xs text-rb-500">
          {failed ? "The series could not be read." : "Reading the series…"}
        </p>
      )}
    </div>
  );
}

function Chart({
  model,
  series,
  hasDebt,
  windowFrom,
}: {
  model: FlowModel;
  series: FlowBinSeries;
  hasDebt: boolean;
  windowFrom: number | null;
}) {
  const [ref, w] = useWidth();
  // The last point is today's, at the figures above.
  const points = useMemo<Point[]>(() => {
    const out = series.points.map(([from, to, collateral, debt]) => ({ from, to, collateral, debt }));
    const last = out[out.length - 1];
    if (last) {
      last.collateral = model.live.collateralUsd;
      last.debt = model.live.debtUsd;
    }
    return out;
  }, [series, model.live]);
  const n = points.length;
  const [picked, setPicked] = useState<number | null>(null);
  const at = picked ?? n - 1;
  const axis = useMemo(
    () => axisFor(Math.max(0, ...points.map((p) => Math.max(p.collateral ?? 0, hasDebt ? (p.debt ?? 0) : 0)))),
    [points, hasDebt],
  );
  const span = Math.max(1, series.today - series.first);
  const inner = Math.max(0, w - PAD * 2);
  const xDay = (day: number) => PAD + ((day - series.first) / span) * inner;
  const x = (i: number) => (n === 1 ? PAD + inner : xDay(points[i].to));
  const y = (v: number) => CHART_H - (v / axis.max) * (CHART_H - 6);

  /** One path per run of priced points: a bin with no price breaks the line. */
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
    `${line(k, run)}L${x(run[run.length - 1])},${CHART_H}L${x(run[0])},${CHART_H}Z`;
  const dot = (k: "collateral" | "debt", run: number[]) =>
    run.length === 1 ? (
      <circle key={`${k}${run[0]}`} cx={x(run[0])} cy={y(points[run[0]][k] as number)} r={2} fill={HUE[k]} />
    ) : null;

  const pick = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect();
    const px = clientX - r.left;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setPicked(best === n - 1 ? null : best);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? n - 1
          : Math.max(0, Math.min(n - 1, at + (e.key === "ArrowLeft" ? -1 : 1)));
    setPicked(next === n - 1 ? null : next);
  };

  const binLabel = (p: Point, i: number) =>
    i === n - 1
      ? "Today"
      : series.bin === "month"
        ? new Date(p.from * DAY_S * 1000)
            .toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" })
            .replace(" ", " '")
        : `Week to ${dayStamp(p.to * DAY_S)}`;
  const p = points[at];
  const gapsHere = series.gaps.filter(([i]) => i === at && at !== n - 1);
  const shade = windowFrom != null && windowFrom > series.first ? xDay(windowFrom) : null;
  const firstLabel = dayStamp(series.first * DAY_S);
  const per = series.bin === "month" ? "month" : "week";

  return (
    <div className="mt-3">
      <div
        ref={ref}
        className="relative select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-rb-400"
        data-flow-chart=""
        tabIndex={0}
        role="group"
        aria-label={`${model.labels.collateral}${hasDebt ? ` and ${model.labels.debt.toLowerCase()}` : ""} at the end of each ${per}, from ${firstLabel} to today. Arrow keys step through the ${per}s.`}
        onKeyDown={onKey}
      >
        {w > 0 && (
          <svg
            width={w}
            height={CHART_H}
            aria-hidden
            className="block cursor-crosshair touch-none"
            onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
            onPointerMove={(e) => (e.buttons === 1 || e.pointerType === "mouse") && pick(e.clientX, e.currentTarget)}
            onPointerLeave={(e) => e.pointerType === "mouse" && setPicked(null)}
          >
            {shade != null && (
              <rect
                x={shade}
                y={0}
                width={Math.max(0, w - PAD - shade)}
                height={CHART_H}
                className="fill-rb-400/15 dark:fill-rb-500/15"
                data-flow-window=""
              />
            )}
            {axis.ticks.map((t) => (
              <line
                key={t}
                x1={0}
                x2={w}
                y1={y(t)}
                y2={y(t)}
                className="stroke-rb-300/60 dark:stroke-rb-700"
                strokeWidth={1}
              />
            ))}
            {(hasDebt ? (["collateral", "debt"] as const) : (["collateral"] as const)).map((k) =>
              runs(k).map((run) => (
                <g key={`${k}${run[0]}`}>
                  <path d={area(k, run)} fill={HUE[k]} fillOpacity={k === "collateral" ? 0.14 : 0.12} />
                  <path d={line(k, run)} fill="none" stroke={HUE[k]} strokeWidth={1.75} strokeLinejoin="round" />
                  {dot(k, run)}
                </g>
              )),
            )}
            <line
              x1={x(at)}
              x2={x(at)}
              y1={0}
              y2={CHART_H}
              className="stroke-foreground"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            {p.collateral != null && (
              <circle
                cx={x(at)}
                cy={y(p.collateral)}
                r={3.5}
                fill={HUE.collateral}
                className="stroke-background"
                strokeWidth={1.5}
              />
            )}
            {hasDebt && p.debt != null && (
              <circle
                cx={x(at)}
                cy={y(p.debt)}
                r={3.5}
                fill={HUE.debt}
                className="stroke-background"
                strokeWidth={1.5}
              />
            )}
          </svg>
        )}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 text-[11px] tabular-nums text-rb-500"
          aria-hidden
          data-prov-exempt=""
        >
          {axis.ticks.slice(1).map((t, k) => (
            <span
              key={t}
              className={`absolute left-0 -translate-y-full rounded bg-background/70 pr-1${axis.ticks.length > 5 && k % 2 === 0 ? " max-sm:hidden" : ""}`}
              style={{ top: y(t) }}
            >
              {formatFlowUsd(t)}
            </span>
          ))}
        </div>
      </div>
      <div
        className="mt-1 flex justify-between px-2 text-[11px] tabular-nums text-rb-500"
        aria-hidden
        data-prov-exempt=""
      >
        <span>{firstLabel}</span>
        <span>Today</span>
      </div>
      <p className="mt-2 min-h-[1.25rem] text-xs tabular-nums text-rb-500" aria-live="polite" data-flow-readout="">
        <span className="font-medium text-foreground">{binLabel(p, at)}</span>
        {": "}
        {model.labels.collateral}{" "}
        <Figure v={p.collateral} what={model.labels.collateral} when={binLabel(p, at)} live={at === n - 1} />
        {hasDebt && (
          <>
            {" · "}
            {model.labels.debt}{" "}
            <Figure v={p.debt} what={model.labels.debt} when={binLabel(p, at)} live={at === n - 1} />
          </>
        )}
        {gapsHere.length > 0 && (
          <span className="block">{`No price recorded that ${per}: ${[...new Set(gapsHere.map(([, , sym]) => sym))].join(", ")}.`}</span>
        )}
      </p>
      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-rb-500">
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden className="inline-block h-0.5 w-4" style={{ background: HUE.collateral }} />
          {model.labels.collateral}
        </span>
        {hasDebt && (
          <span className="inline-flex items-center gap-1.5">
            <i aria-hidden className="inline-block h-0.5 w-4" style={{ background: HUE.debt }} />
            {model.labels.debt}
          </span>
        )}
        {shade != null && (
          <span className="inline-flex items-center gap-1.5">
            <i aria-hidden className="inline-block h-3 w-4 rounded-[2px] bg-rb-400/25 dark:bg-rb-500/25" />
            The bars&apos; window
          </span>
        )}
      </p>
    </div>
  );
}

function Figure({ v, what, when, live }: { v: number | null; what: string; when: string; live: boolean }) {
  if (v == null) return <span className="text-rb-500">no price</span>;
  return (
    <Prov
      info={
        live
          ? {
              kind: "chain-derived",
              summary: `${what} now — the figure above: each asset at the oracle price now, added up.`,
              formula: "Σ balance × price",
            }
          : {
              kind: "chain-derived",
              summary: `${what} at the end of ${when.charAt(0).toLowerCase()}${when.slice(1)} — each asset's balance after its last event by then, at the last daily oracle price recorded in that period, added up.`,
              formula: "Σ balance × price on the period's last priced day",
            }
      }
    >
      <span className="font-medium text-foreground">{formatFlowUsd(v)}</span>
    </Prov>
  );
}
