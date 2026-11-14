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

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
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
  /** A drag handle at the top edge (dragging it down closes the sheet) and a
   *  close button in the top corner, for a sheet whose content is not a menu
   *  a tap on an option closes (the Lifetime flows panel). "handle" draws the
   *  handle alone, for a sheet whose header holds its own controls in that
   *  corner (a filter pill's editor, N1.11). */
  dismiss?: boolean | "handle";
  /** The sheet takes a history entry at the same URL while open, so the
   *  browser's Back (Android's back gesture) closes it. Its own controls leave
   *  through that entry. Opt-in: a menu whose rows navigate must not step back
   *  under its own navigation. */
  backCloses?: boolean;
  /** Set to a function that closes the sheet as its own controls do (slide
   *  down, history entry gone) and then runs `after`: a caller that writes the
   *  URL on its way out (a filter pill's Apply) writes it after the entry has
   *  left. */
  closeRef?: MutableRefObject<((after?: () => void) => void) | null>;
  children: React.ReactNode;
}

/** The `history.state` key of a sheet's entry (`backCloses`). */
const SHEET_ENTRY = "mobileSheet";
const ownsTop = () => (window.history.state as Record<string, unknown> | null)?.[SHEET_ENTRY] === true;

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

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
 *  slide animate rather than snap into place: the panel first lays out
 *  off-screen (translate-y-full), then `visible` flips so the transform
 *  transition has a starting style to run from. */
/** How far, in px, the handle must be dragged down to close the sheet. */
const DRAG_CLOSE_PX = 80;

export function MobileSheet({
  label,
  onClose,
  mode = "modal",
  header,
  dismiss = false,
  backCloses = false,
  closeRef,
  children,
}: MobileSheetProps) {
  const [visible, setVisible] = useState(false);
  // The handle's drag: how far down the sheet follows the finger.
  const [drag, setDrag] = useState(0);
  const dragFrom = useRef<number | null>(null);
  const closingRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const live = mode === "live";

  // Reading the panel's box makes the browser settle its off-screen starting
  // style before `visible` flips, so the transition has a frame to run from
  // without waiting on requestAnimationFrame. A page the browser counts as
  // hidden (a background tab, an automated browser) never runs rAF, and the
  // sheet used to stay parked below the viewport there: a newcomer review
  // (2026-09-28) pressed Display twice and saw nothing open.
  useLayoutEffect(() => {
    panelRef.current?.getBoundingClientRect();
    setVisible(true);
  }, []);

  // Closing plays the same transition in reverse, then unmounts — a bare
  // onClose() here would cut the slide-down short. With a history entry, the
  // entry goes first (Back), and the close finishes once it has.
  const after = useRef<(() => void) | undefined>(undefined);
  const finished = useRef(false);
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    window.setTimeout(() => {
      onClose();
      after.current?.();
    }, 300);
  };
  const close = (then?: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    after.current = then;
    setVisible(false);
    if (backCloses && ownsTop()) {
      window.history.back();
      // Should popstate never come, close anyway.
      window.setTimeout(finish, 800);
    } else finish();
  };
  if (closeRef) closeRef.current = close;

  // The sheet's history entry: pushed on open, and Back closes the sheet.
  useEffect(() => {
    if (!backCloses) return;
    // A remount in the same open (React's development double effect) finds
    // its entry already on top.
    if (!ownsTop()) window.history.pushState({ ...(window.history.state ?? {}), [SHEET_ENTRY]: true }, "");
    const onPop = () => {
      if (ownsTop()) return;
      if (closingRef.current) finish();
      else {
        closingRef.current = true;
        setVisible(false);
        finish();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per open
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // A press already spent closing an (i) panel inside the sheet
      // (use-escape-close.ts) leaves the sheet open.
      if (e.key === "Escape" && !e.defaultPrevented) {
        close();
        return;
      }
      // A modal sheet holds focus: Tab cycles inside it, never behind the scrim.
      if (live || e.key !== "Tab" || !panelRef.current) return;
      const els = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      const at = document.activeElement;
      const inside = panelRef.current.contains(at);
      if (e.shiftKey && (at === first || at === panelRef.current || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (at === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
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

  const onHandleDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragFrom.current = e.clientY;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onHandleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragFrom.current != null) setDrag(Math.max(0, e.clientY - dragFrom.current));
  };
  const onHandleUp = () => {
    if (dragFrom.current == null) return;
    dragFrom.current = null;
    if (drag > DRAG_CLOSE_PX) close();
    else setDrag(0);
  };

  // Focus goes into the sheet on open.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)]">
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${
          live ? "bg-black/20" : "bg-black/50 backdrop-blur-sm"
        } ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={() => close()}
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
        // the list ends and the menu begins. In dark mode the sheet wears the
        // desktop dropdown's near-black (.overlay-panel) so it lifts off the
        // rb-800 cards beneath it.
        className={`absolute inset-x-0 bottom-0 flex flex-col rounded-t-2xl bg-raised dark:bg-rb-900 p-6 shadow-xl transition-transform duration-300 focus:outline-none ${
          live ? "max-h-[50vh] border-t border-rb-300 dark:border-rb-700" : "max-h-[75vh]"
        } ${visible ? "translate-y-0" : "translate-y-full"} ${dismiss ? "pt-2" : ""}`}
        style={{
          paddingBottom: "max(24px, env(safe-area-inset-bottom))",
          ...(drag > 0 && visible ? { transform: `translateY(${drag}px)`, transition: "none" } : {}),
        }}
      >
        {dismiss && (
          <>
            <div
              className="-mx-6 -mt-2 mb-2 flex h-6 shrink-0 cursor-grab touch-none items-center justify-center"
              onPointerDown={onHandleDown}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
              aria-hidden="true"
              data-sheet-handle=""
            >
              <span className="h-1 w-10 rounded-full bg-rb-300 dark:bg-rb-600" />
            </div>
          </>
        )}
        {dismiss === true && (
          <>
            <button
              type="button"
              onClick={() => close()}
              aria-label="Close"
              className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-md text-rb-500 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rb-400"
              data-sheet-close=""
            >
              <X size={18} aria-hidden="true" />
            </button>
          </>
        )}
        {header}
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
