"use client";

// The Lifetime flows panel for busy, long-lived positions (lib/shared/flows-busy.ts):
// the slider steps by bin (a day, a week or a month, by the position's span),
// a density strip counts the transactions in each bin, and either
//   rescaled   each bar is what is held or owed, on an axis fixed to the
//              largest either has been, with the lifetime's throughput in one line;
//   over-time  collateral and debt as lines over the bins, with the health
//              factor under them where the page states a liquidation threshold.
// With `operations`, the transactions grouped by the events inside each one.
// Every figure is `stateAt(model, stop)` at a bin's last day, or the live stop.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { flowSegmentProv } from "@/lib/shared/flows-timeline-provenance";
import { CTRL_GHOST, CTRL_OFF } from "@/lib/shared/ui-grammar";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import {
  assetsAt,
  axisFor,
  dayStart,
  formatFlowUsd,
  spokenUsd,
  stateAt,
  type FlowModel,
  type FlowSegment,
  type FlowSide,
  type FlowSideState,
} from "@/lib/shared/flows-timeline";
import {
  binOf,
  flowBins,
  healthAt,
  seriesByBin,
  throughput,
  type FlowBin,
  type FlowOperations,
  type FlowVariant,
} from "@/lib/shared/flows-busy";

const PLAY_MS = 220;
const HUE: Record<FlowSide, string> = { collateral: "var(--color-blue-500)", debt: "var(--color-green-400)" };
const dayStamp = (tsSec: number) => `${shortDate(tsSec)} ${shortDateYear(tsSec)}`;
const count = (n: number) => n.toLocaleString("en-US");

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((e) => {
      const r = e[0]?.contentRect;
      if (r) setW(r.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export interface BusyFlowsProps {
  model: FlowModel;
  variant: FlowVariant;
  operations?: FlowOperations | null;
  loadOperations?: () => Promise<FlowOperations | null>;
  /** The account's liquidation threshold now (0.95), for the health factor
   *  over time; absent, no health line. */
  healthThreshold?: number | null;
  /** The Full breakdown's note while the slider is off its last stop. */
  onLedgerNote?: (note: string | null) => void;
}

export function BusyFlows({
  model,
  variant,
  operations,
  loadOperations,
  healthThreshold,
  onLedgerNote,
}: BusyFlowsProps) {
  const [loadedOps, setLoadedOps] = useState<FlowOperations | null>(null);
  useEffect(() => {
    if (!variant.ops || operations || !loadOperations) return;
    let live = true;
    loadOperations()
      .then((o) => live && setLoadedOps(o))
      .catch(() => {
        // The grouping stays off; the chart reads as it does without it.
      });
    return () => {
      live = false;
    };
  }, [variant.ops, operations, loadOperations]);
  const ops = operations ?? loadedOps;
  const { unit, bins } = useMemo(() => flowBins(model), [model]);
  const series = useMemo(() => seriesByBin(model, bins), [model, bins]);
  const through = useMemo(() => throughput(model), [model]);
  const last = bins.length; // the live stop's index
  const [at, setAt] = useState(last);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => setAt((i) => Math.min(i, last)), [last]);
  const halt = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPlaying(false);
  }, []);
  useEffect(() => halt, [halt]);
  useEffect(() => {
    if (playing && at >= last) halt();
  }, [playing, at, last, halt]);
  const play = () => {
    if (timer.current) return halt();
    if (at >= last) setAt(0);
    setPlaying(true);
    timer.current = setInterval(() => setAt((i) => Math.min(last, i + 1)), PLAY_MS);
  };
  const go = (i: number) => {
    halt();
    setAt(Math.max(0, Math.min(last, i)));
  };

  const stop = at >= last ? model.liveStop : bins[at].to;
  const s = stateAt(model, stop);
  const assets = useMemo(() => assetsAt(model, stop), [model, stop]);
  const hasDebt = model.buckets.some((b) => b.side === "debt");
  const closed = !(model.heldAt[model.heldAt.length - 1] ?? []).some((h) => (h.amount ?? 0) > 0);
  const closeDay = dayStamp(dayStart(model, model.lastDay));
  const atClose = s.isLive && closed;
  const dateText = atClose
    ? `At close, ${closeDay}`
    : s.isLive
      ? (model.words.live ?? "Today, live prices")
      : dayStamp(dayStart(model, stop));
  const when = atClose ? `the close on ${closeDay}` : s.isLive ? "now" : `the end of ${dateText}`;
  const dateLine = atClose
    ? `Position at close, ${closeDay}`
    : s.isLive
      ? `Position ${dateText.charAt(0).toLowerCase()}${dateText.slice(1)}`
      : `Position on ${dateText}`;
  const liveReceipts = s.isLive && !closed;
  const unitWord = through.unit;
  const through_ = s.txs ?? s.count;
  const counter = `${count(through_)} of ${count(through.txs)} ${unitWord}${through.txs === 1 ? "" : "s"}`;
  const binText = at >= last ? (closed ? "Close" : "Today") : bins[at].label;

  const ledgerText = s.isLive ? null : closed ? "Shows the position at close" : "Shows the position today";
  useEffect(() => {
    onLedgerNote?.(ledgerText);
  }, [onLedgerNote, ledgerText]);
  useEffect(() => () => onLedgerNote?.(null), [onLedgerNote]);

  const btn = `${CTRL_GHOST} ${CTRL_OFF} size-11 shrink-0 rounded-md sm:size-9`;
  const per = unit === "day" ? "day" : unit === "week" ? "week" : "month";

  return (
    <div className="text-sm" data-flows-variant={`${variant.chart}${variant.ops ? "+ops" : ""}`}>
      <p className="mb-1 font-semibold tabular-nums text-foreground" aria-live="polite">
        {dateLine}
      </p>
      <Throughput t={through} hasDebt={hasDebt} />

      {variant.chart === "rescaled" ? (
        <Rescaled model={model} s={s} hasDebt={hasDebt} when={when} isLive={liveReceipts} assets={assets} />
      ) : (
        <OverTime
          model={model}
          s={s}
          hasDebt={hasDebt}
          when={when}
          isLive={liveReceipts}
          assets={assets}
          series={series}
          at={at}
          bins={bins}
          onPick={go}
          healthThreshold={healthThreshold ?? null}
        />
      )}

      <div className="relative mt-3">
        <Density bins={bins} at={at} per={per} unit={unitWord} onPick={go} />
        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={at}
          aria-label={`Date, by ${per}`}
          aria-valuetext={at >= last ? dateText : `${bins[at].label}: ${count(bins[at].count)} ${unitWord}s`}
          onChange={(e) => go(Number(e.target.value))}
          className="block h-11 w-full cursor-pointer accent-[var(--color-rb-500)] sm:h-7"
        />
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-1">
        <button type="button" className={btn} aria-label="Jump to opening" onClick={() => go(0)}>
          <SkipBack size={16} aria-hidden />
        </button>
        <button type="button" className={btn} aria-label={`Previous ${per}`} onClick={() => go(at - 1)}>
          <ChevronLeft size={18} aria-hidden />
        </button>
        <button type="button" className={btn} aria-label={playing ? "Pause" : "Play"} onClick={play}>
          {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
        </button>
        <button type="button" className={btn} aria-label={`Next ${per}`} onClick={() => go(at + 1)}>
          <ChevronRight size={18} aria-hidden />
        </button>
        <button
          type="button"
          className={btn}
          aria-label={closed ? "Jump to close" : "Jump to today"}
          onClick={() => go(last)}
        >
          <SkipForward size={16} aria-hidden />
        </button>
        <span className="ml-auto text-right text-xs tabular-nums text-rb-500" data-prov-exempt="">
          <span className="max-sm:block">{binText}</span>
          <span className="max-sm:hidden"> · </span>
          <span>{counter}</span>
        </span>
      </div>

      {s.stale.length > 0 && (
        <p className="mt-2 text-[11px] leading-snug text-rb-500">
          {`${model.daily ? "No newer price recorded" : "Valued at each asset's last event price"}: ${s.stale
            .map((x) => `${x.symbol} from ${dayStamp(x.pricedAt)}`)
            .join(", ")}.`}
        </p>
      )}

      {variant.ops && ops && <Operations ops={ops} />}
    </div>
  );
}

// ── The lifetime's throughput, in one line ──────────────────────────────────

const throughputProv = (what: string, figure: string): Provenance => ({
  kind: "chain-derived",
  summary: `${what} over the position's life — every such flow its events record, each at the oracle price at its block, added up (${figure}).`,
  formula: "Σ amount × price at block",
});

function Throughput({ t, hasDebt }: { t: ReturnType<typeof throughput>; hasDebt: boolean }) {
  const fig = (v: number, what: string) => (
    <Prov info={throughputProv(what, formatFlowUsd(v))}>
      <span className="font-medium tabular-nums text-foreground">{formatFlowUsd(v)}</span>
    </Prov>
  );
  return (
    <p className="mb-3 text-xs leading-relaxed text-rb-500" data-flow-throughput="">
      {fig(t.deposited, "Deposited")} deposited
      {hasDebt && t.borrowed > 0.5 && <> and {fig(t.borrowed, "Borrowed")} borrowed</>} across{" "}
      <span className="font-medium tabular-nums text-foreground" data-prov-exempt="">
        {count(t.txs)}
      </span>{" "}
      {t.unit}
      {t.txs === 1 ? "" : "s"}
      {t.turnover != null ? `; the position has turned over about ${count(t.turnover)} times.` : "."}
    </p>
  );
}

// ── a: the bars at the scale of what is held ────────────────────────────────

function Headline({
  side,
  st,
  model,
  when,
  isLive,
  assets,
}: {
  side: FlowSide;
  st: FlowSideState;
  model: FlowModel;
  when: string;
  isLive: boolean;
  assets: ReturnType<typeof assetsAt>;
}) {
  const word = side === "collateral" ? model.labels.collateral : model.labels.debt;
  const tokens = assets.held.filter((h) => h.side === side && (h.amount ?? 0) > 0).map((h) => h.symbol);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Prov info={flowSegmentProv(st.bar[0], side, when, isLive, model.daily)}>
        <span className="text-xl font-semibold tabular-nums text-foreground">{formatFlowUsd(st.now)}</span>
      </Prov>
      {tokens.length > 0 && <InlineAssetCluster symbols={tokens} size={16} overlap={5} max={3} />}
      <span className="text-xs text-rb-500">{word}</span>
    </div>
  );
}

/** Held or owed, as the flows net to it: each inflow, each outflow taken
 *  off, and the balancing item. */
function NetLine({
  side,
  st,
  when,
  isLive,
  daily,
}: {
  side: FlowSide;
  st: FlowSideState;
  when: string;
  isLive: boolean;
  daily: boolean;
}) {
  const ins = st.sources.filter((x) => x.fill === "in");
  const rest = st.sources.find((x) => x.fill === "estimate");
  const outs = st.bar.filter((x) => x.fill === "out");
  const terms: { seg: FlowSegment; v: number; signed: boolean }[] = [
    ...ins.map((seg) => ({ seg, v: seg.value, signed: false })),
    ...outs.map((seg) => ({ seg, v: -seg.value, signed: true })),
    ...(rest ? [{ seg: rest, v: rest.value, signed: true }] : []),
  ].filter((x) => Math.abs(x.v) >= 0.5);
  if (terms.length === 0) return null;
  return (
    <p className="mt-1.5 text-xs leading-relaxed text-rb-500" data-flow-net={side}>
      {terms.map(({ seg, v, signed }, i) => (
        <span key={seg.key}>
          <span className="whitespace-nowrap">
            {i === 0 ? seg.label : seg.label.charAt(0).toLowerCase() + seg.label.slice(1)}{" "}
            <Prov info={flowSegmentProv(seg, side, when, isLive, daily)}>
              <span className="font-medium tabular-nums text-foreground">
                {i > 0 && (signed || v >= 0) && v >= 0.5 ? "+" : ""}
                {formatFlowUsd(v)}
              </span>
            </Prov>
            {i < terms.length - 1 && " ·"}
          </span>{" "}
        </span>
      ))}
    </p>
  );
}

function Rescaled({
  model,
  s,
  hasDebt,
  when,
  isLive,
  assets,
}: {
  model: FlowModel;
  s: ReturnType<typeof stateAt>;
  hasDebt: boolean;
  when: string;
  isLive: boolean;
  assets: ReturnType<typeof assetsAt>;
}) {
  // Fixed per position: the most either side has held or owed at any stop.
  const axis = useMemo(() => {
    let peak = Math.max(model.live.collateralUsd, model.live.debtUsd);
    for (const v of model.valued) peak = Math.max(peak, v.collateral, v.debt);
    return axisFor(peak);
  }, [model]);
  const sides: FlowSide[] = hasDebt ? ["collateral", "debt"] : ["collateral"];
  return (
    <div>
      {sides.map((side, i) => {
        const st = s[side];
        return (
          <div key={side} className={i === 0 ? "mt-1" : "mt-4"}>
            <Headline side={side} st={st} model={model} when={when} isLive={isLive} assets={assets} />
            <div
              className="relative mb-1 mt-1.5 h-4 text-[11px] tabular-nums text-rb-500"
              aria-hidden
              data-prov-exempt=""
            >
              {axis.ticks.map((t, k) => {
                const x = t / axis.max;
                const lastTick = k === axis.ticks.length - 1;
                return (
                  <span
                    key={t}
                    className={`absolute top-0${axis.ticks.length > 5 && k % 2 === 1 && !lastTick ? " max-sm:hidden" : ""}`}
                    style={{
                      left: `${x * 100}%`,
                      transform: x === 0 ? "none" : x > 0.9 ? "translateX(-100%)" : "translateX(-50%)",
                    }}
                  >
                    {formatFlowUsd(t)}
                  </span>
                );
              })}
            </div>
            <div
              role="img"
              aria-label={`${side === "collateral" ? model.labels.collateral : model.labels.debt}: ${spokenUsd(st.now)}.`}
              className="relative h-10 overflow-hidden rounded-md bg-sunken sm:h-11"
            >
              {axis.ticks.slice(1).map((t) => (
                <i
                  key={t}
                  aria-hidden
                  className="absolute inset-y-0 border-l border-rb-300/60 dark:border-rb-600"
                  style={{ left: `${(t / axis.max) * 100}%` }}
                />
              ))}
              <span
                className="absolute inset-y-0 left-0 block rounded-[3px] transition-all duration-200 ease-out motion-reduce:transition-none"
                style={{ width: `${Math.max(0, (st.now / axis.max) * 100)}%`, background: HUE[side] }}
              />
            </div>
            <NetLine side={side} st={st} when={when} isLive={isLive} daily={model.daily} />
          </div>
        );
      })}
    </div>
  );
}

// ── b: collateral and debt over time ────────────────────────────────────────

const CHART_H = 150;
const HEALTH_H = 44;
/** The chart's inset each side, matching the slider thumb's travel. */
const PAD = 8;

function OverTime({
  model,
  s,
  hasDebt,
  when,
  isLive,
  assets,
  series,
  at,
  bins,
  onPick,
  healthThreshold,
}: {
  model: FlowModel;
  s: ReturnType<typeof stateAt>;
  hasDebt: boolean;
  when: string;
  isLive: boolean;
  assets: ReturnType<typeof assetsAt>;
  series: ReturnType<typeof seriesByBin>;
  at: number;
  bins: FlowBin[];
  onPick: (i: number) => void;
  healthThreshold: number | null;
}) {
  const [ref, w] = useWidth();
  const n = series.length;
  const axis = useMemo(() => axisFor(Math.max(...series.map((p) => Math.max(p.collateral, p.debt)))), [series]);
  const inner = Math.max(0, w - PAD * 2);
  const x = (i: number) => PAD + (n > 1 ? (i / (n - 1)) * inner : inner / 2);
  const y = (v: number) => CHART_H - (v / axis.max) * (CHART_H - 6);
  const line = (k: "collateral" | "debt") => series.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p[k])}`).join("");
  const area = (k: "collateral" | "debt") => `${line(k)}L${x(n - 1)},${CHART_H}L${x(0)},${CHART_H}Z`;
  const health = healthThreshold ? series.map((p) => healthAt(p.collateral, p.debt, healthThreshold)) : null;
  // The line's range: its own values with 1.00, the liquidation line, in view.
  const hVals = health ? health.filter((h): h is number => h != null) : [];
  const hMax = Math.min(3, Math.max(1.1, ...hVals) * 1.01);
  const hMin = Math.max(0, Math.min(1, ...hVals) - (hMax - Math.min(1, ...hVals)) * 0.08);
  const hy = (h: number) => HEALTH_H - 3 - ((Math.min(h, hMax) - hMin) / (hMax - hMin)) * (HEALTH_H - 6);
  const hPath = health
    ? health
        .map((h, i) => (h == null ? null : `${x(i)},${hy(h)}`))
        .reduce<string>((d, p, i) => (p == null ? d : `${d}${d === "" || health[i - 1] == null ? "M" : "L"}${p}`), "")
    : "";
  const pick = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect();
    const t = (clientX - r.left - PAD) / Math.max(1, r.width - PAD * 2);
    onPick(Math.round(Math.max(0, Math.min(1, t)) * (n - 1)));
  };
  const hNow = health?.[at] ?? null;
  const firstLabel = bins[0] ? dayStamp(dayStart(model, bins[0].from)) : "";
  const midBin = bins[Math.floor(bins.length / 2)];
  return (
    <div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Headline side="collateral" st={s.collateral} model={model} when={when} isLive={isLive} assets={assets} />
        {hasDebt && <Headline side="debt" st={s.debt} model={model} when={when} isLive={isLive} assets={assets} />}
      </div>
      <div ref={ref} className="relative mt-3 select-none" data-flow-chart="">
        {w > 0 && (
          <svg
            width={w}
            height={CHART_H}
            role="img"
            aria-label={`${model.labels.collateral} and ${model.labels.debt.toLowerCase()} by ${bins.length > 0 ? "period" : "day"}, from ${firstLabel} to today.`}
            className="block cursor-crosshair touch-none"
            onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
            onPointerMove={(e) => e.buttons === 1 && pick(e.clientX, e.currentTarget)}
          >
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
            <path d={area("collateral")} fill={HUE.collateral} fillOpacity={0.14} />
            <path
              d={line("collateral")}
              fill="none"
              stroke={HUE.collateral}
              strokeWidth={1.75}
              strokeLinejoin="round"
            />
            {hasDebt && (
              <>
                <path d={area("debt")} fill={HUE.debt} fillOpacity={0.12} />
                <path d={line("debt")} fill="none" stroke={HUE.debt} strokeWidth={1.75} strokeLinejoin="round" />
              </>
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
            <circle
              cx={x(at)}
              cy={y(series[at].collateral)}
              r={3.5}
              fill={HUE.collateral}
              className="stroke-background"
              strokeWidth={1.5}
            />
            {hasDebt && (
              <circle
                cx={x(at)}
                cy={y(series[at].debt)}
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
        {midBin && <span className="max-sm:hidden">{dayStamp(dayStart(model, midBin.from))}</span>}
        <span>Today</span>
      </div>
      <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-rb-500">
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
      </p>
      {health && w > 0 && hPath && (
        <div className="mt-3" data-flow-health="">
          <p className="mb-1 flex flex-wrap items-baseline gap-x-2 text-xs text-rb-500">
            <span>
              Health factor at today&apos;s liquidation threshold, {Math.round((healthThreshold ?? 0) * 1000) / 10}%
            </span>
            {hNow != null && (
              <Prov
                info={{
                  kind: "chain-derived",
                  summary: `Health factor at ${when} — ${model.labels.collateral.toLowerCase()} held then × today's liquidation threshold, over the debt owed then.`,
                  formula: "collateral × threshold ÷ debt",
                }}
              >
                <span className="font-medium tabular-nums text-foreground">{hNow.toFixed(2)}</span>
              </Prov>
            )}
          </p>
          <svg width={w} height={HEALTH_H} aria-hidden className="block">
            {hMin < 1 && (
              <line
                x1={0}
                x2={w}
                y1={hy(1)}
                y2={hy(1)}
                stroke="var(--color-red-500)"
                strokeDasharray="2 3"
                strokeWidth={1}
              />
            )}
            <path d={hPath} fill="none" className="stroke-rb-500" strokeWidth={1.5} strokeLinejoin="round" />
            {hNow != null && <circle cx={x(at)} cy={hy(hNow)} r={3} className="fill-foreground" />}
          </svg>
        </div>
      )}
    </div>
  );
}

// ── The density strip: transactions per bin ────────────────────────────────

function Density({
  bins,
  at,
  per,
  unit,
  onPick,
}: {
  bins: FlowBin[];
  at: number;
  per: string;
  unit: string;
  onPick: (i: number) => void;
}) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const n = bins.length + 1;
  const max = Math.max(1, ...bins.map((b) => b.count));
  const inner = Math.max(0, w - PAD * 2);
  const x = (i: number) => PAD + (i / (n - 1)) * inner;
  const colW = Math.max(1, Math.min(14, (inner / Math.max(1, n - 1)) * 0.7));
  const H = 22;
  const idx = (clientX: number) => {
    const el = ref.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const i = Math.round(((clientX - r.left - PAD) / Math.max(1, inner)) * (n - 1));
    return i >= 0 && i < bins.length ? i : null;
  };
  const shown = hover ?? null;
  return (
    <div className="relative">
      <p className="mb-0.5 text-[11px] text-rb-500" data-prov-exempt="">
        {`${unit.charAt(0).toUpperCase()}${unit.slice(1)}s per ${per}`}
      </p>
      <div
        ref={ref}
        className="relative"
        style={{ height: H }}
        data-flow-density=""
        onPointerMove={(e) => e.pointerType === "mouse" && setHover(idx(e.clientX))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          const i = idx(e.clientX);
          if (i != null) onPick(i);
        }}
      >
        {w > 0 && (
          <svg width={w} height={H} aria-hidden className="block cursor-pointer">
            {bins.map((b, i) =>
              b.count > 0 ? (
                <rect
                  key={i}
                  x={x(i) - colW / 2}
                  y={H - Math.max(1.5, (Math.sqrt(b.count) / Math.sqrt(max)) * H)}
                  width={colW}
                  height={Math.max(1.5, (Math.sqrt(b.count) / Math.sqrt(max)) * H)}
                  rx={Math.min(1.5, colW / 2)}
                  fill={b.liquidation ? "var(--color-red-500)" : i === at ? "var(--foreground)" : "var(--color-rb-400)"}
                  fillOpacity={i === at || b.liquidation ? 1 : 0.7}
                />
              ) : null,
            )}
          </svg>
        )}
        {shown != null && bins[shown] && (
          <span
            role="tooltip"
            data-prov-hidden=""
            className="pointer-events-none absolute bottom-full z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg border px-2 py-1 text-xs font-medium tabular-nums text-foreground shadow-lg"
            style={{
              left: Math.max(70, Math.min(w - 70, x(shown))),
              background: "var(--rb-tooltip-bg)",
              borderColor: "var(--rb-tooltip-border)",
            }}
          >
            {bins[shown].label}: {count(bins[shown].count)} {unit}
            {bins[shown].count === 1 ? "" : "s"}
          </span>
        )}
      </div>
    </div>
  );
}

// ── c: the transactions grouped by what they did ────────────────────────────

function Operations({ ops }: { ops: FlowOperations }) {
  const max = Math.max(1, ...ops.kinds.map((k) => k.count));
  return (
    <div className="mt-4 border-t border-rb-200 pt-3 dark:border-rb-800" data-flow-ops="">
      <p className="text-xs font-semibold text-foreground">What each transaction did</p>
      <ul className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 text-xs">
        {ops.kinds.map((k) => (
          <li key={k.label} className="contents">
            <span className="text-rb-600 dark:text-rb-300">{k.label}</span>
            <span className="h-1.5 rounded-full bg-sunken">
              <span className="block h-full rounded-full bg-rb-400" style={{ width: `${(k.count / max) * 100}%` }} />
            </span>
            <span className="tabular-nums text-foreground" data-prov-exempt="">
              {count(k.count)}
            </span>
          </li>
        ))}
      </ul>
      {ops.executor && (
        <p className="mt-2 text-xs leading-relaxed text-rb-500">
          Sent from{" "}
          <a
            href={`https://etherscan.io/address/${ops.executor.address}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-foreground underline decoration-rb-300 underline-offset-2 hover:decoration-foreground"
          >
            {shortAddress(ops.executor.address)}
          </a>{" "}
          in{" "}
          <span className="tabular-nums text-foreground" data-prov-exempt="">
            {count(ops.executor.count)}
          </span>{" "}
          of the{" "}
          <span className="tabular-nums text-foreground" data-prov-exempt="">
            {count(ops.executor.known)}
          </span>{" "}
          transactions whose sender the index records.
        </p>
      )}
    </div>
  );
}
