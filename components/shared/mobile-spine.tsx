"use client";

// The phone layout of a timeline (rails-ops TO-DO-mobile-timeline.md).
//
// One row DOM serves both widths (ui-jobs 304): under 640px CSS draws each
// event as its spine segment with the T1 row as the caption under the node,
// and a tap opens the card's body inline. On phones one card is open at a
// time; the click handler reads the viewport at click time
// (`isPhoneViewport`) and routes the open state through `SpineViewProvider`.

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PHONE_QUERY } from "@/hooks/useMediaQuery";
import { useTimelineScale } from "@/components/shared/activity-timeline";

/** The key row above the first event: what the left and the right arrows
 *  mean, in the family's words ("to wallet" / "into Trove"). */
export interface SpineKey {
  keyLeft: string;
  keyRight: string;
}

export const DEFAULT_SPINE_KEY: SpineKey = { keyLeft: "to wallet", keyRight: "into position" };

/** True when the viewport is a phone's, read at the moment of a click. */
export function isPhoneViewport(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.(PHONE_QUERY).matches;
}

interface SpineViewState {
  /** The one open card's id, or null. */
  openId: string | null;
  /** Open `id` (closing any other) or close it if it is the open one. `anchor`
   *  is the tapped segment, which holds its place on screen. */
  toggle: (id: string, anchor: HTMLElement) => void;
}

const SpineViewContext = createContext<SpineViewState | null>(null);

/** The phone open state, or null outside a timeline and on a pinned page. */
export function useSpineView(): SpineViewState | null {
  return useContext(SpineViewContext);
}

const cssEscape = (s: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s);

/** Holds the one card open on a phone. When a tap closes a card above the
 *  tapped one, the tapped segment would jump up by that card's height; the
 *  layout effect scrolls it back to where it was. An opened card that runs
 *  past the bottom of the screen stays where it opened: the visitor scrolls to
 *  read it (Miles, 1 Oct 2026). */
export function SpineViewProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const pending = useRef<{ el: HTMLElement; top: number; id: string } | null>(null);

  const toggle = useCallback((id: string, anchor: HTMLElement) => {
    pending.current = { el: anchor, top: anchor.getBoundingClientRect().top, id };
    setOpenId((cur) => (cur === id ? null : id));
  }, []);

  useLayoutEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    if (!p.el.isConnected) return;
    const drift = p.el.getBoundingClientRect().top - p.top;
    if (Math.abs(drift) >= 1) window.scrollBy(0, drift);
  }, [openId]);

  const value = useMemo(() => ({ openId, toggle }), [openId, toggle]);
  return <SpineViewContext.Provider value={value}>{children}</SpineViewContext.Provider>;
}

/** The caption a row states by default: the event's kind and its moment. The
 *  timeline provides it around each row; a card's `caption` prop overrides it. */
export interface EventCaption {
  kind: string;
  ts: number;
  /** The row's event number (and the last of a one-transaction row's range),
   *  drawn at the row's far left at both widths. */
  n?: number;
  nLast?: number;
}

export const EventCaptionContext = createContext<EventCaption | null>(null);

/** What a timeline row hands its `SpineColumn`: where to report the spoken
 *  legs for the phone control's name. */
export interface SpineRowSlot {
  setLegs: (legs: string | null) => void;
  /** Where the column reports the line it draws down to the next segment
   *  (`spineLineKey`), or null where it draws none, so an opened card can
   *  carry the same line past itself. */
  setLine?: (line: string | null) => void;
}

export const SpineRowContext = createContext<SpineRowSlot | null>(null);

export function useSpineRow(): SpineRowSlot | null {
  return useContext(SpineRowContext);
}

// ── The line between segments ─────────────────────────────────────────────
//
// Each segment's column draws the line from its node down into the next
// node's halo: `var(--card-pad) + 28px` past its own bottom, which is the list's
// 8px gap, the next row's padding and its column's 16px top padding. Two
// things lengthen it in the spine view, and both reach it without a prop:
//
//   - an opened card under the segment carries the same line behind itself,
//     from where the column's line stops to the next segment (`SpineSegment`);
//   - a gap holding market-note markers grows, and the line that ends in that
//     gap is lengthened by the growth through `--mspine-extra`, set on the
//     line element that precedes the gap (`useExtendLineAbove`).
//
// Every such line element carries `data-spine-line`, in the spine view only.

/** The line a column draws, as a key that compares equal across renders:
 *  "d|<colour>" dotted, "s|<colour>" solid. */
export function spineLineKey(dotted: boolean, rgb: string): string {
  return `${dotted ? "d" : "s"}|${rgb}`;
}

/** The inline style a `spineLineKey` stands for. */
export function spineLineStyle(key: string): React.CSSProperties {
  const [kind, rgb] = [key.slice(0, 1), key.slice(2)];
  return kind === "d"
    ? { backgroundImage: `linear-gradient(to bottom, ${rgb} 50%, transparent 50%)`, backgroundSize: "1px 6px" }
    : { backgroundColor: rgb };
}

/** How far a line overshoots the bottom of the row it is drawn in, to reach
 *  the next node's halo. */
export const SPINE_LINE_OVERSHOOT = "calc(-1 * var(--card-pad) - 28px - var(--mspine-extra, 0px))";

/** Lengthen the spine line that ends in this gap by `extra` px: the last
 *  `[data-spine-line]` before `ref` in the timeline. Recomputed when the rows
 *  around it change (a card or a folder opening above it). The desktop list
 *  view's stacked note markers pass `[data-list-line]`, which `SpineColumn`
 *  sets on its line outside the spine view. */
export function useExtendLineAbove(
  ref: React.RefObject<HTMLElement | null>,
  extra: number,
  enabled = true,
  selector = "[data-spine-line]",
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const root = el.closest("[data-timeline-rows-drawn]") ?? document.body;
    let target: HTMLElement | null = null;
    // Both widths' gaps are in the DOM, one of them hidden: only a drawn gap
    // lengthens a drawn line.
    const drawn = (e: HTMLElement) => e.getClientRects().length > 0;
    const apply = () => {
      let found: HTMLElement | null = null;
      if (drawn(el))
        for (const line of root.querySelectorAll<HTMLElement>(selector)) {
          if (el.contains(line)) break;
          if (line.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
            if (drawn(line)) found = line;
          } else break;
        }
      if (found === target) return;
      target?.style.removeProperty("--mspine-extra");
      target = found;
      target?.style.setProperty("--mspine-extra", `${extra}px`);
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true });
    const mq = window.matchMedia(PHONE_QUERY);
    mq.addEventListener?.("change", apply);
    return () => {
      observer.disconnect();
      mq.removeEventListener?.("change", apply);
      target?.style.removeProperty("--mspine-extra");
    };
  }, [ref, extra, enabled, selector]);
}

/** One row above the first event, under the two flanks, below 640px: what a
 *  left arrow and a right arrow mean. It stays true whichever way the first
 *  event moves. */
export function SpineKeyRow({ config }: { config: SpineKey }) {
  const scale = useTimelineScale();
  return (
    <div
      aria-hidden
      className="grid items-center px-1 pb-1 text-xs text-rb-500 sm:hidden"
      style={{ gridTemplateColumns: scale.gridCols }}
    >
      <span className="justify-self-end whitespace-nowrap pr-3">&larr; {config.keyLeft}</span>
      <span />
      <span />
      <span />
      <span className="justify-self-start whitespace-nowrap pl-3">{config.keyRight} &rarr;</span>
    </div>
  );
}

/** A leg amount for a spoken label: grouped, and only as precise as a reader
 *  needs to tell two events apart. */
export function spokenAmount(v: number): string {
  const a = Math.abs(v);
  const digits = a >= 1000 ? 0 : a >= 1 ? 2 : 4;
  return a.toLocaleString("en-US", { maximumFractionDigits: digits });
}
