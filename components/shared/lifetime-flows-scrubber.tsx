"use client";

// <LifetimeFlowsScrubber> — Lifetime flows as two horizontal bars on one USD
// axis, with a date scrubber under them (rails-ops
// reference/lifetime-flows-scrubber.md). Solid is what is still there, each
// kind of exit its own hatch, dashed what moved no funds. Every figure is
// `stateAt(model, stop)` and `assetsAt(model, stop)` (lib/shared/flows-timeline.ts);
// this file only draws them. Each bar opens (the zoom control) to its legend,
// where its inflows came from, and its assets.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, Info, Pause, Play, SkipBack, SkipForward, ZoomIn } from "lucide-react";
import { RevealTip } from "@/components/shared/reveal-tip";
import { Prov } from "@/components/shared/provenance";
import { flowAssetProv, flowSegmentProv, flowTotalProv } from "@/lib/shared/flows-timeline-provenance";
import { CTRL_GHOST, CTRL_OFF } from "@/lib/shared/ui-grammar";
import { formatDate, monthShort } from "@/lib/date";
import {
  assetsAt,
  buildFlowModel,
  dayStart,
  formatFlowUsd,
  nextEventDay,
  prevEventDay,
  spokenUsd,
  stateAt,
  type FlowAssetHeld,
  type FlowHatch,
  type FlowModel,
  type FlowSegment,
  type FlowSide,
  type FlowSideState,
  type FlowTimeline,
} from "@/lib/shared/flows-timeline";

/** Days the slider advances per tick while playing, and the tick. */
const PLAY_DAYS = 7;
const PLAY_MS = 60;

// The position axes' hues (color-grammar §6): blue the supplied side, green
// the debt. Each outflow kind takes its own hatch (standards/lexicon.md).
const HUE: Record<FlowSide, { solid: string; light: string; line: string; tint: string; hatch: string }> = {
  collateral: {
    solid: "var(--color-blue-500)",
    light: "var(--color-blue-300)",
    line: "rgba(96, 165, 250, 0.9)",
    tint: "color-mix(in srgb, var(--color-blue-500) 12%, transparent)",
    hatch: "rgba(96, 165, 250, 0.75)",
  },
  debt: {
    solid: "var(--color-green-400)",
    light: "#bbf7d0", // green-200
    line: "rgba(74, 222, 128, 0.9)",
    tint: "color-mix(in srgb, var(--color-green-400) 12%, transparent)",
    hatch: "rgba(74, 222, 128, 0.7)",
  },
};
const TONE_HATCH = { liquidation: "rgba(248, 113, 113, 0.75)", redemption: "rgba(244, 114, 182, 0.75)" };
const TONE_LINE = { liquidation: "rgba(239, 68, 68, 0.9)", redemption: "rgba(236, 72, 153, 0.9)" };

/** A 6px tile of the hatch, in `color`. */
function hatchImage(hatch: FlowHatch, color: string): CSSProperties {
  const c = encodeURIComponent(color);
  const paths: Record<FlowHatch, string> = {
    reverse: `<path d='M-1,5 l2,2 M0,0 l6,6 M5,-1 l2,2' stroke='${c}' stroke-width='1.6'/>`,
    forward: `<path d='M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2' stroke='${c}' stroke-width='1.6'/>`,
    cross: `<path d='M0,0 l6,6 M6,0 l-6,6' stroke='${c}' stroke-width='1.1'/>`,
    vertical: `<path d='M1.5,0 v6 M4.5,0 v6' stroke='${c}' stroke-width='1.2'/>`,
    horizontal: `<path d='M0,1.5 h6 M0,4.5 h6' stroke='${c}' stroke-width='1.2'/>`,
    dots: `<circle cx='1.5' cy='1.5' r='1.1' fill='${c}'/><circle cx='4.5' cy='4.5' r='1.1' fill='${c}'/>`,
  };
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='6' height='6'>${paths[hatch]}</svg>`;
  return { backgroundImage: `url("data:image/svg+xml,${svg}")`, backgroundSize: "6px 6px", backgroundRepeat: "repeat" };
}

function fillStyle(side: FlowSide, s: FlowSegment): CSSProperties {
  const h = HUE[side];
  if (s.fill === "held" || s.fill === "in") return { background: s.light ? h.light : h.solid };
  if (s.fill === "estimate") return { background: h.tint, border: `1.5px dashed ${h.line}` };
  const hatch = s.hatch ?? (s.tone && s.tone !== "exit" ? "forward" : "reverse");
  if (s.tone === "liquidation" || s.tone === "redemption")
    return { ...hatchImage(hatch, TONE_HATCH[s.tone]), boxShadow: `inset 0 0 0 1px ${TONE_LINE[s.tone]}` };
  return { ...hatchImage(hatch, h.hatch), boxShadow: `inset 0 0 0 1px ${h.line}` };
}

/** Tick colours: the side an event moved; a liquidation in the critical red. */
const TICK: Record<FlowModel["ticks"][number]["tick"], string> = {
  collateral: "var(--color-blue-500)",
  debt: "var(--color-green-400)",
  both: "linear-gradient(to bottom, var(--color-blue-500) 50%, var(--color-green-400) 50%)",
  liquidation: "var(--color-red-500)",
};

const pct = (v: number, max: number) => `${Math.max(0, (v / max) * 100)}%`;

/** The highlight key a segment answers to: its link group, else its own key. */
const hlKey = (s: FlowSegment) => (s.link ? `link:${s.link}` : s.key);

/** "2.1234" · "0.00041" · "12,400": decimals scale with the magnitude. */
function tokenText(n: number): string {
  const a = Math.abs(n);
  if (a === 0) return "0";
  if (a >= 1_000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (a >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return n.toLocaleString("en-US", { maximumFractionDigits: Math.min(8, Math.ceil(-Math.log10(a)) + 2) });
}

function Label({ s }: { s: FlowSegment }) {
  if (!s.short) return <>{s.label}</>;
  return (
    <>
      <span className="sm:hidden">{s.short}</span>
      <span className="hidden sm:inline">{s.label}</span>
    </>
  );
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/** A segment's assets, largest first, for its tip. */
type AssetSplit = Map<string, { symbol: string; usd: number }[]>;

/** One strip: a bar or its drill-down. Fills are clipped to the rounded
 *  track; the hover and tap targets ride a layer above, unclipped, so the
 *  tip can rise out of it. */
function Strip({
  side,
  segments,
  max,
  ticks,
  height,
  today,
  active,
  onHover,
  onPin,
  label,
  motion,
  split,
}: {
  side: FlowSide;
  segments: FlowSegment[];
  max: number;
  ticks: number[];
  height: string;
  today?: number | null;
  active: string | null;
  onHover: (k: string | null) => void;
  onPin: (k: string) => void;
  label: string;
  motion: string;
  split: AssetSplit;
}) {
  const shown = segments.filter((s) => s.width > 0);
  return (
    <div className={`relative ${height}`}>
      <div role="img" aria-label={label} className="absolute inset-0 overflow-hidden rounded-md bg-sunken">
        {ticks.slice(1).map((t) => (
          <i
            key={t}
            aria-hidden
            className="absolute inset-y-0 border-l border-rb-300/60 dark:border-rb-600"
            style={{ left: pct(t, max) }}
          />
        ))}
        <div className="absolute inset-0 flex">
          {shown.map((s) => (
            <span
              key={s.key}
              className={`block h-full shrink-0 ${motion}`}
              style={{ width: pct(s.width, max), ...fillStyle(side, s) }}
            />
          ))}
        </div>
      </div>
      <div className="absolute inset-0 flex" aria-hidden>
        {shown.map((s) => {
          const on = active != null && active === hlKey(s);
          const parts = split.get(s.key) ?? [];
          return (
            <span key={s.key} className={`block h-full shrink-0 ${motion}`} style={{ width: pct(s.width, max) }}>
              <RevealTip
                className="h-full w-full"
                tip={
                  <span className="flex min-w-40 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span>{s.label}</span>
                      <span className="ml-auto">{formatFlowUsd(s.value)}</span>
                    </span>
                    {parts.length > 1 &&
                      parts.slice(0, 6).map((p) => (
                        <span key={p.symbol} className="flex items-center gap-2 text-xs font-normal opacity-80">
                          <span>{p.symbol}</span>
                          <span className="ml-auto">{formatFlowUsd(p.usd)}</span>
                        </span>
                      ))}
                  </span>
                }
              >
                <span
                  className={`block h-full w-full rounded-[3px] ${on ? "outline outline-2 -outline-offset-2 outline-foreground" : ""}`}
                  onMouseEnter={() => onHover(hlKey(s))}
                  onMouseLeave={() => onHover(null)}
                  onClick={() => s.link && onPin(hlKey(s))}
                />
              </RevealTip>
            </span>
          );
        })}
      </div>
      {today != null && (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 left-0 rounded-md border border-dashed border-rb-500 ${motion}`}
          style={{ width: pct(today, max) }}
        />
      )}
    </div>
  );
}

/** The tappable list under a strip: every segment by name and figure, so a
 *  segment too thin to tap is reached here. */
function Legend({
  side,
  segments,
  active,
  pinned,
  onHover,
  onPin,
  when,
  isLive,
  daily,
}: {
  side: FlowSide;
  segments: FlowSegment[];
  active: string | null;
  pinned: string | null;
  onHover: (k: string | null) => void;
  onPin: (k: string) => void;
  when: string;
  isLive: boolean;
  daily: boolean;
}) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-rb-500">
      {segments.map((s) => {
        const k = hlKey(s);
        const on = active === k;
        return (
          <li key={s.key}>
            <button
              type="button"
              aria-pressed={pinned === k}
              onMouseEnter={() => onHover(k)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(k)}
              onBlur={() => onHover(null)}
              onClick={() => onPin(k)}
              className={`${CTRL_GHOST} min-h-7 gap-1.5 rounded-md px-1 -mx-1 ${on ? "text-foreground" : "hover:text-foreground"}`}
            >
              <i aria-hidden className="inline-block h-3 w-4 shrink-0 rounded-[2px]" style={fillStyle(side, s)} />
              <Label s={s} />
              <Prov info={flowSegmentProv(s, side, when, isLive, daily)} echo={s.fill === "held"}>
                <span className="font-medium tabular-nums text-foreground">{formatFlowUsd(s.value)}</span>
              </Prov>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Each asset's part of one side: what is held or owed, what came in, what left. */
function AssetList({
  side,
  held,
  ins,
  outs,
  heldWord,
  when,
  isLive,
  daily,
}: {
  side: FlowSide;
  held: FlowAssetHeld[];
  ins: Map<string, number>;
  outs: Map<string, number>;
  heldWord: string;
  when: string;
  isLive: boolean;
  daily: boolean;
}) {
  const symbols = [...new Set([...held.map((h) => h.symbol), ...ins.keys(), ...outs.keys()])];
  const heldOf = (sym: string) => held.find((h) => h.symbol === sym);
  const rank = (sym: string) => (heldOf(sym)?.usd ?? 0) + (ins.get(sym) ?? 0);
  symbols.sort((a, b) => rank(b) - rank(a));
  if (symbols.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="mb-1 text-[11px] text-rb-500">By asset</div>
      <ul className="divide-y divide-rb-200/70 text-xs dark:divide-rb-700/70">
        {symbols.map((sym) => {
          const h = heldOf(sym);
          return (
            <li key={sym} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1">
              <span className="min-w-16 font-medium text-foreground">
                <i
                  aria-hidden
                  className="mr-1.5 inline-block size-2 rounded-full align-middle"
                  style={{ background: HUE[side].solid }}
                />
                {sym}
              </span>
              <span className="tabular-nums text-rb-500">
                <Prov info={flowAssetProv(sym, side, "held", when, isLive, daily)}>
                  <span className="font-medium text-foreground">{formatFlowUsd(h?.usd ?? 0)}</span>
                </Prov>{" "}
                {heldWord}
                {h?.amount != null && h.amount > 0 && (
                  <>
                    {" "}
                    ({tokenText(h.amount)} {sym})
                  </>
                )}
              </span>
              {(ins.has(sym) || outs.has(sym)) && (
                <span className="tabular-nums text-rb-500 sm:ml-auto">
                  <Prov info={flowAssetProv(sym, side, "in", when, isLive, daily)}>
                    <span>{formatFlowUsd(ins.get(sym) ?? 0)}</span>
                  </Prov>{" "}
                  in ·{" "}
                  <Prov info={flowAssetProv(sym, side, "out", when, isLive, daily)}>
                    <span>{formatFlowUsd(outs.get(sym) ?? 0)}</span>
                  </Prov>{" "}
                  out
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SideBlock({
  side,
  st,
  model,
  isLive,
  open,
  onToggle,
  active,
  pinned,
  onHover,
  onPin,
  motion,
  when,
  assets,
}: {
  side: FlowSide;
  st: FlowSideState;
  model: FlowModel;
  isLive: boolean;
  when: string;
  open: boolean;
  onToggle: () => void;
  active: string | null;
  pinned: string | null;
  onHover: (k: string | null) => void;
  onPin: (k: string) => void;
  motion: string;
  assets: ReturnType<typeof assetsAt>;
}) {
  const id = `flows-${side}`;
  const coll = side === "collateral";
  const word = coll ? model.labels.collateral : model.labels.debt;
  const outs = st.bar.filter((s) => s.fill === "out");
  const liquidated = outs.filter((s) => s.tone === "liquidation").reduce((a, s) => a + s.value, 0);
  const repaid = st.out - liquidated;
  const held = st.bar[0];
  const spoken = coll
    ? `${word}: ${spokenUsd(st.now)} still supplied, of ${spokenUsd(st.total)} that came in; ${spokenUsd(st.out)} has left.`
    : `${word}: ${spokenUsd(st.now)} owed, of ${spokenUsd(st.total)} owed in all; ${spokenUsd(repaid)} repaid` +
      (liquidated > 0 ? `, ${spokenUsd(liquidated)} liquidated.` : ".");
  const srcSpoken = `${coll ? "Everything that came in" : "Everything that was owed"}, by source: ${st.sources
    .map((s) => `${s.label} ${spokenUsd(s.value)}`)
    .join(", ")}.`;

  // Each segment's assets: held from the stop's balances, flows from the
  // day rows' per-asset totals.
  const sideHeld = assets.held.filter((h) => h.side === side);
  const split: AssetSplit = new Map();
  split.set(
    `${side}-held`,
    sideHeld.map((h) => ({ symbol: h.symbol, usd: h.usd })),
  );
  const bucketsHere = model.buckets.filter((b) => b.side === side);
  const ins = new Map<string, number>();
  const outsBy = new Map<string, number>();
  for (const b of bucketsHere) {
    const parts = assets.flows.get(b.key) ?? [];
    split.set(b.key, parts);
    for (const p of parts) {
      const m = b.dir === "in" ? ins : outsBy;
      m.set(p.symbol, (m.get(p.symbol) ?? 0) + p.usd);
    }
  }

  return (
    <div className="mt-4 first:mt-1">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <Prov info={flowSegmentProv(held, side, when, isLive, model.daily)}>
            <span className="text-xl font-semibold tabular-nums text-foreground">{formatFlowUsd(st.now)}</span>
          </Prov>
          <span className="text-xs text-rb-500">{word}</span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${id}-zoom`}
          aria-label={`${word}: ${open ? "hide" : "show"} what came in, what left and each asset`}
          className={`${CTRL_GHOST} ${CTRL_OFF} min-h-11 min-w-11 justify-center gap-0.5 rounded-md px-2 sm:min-h-8 sm:min-w-0`}
        >
          <ZoomIn size={16} aria-hidden />
          <ChevronDown size={14} aria-hidden className={`${motion} ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      <Strip
        side={side}
        segments={st.bar}
        max={model.axis.max}
        ticks={model.axis.ticks}
        height="h-10 sm:h-11"
        today={isLive ? null : coll ? model.today.collateral : model.today.debt}
        active={active}
        onHover={onHover}
        onPin={onPin}
        label={spoken}
        motion={motion}
        split={split}
      />
      {!coll && <AxisLabels model={model} />}
      <div id={`${id}-zoom`} hidden={!open}>
        {open && (
          <>
            <Legend
              side={side}
              segments={st.bar}
              active={active}
              pinned={pinned}
              onHover={onHover}
              onPin={onPin}
              when={when}
              isLive={isLive}
              daily={model.daily}
            />
            <div className="mt-1 text-xs tabular-nums text-rb-500">
              <Prov info={flowTotalProv(side, "in", when)}>
                <span className="text-foreground">{formatFlowUsd(st.total)}</span>
              </Prov>
              {coll ? " in, " : " owed in all, "}
              <Prov info={flowTotalProv(side, "out", when)}>
                <span className="text-foreground">{formatFlowUsd(coll ? st.out : repaid)}</span>
              </Prov>
              {coll ? " out" : " repaid"}
              {!coll && liquidated > 0 && (
                <>
                  {", "}
                  <Prov info={flowTotalProv(side, "liquidated", when)}>
                    <span className="text-foreground">{formatFlowUsd(liquidated)}</span>
                  </Prov>
                  {" liquidated"}
                </>
              )}
            </div>
            <div className="mb-1 mt-3 text-[11px] text-rb-500">
              {coll ? "Everything that came in, by source" : "Everything that was owed, by source"}
            </div>
            <Strip
              side={side}
              segments={st.sources}
              max={model.axis.max}
              ticks={model.axis.ticks}
              height="h-5"
              active={active}
              onHover={onHover}
              onPin={onPin}
              label={srcSpoken}
              motion={motion}
              split={split}
            />
            <Legend
              side={side}
              segments={st.sources}
              active={active}
              pinned={pinned}
              onHover={onHover}
              onPin={onPin}
              when={when}
              isLive={isLive}
              daily={model.daily}
            />
            <AssetList
              side={side}
              held={sideHeld}
              ins={ins}
              outs={outsBy}
              heldWord={coll ? "held" : "owed"}
              when={when}
              isLive={isLive}
              daily={model.daily}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** The shared axis's labels, under the last bar. */
function AxisLabels({ model }: { model: FlowModel }) {
  return (
    <div className="relative mt-1.5 h-4 text-[11px] tabular-nums text-rb-500" aria-hidden data-prov-exempt="">
      {model.axis.ticks.map((t) => {
        const at = t / model.axis.max;
        return (
          <span
            key={t}
            className="absolute top-0"
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

const monthYear = (tsSec: number) => {
  const d = new Date(tsSec * 1000);
  return `${monthShort(d.getUTCMonth())} ${d.getUTCFullYear()}`;
};

export function LifetimeFlowsScrubber({ timeline }: { timeline: FlowTimeline }) {
  const model = useMemo(() => buildFlowModel(timeline), [timeline]);
  if (!model) return null;
  return <ScrubberBody model={model} />;
}

function ScrubberBody({ model }: { model: FlowModel }) {
  const [stop, setStop] = useState(model.liveStop);
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState<Record<FlowSide, boolean>>({ collateral: false, debt: false });
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const motion = reduced ? "" : "transition-all duration-200 ease-out";
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // A new position (or a refreshed live read) keeps the reader's stop within range.
  useEffect(() => setStop((s) => Math.min(s, model.liveStop)), [model.liveStop]);

  const halt = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPlaying(false);
  }, []);
  useEffect(() => halt, [halt]);

  const play = () => {
    if (timer.current) return halt();
    if (stop >= model.liveStop) setStop(0);
    setPlaying(true);
    timer.current = setInterval(() => {
      setStop((s) => Math.min(model.liveStop, s + PLAY_DAYS));
    }, PLAY_MS);
  };
  useEffect(() => {
    if (playing && stop >= model.liveStop) halt();
  }, [playing, stop, model.liveStop, halt]);

  const s = stateAt(model, stop);
  const anyOpen = open.collateral || open.debt;
  const assets = useMemo(
    () => (anyOpen ? assetsAt(model, stop) : { held: [], flows: new Map() }),
    [anyOpen, model, stop],
  );
  const active = pinned ?? hover;
  const pin = (k: string) => setPinned((p) => (p === k ? null : k));
  const dateText = s.isLive ? "Today, live prices" : formatDate(dayStart(model, stop));
  const when = s.isLive ? "now" : `the end of ${dateText}`;
  const counter =
    model.totalTxs != null && s.txs != null
      ? `${s.txs.toLocaleString("en-US")} of ${model.totalTxs.toLocaleString("en-US")} transaction${model.totalTxs === 1 ? "" : "s"}`
      : `${s.count.toLocaleString("en-US")} of ${model.totalEvents.toLocaleString("en-US")} event${model.totalEvents === 1 ? "" : "s"}`;
  const repricedHere = s.isLive ? [] : model.repricings.filter((r) => r.day === stop);
  const btn = `${CTRL_GHOST} ${CTRL_OFF} size-11 shrink-0 rounded-md sm:size-9`;
  const hint =
    "Solid is still there; each hatch is one way value left, and a dashed fill moved no funds. The dashed outline marks where each bar ends today. Flows are valued at the oracle price at their block; " +
    (model.daily
      ? "what is held on a day is valued at the last oracle price recorded by that day's end."
      : "between events an asset keeps the price of its last event.");

  return (
    <div className="text-sm">
      <SideBlock
        side="collateral"
        st={s.collateral}
        model={model}
        isLive={s.isLive}
        open={open.collateral}
        onToggle={() => setOpen((o) => ({ ...o, collateral: !o.collateral }))}
        active={active}
        pinned={pinned}
        onHover={setHover}
        onPin={pin}
        motion={motion}
        when={when}
        assets={assets}
      />
      <SideBlock
        side="debt"
        st={s.debt}
        model={model}
        isLive={s.isLive}
        open={open.debt}
        onToggle={() => setOpen((o) => ({ ...o, debt: !o.debt }))}
        active={active}
        pinned={pinned}
        onHover={setHover}
        onPin={pin}
        motion={motion}
        when={when}
        assets={assets}
      />

      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          type="button"
          className={btn}
          aria-label="Previous event"
          onClick={() => {
            halt();
            setStop(prevEventDay(model, stop));
          }}
        >
          <SkipBack size={16} aria-hidden />
        </button>
        <button type="button" className={btn} aria-label={playing ? "Pause" : "Play"} onClick={play}>
          {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
        </button>
        <button
          type="button"
          className={btn}
          aria-label="Next event"
          onClick={() => {
            halt();
            setStop(nextEventDay(model, stop));
          }}
        >
          <SkipForward size={16} aria-hidden />
        </button>
        <span className="ml-1 min-w-[7.5rem] flex-1 font-semibold tabular-nums text-foreground" aria-live="polite">
          {dateText}
        </span>
        <span className="flex items-center gap-1 text-xs tabular-nums text-rb-500" data-prov-exempt="">
          {counter}
          <RevealTip
            tip={<span className="block max-w-72 font-normal leading-snug">{hint}</span>}
            label={hint}
            focusable
            className="focus-ring ml-1 inline-flex size-7 items-center justify-center rounded-full text-rb-500 hover:text-foreground"
          >
            <Info size={14} aria-hidden />
          </RevealTip>
        </span>
      </div>

      <div className="relative mt-1">
        <input
          type="range"
          min={0}
          max={model.liveStop}
          step={1}
          value={stop}
          aria-label="Date"
          aria-valuetext={dateText}
          onChange={(e) => {
            halt();
            setStop(Number(e.target.value));
          }}
          className="block h-11 w-full cursor-pointer accent-[var(--color-rb-500)] sm:h-7"
        />
        {/* Event ticks, coloured by the side each event moved, and a marker
            where an event repriced an asset whose price had gone stale. */}
        <div className="pointer-events-none relative mx-2 h-3" aria-hidden>
          {model.ticks.map((t, i) => (
            <i
              key={i}
              className="absolute top-0 h-2.5 w-[2px] rounded-[1px]"
              style={{ left: pct(t.day, model.liveStop), background: TICK[t.tick] }}
            />
          ))}
        </div>
        <div className="relative mx-2 h-3">
          {model.repricings.map((r, i) => (
            <span key={i} className="absolute top-0 -translate-x-1/2" style={{ left: pct(r.day, model.liveStop) }}>
              <RevealTip
                tip={`Repriced ${formatDate(dayStart(model, r.day))}: ${r.symbol} last priced ${formatDate(r.from)}`}
                label={`Repriced ${formatDate(dayStart(model, r.day))}: ${r.symbol} last priced ${formatDate(r.from)}`}
              >
                <span className="block size-2 rotate-45 border border-rb-500" />
              </RevealTip>
            </span>
          ))}
        </div>
      </div>

      {(s.stale.length > 0 || repricedHere.length > 0) && (
        <p className="mt-2 text-[11px] leading-snug text-rb-500">
          {repricedHere.map((r) => `${r.symbol} repriced on this day, last priced ${formatDate(r.from)}. `).join("")}
          {s.stale.length > 0 &&
            `${model.daily ? "No newer price recorded" : "Valued at each asset's last event price"}: ${s.stale
              .map((x) => `${x.symbol} from ${monthYear(x.pricedAt)}`)
              .join(", ")}.`}
        </p>
      )}
    </div>
  );
}
