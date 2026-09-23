"use client";

// RevealTip — the one gesture behind "show a compact form, reveal the exact
// form on demand". Wraps any inline content; the `tip` shows on hover (pointer
// devices) and on tap (touch devices). Used for both compact numbers (tip = the
// exact value) and token glyphs (tip = the ticker) so the two read the same.
//
// Two collisions to respect on these cards:
//   • the whole card is a <Link> — a touch tap must NOT navigate, so on touch
//     the first tap reveals (preventDefault + stopPropagation) and a tap-away
//     closes; a second tap on the element then falls through to the link.
//   • <Prov> arms a click-to-trace on the same value when the provenance
//     inspector is on — that's pointer-click, which we leave untouched (we only
//     intercept clicks on touch devices, where Prov tracing isn't the gesture).

import { useEffect, useRef, useState, type ReactNode } from "react";

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

export function RevealTip({ tip, children, className }: { tip: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const hasHover = useHasHover();
  const ref = useRef<HTMLSpanElement>(null);

  // Touch: dismiss when tapping elsewhere.
  useEffect(() => {
    if (!open || hasHover) return;
    const onDoc = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open, hasHover]);

  return (
    <span
      ref={ref}
      className={`relative inline-flex items-center ${className ?? ""}`}
      onMouseEnter={hasHover ? () => setOpen(true) : undefined}
      onMouseLeave={hasHover ? () => setOpen(false) : undefined}
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
      {children}
      {open && (
        /* data-prov-hidden: the tip is open mid-hover when a <Prov> click-to-
           trace lands, so the provenance capture must not read it as part of
           the displayed value. */
        <span
          role="tooltip"
          data-prov-hidden=""
          className="pointer-events-none absolute bottom-full left-0 z-50 mb-1.5 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium tabular-nums text-background shadow-lg"
        >
          {tip}
        </span>
      )}
    </span>
  );
}
