"use client";

// The Lifetime flows panel's segment panels (rails-ops
// reference/lifetime-flows-scrubber.md, "A segment's panel"). A click, a tap
// or Enter on a bar's segment (or anywhere on a busy bar's track) opens its
// panel; a second click, Escape, the close button or a click outside closes
// it. From the phone breakpoint up (PHONE_QUERY) the panel is a popover over
// the bar, held inside the viewport; below it, a bottom sheet with a drag
// handle and a close button (mobile-sheet.tsx), and the page does not scroll
// behind it.
//
// The panel is interactive: every figure carries its receipt (<Prov>, inside
// the flows panel's receipts scope, since a portal keeps React context), and
// the token chips filter the timeline where the page offers that. The cursor
// keeps working while a panel is open: the line strip, the ticks and the
// controls do not count as outside, the panel's own arrows step the cursor,
// and the open panel restates its figures at each new date (a segment that
// has no width at the new date closes its panel).
//
// The side's sum is one signed line per component in whole dollars, landing
// on what is held or owed at the date (lib/shared/flows-sum.ts): the printed
// lines add to the printed total.

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { MobileSheet } from "@/components/shared/mobile-sheet";
import { Prov, provInspector } from "@/components/shared/provenance";
import { BreakdownRow } from "@/components/shared/amount-breakdown";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import {
  flowAssetProv,
  flowOpeningProv,
  flowRemainderProv,
  flowSegmentProv,
} from "@/lib/shared/flows-timeline-provenance";
import { apportionDollars, sideSumRows, wholeUsd } from "@/lib/shared/flows-sum";
import type {
  FlowAssetHeld,
  FlowHatch,
  FlowModel,
  FlowSegment,
  FlowSide,
  FlowSideState,
} from "@/lib/shared/flows-timeline";

// ── The bars' fills, and the sum's swatches ─────────────────────────────────

// The position axes' hues (color-grammar §6): blue the supplied side, green
// the debt. Each outflow kind takes its own hatch (standards/lexicon.md).
export const HUE: Record<FlowSide, { solid: string; line: string; hatch: string }> = {
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

export function fillStyle(side: FlowSide, s: FlowSegment): CSSProperties {
  const h = HUE[side];
  if (s.fill !== "out") return { background: h.solid };
  const hatch = s.hatch ?? (s.tone && s.tone !== "exit" ? "forward" : "reverse");
  if (s.tone === "liquidation" || s.tone === "redemption")
    return { ...hatchImage(hatch, TONE_HATCH[s.tone]), boxShadow: `inset 0 0 0 1px ${TONE_LINE[s.tone]}` };
  return { ...hatchImage(hatch, h.hatch), boxShadow: `inset 0 0 0 1px ${h.line}` };
}

/** The inflow swatch in a side's sum: the side's hue, faded, as the towers'
 *  key drew what came in. */
const INFLOW_SWATCH: Record<FlowSide, string> = {
  collateral: "rgba(96, 165, 250, 0.35)",
  debt: "rgba(74, 222, 128, 0.35)",
};

/** A line's swatch in a side's sum: its segment's fill on the bar; an inflow,
 *  which the bar does not draw, the side's faded hue. */
export const sumSwatch =
  (side: FlowSide) =>
  (s: FlowSegment): CSSProperties | null =>
    s.fill === "in" ? { background: INFLOW_SWATCH[side] } : s.fill === "estimate" ? null : fillStyle(side, s);

/** What the panels read of the cursor: the date in words, and the steps. The
 *  view that owns the cursor provides it (Combined, the busy bars, the
 *  scrubber without a line). */
export interface FlowCursor {
  /** The date the figures are at, for "Held at 5 Jul '25": "at 5 Jul '25",
   *  "today (30 Sep '26)", "at close, 28 Jul '26". */
  at: string;
  prev?: () => void;
  next?: () => void;
  canPrev?: boolean;
  canNext?: boolean;
  /** False while the bars are greyed (before their window): no panel opens. */
  live?: boolean;
}
export const FlowCursorContext = createContext<FlowCursor | null>(null);

/** Marks the parts of the panel that move the cursor: a pointer there does
 *  not close an open segment panel. */
export const KEEP_PANEL = { "data-flow-keep-panel": "" } as const;

/** One asset's part of a segment, as the segment's panel lists it. */
export type PanelPart = { symbol: string; usd: number; token?: boolean };

/** Each line's assets in a side's sum, by its segment's key, largest first:
 *  the flows' per-asset running totals, and what was held as the bars'
 *  window opens. */
export function panelSplit(
  model: FlowModel,
  side: FlowSide,
  flows: Map<string, { symbol: string; usd: number }[]>,
): Map<string, PanelPart[]> {
  const split = new Map<string, PanelPart[]>();
  for (const b of model.buckets) if (b.side === side) split.set(b.key, flows.get(b.key) ?? []);
  if (model.opening)
    split.set(
      `${side}-opening`,
      model.opening.held
        .filter((h) => h.side === side && h.usd >= 0.5)
        .map((h) => ({ symbol: h.symbol, usd: h.usd, token: h.amount != null }))
        .sort((x, y) => y.usd - x.usd),
    );
  return split;
}

/** Rows a segment's panel lists before it counts the rest. */
const PANEL_ROWS = 6;
const POP_W = 336;
const GUTTER = 12;

/** The popover or the sheet around a panel's body. `anchor` finds the
 *  segment (or the busy track) the panel belongs to. */
export function FlowPanelShell({
  label,
  anchor,
  onClose,
  focusOnOpen,
  children,
}: {
  label: string;
  anchor: () => HTMLElement | null;
  onClose: () => void;
  /** Opened from the keyboard: focus moves into the panel. */
  focusOnOpen: boolean;
  children: ReactNode;
}) {
  const phone = useMediaQuery(PHONE_QUERY);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const latest = useRef({ anchor, onClose });
  useLayoutEffect(() => {
    latest.current = { anchor, onClose };
  });

  // Placed over the segment, clamped inside the viewport; under it where the
  // room above is short. Re-placed on scroll, resize and each render (the
  // segments move as the cursor does, after their 200ms transition).
  useLayoutEffect(() => {
    if (phone) return;
    const place = () => {
      const a = latest.current.anchor();
      const el = ref.current;
      if (!a || !el) return;
      const r = a.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const width = Math.min(POP_W, vw - GUTTER * 2);
      const h = el.offsetHeight;
      const mid = r.left + r.width / 2;
      const left = Math.min(Math.max(GUTTER, mid - width / 2), vw - GUTTER - width);
      const above = r.top - 8 - h;
      const top = above >= GUTTER || r.bottom + 8 + h > vh - GUTTER ? Math.max(GUTTER, above) : r.bottom + 8;
      setPos((p) => (p && p.top === top && p.left === left && p.width === width ? p : { top, left, width }));
    };
    place();
    const t = window.setTimeout(place, 230);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  });

  // A click outside closes it: outside the panel, its segment, the controls
  // that move the cursor, and the receipt the inspector opened from it.
  useEffect(() => {
    if (phone) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || ref.current?.contains(t) || latest.current.anchor()?.contains(t)) return;
      if (t.closest?.("[data-flow-keep-panel], [data-prov-chrome], [aria-modal='true']")) return;
      latest.current.onClose();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [phone]);

  // Escape closes it and returns focus to its segment. While the provenance
  // inspector is armed, Escape is the inspector's (its receipt, then the mode).
  useEffect(() => {
    if (phone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || provInspector.getArmed()) return;
      e.preventDefault();
      const a = latest.current.anchor();
      latest.current.onClose();
      a?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [phone]);

  // Once, as it opens, after it is placed (a hidden panel takes no focus).
  const focused = useRef(false);
  useEffect(() => {
    if (!focusOnOpen || phone || !pos || focused.current) return;
    focused.current = true;
    ref.current?.focus();
  }, [focusOnOpen, phone, pos]);

  if (typeof document === "undefined") return null;
  if (phone)
    return (
      <MobileSheet label={label} mode="live" dismiss onClose={onClose}>
        <div data-flow-panel="sheet">{children}</div>
      </MobileSheet>
    );
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      data-flow-panel="popover"
      className="fixed z-50 max-h-[calc(100vh-24px)] overflow-y-auto rounded-2xl border p-3 text-xs text-foreground shadow-lg outline-none"
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        width: pos?.width ?? POP_W,
        visibility: pos ? undefined : "hidden",
        background: "var(--rb-tooltip-bg)",
        borderColor: "var(--rb-tooltip-border)",
      }}
    >
      <button
        type="button"
        onClick={() => {
          const a = latest.current.anchor();
          onClose();
          a?.focus();
        }}
        aria-label="Close"
        className="absolute right-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-md text-rb-500 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rb-400"
        data-flow-panel-close=""
      >
        <X size={14} aria-hidden />
      </button>
      {children}
    </div>,
    document.body,
  );
}

/** The panel's first line: the date its figures are at, with the cursor's
 *  steps either side. */
function PanelDate({ cursor }: { cursor: FlowCursor | null }) {
  if (!cursor) return null;
  const words = cursor.at.charAt(0).toUpperCase() + cursor.at.slice(1);
  const btn =
    "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-rb-500 hover:text-foreground disabled:opacity-30 disabled:hover:text-rb-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rb-400";
  return (
    <div className="-ml-1 mb-1.5 flex items-center gap-0.5 pr-7 text-rb-500" data-flow-panel-date="">
      {cursor.prev && (
        <button
          type="button"
          className={btn}
          aria-label="Previous date"
          disabled={!cursor.canPrev}
          onClick={cursor.prev}
        >
          <ChevronLeft size={14} aria-hidden />
        </button>
      )}
      <span className="tabular-nums" aria-live="polite">
        {words}
      </span>
      {cursor.next && (
        <button type="button" className={btn} aria-label="Next date" disabled={!cursor.canNext} onClick={cursor.next}>
          <ChevronRight size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}

/** A segment's panel body: the date its figures are at, then its side's sum,
 *  the same signed table whichever segment opened it, with that segment's row
 *  highlighted and its assets open beneath it; then the basis line. On the
 *  busy bars (`seg` the held segment) the total's row is the highlighted one. */
export function SegmentPanelBody({
  side,
  seg,
  split,
  st,
  held,
  when,
  isLive,
  daily,
  swatch,
  words,
  onPick,
}: {
  side: FlowSide;
  seg: FlowSegment;
  /** Each line's assets by its segment's key, largest first (the window's
   *  opening under `${side}-opening`). */
  split: Map<string, PanelPart[]>;
  st: FlowSideState;
  /** The side's assets held or owed at the date. */
  held: FlowAssetHeld[];
  when: string;
  isLive: boolean;
  daily: boolean;
  /** Each line's swatch: the segment's own fill. */
  swatch: (s: FlowSegment) => CSSProperties | null;
  /** The balancing item's name, for the basis line. */
  words: { rest: string };
  /** Moves the panel to another segment the bar draws (a click on its row). */
  onPick?: (key: string) => void;
}) {
  const cursor = useContext(FlowCursorContext);
  return (
    <div className="flex flex-col" data-flow-tip={side}>
      <PanelDate cursor={cursor} />
      <SideSumTable
        side={side}
        st={st}
        seg={seg}
        split={split}
        held={held}
        when={when}
        isLive={isLive}
        daily={daily}
        swatch={swatch}
        words={words}
        onPick={onPick}
      />
    </div>
  );
}

/** The row key of the side's total, highlighted for the held segment. */
const TOTAL = "total";

/** The side's sum: one signed line per component, the total under a rule
 *  with what makes it up, asset by asset, and the basis line under it. A line
 *  with assets opens them beneath it behind a chevron. */
function SideSumTable({
  side,
  st,
  seg,
  split,
  held,
  when,
  isLive,
  daily,
  swatch,
  words,
  onPick,
}: {
  side: FlowSide;
  st: FlowSideState;
  seg: FlowSegment;
  split: Map<string, PanelPart[]>;
  held: FlowAssetHeld[];
  when: string;
  isLive: boolean;
  daily: boolean;
  swatch: (s: FlowSegment) => CSSProperties | null;
  words: { rest: string };
  onPick?: (key: string) => void;
}) {
  const cursor = useContext(FlowCursorContext);
  const sum = sideSumRows(st);
  const coll = side === "collateral";
  const heldWord = coll ? "Held" : "Owed";
  const at = cursor?.at ?? (isLive ? "now" : `at ${when}`);
  const heldAssets = held.filter((h) => h.usd >= 0.5 || (h.amount ?? 0) > 0);
  const heldDollars = apportionDollars(
    heldAssets.map((h) => h.usd),
    sum.total.dollars,
  );
  const rest = words.rest.toLowerCase();
  // The clicked segment's row; a click on another row moves it.
  const opened = seg.fill === "held" ? TOTAL : seg.key;
  const [hl, setHl] = useState(opened);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([opened]));
  useEffect(() => {
    setHl(opened);
    setExpanded(new Set([opened]));
  }, [opened]);
  const partsOf = (key: string): PanelPart[] => split.get(key) ?? [];
  const toggle = (key: string) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const pick = (key: string, onBar: boolean) => {
    setHl(key);
    setExpanded((cur) => new Set(cur).add(key));
    if (onBar && onPick && key !== seg.key) onPick(key);
  };
  const provFor = (kind: string, s: FlowSegment) =>
    kind === "rest"
      ? flowRemainderProv(s.label, side, when)
      : kind === "opening"
        ? flowOpeningProv(s.label, side)
        : flowSegmentProv(s, side, when, isLive, daily);
  const heldSeg = st.bar.find((b) => b.fill === "held");
  return (
    <>
      <div className="flex flex-col tabular-nums" data-flow-tip-sum={side}>
        {sum.lines.map((l) => {
          const parts = l.kind === "rest" ? [] : partsOf(l.key);
          const open = parts.length > 0 && expanded.has(l.key);
          const listed = parts.slice(0, PANEL_ROWS);
          const dollars = open
            ? apportionDollars(
                parts.map((p) => Math.abs(p.usd)),
                Math.abs(l.dollars),
              )
            : [];
          return (
            <BreakdownRow
              key={l.key}
              rowKey={`${side}-${l.key}`}
              label={l.label}
              name={l.label}
              sign={l.sign}
              swatch={l.kind === "rest" ? null : swatch(l.seg)}
              value={{ text: l.amount, prov: provFor(l.kind, l.seg) }}
              parts={listed.map((p, i) => ({
                symbol: p.symbol,
                icon: p.token !== false,
                usd: {
                  text: wholeUsd(dollars[i] ?? 0),
                  prov: flowAssetProv(p.symbol, l.seg, side, when, isLive, daily),
                },
              }))}
              more={Math.max(0, parts.length - PANEL_ROWS)}
              open={open}
              onToggle={() => toggle(l.key)}
              highlighted={hl === l.key}
              onSelect={() => pick(l.key, l.kind === "out")}
              attrs={{ "data-flow-sum-line": l.kind, "data-flow-sum-key": l.key }}
            />
          );
        })}
        <BreakdownRow
          rowKey={`${side}-total`}
          label={`${heldWord} ${at}`}
          swatch={swatch(sum.total.seg)}
          value={{ text: sum.total.amount, prov: flowSegmentProv(sum.total.seg, side, when, isLive, daily) }}
          parts={heldAssets.map((h, i) => ({
            symbol: h.symbol,
            icon: h.amount != null,
            usd: {
              text: wholeUsd(heldDollars[i]),
              prov: flowAssetProv(h.symbol, sum.total.seg, side, when, isLive, daily),
            },
          }))}
          open
          total
          highlighted={hl === TOTAL}
          onSelect={() => {
            setHl(TOTAL);
            if (onPick && heldSeg && heldSeg.key !== seg.key && heldSeg.width > 0) onPick(heldSeg.key);
          }}
          attrs={{ "data-flow-sum-line": "total" }}
        />
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-rb-500" data-flow-panel-basis="">
        Each flow is valued at the price on its own day. {words.rest} is the remainder, {coll ? "held" : "owed"} {at}{" "}
        less the lines above it
        {rest === "interest earned" ? "." : ", so it holds price changes and interest together."}
      </p>
    </>
  );
}
