"use client";

// RevealTip — the one gesture behind "show a compact form, reveal the exact
// form on demand". Wraps any inline content; the `tip` opens on a click or a
// tap, never on hover (Miles, 10 Oct 2026). A second click, Escape or a click
// elsewhere closes it; a focusable tip opens on Enter or Space. Used for both
// compact numbers (tip = the exact value) and token glyphs (tip = the ticker)
// so the two read the same.
// The bubble: rounded-2xl, p-3, medium-weight text on the tooltip tokens
// (--rb-tooltip-bg / --rb-tooltip-border), with an arrow to the value.
// `label` is the accessible name: screen readers get it in place of the
// visible children (an amount's exact figure behind "<0.000001").
//
// Two collisions to respect on these cards:
//   • the whole card is a <Link>: a click on a tip opens or closes it and
//     never navigates (preventDefault + stopPropagation).
//   • <Prov> arms a click-to-trace on the same value when the provenance
//     inspector is on: while it is armed a click is the trace's, and the tip
//     leaves it alone.

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { provInspector } from "@/components/shared/provenance";

/** Inside a tip that already answers a hover (the closed ledger cell's USD
 *  tip), a nested RevealTip shows its children and opens no second bubble. */
export const QuietTipsContext = createContext(false);

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
  /** Put the wrapper in the tab order as a button: Enter or Space opens the
   *  tip. Its accessible name is `label`. */
  focusable?: boolean;
  /** Which edge of the content the bubble lines up with: "end" for content at
   *  the right of its row, so the bubble opens leftward. */
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
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

  // A press elsewhere or Escape closes it.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
      className={`relative inline-flex cursor-pointer items-center ${className ?? ""}`}
      tabIndex={focusable ? 0 : undefined}
      role={focusable ? "button" : undefined}
      aria-expanded={focusable ? open : undefined}
      onBlur={focusable ? () => setOpen(false) : undefined}
      onKeyDown={
        focusable
          ? (e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              e.stopPropagation();
              setOpen((o) => !o);
            }
          : undefined
      }
      onClick={(e) => {
        // While the inspector is armed the click traces the value.
        if (provInspector.getArmed()) return;
        e.preventDefault();
        e.stopPropagation();
        setOpen((o) => !o);
      }}
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
