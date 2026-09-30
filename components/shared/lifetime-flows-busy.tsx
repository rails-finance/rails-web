"use client";

// The bars for a busy window (lib/shared/flows-busy.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "The two views"): each bar is what is
// held or owed, on an axis fixed to the most either has been in the window,
// with the window's throughput in one line, a density strip counting the
// transactions in each bin (a day, a week or a month, by the window's span),
// and the slider stepping by bin. Every figure is `stateAt(model, stop)` at a
// bin's last day, or the live stop. Each bar's tip ends with how its side's
// flows net to what is held (`SideSum`).

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { RevealTip } from "@/components/shared/reveal-tip";
import { flowSegmentProv } from "@/lib/shared/flows-timeline-provenance";
import { CTRL_GHOST, CTRL_OFF } from "@/lib/shared/ui-grammar";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import {
  assetsAt,
  axisFor,
  axisLabelOnPhone,
  dayStart,
  formatFlowUsd,
  spokenUsd,
  stateAt,
  type FlowModel,
  type FlowSegment,
  type FlowSide,
  type FlowSideState,
} from "@/lib/shared/flows-timeline";
import { flowBins, throughput, type FlowBin } from "@/lib/shared/flows-busy";

const PLAY_MS = 220;
const HUE: Record<FlowSide, string> = { collateral: "var(--color-blue-500)", debt: "var(--color-green-400)" };
const dayStamp = (tsSec: number) => `${shortDate(tsSec)} ${shortDateYear(tsSec)}`;
const count = (n: number) => n.toLocaleString("en-US");
/** The density strip's inset each side, matching the slider thumb's travel. */
const PAD = 8;

export function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
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

/** The date line over the headlines. */
export function DateRow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 flex min-h-9 items-center">
      <p className="min-w-0 font-semibold tabular-nums text-foreground" aria-live="polite">
        {children}
      </p>
    </div>
  );
}

/** The first and last day, under the two ends of a slider or a chart. */
export function TrackEnds({ start, end }: { start: string; end: string }) {
  return (
    <div
      className="mt-0.5 flex justify-between px-2 text-[11px] tabular-nums text-rb-500"
      aria-hidden
      data-prov-exempt=""
      data-flow-track-ends=""
    >
      <span>{start}</span>
      <span>{end}</span>
    </div>
  );
}

export interface BusyFlowsProps {
  /** The model, cut to the bars' window where it has one. */
  model: FlowModel;
  /** A ledger's note while the slider is off its last stop (Aave V4). */
  onLedgerNote?: (note: string | null) => void;
}

export function BusyFlows({ model, onLedgerNote }: BusyFlowsProps) {
  const { unit, bins } = useMemo(() => flowBins(model), [model]);
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

  const ledgerText = s.isLive ? null : closed ? "Shows the position at close" : "Shows the position today";
  useEffect(() => {
    onLedgerNote?.(ledgerText);
  }, [onLedgerNote, ledgerText]);
  useEffect(() => () => onLedgerNote?.(null), [onLedgerNote]);

  const btn = `${CTRL_GHOST} ${CTRL_OFF} size-11 shrink-0 rounded-md sm:size-9`;
  const per = unit === "day" ? "day" : unit === "week" ? "week" : "month";

  return (
    <div className="text-sm" data-flows-busy="">
      <DateRow>{dateLine}</DateRow>
      <Throughput t={through} hasDebt={hasDebt} />

      <Rescaled model={model} s={s} hasDebt={hasDebt} when={when} isLive={liveReceipts} assets={assets} />

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
        <TrackEnds start={dayStamp(dayStart(model, 0))} end={closed ? closeDay : "Today"} />
      </div>

      <div className="mt-1 flex items-center justify-center gap-x-1" data-flow-controls="">
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
      </div>

      {s.stale.length > 0 && (
        <p className="mt-2 text-[11px] leading-snug text-rb-500">
          {`${model.daily ? "No newer price recorded" : "Valued at each asset's last event price"}: ${s.stale
            .map((x) => `${x.symbol} from ${dayStamp(x.pricedAt)}`)
            .join(", ")}.`}
        </p>
      )}
    </div>
  );
}

// ── The lifetime's throughput, in one line ──────────────────────────────────

const throughputProv = (what: string, figure: string): Provenance => ({
  kind: "chain-derived",
  summary: `${what} over the position's life — every such flow its events record, each at the oracle price at its block, added up (${figure}).`,
  formula: "Σ amount × price at block",
});

export function Throughput({ t, hasDebt }: { t: ReturnType<typeof throughput>; hasDebt: boolean }) {
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

/** The shared axis's labels, once, under the last bar, in both bar views;
 *  a phone thins them (`axisLabelOnPhone`). */
export function AxisLabels({ ticks, max }: { ticks: number[]; max: number }) {
  return (
    <div
      className="relative mt-1 h-4 text-[11px] tabular-nums text-rb-500"
      aria-hidden
      data-flow-axis=""
      data-prov-exempt=""
    >
      {ticks.map((t, i) => {
        const at = t / max;
        return (
          <span
            key={t}
            className={`absolute top-0${axisLabelOnPhone(i, ticks.length) ? "" : " max-sm:hidden"}`}
            style={{
              left: `${at * 100}%`,
              transform: at === 0 ? "none" : at > 0.9 ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            {formatFlowUsd(t)}
          </span>
        );
      })}
    </div>
  );
}

export function Headline({
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

/** A side's sum, at the foot of each segment's tip on that bar, in short
 *  lines. The plain bars: the bar's length and where it came from, what has
 *  left, and what is held or owed (the headline, the solid part). The busy
 *  bars (`net`), whose length is what is held: each inflow, each outflow
 *  taken off, the balancing item, and what they net to. */
export function SideSum({ side, st, net = false }: { side: FlowSide; st: FlowSideState; net?: boolean }) {
  const coll = side === "collateral";
  const row = (key: string, label: string, v: number, opts: { sub?: boolean; sign?: boolean } = {}) => (
    <span key={key} className={`flex items-center gap-3${opts.sub ? " pl-2 font-normal opacity-80" : ""}`}>
      <span>{label}</span>
      <span className="ml-auto tabular-nums">
        {opts.sign && v >= 0.5 ? "+" : ""}
        {formatFlowUsd(v)}
      </span>
    </span>
  );
  const rows: ReactNode[] = [];
  if (net) {
    const ins = st.sources.filter((x) => x.fill === "in");
    const rest = st.sources.find((x) => x.fill === "estimate");
    const outs = st.bar.filter((x) => x.fill === "out");
    const terms: { seg: FlowSegment; v: number; signed: boolean }[] = [
      ...ins.map((seg) => ({ seg, v: seg.value, signed: false })),
      ...outs.map((seg) => ({ seg, v: -seg.value, signed: true })),
      ...(rest ? [{ seg: rest, v: rest.value, signed: true }] : []),
    ].filter((x) => Math.abs(x.v) >= 0.5);
    for (const { seg, v, signed } of terms) rows.push(row(seg.key, seg.label, v, { sign: signed }));
  } else {
    const shown = st.sources.filter((x) => Math.abs(x.value) >= 0.5);
    rows.push(row("total", coll ? "Came in" : "Owed in all", st.total));
    for (const x of shown) rows.push(row(x.key, x.label, x.value, { sub: true, sign: x.signed }));
    if (st.out >= 0.5) {
      const liquidated = st.bar.some((x) => x.fill === "out" && x.tone === "liquidation" && x.value >= 0.5);
      rows.push(row("out", coll ? "Left" : liquidated ? "Repaid or liquidated" : "Repaid", st.out));
    }
  }
  rows.push(row("now", coll ? "Held" : "Owed", st.now));
  return (
    <span
      className="mt-1.5 flex flex-col gap-0.5 border-t pt-1.5"
      style={{ borderColor: "var(--rb-tooltip-border)" }}
      data-flow-tip-sum={side}
    >
      {rows}
    </span>
  );
}

export function Rescaled({
  model,
  s,
  hasDebt,
  when,
  isLive,
  assets,
  headlines = true,
  outline = false,
}: {
  model: FlowModel;
  s: ReturnType<typeof stateAt>;
  hasDebt: boolean;
  when: string;
  isLive: boolean;
  assets: ReturnType<typeof assetsAt>;
  /** False where the view draws the headlines above (Combined). */
  headlines?: boolean;
  /** Draw the dashed outline of each bar's length at the last stop, as the
   *  plain bars do (Combined; the Flows view's busy bars draw none). */
  outline?: boolean;
}) {
  // Fixed per position: the most either side has held or owed at any stop.
  const axis = useMemo(() => {
    let peak = Math.max(model.live.collateralUsd, model.live.debtUsd);
    for (const v of model.valued) peak = Math.max(peak, v.collateral, v.debt);
    return axisFor(peak);
  }, [model]);
  const sides: FlowSide[] = hasDebt ? ["collateral", "debt"] : ["collateral"];
  const live = { collateral: model.live.collateralUsd, debt: model.live.debtUsd };
  return (
    <div>
      {headlines && (
        <div className="mb-2 flex flex-wrap gap-x-6 gap-y-2" data-flow-headlines="">
          {sides.map((side) => (
            <Headline key={side} side={side} st={s[side]} model={model} when={when} isLive={isLive} assets={assets} />
          ))}
        </div>
      )}
      {sides.map((side, i) => {
        const st = s[side];
        return (
          <div key={side} className={i === 0 ? "" : "mt-3"} data-flow-side={side}>
            <div className="relative h-10 sm:h-11">
              <div
                role="img"
                aria-label={`${side === "collateral" ? model.labels.collateral : model.labels.debt}: ${spokenUsd(st.now)}.`}
                className="absolute inset-0 overflow-hidden rounded-md bg-sunken"
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
              {/* The whole track opens the tip, so a bar held near zero still
                  names its flows. */}
              <span className="absolute inset-0 block" aria-hidden>
                <RevealTip
                  className="h-full w-full"
                  tip={
                    <span className="flex min-w-40 flex-col gap-0.5" data-flow-tip={side}>
                      <span className="flex items-center gap-2">
                        <span>{side === "collateral" ? model.labels.collateral : model.labels.debt}</span>
                        <span className="ml-auto">{formatFlowUsd(st.now)}</span>
                      </span>
                      <SideSum side={side} st={st} net />
                    </span>
                  }
                >
                  <span className="block h-full w-full cursor-default" />
                </RevealTip>
              </span>
              {outline && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 rounded-md border border-dashed border-rb-500 transition-all duration-200 ease-out motion-reduce:transition-none"
                  style={{ width: `${Math.max(0, (live[side] / axis.max) * 100)}%` }}
                  data-flow-outline=""
                />
              )}
            </div>
            {i === sides.length - 1 && <AxisLabels ticks={axis.ticks} max={axis.max} />}
          </div>
        );
      })}
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
