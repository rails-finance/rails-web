"use client";

// The phone spine view of a timeline (rails-ops TO-DO-mobile-timeline.md).
//
// On a phone the timeline draws each event as its spine segment with a
// caption, and a tap opens the event's card inline, one at a time. A page
// opts in by passing `mobileSpine` to its timeline; there the toolbar's
// "Timeline | List" switch picks the view (`SpineViewSwitch`), saved as
// `mobileSpine` in the display preferences, and `?timeline=spine` or
// `?timeline=list` overrides the saved choice for one page. List is the
// default. On a page that has not opted in, nothing here renders.
//
// The view is a root attribute plus CSS. The timeline root carries
// `data-mview="spine"` while the view is on, and every layout change is a
// `mspine:max-sm:` class (the `mspine` variant is in app/globals.css). The
// choice and the width are read after mount, so the server and the first
// client render are the list view and hydrate alike; an inline script in
// app/layout.tsx marks `<html data-timeline-view="spine">` before first paint,
// and CSS hides the opted-in list's rows until the spine view replaces them.
// At ≥640px the view never turns on, so desktop is unchanged.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { useTimelineScale } from "@/components/shared/activity-timeline";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import { CTRL_GHOST } from "@/lib/shared/ui-grammar";

/** What a family passes to turn the phone spine view on for its timeline. */
export interface MobileSpineConfig {
  /** The key row above the first event: what the left and the right arrows
   *  mean, in the family's words ("to wallet" / "into Trove"). */
  keyLeft: string;
  keyRight: string;
}

/** True when the page opted in, the reader chose the spine view (or the URL
 *  did) and the viewport is a phone. */
export function useSpineViewActive(config: MobileSpineConfig | undefined): boolean {
  const flag = useTimelineDisplay().spineView;
  const phone = useMediaQuery(PHONE_QUERY);
  return !!config && flag && phone;
}

interface SpineViewState {
  /** The one open card's id, or null. */
  openId: string | null;
  /** Open `id` (closing any other) or close it if it is the open one. `anchor`
   *  is the tapped segment, which holds its place on screen. */
  toggle: (id: string, anchor: HTMLElement) => void;
}

const SpineViewContext = createContext<SpineViewState | null>(null);

/** The spine view's state, or null while the list view is showing. */
export function useSpineView(): SpineViewState | null {
  return useContext(SpineViewContext);
}

const cssEscape = (s: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s);

/** Holds the one open card. When a tap closes a card above the tapped one, the
 *  tapped segment would jump up by that card's height; the layout effect
 *  scrolls it back to where it was, then reveals the opened card as far as it
 *  can while the segment stays on screen. */
export function SpineViewProvider({ active, children }: { active: boolean; children: ReactNode }) {
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
    if (openId !== p.id) return;
    const region = document.querySelector<HTMLElement>(`[data-spine-card="${cssEscape(p.id)}"]`);
    if (!region) return;
    const overflow = region.getBoundingClientRect().bottom - window.innerHeight + 12;
    const room = p.el.getBoundingClientRect().top - 8;
    const by = Math.min(overflow, room);
    if (by <= 0) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollBy({ top: by, behavior: reduced ? "auto" : "smooth" });
  }, [openId]);

  // Leaving the view (the viewport widened) drops the open card, so a return
  // to it starts closed.
  useEffect(() => {
    if (!active) setOpenId(null);
  }, [active]);

  const value = useMemo(() => (active ? { openId, toggle } : null), [active, openId, toggle]);
  return <SpineViewContext.Provider value={value}>{children}</SpineViewContext.Provider>;
}

/** The caption a row states by default: the event's kind and its moment. The
 *  timeline provides it around each row; a card's `caption` prop overrides it. */
export interface EventCaption {
  kind: string;
  ts: number;
}

export const EventCaptionContext = createContext<EventCaption | null>(null);

/** What a card in the spine view hands its `SpineColumn`: the caption to
 *  draw on the line, and where to report the spoken legs for the card
 *  button's name. */
export interface SpineRowSlot {
  caption: ReactNode;
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
    const apply = () => {
      let found: HTMLElement | null = null;
      for (const line of root.querySelectorAll<HTMLElement>(selector)) {
        if (el.contains(line)) break;
        if (line.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) found = line;
        else break;
      }
      if (found === target) return;
      target?.style.removeProperty("--mspine-extra");
      target = found;
      target?.style.setProperty("--mspine-extra", `${extra}px`);
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      target?.style.removeProperty("--mspine-extra");
    };
  }, [ref, extra, enabled, selector]);
}

/** One segment of the spine view: the column and its caption as one button,
 *  and, while open, the card under it as a region labelled by the caption.
 *  Event cards, run and folder rows draw through it. A segment with nothing to
 *  open (the boundary row) passes no `onToggle` and draws as plain text. */
export function SpineSegment({
  caption,
  spokenCaption,
  label,
  open = false,
  onToggle,
  iconColumn,
  card,
  cardKey,
  captionFor,
  wrapperProps,
}: {
  /** The caption drawn on the line: "Repay · 6 Feb '26". */
  caption: ReactNode;
  /** The caption as spoken: "Repay, 6 Feb 2026". */
  spokenCaption: string;
  /** The button's full name; unset, the spoken caption and the legs the
   *  column reports. */
  label?: string;
  open?: boolean;
  onToggle?: (anchor: HTMLElement) => void;
  iconColumn: ReactNode;
  /** The card drawn under the segment while it is open. */
  card?: ReactNode;
  /** `data-spine-card` on the open region, which the reveal scroll finds. */
  cardKey?: string;
  /** Colour the caption as the open card's. */
  captionFor?: "open";
  wrapperProps?: React.HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string | undefined>;
}) {
  const scale = useTimelineScale();
  const reactId = useId();
  const [legs, setLegs] = useState<string | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const lit = open || captionFor === "open";
  const labelId = `${reactId}-label`;
  const regionId = `${reactId}-card`;
  const captionNode = (
    <span
      aria-hidden={onToggle ? true : undefined}
      className={`block max-w-full truncate px-2 text-xs leading-5 ${lit ? "text-foreground" : "text-rb-500"}`}
      style={{ backgroundColor: "var(--background)" }}
    >
      {caption}
    </span>
  );
  const column = (
    <SpineRowContext.Provider value={{ caption: captionNode, setLegs, setLine }}>{iconColumn}</SpineRowContext.Provider>
  );
  return (
    <div
      {...wrapperProps}
      className={`relative flex w-full flex-col ${scale.cardRounded}`}
      style={{ "--card-pad": `${scale.cardPad}px`, padding: scale.cardPad } as React.CSSProperties}
    >
      {onToggle ? (
        // The segment, its flank values and its caption are one button. The
        // glyphs are hidden from screen readers and inert to the pointer.
        <button
          type="button"
          data-spine-toggle=""
          aria-expanded={open}
          aria-controls={open && card ? regionId : undefined}
          aria-label={label ?? (legs ? `${spokenCaption}: ${legs}` : spokenCaption)}
          onClick={(e) => onToggle(e.currentTarget)}
          className="hidden w-full min-h-11 cursor-pointer items-stretch mspine:max-sm:flex justify-center rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <span aria-hidden className="pointer-events-none flex w-full items-stretch justify-center">
            {column}
          </span>
          <span id={labelId} hidden>
            {spokenCaption}
          </span>
        </button>
      ) : (
        <div className="hidden w-full items-stretch justify-center mspine:max-sm:flex">{column}</div>
      )}
      {open && card && (
        <div
          role="region"
          id={regionId}
          aria-labelledby={labelId}
          data-spine-card={cardKey}
          // Its own stacking context, so the line below paints behind the
          // card and shows only where the card does not cover it.
          className="relative isolate mt-2 w-full"
        >
          {line && (
            <div
              aria-hidden
              data-spine-line=""
              className="absolute left-1/2 -z-10 w-px -translate-x-1/2"
              style={{ top: "calc(var(--card-pad) + 20px)", bottom: SPINE_LINE_OVERSHOOT, ...spineLineStyle(line) }}
            />
          )}
          {card}
        </div>
      )}
    </div>
  );
}

/** One row above the first event, under the two flanks: what a left arrow and
 *  a right arrow mean. It stays true whichever way the first event moves. */
export function SpineKeyRow({ config }: { config: MobileSpineConfig }) {
  const scale = useTimelineScale();
  return (
    <div
      aria-hidden
      className="grid items-center px-1 pb-1 text-xs text-rb-500"
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

/** The phone's "Timeline | List" switch (decision 4 of rails-ops
 *  TO-DO-mobile-timeline.md), at the right end of the toolbar's count line.
 *  Two buttons with `aria-pressed`, each a 44px-tall target around a smaller
 *  pill. Hidden from `sm` up. The pressed look follows `<html
 *  data-timeline-view>` in CSS, so a saved "Timeline" shows before hydration. */
export function SpineViewSwitch() {
  const { spineView, setSpineView } = useTimelineDisplay();
  const option = (on: boolean, label: string) => (
    <button
      type="button"
      aria-pressed={spineView === on}
      onClick={() => setSpineView(on)}
      className={`${CTRL_GHOST} group/seg -my-2.5 h-11 px-0.5 first:pl-0 last:pr-0`}
    >
      <span
        className={`rounded-full px-3 py-1 text-xs font-medium group-hover/seg:text-foreground ${
          on
            ? "tlspine:bg-rb-100 tlspine:text-foreground dark:tlspine:bg-rb-800 tllist:text-rb-500"
            : "tllist:bg-rb-100 tllist:text-foreground dark:tllist:bg-rb-800 tlspine:text-rb-500"
        }`}
      >
        {label}
      </span>
    </button>
  );
  return (
    <div
      role="group"
      aria-label="Show events as"
      data-spine-switch=""
      className="ml-auto inline-flex items-center rounded-full border border-rb-200 p-0.5 dark:border-rb-800 sm:hidden"
    >
      {option(true, "Timeline")}
      {option(false, "List")}
    </div>
  );
}
