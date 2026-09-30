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
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import {
  flowAssetProv,
  flowOpeningProv,
  flowRemainderProv,
  flowSegmentProv,
} from "@/lib/shared/flows-timeline-provenance";
import { apportionDollars, sideSumRows, wholeUsd } from "@/lib/shared/flows-sum";
import type { FlowAssetHeld, FlowHatch, FlowSegment, FlowSide, FlowSideState } from "@/lib/shared/flows-timeline";

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

/** A segment's panel body: its name and figure, its assets, then the side's
 *  sum. A busy bar's panel (`seg` the held segment, `busy`) names the side. */
export function SegmentPanelBody({
  side,
  seg,
  title,
  parts,
  st,
  held,
  when,
  isLive,
  daily,
  swatch,
  words,
}: {
  side: FlowSide;
  seg: FlowSegment;
  /** The panel's heading: the segment's name, or on a busy bar the side's. */
  title: string;
  /** The segment's assets, largest first; none on a busy bar. */
  parts: PanelPart[];
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
}) {
  const cursor = useContext(FlowCursorContext);
  const partDollars = apportionDollars(
    parts.map((p) => p.usd),
    Math.round(seg.value),
  );
  const shownParts = parts.slice(0, PANEL_ROWS);
  return (
    <div className="flex flex-col gap-1" data-flow-tip={side}>
      <PanelDate cursor={cursor} />
      <div className="flex items-baseline gap-2 pr-6 text-sm font-semibold">
        <span>{title}</span>
        <span className="ml-auto tabular-nums">
          <Prov info={flowSegmentProv(seg, side, when, isLive, daily)}>{wholeUsd(seg.value)}</Prov>
        </span>
      </div>
      {shownParts.length > 0 && (
        <ul className="flex flex-col gap-0.5" data-flow-panel-assets="">
          {shownParts.map((p, i) => (
            <li key={p.symbol} className="flex items-center gap-1.5 text-rb-500">
              {p.token !== false && <TokenChipIcon symbol={p.symbol} size={14} />}
              <span>{p.symbol}</span>
              <span className="ml-auto tabular-nums">
                <Prov info={flowAssetProv(p.symbol, seg, side, when, isLive, daily)}>{wholeUsd(partDollars[i])}</Prov>
              </span>
            </li>
          ))}
          {parts.length > PANEL_ROWS && <li className="text-rb-500">{parts.length - PANEL_ROWS} more</li>}
        </ul>
      )}
      <SideSumTable
        side={side}
        st={st}
        held={held}
        when={when}
        isLive={isLive}
        daily={daily}
        swatch={swatch}
        words={words}
      />
    </div>
  );
}

/** The side's sum: one signed line per component, the total under a rule,
 *  and what makes up the total, asset by asset. */
function SideSumTable({
  side,
  st,
  held,
  when,
  isLive,
  daily,
  swatch,
  words,
}: {
  side: FlowSide;
  st: FlowSideState;
  held: FlowAssetHeld[];
  when: string;
  isLive: boolean;
  daily: boolean;
  swatch: (s: FlowSegment) => CSSProperties | null;
  words: { rest: string };
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
  // A family that names what each side's remainder holds (Liquity) states it
  // on the balancing item.
  const restSeg = st.sources.find((x) => x.fill === "estimate");
  const sw = (s: FlowSegment | null) => {
    const style = s ? swatch(s) : null;
    return <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-[2px]" style={style ?? undefined} />;
  };
  const provFor = (kind: string, seg: FlowSegment) =>
    kind === "rest"
      ? flowRemainderProv(seg.label, side, when, seg.note)
      : kind === "opening"
        ? flowOpeningProv(seg.label, side)
        : flowSegmentProv(seg, side, when, isLive, daily);
  return (
    <div className="mt-1.5 border-t pt-1.5" style={{ borderColor: "var(--rb-tooltip-border)" }}>
      <p className="mb-1 text-[11px] leading-snug text-rb-500" data-flow-panel-basis="">
        {restSeg?.basis ?? "Each flow is valued at the price on its own day."} {words.rest} is the remainder,{" "}
        {coll ? "held" : "owed"} {at} less the lines above it
        {restSeg?.note
          ? `, so it is ${restSeg.note}.`
          : rest === "interest earned"
            ? "."
            : ", so it holds price changes and interest together."}
      </p>
      <table className="w-full border-collapse tabular-nums" data-flow-tip-sum={side}>
        <tbody>
          {sum.lines.map((l) => (
            <tr key={l.key} data-flow-sum-line={l.kind}>
              <td className="w-3 py-0.5 pr-0.5 text-right align-middle text-rb-500">{l.sign}</td>
              <td className="w-4 py-0.5 align-middle">{sw(l.kind === "rest" ? null : l.seg)}</td>
              <td className="py-0.5 pr-2 text-rb-500">{l.label}</td>
              <td className="whitespace-nowrap py-0.5 text-right">
                <Prov info={provFor(l.kind, l.seg)}>{l.amount}</Prov>
              </td>
            </tr>
          ))}
          <tr className="font-semibold" data-flow-sum-line="total">
            <td className="border-t py-0.5" style={{ borderColor: "var(--rb-tooltip-border)" }} />
            <td className="border-t py-0.5 align-middle" style={{ borderColor: "var(--rb-tooltip-border)" }}>
              {sw(sum.total.seg)}
            </td>
            <td className="border-t py-0.5 pr-2" style={{ borderColor: "var(--rb-tooltip-border)" }}>
              {heldWord} {at}
            </td>
            <td
              className="whitespace-nowrap border-t py-0.5 text-right"
              style={{ borderColor: "var(--rb-tooltip-border)" }}
            >
              <Prov info={flowSegmentProv(sum.total.seg, side, when, isLive, daily)}>{sum.total.amount}</Prov>
            </td>
          </tr>
          {heldAssets.map((h, i) => (
            <tr key={`${h.side}:${h.symbol}`} className="text-rb-500" data-flow-sum-line="asset">
              <td />
              <td />
              <td className="py-0.5 pr-2">
                <span className="inline-flex items-center gap-1.5 pl-2">
                  {h.amount != null && <TokenChipIcon symbol={h.symbol} size={14} />}
                  {h.symbol}
                </span>
              </td>
              <td className="whitespace-nowrap py-0.5 text-right">
                <Prov info={flowAssetProv(h.symbol, sum.total.seg, side, when, isLive, daily)}>
                  {wholeUsd(heldDollars[i])}
                </Prov>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
