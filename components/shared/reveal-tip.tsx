"use client";

// RevealTip — the one gesture behind "show a compact form, reveal the exact
// form on demand". Wraps any inline content; the `tip` shows on hover (pointer
// devices) and on tap (touch devices). Used for both compact numbers (tip = the
// exact value) and token glyphs (tip = the ticker) so the two read the same.
// The bubble: rounded-2xl, p-3, medium-weight text on the tooltip tokens
// (--rb-tooltip-bg / --rb-tooltip-border), with an arrow to the value.
// `label` is the accessible name: screen readers get it in place of the
// visible children (an amount's exact figure behind "<0.000001").
//
// Two collisions to respect on these cards:
//   • the whole card is a <Link> — a touch tap must NOT navigate, so on touch
//     the first tap reveals (preventDefault + stopPropagation) and a tap-away
//     closes; a second tap on the element then falls through to the link.
//   • <Prov> arms a click-to-trace on the same value when the provenance
//     inspector is on — that's pointer-click, which we leave untouched (we only
//     intercept clicks on touch devices, where Prov tracing isn't the gesture).

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Inside a tip that already answers a hover (the closed ledger cell's USD
 *  tip), a nested RevealTip shows its children and opens no second bubble. */
export const QuietTipsContext = createContext(false);

function useHasHover(): boolean {
  const [hasHover, setHasHover] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: hover)");
    setHasHover(mq.matches);
    const onChange = () => setHasHover(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return hasHover;
}

export function RevealTip({
  tip,
  children,
  className,
  label,
  focusable,
  align = "start",
}: {
  tip: ReactNode;
  children: ReactNode;
  className?: string;
  label?: string;
  /** Put the wrapper in the tab order and show the tip on keyboard focus
   *  (:focus-visible only, so a touch tap still reveals on the click and
   *  leaves navigation to the second tap). Give it `role="img"`-style
   *  semantics through `label`. */
  focusable?: boolean;
  /** Which edge of the content the bubble lines up with: "end" for content at
   *  the right of its row, so the bubble opens leftward. */
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const hasHover = useHasHover();
  const quiet = useContext(QuietTipsContext);
  const ref = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  // Shift left by however far the bubble would run past the viewport's right
  // edge (a right-aligned cell at 390px), keeping the arrow on the value. The
  // edge is the document's width: on a phone an unshifted bubble widens the
  // layout viewport, and `innerWidth` then reports the widened one.
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    if (!open) return setShift(0);
    const b = bubbleRef.current;
    if (!b) return;
    if (align === "end") {
      // Opening leftward: shift right by however far it would run past the left edge.
      const under = 8 - b.getBoundingClientRect().left;
      return setShift(under > 0 ? -under : 0);
    }
    const over = b.getBoundingClientRect().right - (document.documentElement.clientWidth - 8);
    const room = ref.current ? ref.current.getBoundingClientRect().left - 8 : 0;
    setShift(over > 0 ? Math.min(over, Math.max(room, 0)) : 0);
  }, [open, align]);

  // Touch: dismiss when tapping elsewhere.
  useEffect(() => {
    if (!open || hasHover) return;
    const onDoc = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open, hasHover]);

  if (quiet)
    return (
      <span className={`inline-flex items-center ${className ?? ""}`}>
        {label ? (
          <>
            <span aria-hidden="true" className="inline-flex items-center [gap:inherit]">
              {children}
            </span>
            <span className="sr-only" data-prov-hidden="">
              {label}
            </span>
          </>
        ) : (
          children
        )}
      </span>
    );
  return (
    <span
      ref={ref}
      data-reveal-tip=""
      className={`relative inline-flex items-center ${className ?? ""}`}
      onMouseEnter={hasHover ? () => setOpen(true) : undefined}
      onMouseLeave={hasHover ? () => setOpen(false) : undefined}
      tabIndex={focusable ? 0 : undefined}
      onFocus={
        focusable
          ? (e) => {
              if (e.currentTarget.matches(":focus-visible")) setOpen(true);
            }
          : undefined
      }
      onBlur={focusable ? () => setOpen(false) : undefined}
      onClick={
        hasHover
          ? undefined
          : (e) => {
              // Touch: first tap reveals instead of following the card link.
              if (!open) {
                e.preventDefault();
                e.stopPropagation();
                setOpen(true);
              }
            }
      }
    >
      {label ? (
        <>
          <span aria-hidden="true" className="inline-flex items-center [gap:inherit]">
            {children}
          </span>
          {/* data-prov-hidden: the capture reads the visible figure only. */}
          <span className="sr-only" data-prov-hidden="">
            {label}
          </span>
        </>
      ) : (
        children
      )}
      {open && (
        /* data-prov-hidden: the tip is open mid-hover when a <Prov> click-to-
           trace lands, so the provenance capture must not read it as part of
           the displayed value. */
        <span
          ref={bubbleRef}
          role="tooltip"
          data-prov-hidden=""
          className={`pointer-events-none absolute bottom-full ${align === "end" ? "right-0" : "left-0"} z-50 mb-2.5 whitespace-nowrap rounded-2xl border p-3 text-xs font-medium tabular-nums text-foreground shadow-lg`}
          style={{
            background: "var(--rb-tooltip-bg)",
            borderColor: "var(--rb-tooltip-border)",
            transform: shift ? `translateX(${-shift}px)` : undefined,
          }}
        >
          {tip}
          <span
            aria-hidden="true"
            className="absolute top-full -mt-[5px] size-2.5 rotate-45 border-b border-r"
            style={{
              ...(align === "end" ? { right: 12 - shift } : { left: 12 + shift }),
              background: "var(--rb-tooltip-bg)",
              borderColor: "var(--rb-tooltip-border)",
            }}
          />
        </span>
      )}
    </span>
  );
}
