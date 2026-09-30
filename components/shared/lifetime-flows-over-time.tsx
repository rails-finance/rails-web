// The Over time view (rails-ops reference/lifetime-flows-scrubber.md, "The two
// views"): collateral and debt at the end of each week (a month on a life of
// more than three years) from the open to today, from the family's series
// route (lib/shared/flows-series.ts). The headlines are today's, the same as
// the Flows view's, until the pointer, a finger or the arrow keys pick a bin;
// then they are that bin's, and leaving the chart returns them to today. The
// last point is today's. The Flows window is shaded. A bin where a held asset
// recorded no price draws a gap. The lines' legend is in the panel's Key.

import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Provenance } from "@/components/shared/provenance";
import { DateRow, Headline, TrackEnds, useWidth } from "@/components/shared/lifetime-flows-busy";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import {
  assetsAt,
  axisFor,
  DAY_MS,
  dayStart,
  formatFlowUsd,
  stateAt,
  type FlowModel,
} from "@/lib/shared/flows-timeline";
import type { FlowBinSeries } from "@/lib/shared/flows-series";

/** The lines' hues; the panel's Key draws the same. */
export const OVER_TIME_HUE = { collateral: "var(--color-blue-500)", debt: "var(--color-green-400)" };
const HUE = OVER_TIME_HUE;
const CHART_H = 150;
/** The chart's inset each side. */
const PAD = 8;
const DAY_S = 86_400;
const dayStamp = (tsSec: number) => `${shortDate(tsSec)} ${shortDateYear(tsSec)}`;

type Point = { from: number; to: number; collateral: number | null; debt: number | null };

/** A bin's figure: its assets' balances at the period's last priced day. */
const binProv = (what: string, day: string): Provenance => ({
  kind: "chain-derived",
  summary: `${what} on ${day} — each asset's balance after its last event by then, at the last daily oracle price recorded in that period, added up.`,
  formula: "Σ balance × price on the period's last priced day",
});

export function LifetimeOverTime({
  model,
  series,
  failed,
  windowFrom,
  switcher,
}: {
  /** The whole life's model: today's figures, the labels, the close. */
  model: FlowModel;
  /** The family's series, or null while it loads. */
  series: FlowBinSeries | null;
  failed: boolean;
  /** UTC day the Flows window opens, where it opens after the first event. */
  windowFrom: number | null;
  /** The view switch, on the date line's row. */
  switcher?: ReactNode;
}) {
  const hasDebt = model.buckets.some((b) => b.side === "debt");
  // The last point is today's, at the live figures.
  const points = useMemo<Point[]>(() => {
    const out = (series?.points ?? []).map(([from, to, collateral, debt]) => ({ from, to, collateral, debt }));
    const last = out[out.length - 1];
    if (last) {
      last.collateral = model.live.collateralUsd;
      last.debt = model.live.debtUsd;
    }
    return out;
  }, [series, model.live]);
  const n = points.length;
  // The bin under the pointer, a finger or the arrow keys; null is today.
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => setPicked(null), [series]);
  const at = picked != null && picked < n - 1 ? picked : null;
  const p = at != null ? points[at] : null;
  const stop = p ? Math.max(0, Math.min(model.liveStop, p.to - model.start / DAY_MS)) : model.liveStop;
  const s = stateAt(model, model.liveStop);
  const assets = useMemo(() => assetsAt(model, stop), [model, stop]);
  const closed = !(model.heldAt[model.heldAt.length - 1] ?? []).some((h) => (h.amount ?? 0) > 0);
  const closeDay = dayStamp(dayStart(model, model.lastDay));
  const binDay = p ? dayStamp(p.to * DAY_S) : null;
  const dateLine = binDay
    ? `Position on ${binDay}`
    : closed
      ? `Position at close, ${closeDay}`
      : `Position ${(model.words.live ?? "Today, live prices").replace(/^./, (c) => c.toLowerCase())}`;
  const when = closed ? `the close on ${closeDay}` : "now";
  const figure = (side: "collateral" | "debt") =>
    p && binDay
      ? { v: p[side], info: binProv(side === "collateral" ? model.labels.collateral : model.labels.debt, binDay) }
      : undefined;
  const gapsHere = at != null && series ? series.gaps.filter(([i]) => i === at) : [];

  return (
    <div className="text-sm" data-flows-lifetime="">
      <DateRow switcher={switcher}>{dateLine}</DateRow>
      <div className="flex flex-wrap gap-x-6 gap-y-2" data-flow-headlines="">
        <Headline
          side="collateral"
          st={s.collateral}
          model={model}
          when={when}
          isLive={!closed}
          assets={assets}
          figure={figure("collateral")}
        />
        {hasDebt && (
          <Headline
            side="debt"
            st={s.debt}
            model={model}
            when={when}
            isLive={!closed}
            assets={assets}
            figure={figure("debt")}
          />
        )}
      </div>
      {series && n > 0 ? (
        <Chart
          model={model}
          series={series}
          points={points}
          at={at ?? n - 1}
          onPick={setPicked}
          hasDebt={hasDebt}
          windowFrom={windowFrom}
        />
      ) : (
        <p className="mt-3 flex h-[150px] items-center justify-center rounded-md bg-sunken text-xs text-rb-500">
          {failed ? "The series could not be read." : "Reading the series…"}
        </p>
      )}
      {gapsHere.length > 0 && (
        <p className="mt-2 text-xs text-rb-500" data-flow-gap-note="">
          {`No price recorded that ${series?.bin === "month" ? "month" : "week"}: ${[...new Set(gapsHere.map(([, , sym]) => sym))].join(", ")}.`}
        </p>
      )}
    </div>
  );
}

function Chart({
  model,
  series,
  points,
  at,
  onPick,
  hasDebt,
  windowFrom,
}: {
  model: FlowModel;
  series: FlowBinSeries;
  points: Point[];
  /** The bin drawn under the cursor line: the last, today's, unless picked. */
  at: number;
  /** A bin, or null for today. */
  onPick: (i: number | null) => void;
  hasDebt: boolean;
  windowFrom: number | null;
}) {
  const [ref, w] = useWidth();
  const n = points.length;
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

  const set = (i: number) => onPick(i >= n - 1 ? null : i);
  const pick = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect();
    const px = clientX - r.left;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    set(best);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    set(
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? n - 1
          : Math.max(0, Math.min(n - 1, at + (e.key === "ArrowLeft" ? -1 : 1))),
    );
  };

  const p = points[at];
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
        onBlur={() => onPick(null)}
      >
        {w > 0 && (
          <svg
            width={w}
            height={CHART_H}
            aria-hidden
            className="block cursor-crosshair touch-none"
            onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
            onPointerMove={(e) => (e.buttons === 1 || e.pointerType === "mouse") && pick(e.clientX, e.currentTarget)}
            onPointerLeave={() => onPick(null)}
            onPointerCancel={() => onPick(null)}
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
      <TrackEnds start={firstLabel} end="Today" />
    </div>
  );
}
