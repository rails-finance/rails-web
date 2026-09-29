"use client";

// <LifetimeFlowsScrubber> — Lifetime flows as two horizontal bars on one USD
// axis, with a date scrubber (rails-ops TO-DO-ui-jobs §141). Solid is what is
// still there, hatched what has left, dashed what moved no funds. Every figure
// is `stateAt(model, stop)` (lib/shared/flows-timeline.ts); this file only
// draws it. The ledger this summarises stays one click deeper, in the same
// panel (ChainTruthTower's `timeline` slot).

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { RevealTip } from "@/components/shared/reveal-tip";
import { Prov } from "@/components/shared/provenance";
import { flowSegmentProv, flowTotalProv } from "@/lib/shared/flows-timeline-provenance";
import {
  LIQUIDATION_PATTERN,
  REDEMPTION_PATTERN,
  REPAID_PATTERN,
  WITHDRAWN_PATTERN,
} from "@/components/shared/economics-chart-primitives";
import { CTRL_GHOST, CTRL_OFF } from "@/lib/shared/ui-grammar";
import { formatDate, monthShort } from "@/lib/date";
import {
  buildFlowModel,
  dayStart,
  formatFlowUsd,
  nextEventDay,
  prevEventDay,
  spokenUsd,
  stateAt,
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
// the debt. Outflows take the ledger's hatches.
const HUE: Record<FlowSide, { solid: string; light: string; line: string; tint: string }> = {
  collateral: {
    solid: "var(--color-blue-500)",
    light: "var(--color-blue-300)",
    line: "rgba(96, 165, 250, 0.9)",
    tint: "color-mix(in srgb, var(--color-blue-500) 12%, transparent)",
  },
  debt: {
    solid: "var(--color-green-400)",
    light: "#bbf7d0", // green-200
    line: "rgba(74, 222, 128, 0.9)",
    tint: "color-mix(in srgb, var(--color-green-400) 12%, transparent)",
  },
};

function fillStyle(side: FlowSide, s: FlowSegment): CSSProperties {
  const h = HUE[side];
  if (s.fill === "held" || s.fill === "in") return { background: s.light ? h.light : h.solid };
  if (s.fill === "estimate") return { background: h.tint, border: `1.5px dashed ${h.line}` };
  if (s.tone === "liquidation") return { ...LIQUIDATION_PATTERN, boxShadow: "inset 0 0 0 1px rgba(239, 68, 68, 0.9)" };
  if (s.tone === "redemption") return { ...REDEMPTION_PATTERN, boxShadow: "inset 0 0 0 1px rgba(236, 72, 153, 0.9)" };
  return { ...(side === "collateral" ? WITHDRAWN_PATTERN : REPAID_PATTERN), boxShadow: `inset 0 0 0 1px ${h.line}` };
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
          return (
            <span key={s.key} className={`block h-full shrink-0 ${motion}`} style={{ width: pct(s.width, max) }}>
              <RevealTip
                className="h-full w-full"
                tip={
                  <span className="flex items-center gap-2">
                    <span>{s.label}</span>
                    <span className="ml-auto">{formatFlowUsd(s.value)}</span>
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
              <i aria-hidden className="inline-block h-2.5 w-3.5 shrink-0 rounded-[2px]" style={fillStyle(side, s)} />
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
}) {
  const id = `flows-${side}`;
  const coll = side === "collateral";
  const outs = st.bar.filter((s) => s.fill === "out");
  const liquidated = outs.filter((s) => s.tone === "liquidation").reduce((a, s) => a + s.value, 0);
  const repaid = st.out - liquidated;
  const held = st.bar[0];
  const spoken = coll
    ? `Collateral: ${spokenUsd(st.now)} still supplied, of ${spokenUsd(st.total)} that came in; ${spokenUsd(st.out)} has left.`
    : `Debt: ${spokenUsd(st.now)} owed now, of ${spokenUsd(st.total)} owed in all; ${spokenUsd(repaid)} repaid` +
      (liquidated > 0 ? `, ${spokenUsd(liquidated)} liquidated.` : ".");
  const srcSpoken = `${coll ? "Everything that came in" : "Everything that was owed"}, by source: ${st.sources
    .map((s) => `${s.label} ${spokenUsd(s.value)}`)
    .join(", ")}.`;
  return (
    <div className="mt-4 first:mt-3">
      <div className="mb-1.5 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="flex items-baseline gap-2">
          <Prov info={flowSegmentProv(held, side, when, isLive, model.daily)}>
            <span className="text-xl font-semibold tabular-nums text-foreground">{formatFlowUsd(st.now)}</span>
          </Prov>
          <span className="text-xs text-rb-500">{coll ? "collateral now" : "owed now"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs tabular-nums text-rb-500">
            <Prov info={flowTotalProv(side, "in", when)}>
              <span>{formatFlowUsd(st.total)}</span>
            </Prov>
            {coll ? " in, " : " owed, "}
            <Prov info={flowTotalProv(side, "out", when)}>
              <span>{formatFlowUsd(coll ? st.out : repaid)}</span>
            </Prov>
            {coll ? " out" : " repaid"}
            {!coll && liquidated > 0 && (
              <>
                {", "}
                <Prov info={flowTotalProv(side, "liquidated", when)}>
                  <span>{formatFlowUsd(liquidated)}</span>
                </Prov>
                {" liquidated"}
              </>
            )}
          </span>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={`${id}-src`}
            className={`${CTRL_GHOST} ${CTRL_OFF} min-h-9 gap-1 rounded-md px-2 text-xs sm:min-h-7`}
          >
            Where it came from
            <ChevronDown size={14} aria-hidden className={`${motion} ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
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
      />
      <div id={`${id}-src`} hidden={!open} className="mt-2.5">
        {open && (
          <>
            <div className="mb-1 text-[11px] text-rb-500">
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
          </>
        )}
      </div>
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
  const active = pinned ?? hover;
  const pin = (k: string) => setPinned((p) => (p === k ? null : k));
  const dateText = s.isLive ? "Today, live prices" : formatDate(dayStart(model, stop));
  const when = s.isLive ? "now" : `the end of ${dateText}`;
  const total = model.totalEvents;
  const repricedHere = s.isLive ? [] : model.repricings.filter((r) => r.day === stop);
  const btn = `${CTRL_GHOST} ${CTRL_OFF} size-11 shrink-0 rounded-md sm:size-9`;

  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
        <span className="w-full text-xs tabular-nums text-rb-500 sm:w-auto">
          {s.count} of {total} events
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
      />

      <div className="relative mt-2 h-4 text-[11px] tabular-nums text-rb-500" aria-hidden data-prov-exempt="">
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

      {(s.stale.length > 0 || repricedHere.length > 0) && (
        <p className="mt-2 text-[11px] leading-snug text-rb-500">
          {repricedHere.map((r) => `${r.symbol} repriced on this day, last priced ${formatDate(r.from)}. `).join("")}
          {s.stale.length > 0 &&
            `${model.daily ? "No newer price recorded" : "Valued at each asset's last event price"}: ${s.stale
              .map((x) => `${x.symbol} from ${monthYear(x.pricedAt)}`)
              .join(", ")}.`}
        </p>
      )}
      <p className="mt-2 text-[11px] leading-snug text-rb-500">
        Solid is still there, hatched has left, and a dashed fill moved no funds. The dashed outline marks where each
        bar ends today. Flows are valued at the oracle price at their block;{" "}
        {model.daily
          ? "what is held on a day is valued at the last oracle price recorded by that day's end."
          : "between events an asset keeps the price of its last event."}
      </p>
    </div>
  );
}
