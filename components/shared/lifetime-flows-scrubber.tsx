"use client";

// <LifetimeFlowsScrubber> — Lifetime flows as two horizontal bars on one USD
// axis, with a date scrubber under them (rails-ops
// reference/lifetime-flows-scrubber.md). Solid is what is still there, each
// kind of exit its own hatch, named in the Key inside the panel's Explanation
// (`FlowsKeyContext`). Every figure is `stateAt(model, stop)` and
// `assetsAt(model, stop)` (lib/shared/flows-timeline.ts); this file only draws
// them. Under each bar one line says where its length came from; hovering or
// tapping a segment lists its assets.
//
// Accuracy: each segment is its own rounded block, 1px apart, laid out in
// pixels from the measured track; a non-zero segment is at least 2px, the
// width that takes comes off the largest segments, and the bar's total length
// stays exact on the axis (`layoutStrip`).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { ChevronLeft, ChevronRight, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { RevealTip } from "@/components/shared/reveal-tip";
import { Prov } from "@/components/shared/provenance";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { flowSegmentProv } from "@/lib/shared/flows-timeline-provenance";
import { CTRL_GHOST, CTRL_OFF, CTRL_ON, CTRL_ON_HOVER } from "@/lib/shared/ui-grammar";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import {
  assetsAt,
  buildFlowModel,
  DAY_MS,
  dayStart,
  longDay,
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
  windowModel,
} from "@/lib/shared/flows-timeline";
import { isBusy } from "@/lib/shared/flows-busy";
import { BusyFlows } from "@/components/shared/lifetime-flows-busy";
import { LifetimeOverTime } from "@/components/shared/lifetime-flows-over-time";
import {
  binInputFromTimeline,
  binSeries,
  lifetimeBinFor,
  windowFromDay,
  WINDOW_ACTIVE_DAYS,
  type FlowBinSeries,
  type SeriesBin,
} from "@/lib/shared/flows-series";
import { fetchFlowBinSeries } from "@/lib/api/fetch-aave-v3-flow-series";

/** Days the slider advances per tick while playing, and the tick. */
const PLAY_DAYS = 7;
const PLAY_MS = 60;

// The position axes' hues (color-grammar §6): blue the supplied side, green
// the debt. Each outflow kind takes its own hatch (standards/lexicon.md).
const HUE: Record<FlowSide, { solid: string; line: string; hatch: string }> = {
  collateral: {
    solid: "var(--color-blue-500)",
    line: "rgba(96, 165, 250, 0.9)",
    hatch: "rgba(96, 165, 250, 0.75)",
  },
  debt: {
    solid: "var(--color-green-400)",
    line: "rgba(74, 222, 128, 0.9)",
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
    // One dot a tile, a square grid: a diagonal pair of dots reads as the
    // reverse diagonal at bar size.
    dots: `<circle cx='3' cy='3' r='1.3' fill='${c}'/>`,
  };
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='6' height='6'>${paths[hatch]}</svg>`;
  return { backgroundImage: `url("data:image/svg+xml,${svg}")`, backgroundSize: "6px 6px", backgroundRepeat: "repeat" };
}

function fillStyle(side: FlowSide, s: FlowSegment): CSSProperties {
  const h = HUE[side];
  if (s.fill !== "out") return { background: h.solid };
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

/** "7 Feb '26": the timeline's day stamp (chain-truth-timeline). */
const dayStamp = (tsSec: number) => `${shortDate(tsSec)} ${shortDateYear(tsSec)}`;

/** A held line that names a token (the ledger's summed interest line names none). */
const isToken = (h: FlowAssetHeld) => h.amount != null;

/** The highlight key a segment answers to: its link group, else its own key. */
const hlKey = (s: FlowSegment) => (s.link ? `link:${s.link}` : s.key);

/** Set by the panel around the scrubber: told what the ledger under it shows
 *  while the slider is off its last stop ("Shows the position today"), and
 *  null at the last stop, where the two agree. */
export const FlowsLedgerNoteContext = createContext<((note: string | null) => void) | null>(null);

/** The Key: each kind of exit the position has had over its life, and the
 *  dashed outline where it has other stops. The scrubber reports it; the panel
 *  draws it inside its Explanation, so the bars stand alone. */
export type FlowsKeyItems = {
  items: { side: FlowSide; s: FlowSegment }[];
  outline: string | null;
  /** The Key's line on which view is which. */
  views?: string;
  /** The Explanation's line on the same. */
  explain?: string;
};
export const FlowsKeyContext = createContext<((key: FlowsKeyItems | null) => void) | null>(null);

/** Gap between neighbouring segments, the least width a non-zero segment
 *  draws at, and the largest corner radius, all in px. */
const SEG_GAP = 1;
const SEG_MIN = 2;
const SEG_RADIUS = 3;

type SegBox = { left: number; width: number };

/** Lays a strip's segments out in pixels on a track `trackPx` wide whose axis
 *  runs to `max`. The bar ends where its total sits on the axis; the gaps come
 *  out of that length; a segment the split leaves under SEG_MIN is raised to
 *  it, and what that adds is shaved off the largest segments (down to a common
 *  ceiling). A bar too short to hold every segment at SEG_MIN runs that much
 *  longer. Edges snap to device pixels. */
export function layoutStrip(widths: number[], max: number, trackPx: number, dpr = 1): SegBox[] {
  const n = widths.length;
  const total = widths.reduce((a, w) => a + w, 0);
  if (n === 0 || !(total > 0) || !(max > 0) || !(trackPx > 0)) return widths.map(() => ({ left: 0, width: 0 }));
  const length = Math.min(trackPx, (total / max) * trackPx);
  const room = length - SEG_GAP * (n - 1);
  let w: number[];
  if (room <= SEG_MIN * n) {
    w = widths.map(() => SEG_MIN);
  } else {
    w = widths.map((v) => (v / total) * room);
    const small = w.map((x) => x < SEG_MIN);
    const owed = w.reduce((a, x, i) => a + (small[i] ? SEG_MIN - x : 0), 0);
    if (owed > 0) {
      // The ceiling c over the rest where what lies above it equals `owed`.
      const big = w.filter((_, i) => !small[i]).sort((a, b) => b - a);
      let c = 0;
      let sum = 0;
      for (let k = 0; k < big.length; k++) {
        sum += big[k];
        c = (sum - owed) / (k + 1);
        if (k === big.length - 1 || c >= big[k + 1]) break;
      }
      w = w.map((x, i) => (small[i] ? SEG_MIN : Math.min(x, c)));
    }
  }
  const snap = (x: number) => Math.round(x * dpr) / dpr;
  const out: SegBox[] = [];
  let edge = 0;
  let start = 0;
  for (let i = 0; i < n; i++) {
    edge += w[i];
    const end = Math.max(start + SEG_MIN, snap(edge));
    out.push({ left: start, width: end - start });
    edge += SEG_GAP;
    start = end + SEG_GAP;
  }
  return out;
}

/** The track's width once measured, and whether it has been measured long
 *  enough for moves to animate (the first measured frame lands without one). */
function useTrackWidth(): [RefObject<HTMLDivElement | null>, number | null, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [settled, setSettled] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setWidth(r.width);
    });
    ro.observe(el);
    const raf = requestAnimationFrame(() => setSettled(true));
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
  return [ref, width, settled];
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
type AssetSplit = Map<string, { symbol: string; usd: number; token?: boolean }[]>;

/** Rows a segment's tip lists before it counts the rest. */
const TIP_ROWS = 6;

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
  const [trackRef, trackPx, settled] = useTrackWidth();
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  // Until the track is measured (the server's render, the first paint) the
  // segments sit on percentages with no gaps; after it, on `layoutStrip`.
  const boxes = useMemo(() => {
    if (trackPx == null) {
      let at = 0;
      return shown.map((s) => {
        const box = { left: pct(at, max), width: pct(s.width, max), radius: SEG_RADIUS };
        at += s.width;
        return box;
      });
    }
    return layoutStrip(
      shown.map((s) => s.width),
      max,
      trackPx,
      dpr,
    ).map((b) => ({ left: `${b.left}px`, width: `${b.width}px`, radius: Math.min(SEG_RADIUS, b.width / 2) }));
    // `shown` is new each render; its widths are what the layout reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.map((s) => `${s.key}:${s.width}`).join("|"), max, trackPx, dpr]);
  const anim = trackPx != null && settled ? motion : "";
  const place = (i: number): CSSProperties => ({
    left: boxes[i].left,
    width: boxes[i].width,
    borderRadius: boxes[i].radius,
  });
  return (
    <div ref={trackRef} className={`relative ${height}`}>
      <div role="img" aria-label={label} className="absolute inset-0 overflow-hidden rounded-md bg-sunken">
        {ticks.slice(1).map((t) => (
          <i
            key={t}
            aria-hidden
            className="absolute inset-y-0 border-l border-rb-300/60 dark:border-rb-600"
            style={{ left: pct(t, max) }}
          />
        ))}
        {shown.map((s, i) => (
          <span
            key={s.key}
            className={`absolute inset-y-0 block ${anim}`}
            style={{ ...place(i), ...fillStyle(side, s) }}
          />
        ))}
      </div>
      <div className="absolute inset-0" aria-hidden>
        {shown.map((s, i) => {
          const on = active != null && active === hlKey(s);
          const parts = split.get(s.key) ?? [];
          return (
            <span key={s.key} className={`absolute inset-y-0 block ${anim}`} style={place(i)}>
              <RevealTip
                className="h-full w-full"
                tip={
                  <span className="flex min-w-40 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span>{s.label}</span>
                      <span className="ml-auto">{formatFlowUsd(s.value)}</span>
                    </span>
                    {parts.slice(0, TIP_ROWS).map((p) => (
                      <span key={p.symbol} className="flex items-center gap-1.5 text-xs font-normal">
                        {p.token !== false && <TokenChipIcon symbol={p.symbol} size={14} filterable={false} />}
                        <span className="opacity-80">{p.symbol}</span>
                        <span className="ml-auto pl-2 opacity-80">{formatFlowUsd(p.usd)}</span>
                      </span>
                    ))}
                    {parts.length > TIP_ROWS && (
                      <span className="text-xs font-normal opacity-80">{parts.length - TIP_ROWS} more</span>
                    )}
                  </span>
                }
              >
                <span
                  className={`block h-full w-full ${on ? "outline outline-2 -outline-offset-2 outline-foreground" : ""}`}
                  style={{ borderRadius: boxes[i].radius }}
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
          className={`pointer-events-none absolute inset-y-0 left-0 rounded-md border border-dashed border-rb-500 ${anim}`}
          style={{ width: pct(today, max) }}
        />
      )}
    </div>
  );
}

function SideBlock({
  side,
  st,
  model,
  isLive,
  active,
  onHover,
  onPin,
  motion,
  when,
  assets,
  atLive,
}: {
  side: FlowSide;
  st: FlowSideState;
  model: FlowModel;
  isLive: boolean;
  when: string;
  active: string | null;
  onHover: (k: string | null) => void;
  onPin: (k: string) => void;
  motion: string;
  assets: ReturnType<typeof assetsAt>;
  /** The first bar drawn. Each bar carries the axis labels over it. */
  first: boolean;
  /** The last stop, where no "today" outline is drawn (`isLive` there is
   *  false on a closed position: its receipts read as the close's). */
  atLive: boolean;
}) {
  const coll = side === "collateral";
  const word = coll ? model.labels.collateral : model.labels.debt;
  const outs = st.bar.filter((s) => s.fill === "out");
  const liquidated = outs.filter((s) => s.tone === "liquidation").reduce((a, s) => a + s.value, 0);
  const repaid = st.out - liquidated;
  const held = st.bar[0];
  const spoken = coll
    ? `${word}: ${spokenUsd(st.now)} ${(model.words.held ?? "Still supplied").toLowerCase()}, of ${spokenUsd(st.total)} that came in; ${spokenUsd(st.out)} has left.`
    : `${word}: ${spokenUsd(st.now)} owed, of ${spokenUsd(st.total)} owed in all; ${spokenUsd(repaid)} repaid` +
      (liquidated > 0 ? `, ${spokenUsd(liquidated)} liquidated.` : ".");
  // The strip's label names every segment it draws, so the bar reads without
  // the Key.
  const named = st.bar.filter((s) => s.width > 0).map((s) => `${s.label} ${spokenUsd(s.value)}`);
  const label = named.length > 0 ? `${spoken} Segments: ${named.join(", ")}.` : spoken;
  // Each segment's assets: held from the stop's balances, flows from the
  // day rows' per-asset totals.
  const sideHeld = assets.held.filter((h) => h.side === side);
  const heldTokens = sideHeld.filter((h) => isToken(h) && (h.amount ?? 0) > 0).map((h) => h.symbol);
  const split: AssetSplit = new Map();
  split.set(
    `${side}-held`,
    sideHeld.map((h) => ({ symbol: h.symbol, usd: h.usd, token: isToken(h) })),
  );
  for (const b of model.buckets) if (b.side === side) split.set(b.key, assets.flows.get(b.key) ?? []);

  return (
    <div className="mt-4 first:mt-1">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Prov info={flowSegmentProv(held, side, when, isLive, model.daily)}>
          <span className="text-xl font-semibold tabular-nums text-foreground">{formatFlowUsd(st.now)}</span>
        </Prov>
        {heldTokens.length > 0 && <InlineAssetCluster symbols={heldTokens} size={16} overlap={5} max={3} />}
        <span className="text-xs text-rb-500">{word}</span>
      </div>
      <AxisLabels model={model} />
      <Strip
        side={side}
        segments={st.bar}
        max={model.axis.max}
        ticks={model.axis.ticks}
        height="h-10 sm:h-11"
        today={atLive ? null : coll ? model.today.collateral : model.today.debt}
        active={active}
        onHover={onHover}
        onPin={onPin}
        label={label}
        motion={motion}
        split={split}
      />
      <SourceLine side={side} segments={st.sources} when={when} isLive={isLive} daily={model.daily} />
    </div>
  );
}

/** Where a bar's length came from, as one line under it: each source and
 *  its figure, which add up to the bar. */
function SourceLine({
  side,
  segments,
  when,
  isLive,
  daily,
}: {
  side: FlowSide;
  segments: FlowSegment[];
  when: string;
  isLive: boolean;
  daily: boolean;
}) {
  const shown = segments.filter((s) => Math.abs(s.value) >= 0.5);
  if (shown.length === 0) return null;
  return (
    <p className="mt-1.5 text-xs leading-relaxed text-rb-500" data-flow-sources={side}>
      {shown.map((s, i) => {
        const word = (t: string) => (i === 0 ? t : t.charAt(0).toLowerCase() + t.slice(1));
        return (
          <span key={s.key}>
            <span className="whitespace-nowrap">
              {word(s.label)}{" "}
              <Prov info={flowSegmentProv(s, side, when, isLive, daily)}>
                <span className="font-medium tabular-nums text-foreground">
                  {s.signed && s.value >= 0.5 ? "+" : ""}
                  {formatFlowUsd(s.value)}
                </span>
              </Prov>
              {i < shown.length - 1 && " ·"}
            </span>{" "}
          </span>
        );
      })}
    </p>
  );
}

/** The Key, drawn inside the panel's Explanation: the hatches the bars
 *  draw, by name, for each kind of exit the position has had over its life.
 *  The segments' tips carry the figures. Where the position has other stops,
 *  the dashed outline too: where each bar ends at the last stop. */
export function FlowsKey({ items, outline, views }: FlowsKeyItems) {
  if (items.length === 0 && !outline && !views) return null;
  return (
    <div className="mt-3 first:mt-0" data-flow-key="">
      <p className="text-xs font-semibold text-foreground">Key</p>
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-rb-500" aria-label="Key">
        {items.map(({ side, s }) => (
          <li key={`${side}:${s.key}`} className="inline-flex items-center gap-1.5">
            <i aria-hidden className="inline-block h-3 w-4 shrink-0 rounded-[2px]" style={fillStyle(side, s)} />
            {s.label}
          </li>
        ))}
        {outline && (
          <li className="inline-flex items-center gap-1.5" data-flow-key-outline="">
            <i aria-hidden className="inline-block h-3 w-4 shrink-0 rounded-[2px] border border-dashed border-rb-500" />
            {outline}
          </li>
        )}
      </ul>
      {views && (
        <p className="mt-1.5 text-xs leading-relaxed text-rb-500" data-flow-key-views="">
          {views}
        </p>
      )}
    </div>
  );
}

/** Where a pip under the pointer sits from the strip's left edge, and what
 *  its tip says. */
type PipOpen = { x: number; text: string };

/** The event pips' tip: one bubble over the strip, held inside the viewport. */
function PipTip({ at }: { at: PipOpen }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [dx, setDx] = useState(0);
  useLayoutEffect(() => {
    const b = ref.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const left = r.left - dx;
    const right = r.right - dx;
    setDx(left < 8 ? 8 - left : right > vw - 8 ? vw - 8 - right : 0);
    // Measured once per position of the tip; `dx` is this render's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at.x, at.text]);
  return (
    <span
      ref={ref}
      role="tooltip"
      data-prov-hidden=""
      className="pointer-events-none absolute bottom-full z-50 mb-1.5 whitespace-nowrap rounded-lg border px-2 py-1 text-xs font-medium tabular-nums text-foreground shadow-lg"
      style={{
        left: at.x,
        transform: `translateX(calc(-50% + ${dx}px))`,
        background: "var(--rb-tooltip-bg)",
        borderColor: "var(--rb-tooltip-border)",
      }}
    >
      {at.text}
    </span>
  );
}

/** The shared axis's labels, over the first bar. Below the sm breakpoint an
 *  axis of more than five labels keeps the first, the last and every other
 *  one between that sits two steps clear of the last ("$12.5M$15.0M" ran
 *  together at 390px). */
function AxisLabels({ model }: { model: FlowModel }) {
  const last = model.axis.ticks.length - 1;
  const phoneHidden = (i: number) => last > 4 && i !== 0 && i !== last && (i % 2 === 1 || last - i < 2);
  return (
    <div className="relative mb-1 h-4 text-[11px] tabular-nums text-rb-500" aria-hidden data-prov-exempt="">
      {model.axis.ticks.map((t, i) => {
        const at = t / model.axis.max;
        return (
          <span
            key={t}
            className={`absolute top-0${phoneHidden(i) ? " max-sm:hidden" : ""}`}
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

/** Where the Lifetime view reads its series: the family's route
 *  (`/api/spark/flows/series`) and the position's parameters. */
export type FlowSeriesSource = { path: string; params: Record<string, string> };

/** The two views (rails-ops reference/lifetime-flows-scrubber.md): the bars,
 *  cut to the last WINDOW_ACTIVE_DAYS active days, and Lifetime, collateral
 *  and debt per week or month from the open. The bars take the busy
 *  treatment (lib/shared/flows-busy.ts) where their window is busy. */
export function LifetimeFlowsScrubber({
  timeline,
  healthThreshold,
  series,
}: {
  timeline: FlowTimeline;
  /** The account's liquidation threshold now, for Lifetime's health line. */
  healthThreshold?: number | null;
  /** The family's series route; absent, Lifetime bins the timeline's own day
   *  rows (a page that holds them all, Sky Savings). */
  series?: FlowSeriesSource;
}) {
  const model = useMemo(() => buildFlowModel(timeline), [timeline]);
  const from = model ? windowFromDay(model.eventDays) : 0;
  const bars = useMemo(() => (model ? windowModel(model, from) : null), [model, from]);
  const busy = bars ? isBusy(bars) : false;
  const [view, setView] = useState<"bars" | "lifetime">("bars");
  const ledgerNote = useContext(FlowsLedgerNoteContext);
  const reportKey = useContext(FlowsKeyContext);
  const [hatches, setHatches] = useState<Omit<FlowsKeyItems, "views" | "explain"> | null>(null);

  // Lifetime's series: read on first opening, from the family's route, or
  // binned here from the page's rows.
  const startDay = model ? model.start / DAY_MS : 0;
  const bin: SeriesBin = model ? lifetimeBinFor((timeline.today ?? startDay + model.liveStop) - startDay) : "week";
  const [lifetime, setLifetime] = useState<{ series: FlowBinSeries | null; failed: boolean } | null>(null);
  const seriesKey = series ? `${series.path}?${new URLSearchParams(series.params).toString()}&bin=${bin}` : null;
  useEffect(() => setLifetime(null), [seriesKey, timeline]);
  useEffect(() => {
    if (view !== "lifetime" || lifetime) return;
    if (!series) {
      const input = binInputFromTimeline(timeline);
      setLifetime({ series: input ? binSeries(input, bin) : null, failed: !input });
      return;
    }
    const ctl = new AbortController();
    fetchFlowBinSeries(series.path, series.params, bin, ctl.signal)
      .then((s) => setLifetime({ series: s, failed: false }))
      .catch((err) => {
        if (ctl.signal.aborted) return;
        console.warn("Lifetime flows series not read:", err);
        setLifetime({ series: null, failed: true });
      });
    return () => ctl.abort();
    // `seriesKey` stands for `series`, which a caller may build afresh each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, lifetime, seriesKey, timeline, bin]);

  const words = useMemo(() => (bars && model ? viewWords(model, bars, from, bin) : null), [model, bars, from, bin]);
  useEffect(() => {
    if (!words) return;
    const drawn = view === "bars" && !busy ? hatches : null;
    reportKey?.({
      items: drawn?.items ?? [],
      outline: drawn?.outline ?? null,
      views: words.key,
      explain: words.explain,
    });
  }, [reportKey, view, busy, hatches, words]);
  useEffect(() => () => reportKey?.(null), [reportKey]);
  useEffect(() => {
    if (view === "lifetime") ledgerNote?.(null);
  }, [view, ledgerNote]);

  if (!model || !bars || !words) return null;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 text-xs tabular-nums text-rb-500" data-flow-window-range="">
          {words.range}
        </p>
        <button
          type="button"
          aria-pressed={view === "lifetime"}
          onClick={() => setView((v) => (v === "lifetime" ? "bars" : "lifetime"))}
          className={`${CTRL_GHOST} ${view === "lifetime" ? `${CTRL_ON} ${CTRL_ON_HOVER}` : CTRL_OFF} h-8 shrink-0 rounded-md px-2.5 text-xs font-semibold`}
          data-flow-lifetime-toggle=""
        >
          Lifetime
        </button>
      </div>
      {view === "lifetime" ? (
        <LifetimeOverTime
          model={model}
          series={lifetime?.series ?? null}
          failed={lifetime?.failed ?? false}
          windowFrom={from > 0 ? startDay + from : null}
          healthThreshold={healthThreshold ?? null}
        />
      ) : busy ? (
        <BusyFlows model={bars} onLedgerNote={ledgerNote ?? undefined} />
      ) : (
        <ScrubberBody model={bars} onKey={setHatches} />
      )}
    </div>
  );
}

/** The header's window, and the Key's and the Explanation's line on which
 *  view is which. */
function viewWords(
  model: FlowModel,
  bars: FlowModel,
  from: number,
  bin: SeriesBin,
): { range: string; key: string; explain: string } {
  const closed = !(model.heldAt[model.heldAt.length - 1] ?? []).some((h) => (h.amount ?? 0) > 0);
  const opens = longDay(dayStart(bars, 0));
  const ends = closed ? `close, ${longDay(dayStart(model, model.lastDay))}` : "today";
  const days = bars.eventDays.length;
  const range = `${opens} – ${ends} · ${days.toLocaleString("en-US")} active day${days === 1 ? "" : "s"}`;
  const hasDebt = model.buckets.some((b) => b.side === "debt");
  const what = hasDebt
    ? `${model.labels.collateral.toLowerCase()} and ${model.labels.debt.toLowerCase()}`
    : model.labels.collateral.toLowerCase();
  const barsCover =
    from > 0 ? `the last ${WINDOW_ACTIVE_DAYS} active days, from ${opens}` : `every active day since ${opens}`;
  return {
    range,
    key: `Bars: ${barsCover} · Lifetime: ${what} by ${bin} since the open`,
    explain:
      `The bars cover ${from > 0 ? `the last ${WINDOW_ACTIVE_DAYS} days with events, from ${opens}, and start with what was held as it opens` : `every day with events since ${opens}`}; ` +
      `Lifetime draws ${what} at the end of each ${bin} since the open, at the daily prices the index records` +
      `${from > 0 ? ", with the bars' window shaded" : ""}, and leaves a gap where a held asset has no price that ${bin}.`,
  };
}

function ScrubberBody({
  model,
  onKey,
}: {
  model: FlowModel;
  /** The Key's hatches and outline, for the panel's Explanation. */
  onKey: (key: Omit<FlowsKeyItems, "views" | "explain"> | null) => void;
}) {
  const [stop, setStop] = useState(model.liveStop);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pip, setPip] = useState<PipOpen | null>(null);
  const pipRef = useRef<HTMLDivElement>(null);
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

  // The date tip rides the handle while it is dragged.
  useEffect(() => {
    if (!dragging) return;
    const up = () => setDragging(false);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging]);

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
  const hasDebt = model.buckets.some((b) => b.side === "debt");
  // The key: each kind of exit the position has had, from the whole history.
  const keyItems = useMemo(() => {
    const end = stateAt(model, model.liveStop);
    const seen = new Set<string>();
    const out: { side: FlowSide; s: FlowSegment }[] = [];
    for (const side of ["collateral", "debt"] as const)
      for (const seg of end[side].bar) {
        const id = `${seg.label}|${seg.tone === "exit" ? side : seg.tone}`;
        if (seg.fill !== "out" || !(seg.value >= 0.5) || seen.has(id)) continue;
        seen.add(id);
        out.push({ side, s: seg });
      }
    return out;
  }, [model]);
  // Every stop: the headline icons and each segment's tip list the assets.
  const assets = useMemo(() => assetsAt(model, stop), [model, stop]);
  const active = pinned ?? hover;
  const pin = (k: string) => setPinned((p) => (p === k ? null : k));
  // Closed: nothing held after the last event, so the last stop is its close.
  const closed = !(model.heldAt[model.heldAt.length - 1] ?? []).some((h) => (h.amount ?? 0) > 0);
  // A closed position's last stop is stated as the close: its day, its prices.
  const atClose = s.isLive && closed;
  const closeDay = dayStamp(dayStart(model, model.lastDay));
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
  // Receipts read the live stop as the close's where the position closed.
  const liveReceipts = s.isLive && !closed;
  const counter =
    model.totalTxs != null && s.txs != null
      ? `${s.txs.toLocaleString("en-US")} of ${model.totalTxs.toLocaleString("en-US")} transaction${model.totalTxs === 1 ? "" : "s"}`
      : `${s.count.toLocaleString("en-US")} of ${model.totalEvents.toLocaleString("en-US")} event${model.totalEvents === 1 ? "" : "s"}`;
  const repricedHere = s.isLive ? [] : model.repricings.filter((r) => r.day === stop);
  // The Key goes to the panel's Explanation. Its dashed outline, which marks
  // where each bar ends at the last stop, is named wherever there is another stop.
  const keyOutline = model.liveStop > 0 ? (closed ? "Length at close" : "Today's length") : null;
  useEffect(() => {
    onKey({ items: keyItems, outline: keyOutline });
  }, [onKey, keyItems, keyOutline]);
  useEffect(() => () => onKey(null), [onKey]);
  // The ledger under the panel shows the last stop; say so while the slider is elsewhere.
  const ledgerNote = useContext(FlowsLedgerNoteContext);
  const ledgerText = s.isLive ? null : closed ? "Shows the position at close" : "Shows the position today";
  useEffect(() => {
    ledgerNote?.(ledgerText);
  }, [ledgerNote, ledgerText]);
  useEffect(() => () => ledgerNote?.(null), [ledgerNote]);
  // A pip's tip: the day and the timeline's names for its events.
  const pipText = (t: FlowModel["ticks"][number]) =>
    `${dayStamp(dayStart(model, t.day))}${t.kinds.length ? `: ${t.kinds.join(", ")}` : ""}`;
  const pipAt = (clientX: number): PipOpen | null => {
    const el = pipRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    let best: FlowModel["ticks"][number] | null = null;
    let bestD = Infinity;
    for (const t of model.ticks) {
      const d = Math.abs((t.day / model.liveStop) * r.width - (clientX - r.left));
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best && bestD <= 8 ? { x: (best.day / model.liveStop) * r.width, text: pipText(best) } : null;
  };
  // A tap elsewhere closes a pip's tip.
  useEffect(() => {
    if (!pip) return;
    const away = (e: PointerEvent) => {
      if (!pipRef.current?.contains(e.target as Node)) setPip(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [pip]);
  const tickHere = model.ticks.find((t) => t.day === stop);
  const btn = `${CTRL_GHOST} ${CTRL_OFF} size-11 shrink-0 rounded-md sm:size-9`;
  const go = (to: number) => {
    halt();
    setStop(to);
  };
  return (
    <div className="text-sm">
      <p className="mb-3 font-semibold tabular-nums text-foreground" aria-live="polite">
        {dateLine}
      </p>
      <SideBlock
        side="collateral"
        st={s.collateral}
        model={model}
        isLive={liveReceipts}
        atLive={s.isLive}
        active={active}
        onHover={setHover}
        onPin={pin}
        motion={motion}
        when={when}
        assets={assets}
        first
      />
      {/* A one-sided position (savings, a lender) names no debt bucket and
          draws a single bar. */}
      {hasDebt && (
        <SideBlock
          side="debt"
          st={s.debt}
          model={model}
          isLive={liveReceipts}
          atLive={s.isLive}
          active={active}
          onHover={setHover}
          onPin={pin}
          motion={motion}
          when={when}
          assets={assets}
          first={false}
        />
      )}

      <div className="relative mt-3">
        {/* Event pips over the line, coloured by the side each event moved.
            Hovering or tapping one names its day's events; the keyboard hears
            the same through the slider's value. */}
        <div
          ref={pipRef}
          className="relative mx-2 h-4 sm:h-3"
          data-flow-pips=""
          onPointerMove={(e) => e.pointerType === "mouse" && setPip(pipAt(e.clientX))}
          onPointerLeave={(e) => e.pointerType === "mouse" && setPip(null)}
          onClick={(e) => setPip(pipAt(e.clientX))}
        >
          <div aria-hidden>
            {model.ticks.map((t, i) => (
              <i
                key={i}
                className="pointer-events-none absolute bottom-0 h-2.5 w-[2px] rounded-[1px]"
                style={{ left: pct(t.day, model.liveStop), background: TICK[t.tick] }}
              />
            ))}
          </div>
          {pip && <PipTip at={pip} />}
        </div>
        <div className="relative">
          <input
            type="range"
            min={0}
            max={model.liveStop}
            step={1}
            value={stop}
            aria-label="Date"
            aria-valuetext={tickHere?.kinds.length ? `${dateText}: ${tickHere.kinds.join(", ")}` : dateText}
            onChange={(e) => {
              halt();
              setStop(Number(e.target.value));
            }}
            onPointerDown={() => setDragging(true)}
            className="block h-11 w-full cursor-pointer accent-[var(--color-rb-500)] sm:h-7"
          />
          {dragging && (
            <span
              aria-hidden
              data-prov-hidden=""
              className="pointer-events-none absolute bottom-full z-50 -translate-x-1/2 whitespace-nowrap rounded-lg border px-2 py-1 text-xs font-medium tabular-nums text-foreground shadow-lg"
              style={{
                left: `calc(${stop / model.liveStop} * (100% - 16px) + 8px)`,
                background: "var(--rb-tooltip-bg)",
                borderColor: "var(--rb-tooltip-border)",
              }}
            >
              {atClose ? "Close" : s.isLive ? "Today" : dateText}
            </span>
          )}
        </div>
        {/* A marker where an event repriced an asset whose price had gone stale. */}
        {model.repricings.length > 0 && (
          <div className="relative mx-2 h-3">
            {model.repricings.map((r, i) => (
              <span key={i} className="absolute top-0 -translate-x-1/2" style={{ left: pct(r.day, model.liveStop) }}>
                <RevealTip
                  tip={`Repriced ${dayStamp(dayStart(model, r.day))}: ${r.symbol} last priced ${dayStamp(r.from)}`}
                  label={`Repriced ${dayStamp(dayStart(model, r.day))}: ${r.symbol} last priced ${dayStamp(r.from)}`}
                >
                  <span className="block size-2 rotate-45 border border-rb-500" />
                </RevealTip>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-1">
        <button type="button" className={btn} aria-label="Jump to opening" onClick={() => go(0)}>
          <SkipBack size={16} aria-hidden />
        </button>
        <button type="button" className={btn} aria-label="Previous event" onClick={() => go(prevEventDay(model, stop))}>
          <ChevronLeft size={18} aria-hidden />
        </button>
        <button type="button" className={btn} aria-label={playing ? "Pause" : "Play"} onClick={play}>
          {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
        </button>
        <button type="button" className={btn} aria-label="Next event" onClick={() => go(nextEventDay(model, stop))}>
          <ChevronRight size={18} aria-hidden />
        </button>
        <button
          type="button"
          className={btn}
          aria-label={closed ? "Jump to close" : "Jump to today"}
          onClick={() => go(model.liveStop)}
        >
          <SkipForward size={16} aria-hidden />
        </button>
        <span className="ml-auto text-xs tabular-nums text-rb-500" data-prov-exempt="">
          {counter}
        </span>
      </div>

      {(s.stale.length > 0 || repricedHere.length > 0) && (
        <p className="mt-2 text-[11px] leading-snug text-rb-500">
          {repricedHere.map((r) => `${r.symbol} repriced on this day, last priced ${dayStamp(r.from)}. `).join("")}
          {s.stale.length > 0 &&
            `${model.daily ? "No newer price recorded" : "Valued at each asset's last event price"}: ${s.stale
              .map((x) => `${x.symbol} from ${dayStamp(x.pricedAt)}`)
              .join(", ")}.`}
        </p>
      )}
    </div>
  );
}
