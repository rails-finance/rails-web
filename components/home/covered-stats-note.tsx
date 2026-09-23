"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CircleQuestionMark } from "lucide-react";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { MobileSheet } from "@/components/shared/mobile-sheet";

/**
 * The small print for the headline position count — how "positions" is
 * counted — opened from the help icon that closes the caption sentence, rather
 * than parked at the foot of the page (Miles, 2026-09-03: the paragraph reads
 * better as a note you summon than as a footer the eye has to travel to).
 *
 * Two surfaces, one text, following the coverage matrix's grammar for "a
 * definition to read": on desktop a click-pinned popover (the CellNote
 * treatment — dark tile, always mounted so the copy ships in the HTML and
 * `aria-controls` has a target); below `sm` the shared modal MobileSheet,
 * since a 60-word popover has nowhere to sit on a phone.
 *
 * The popover is anchored to the ICON, not to the band (Miles, 2026-09-12).
 * It used to hang centred under the whole stats band — which, the band being
 * page-centred, could never clip a viewport edge — but that was chosen when
 * the trigger was a dagger on the 58px headline figure, which wandered a long
 * way off centre once the headline pair wrapped. The trigger now sits at the
 * end of the caption sentence, so a popover in the middle of the page read as
 * unrelated to the thing that opened it. Anchoring to the icon costs the free
 * clipping immunity, which `clampShift` below buys back.
 *
 * The text states the rule the loader applies (covered-positions-data.ts):
 * each explorer's own listing total, all-time, summed hourly; the grain each
 * protocol counts in; that "closed" absorbs every protocol's own ending; and
 * that the wallet figure is distinct across explorers (stats.ts counts
 * DISTINCT lower(wallet) over every listing). Nothing about Base backfill
 * completeness on purpose: that gate closes the day Morpho Base's history
 * lands and would then describe nothing.
 */
function NoteText() {
  return (
    <>
      Positions are the sum of each explorer&rsquo;s own listing total, counted all-time and refreshed hourly. A
      position is whatever the protocol&rsquo;s listing counts: a trove for Liquity and its forks, a vault for MakerDAO,
      one entry per wallet and market for Aave V3 and Morpho, one per wallet for Spark, Moonwell, Maple and Compound V2.
      Closed includes liquidated, repaid and defaulted. Wallets are counted once across every explorer.
    </>
  );
}

const NOTE_LABEL = "How positions are counted";

/** Gutter the popover keeps from either viewport edge, in px. */
const EDGE_GUTTER = 16;

/**
 * The trigger and its note, as one inline unit: a `relative inline-block`
 * wrapper so the popover hangs off the icon, carrying the button, the desktop
 * popover and the phone sheet. One component rather than the old
 * scope/trigger/panel trio — the trigger and the panel now share a parent, so
 * the context that used to reach across the band has nothing left to do, and
 * the wrapper is also the outside-click boundary.
 */
export function CoveredStatsNote() {
  const [open, setOpen] = useState(false);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);
  const noteId = useId();
  const popoverOpen = open && !isPhone;

  /**
   * How far to slide the popover off the icon's centre to keep it on screen.
   * Computed from the anchor's centre and the panel's own width — never from
   * the panel's current (already shifted) position — so it settles in one pass
   * instead of chasing itself.
   */
  const [shift, setShift] = useState(0);
  const clampShift = useCallback(() => {
    const anchor = wrapRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const rect = anchor.getBoundingClientRect();
    const width = panel.offsetWidth;
    const wanted = rect.left + rect.width / 2 - width / 2;
    const max = Math.max(EDGE_GUTTER, window.innerWidth - EDGE_GUTTER - width);
    setShift(Math.min(Math.max(wanted, EDGE_GUTTER), max) - wanted);
  }, []);

  // Measured before paint, so the popover never shows at the unclamped spot
  // first. `offsetWidth` reads 0 while the panel is `hidden`, which is why
  // this runs only once it is open.
  useLayoutEffect(() => {
    if (!popoverOpen) return;
    clampShift();
  }, [popoverOpen, clampShift]);

  useEffect(() => {
    if (!popoverOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDoc = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("resize", clampShift);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDoc);
    return () => {
      window.removeEventListener("resize", clampShift);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDoc);
    };
  }, [popoverOpen, clampShift]);

  return (
    <span ref={wrapRef} className="relative inline-block">
      {/* The help icon. An icon rather than a footnote marker: it sits in the
          small caption, not on the headline figure, where a dagger reads as a
          typo and the circled question mark reads as "the answer is here".
          Sized in `em` so it tracks the caption's 12px, and pulled onto the
          text baseline rather than raised as a superscript. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={popoverOpen}
        aria-controls={noteId}
        aria-haspopup={isPhone ? "dialog" : undefined}
        aria-label={open ? `Hide ${NOTE_LABEL.toLowerCase()}` : `Show ${NOTE_LABEL.toLowerCase()}`}
        className={`ml-1 inline-flex cursor-pointer align-[-0.18em] transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          popoverOpen ? "text-foreground" : "text-rb-500"
        }`}
      >
        <CircleQuestionMark className="size-[1.15em]" strokeWidth={1.75} aria-hidden="true" />
      </button>

      {/* The popover, hanging under the icon. The width clamp keeps it inside
          the viewport on its own between `sm` and the note's natural width;
          `shift` handles the rest. */}
      <span
        ref={panelRef}
        id={noteId}
        role="tooltip"
        style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
        className={`absolute left-1/2 top-full z-50 mt-2 w-max max-w-[min(56ch,calc(100vw-2rem))] rounded-md bg-foreground px-3 py-2 text-left text-xs leading-relaxed text-background shadow-lg ${
          popoverOpen ? "" : "hidden"
        }`}
      >
        <NoteText />
      </span>

      {open && isPhone && (
        <MobileSheet label={NOTE_LABEL} onClose={() => setOpen(false)}>
          <p className="font-semibold text-foreground">{NOTE_LABEL}</p>
          <p className="body-text mt-2 text-sm">
            <NoteText />
          </p>
        </MobileSheet>
      )}
    </span>
  );
}
