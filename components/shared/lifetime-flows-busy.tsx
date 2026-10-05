"use client";

// The bars for a busy window (lib/shared/flows-busy.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "The two views"): each bar is what is
// held or owed, on an axis fixed to the most either has been in the window,
// a density strip counting the
// transactions in each bin (a day, a week or a month, by the window's span),
// and the slider stepping by bin. Every figure is `stateAt(model, stop)` at a
// bin's last day, or the live stop. A tap on a bar opens its side's panel
// (lifetime-flows-tip.tsx): how its flows add up to what is held. The
// window's throughput is a bullet in the panel's Explanation (FlowsTotalsBullets).

import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import {
  FlowCursorContext,
  FlowPanelShell,
  KEEP_PANEL,
  SegmentTipContext,
  SegmentTipBody,
  SegmentPanelBody,
  sumSwatch,
  useFlowUnit,
} from "@/components/shared/lifetime-flows-tip";
import { flowSegmentProv } from "@/lib/shared/flows-timeline-provenance";
import { CTRL_GHOST, CTRL_OFF } from "@/lib/shared/ui-grammar";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import {
  assetsAt,
  axisFor,
  axisLabelOnPhone,
  dayStart,
  formatFlowToken,
  formatFlowUsd,
  oldPriceAt,
  partialAt,
  spokenUsd,
  stateAt,
  unitOf,
  type FlowModel,
  type FlowSide,
  type FlowSideState,
  type FlowUnit,
} from "@/lib/shared/flows-timeline";
import { OldPriceLabel, OldPriceTip } from "@/components/shared/flow-old-price";
import { RevealTip } from "@/components/shared/reveal-tip";
import { ExplainBullet } from "@/components/shared/explain-groups";
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
export function DateRow({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex min-h-9 items-center justify-between gap-3">
      <p className="min-w-0 font-semibold tabular-nums text-foreground" aria-live="polite">
        {children}
      </p>
      {aside}
    </div>
  );
}

/** The first and last day, under the two ends of a slider or a chart. */
export function TrackEnds({
  start,
  end,
  startInset = 0,
  endInset = 0,
}: {
  start: string;
  end: string;
  startInset?: number;
  /** How far before the strip's right end the end label's point sits. */
  endInset?: number;
}) {
  return (
    <div
      className="mt-0.5 flex justify-between gap-x-2 whitespace-nowrap px-2 text-[11px] tabular-nums text-rb-500"
      style={{
        ...(startInset > 0 ? { paddingLeft: 8 + startInset } : {}),
        ...(endInset > 0 ? { paddingRight: 8 + endInset } : {}),
      }}
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
  const unitWord = model.totalTxs != null ? "transaction" : "event";
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
  // The readout states the date alone (Miles, 1 Oct 2026).
  const dateLine = s.isLive && !atClose ? (model.words.live ?? "Today") : dateText;
  const liveReceipts = s.isLive && !closed;

  const ledgerText = s.isLive ? null : closed ? "Shows the position at close" : "Shows the position today";
  useEffect(() => {
    onLedgerNote?.(ledgerText);
  }, [onLedgerNote, ledgerText]);
  useEffect(() => () => onLedgerNote?.(null), [onLedgerNote]);

  const btn = `${CTRL_GHOST} ${CTRL_OFF} size-11 shrink-0 rounded-md sm:size-9`;
  const per = unit === "day" ? "day" : unit === "week" ? "week" : "month";

  const cursor = {
    at: atClose ? `at close, ${closeDay}` : s.isLive ? `today (${dayStamp(Date.now() / 1000)})` : `at ${dateText}`,
    prev: () => go(at - 1),
    next: () => go(at + 1),
    canPrev: at > 0,
    canNext: at < last,
  };

  return (
    <FlowCursorContext.Provider value={cursor}>
      <div className="text-sm" data-flows-busy="">
        <DateRow aside={<OldPriceLabel note={oldPriceAt(model, stop)} />}>{dateLine}</DateRow>

        <Rescaled model={model} s={s} hasDebt={hasDebt} when={when} isLive={liveReceipts} assets={assets} />

        <div className="relative mt-3" {...KEEP_PANEL}>
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

        <div
          className="mt-1 flex items-center justify-center gap-x-1"
          data-flow-controls=""
          data-anatomy="F5"
          {...KEEP_PANEL}
        >
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
      </div>
    </FlowCursorContext.Provider>
  );
}

// ── The lifetime's totals, as the Explanation's bullets ─────────────────────

const throughputProv = (what: string, figure: string): Provenance => ({
  kind: "chain-derived",
  summary: `${what} over the position's life — every such flow its events record, each at the oracle price at its block, added up (${figure}).`,
  formula: "Σ amount × price at block",
});

/** What the scrubber reports for the panel's Totals: the throughput over the
 *  bars' stops, its figures already formatted in each side's unit. */
export type FlowsTotalsData = {
  deposited: string;
  /** Null on a position with no debt side, or nothing borrowed. */
  borrowed: string | null;
  txs: number;
  unit: "transaction" | "event";
  turnover: number | null;
  /** The bars' window's first day, where the window is cut. */
  since: string | null;
};

export function flowsTotals(model: FlowModel, since: string | null): FlowsTotalsData {
  const t = throughput(model);
  const hasDebt = model.buckets.some((b) => b.side === "debt");
  return {
    deposited: formatFlowUsd(t.deposited, unitOf(model, "collateral")),
    borrowed: hasDebt && t.borrowed > 0.5 ? formatFlowUsd(t.borrowed, unitOf(model, "debt")) : null,
    txs: t.txs,
    unit: t.unit,
    turnover: t.turnover,
    since,
  };
}

/** The Totals bullets: "Deposited $2.5M, borrowed $2.3M, 92 transactions",
 *  "Turned over about 4 times". */
export function FlowsTotalsBullets({ t }: { t: FlowsTotalsData }) {
  const fig = (v: string, what: string) => (
    <Prov info={throughputProv(what, v)}>
      <span className="font-medium tabular-nums">{v}</span>
    </Prov>
  );
  return (
    <>
      <ExplainBullet data-flow-throughput="" data-anatomy="F11">
        <>
          Deposited {fig(t.deposited, "Deposited")}
          {t.borrowed && <>, borrowed {fig(t.borrowed, "Borrowed")}</>},{" "}
          <span className="font-medium tabular-nums" data-prov-exempt="">
            {count(t.txs)}
          </span>{" "}
          {t.unit}
          {t.txs === 1 ? "" : "s"}
          {t.since ? ` since ${t.since}` : ""}
        </>
      </ExplainBullet>
      {t.turnover != null && (
        <ExplainBullet data-flow-turnover="">Turned over about {count(t.turnover)} times</ExplainBullet>
      )}
    </>
  );
}

// ── a: the bars at the scale of what is held ────────────────────────────────

/** The shared axis's labels, once, under the last bar, in both bar views;
 *  a phone thins them (`axisLabelOnPhone`). */
export function AxisLabels({
  ticks,
  max,
  unit: sideUnit,
}: {
  ticks: number[];
  max: number;
  /** The bar's token, where each bar has its own axis (`FlowModel.sideAxes`). */
  unit?: FlowUnit;
}) {
  const ctxUnit = useFlowUnit();
  const unit = sideUnit ?? ctxUnit;
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
            {unit ? formatFlowToken(t, unit, false) : formatFlowUsd(t)}
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
  partial,
}: {
  side: FlowSide;
  st: FlowSideState;
  model: FlowModel;
  when: string;
  isLive: boolean;
  assets: ReturnType<typeof assetsAt>;
  /** What the figure and its bar rest on that the page could not read
   *  (`unsureAt`): an asterisk after the figure opens these words. */
  partial?: string[];
}) {
  const word = side === "collateral" ? model.labels.collateral : model.labels.debt;
  const tokens = assets.held.filter((h) => h.side === side && (h.amount ?? 0) > 0).map((h) => h.symbol);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Prov info={flowSegmentProv(st.bar[0], side, when, isLive, model.daily)}>
        <span className="text-xl font-semibold tabular-nums text-foreground">
          {formatFlowUsd(st.now, unitOf(model, side))}
        </span>
      </Prov>
      {partial && partial.length > 0 && (
        <RevealTip
          className="focus-ring -ml-1.5 self-start rounded"
          focusable
          label={`Not complete: ${partial.join(" ")}`}
          tip={<OldPriceTip lines={partial} />}
        >
          <span className="cursor-help px-0.5 text-sm font-semibold leading-none text-rb-500" data-flow-partial={side}>
            *
          </span>
        </RevealTip>
      )}
      {tokens.length > 0 && <InlineAssetCluster symbols={tokens} size={16} overlap={5} max={3} />}
      <span className="text-xs text-rb-500">{word}</span>
    </div>
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
  const sharedAxis = useMemo(() => {
    let peak = Math.max(model.live.collateralUsd, model.live.debtUsd);
    for (const v of model.valued) peak = Math.max(peak, v.collateral, v.debt);
    return axisFor(peak);
  }, [model]);
  // Each bar on its own axis where the sides have no common unit.
  const axes = useMemo(() => {
    if (!model.sideUnits) return null;
    const peak = { collateral: model.live.collateralUsd, debt: model.live.debtUsd };
    for (const v of model.valued) {
      peak.collateral = Math.max(peak.collateral, v.collateral);
      peak.debt = Math.max(peak.debt, v.debt);
    }
    return { collateral: axisFor(peak.collateral), debt: axisFor(peak.debt) };
  }, [model]);
  const sides: FlowSide[] = hasDebt ? ["collateral", "debt"] : ["collateral"];
  const live = { collateral: model.live.collateralUsd, debt: model.live.debtUsd };
  // The open side's panel follows the cursor, and closes while the bars are
  // greyed before their window.
  const [open, setOpen] = useState<{ side: FlowSide; keyboard: boolean } | null>(null);
  const cursor = useContext(FlowCursorContext);
  useEffect(() => {
    if (open && cursor?.live === false) setOpen(null);
  }, [open, cursor?.live]);
  // On a page that ties the panel to its timeline, the track opens a short
  // tip naming what is held instead of the side's panel.
  const tip = useContext(SegmentTipContext) != null;
  return (
    <div>
      {headlines && (
        <div className="mb-2 flex flex-wrap gap-x-6 gap-y-2" data-flow-headlines="" data-anatomy="F2">
          {sides.map((side) => (
            <Headline
              key={side}
              side={side}
              st={s[side]}
              model={model}
              when={when}
              isLive={isLive}
              assets={assets}
              partial={partialAt(model, s.stop, side)}
            />
          ))}
        </div>
      )}
      {sides.map((side, i) => {
        const st = s[side];
        const word = side === "collateral" ? model.labels.collateral : model.labels.debt;
        const axis = axes?.[side] ?? sharedAxis;
        const u = unitOf(model, side);
        return (
          <div
            key={side}
            className={i === 0 ? "" : "mt-3"}
            data-flow-side={side}
            data-anatomy={side === "collateral" ? "F3.1" : "F3.2"}
          >
            <div className="relative h-10 sm:h-11">
              <div
                role="img"
                aria-label={`${word}: ${spokenUsd(st.now, u)}.`}
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
              {/* The whole track opens the side's panel, so a bar held near
                  zero still names its flows. */}
              <button
                type="button"
                className={`absolute inset-0 block cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${!tip && open?.side === side ? "outline outline-2 -outline-offset-2 outline-foreground" : ""}`}
                aria-label={
                  tip
                    ? `${st.bar[0].label}: ${spokenUsd(st.now, u)}`
                    : `${word}: ${spokenUsd(st.now, u)}. Open how its flows add up.`
                }
                aria-expanded={open?.side === side}
                aria-haspopup="dialog"
                data-flow-seg={`${side}-busy`}
                onClick={(e) => setOpen(open?.side === side ? null : { side, keyboard: e.detail === 0 })}
              />
              {open?.side === side && (
                <FlowPanelShell
                  label={`${word}: ${spokenUsd(st.now, u)}`}
                  anchor={() => document.querySelector<HTMLElement>(`[data-flow-seg="${side}-busy"]`)}
                  onClose={() => setOpen(null)}
                  focusOnOpen={open.keyboard}
                  width={tip ? 260 : undefined}
                >
                  {tip ? (
                    <SegmentTipBody
                      side={side}
                      seg={st.bar[0]}
                      st={st}
                      when={when}
                      isLive={isLive}
                      daily={model.daily}
                      share={false}
                    />
                  ) : (
                    <SegmentPanelBody
                      side={side}
                      seg={st.bar[0]}
                      title={word}
                      parts={[]}
                      st={st}
                      held={assets.held.filter((h) => h.side === side)}
                      when={when}
                      isLive={isLive}
                      daily={model.daily}
                      swatch={sumSwatch(side)}
                      words={{
                        rest: st.sources.find((x) => x.fill === "estimate")?.label ?? "Market move and interest",
                      }}
                    />
                  )}
                </FlowPanelShell>
              )}
              {outline && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 rounded-md border border-dashed border-rb-500 transition-all duration-200 ease-out motion-reduce:transition-none"
                  style={{ width: `${Math.max(0, (live[side] / axis.max) * 100)}%` }}
                  data-flow-outline=""
                />
              )}
            </div>
            {(i === sides.length - 1 || axes) && <AxisLabels ticks={axis.ticks} max={axis.max} unit={u} />}
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
        data-anatomy="F12"
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
