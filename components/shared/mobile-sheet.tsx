"use client";

// Shared slide-up bottom sheet chrome — the phone-width treatment for any
// panel that opens as an absolutely positioned overlay on desktop but needs
// its own layer below `sm`. Extracted from the coverage page's
// `CapabilitySheet` (components/coverage/capability-sheet.tsx), which is now
// a thin wrapper around this: same portal, same backdrop, same slide.
//
// Two registers, because two kinds of panel open here (Miles, 2026-09-02):
//   - "modal": a definition to read (the coverage capability sheet). The page
//     behind is not the point, so it dims and blurs, and the sheet may take
//     three-quarters of the viewport.
//   - "live":  a filter whose every tap re-settles the list behind it. The
//     list IS the point — the reader ticks a type and watches the timeline
//     change — so the scrim is faint, nothing blurs, and the sheet stops at
//     half the viewport so the top of the list stays readable. This is the
//     non-modal sheet Apple and Material both reserve for filters that apply
//     as you go, as opposed to the Apply-button modal a commerce filter uses.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OVERLAY_HEADING, RESET_LINK } from "@/lib/shared/ui-grammar";

type MobileSheetMode = "modal" | "live";

interface MobileSheetProps {
  /** aria-label for the dialog — what the sheet is showing. */
  label: string;
  onClose: () => void;
  /** Blur-and-dim reading sheet (default) or the faint-scrim live filter. */
  mode?: MobileSheetMode;
  /** Pinned above the scrolling body — a heading row, a live count — so a
   *  long option list scrolls underneath it rather than carrying it away. */
  header?: React.ReactNode;
  children: React.ReactNode;
}

/** The pinned header of a LIVE filter sheet: the menu's name in the overlay
 *  heading register, Reset when the caller says there is something to reset,
 *  and an optional one-line status — the toolbar's count line, which the
 *  sheet covers and which answers every tap. Shared by every filter that
 *  opens as a sheet (the dropdown menus, the date range) so they read as one
 *  family; the status line is `aria-live` so the changing figure is announced. */
export function MobileSheetFilterHeader({
  label,
  status,
  onReset,
}: {
  label: string;
  status?: React.ReactNode;
  onReset?: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between px-4 py-3">
        <span className={OVERLAY_HEADING}>{label}</span>
        {onReset && (
          <button type="button" onClick={onReset} className={RESET_LINK}>
            Reset
          </button>
        )}
      </div>
      {status != null && (
        <div aria-live="polite" className="px-4 pb-2 text-xs text-rb-500 tabular-nums">
          {status}
        </div>
      )}
    </>
  );
}

/** Slide-up bottom sheet: fixed to the viewport bottom, rounded top corners,
 *  a backdrop that closes on tap. Mounted only while the caller keeps it
 *  rendered — the two-step mount-then-transition below is what makes the
 *  slide actually animate rather than snapping into place: the panel first
 *  paints off-screen (translate-y-full), then a rAF flips `visible` so the
 *  transform transition has a starting frame to run from. */
export function MobileSheet({ label, onClose, mode = "modal", header, children }: MobileSheetProps) {
  const [visible, setVisible] = useState(false);
  const closingRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const live = mode === "live";

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Closing plays the same transition in reverse, then unmounts — a bare
  // onClose() here would cut the slide-down short.
  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setVisible(false);
    window.setTimeout(onClose, 300);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Body scroll lock while the sheet is open — same discipline as the other
  // portal modals (learn-more-modal.tsx): the backdrop stays glued to the
  // sheet rather than reading as a page that scrolled out from behind it.
  // Kept in live mode too: the list behind re-settles in place, it is not
  // meant to be scrolled through the scrim (a tap there closes the sheet).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Focus goes into the sheet on open.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${
          live ? "bg-black/20" : "bg-black/50 backdrop-blur-sm"
        } ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={close}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        // A live sheet is not modal in the ARIA sense either: the page behind
        // it is still the reader's subject, and assistive tech should not be
        // told it has gone inert.
        aria-modal={live ? undefined : "true"}
        aria-label={label}
        tabIndex={-1}
        // The live sheet gets a hairline top edge: without the blur behind
        // it, a dark sheet over a dark page has nothing else to mark where
        // the list ends and the menu begins.
        className={`absolute inset-x-0 bottom-0 flex flex-col rounded-t-2xl bg-raised p-6 shadow-xl transition-transform duration-300 focus:outline-none ${
          live ? "max-h-[50vh] border-t border-rb-300 dark:border-rb-700" : "max-h-[75vh]"
        } ${visible ? "translate-y-0" : "translate-y-full"}`}
        style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}
      >
        {header}
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
